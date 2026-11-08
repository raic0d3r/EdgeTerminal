"use client";

import { marketApiUrl, fetchMarketData } from "@/lib/market-selection";
import { useEffect, useMemo, useState } from "react";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};
type QuoteResponse = {
  status: "live" | "demo" | "unavailable" | "error";
  data?: { price: number | null; source: string; updatedAt: string | null; candles?: Candle[]; mode?: string };
  error?: string;
  disclaimer?: string;
};

export default function VolumetricVwap({ asset, interval, theme }: {
  asset: string;
  interval: string;
  theme: "dark" | "light";
}) {
  const [response, setResponse] = useState<QuoteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<Date | null>(null);
  const [showGuide, setShowGuide] = useState(true);

  const apiInterval: Record<string, string> = {
    "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
    "1H": "1h", "1h": "1h", "4H": "4h", "1D": "1day"
  };

  async function load() {
    setBusy(true);
    try {
      const res = await fetchMarketData(marketApiUrl(asset, apiInterval[interval] || "15min"), { cache: "no-store" });
      const json = await res.json();
      setResponse(json);
      setLastAttempt(new Date());
    } catch {
      setResponse({ status: "unavailable", error: "Could not reach the market-data endpoint." });
      setLastAttempt(new Date());
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  // load follows the selected instrument and timeframe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, interval]);

  const analytics = useMemo(() => {
    const candles = response?.data?.candles || [];
    const valid = candles.filter(c => Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && Number.isFinite(c.volume) && (c.volume || 0) > 0);
    if (!valid.length) return { vwap: null as number | null, upper: null as number | null, lower: null as number | null, volume: 0, count: 0, bias: "neutral" as const, momentum: "unavailable", confidence: "Low", context: "Not enough candle data to assess market bias.", setup: "Wait for verified price and candle data before forming a directional view.", vwapPosition: "unavailable" };
    const totalVolume = valid.reduce((sum, c) => sum + (c.volume || 0), 0);
    const vwap = valid.reduce((sum, c) => sum + ((c.high + c.low + c.close) / 3) * (c.volume || 0), 0) / totalVolume;
    const variance = valid.reduce((sum, c) => sum + (((c.high + c.low + c.close) / 3) - vwap) ** 2 * (c.volume || 0), 0) / totalVolume;
    const sd = Math.sqrt(variance);
    const ordered = [...valid].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const latest = ordered[ordered.length - 1];
    const lookback = ordered[Math.max(0, ordered.length - 6)];
    const momentumPct = lookback?.close ? (latest.close - lookback.close) / lookback.close * 100 : 0;
    const recent = ordered.slice(-5);
    const risingStructure = recent.length >= 3 && recent[recent.length - 1].high > recent[0].high && recent[recent.length - 1].low > recent[0].low;
    const fallingStructure = recent.length >= 3 && recent[recent.length - 1].high < recent[0].high && recent[recent.length - 1].low < recent[0].low;
    const momentum = momentumPct > 0.04 || risingStructure ? "Bullish" : momentumPct < -0.04 || fallingStructure ? "Bearish" : "Mixed";
    const price = response?.data?.price ?? latest.close;
    const vwapPosition = price > vwap ? "Above VWAP" : price < vwap ? "Below VWAP" : "At VWAP";
    const priceScore = price > vwap ? 1 : price < vwap ? -1 : 0;
    const momentumScore = momentum === "Bullish" ? 1 : momentum === "Bearish" ? -1 : 0;
    const score = priceScore + momentumScore;
    const bias = score > 0 ? "bullish" as const : score < 0 ? "bearish" as const : "neutral" as const;
    const agreement = priceScore !== 0 && priceScore === momentumScore;
    const confidence = agreement && ordered.length >= 10 ? "Moderate" : "Low";
    const extendedUp = sd > 0 && price >= vwap + sd;
    const extendedDown = sd > 0 && price <= vwap - sd;
    const context = bias === "bullish"
      ? `Price is ${vwapPosition.toLowerCase()} and recent candle momentum is bullish. Buyers have the short-term edge, but this is not a guarantee of continuation.${extendedUp ? " Price is at/above the +1σ band, so chasing strength carries extension risk." : " Watch whether pullbacks hold above VWAP."}`
      : bias === "bearish"
        ? `Price is ${vwapPosition.toLowerCase()} and recent candle momentum is bearish. Sellers have the short-term edge, but this is not a guarantee of continuation.${extendedDown ? " Price is at/below the −1σ band, so chasing weakness carries extension risk." : " Watch whether rallies fail near VWAP."}`
        : `VWAP positioning and recent momentum do not agree clearly. Treat conditions as mixed and wait for price and momentum to align before assigning a directional bias.`;
    const setup = bias === "bullish"
      ? "Watch for a pullback that holds above VWAP and a bullish candle close; reassess if price loses VWAP."
      : bias === "bearish"
        ? "Watch for a rally rejected near VWAP and a bearish candle close; reassess if price reclaims VWAP."
        : "Wait for a clear VWAP reclaim/rejection with matching recent momentum; avoid forcing a directional setup.";
    return { vwap, upper: vwap + sd, lower: vwap - sd, volume: totalVolume, count: valid.length, bias, momentum, confidence, context, setup, vwapPosition };
  }, [response]);

  const live = response?.status === "live" && response?.data?.price != null;
  const fmt = (v: number | null) => v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const updated = response?.data?.updatedAt ? new Date(response.data.updatedAt).toLocaleTimeString() : null;

  return (
    <div className={`volumetric-module ${theme === "light" ? "volumetric-light" : "volumetric-dark"}`}>
      <button className="vol-guide-toggle" type="button" aria-expanded={showGuide} onClick={() => setShowGuide(v => !v)}>
        ⓘ &nbsp; VOLUMETRIC DELTA & VWAP GUIDE <span>{showGuide ? "⌃" : "⌄"}</span>
      </button>
      {showGuide && <div className="vol-guide-copy">
        VWAP is calculated from typical candle price weighted by reported candle volume when the provider supplies volume. The deviation bands show one volume-weighted standard deviation around VWAP. Spot FX/CFD volume is provider-specific, not total global market volume. Candle OHLCV does not reveal aggressor-side trades, so true buy/sell delta is not inferred or fabricated here.
      </div>}

      <div className="vol-card">
        <div className="vol-card-heading">
          <div><span className="vol-eyebrow">〰 &nbsp; VOLUMETRIC DELTA (PROVIDER VOLUME)</span><p>{asset} · {interval} candles · {response?.data?.source || "Market data provider"}</p></div>
          <span className={`vol-status ${live ? "is-live" : ""}`}>{busy ? "UPDATING…" : live ? "LIVE PRICE" : response?.status === "demo" ? "LIVE DATA NOT CONFIGURED" : "DATA UNAVAILABLE"}</span>
        </div>
        <div className="vol-price-row">
          <div><small>LAST PRICE</small><strong>{fmt(response?.data?.price ?? null)}</strong></div>
          <div className="vol-updated"><small>LAST RETRIEVED</small><strong>{updated || (lastAttempt ? lastAttempt.toLocaleTimeString() : "—")}</strong></div>
        </div>

        <div className="vol-metrics-grid">
          <div className="vol-metric"><span>VWAP</span><strong>{fmt(analytics.vwap)}</strong><small>{analytics.count ? `${analytics.count} candles with volume` : "Requires candles with volume"}</small></div>
          <div className="vol-metric"><span>+1σ BAND</span><strong>{fmt(analytics.upper)}</strong><small>VWAP + weighted deviation</small></div>
          <div className="vol-metric"><span>−1σ BAND</span><strong>{fmt(analytics.lower)}</strong><small>VWAP − weighted deviation</small></div>
          <div className="vol-metric"><span>REPORTED VOLUME</span><strong>{analytics.volume ? analytics.volume.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</strong><small>Provider-reported, if available</small></div>
        </div>

        <section className={`vol-market-bias bias-${analytics.bias}`} aria-label="Market bias and trading context">
          <div className="vol-bias-topline">
            <div>
              <span className="vol-bias-kicker">MARKET BIAS &amp; TRADING CONTEXT</span>
              <h3>{analytics.bias === "bullish" ? "BULLISH BIAS" : analytics.bias === "bearish" ? "BEARISH BIAS" : "NEUTRAL / MIXED"}</h3>
            </div>
            <span className="vol-bias-confidence">{analytics.confidence} confidence</span>
          </div>
          <div className="vol-bias-signals">
            <div><small>PRICE VS VWAP</small><b>{analytics.vwapPosition}</b></div>
            <div><small>RECENT MOMENTUM</small><b>{analytics.momentum}</b></div>
            <div><small>DATA BASIS</small><b>cTrader broker-reported tick volume</b></div>
          </div>
          <p className="vol-bias-context">{analytics.context}</p>
          <div className="vol-bias-setup"><b>SETUP TO WATCH</b><p>{analytics.setup}</p></div>
          <small className="vol-bias-disclaimer">Technical context only, not a guaranteed signal. VWAP uses provider-specific tick volume; candle data cannot establish true aggressor-side buy/sell delta.</small>
        </section>
        {!live && <div className="vol-data-note">{response?.disclaimer || response?.error || "Configure an eligible market-data provider to enable price calculations."}</div>}
      </div>
    </div>
  );
}
