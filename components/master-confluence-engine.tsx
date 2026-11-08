"use client";

import { marketApiUrl, fetchMarketData } from "@/lib/market-selection";
import { auth } from "@/lib/firebase";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BookOpen, CircleHelp, Clock3, Gauge, ShieldAlert, Sparkles } from "lucide-react";

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

type MarketResponse = {
  status?: "live" | "demo" | "unavailable" | "error";
  data?: {
    price: number | null;
    source: string;
    updatedAt: string | null;
    candles?: Candle[];
    dataNote?: string;
  };
  error?: string;
  disclaimer?: string;
};

type Signal = "Bullish" | "Bearish" | "Neutral";
type ContextResponse = {
  status?: string; source?: string; updatedAt?: string;
  dxy?: { value: number; changePct: number | null; asOf: string } | null;
  us10y?: { value: number; change: number | null; asOf: string } | null;
  errors?: string[]; note?: string;
};
type CorrelationResponse = { status?: string; matrix?: (number | null)[][]; observations?: number; error?: string };
type CalendarResponse = { status?: string; source?: string | null; events?: unknown[]; error?: string };

function fmt(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function MasterConfluenceEngine({
  asset = "XAU/USD",
  interval = "15m",
}: {
  asset?: string;
  interval?: string;
}) {
  const [response, setResponse] = useState<MarketResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationResponse | null>(null);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);

  const intervalMap: Record<string, string> = {
    "1m": "1min", "5m": "5min", "10m": "5min", "15m": "15min",
    "30m": "30min", "1H": "1h", "1h": "1h", "4H": "4h", "1D": "1day",
  };

  useEffect(() => {
    let active = true;

    async function load() {
      setBusy(true);
      try {
        const res = await fetchMarketData(
          marketApiUrl(asset, intervalMap[interval] || "15min"),
          { cache: "no-store" },
        );
        const json = (await res.json()) as MarketResponse;
        if (active) setResponse(json);
      } catch {
        if (active) setResponse({ status: "unavailable", error: "Could not reach the market-data endpoint." });
      } finally {
        if (active) setBusy(false);
      }
    }

    async function loadContext() {
      const user = auth?.currentUser;
      const token = user ? await user.getIdToken() : "";
      const calendarHeaders: Record<string, string> = {};
      if (token) calendarHeaders.Authorization = `Bearer ${token}`;
      const results = await Promise.allSettled([
        fetch("/api/confluence-context", { cache: "no-store" }).then(r => r.json()),
        fetch("/api/correlation?period=90D", { cache: "no-store" }).then(r => r.json()),
        fetch("/api/calendar", { cache: "no-store", headers: calendarHeaders }).then(r => r.json()),
      ]);
      if (!active) return;
      if (results[0].status === "fulfilled") setContext(results[0].value as ContextResponse);
      if (results[1].status === "fulfilled") setCorrelation(results[1].value as CorrelationResponse);
      if (results[2].status === "fulfilled") setCalendar(results[2].value as CalendarResponse);
    }

    void load();
    void loadContext();
    const timer = window.setInterval(() => { void load(); void loadContext(); }, 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  // intervalMap is static and intentionally excluded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, interval]);

  const analysis = useMemo(() => {
    const candles = (response?.data?.candles || [])
      .filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0))
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const price = response?.data?.price ?? candles[candles.length - 1]?.close ?? null;
    if (candles.length < 15 || price == null || !Number.isFinite(price) || price <= 0) {
      return {
        available: false, price, score: 50, signal: "Neutral" as Signal, conviction: "Unavailable",
        sma: null as number | null, momentumPct: null as number | null, rsi: null as number | null,
        trendStrength: 0, momentumStrength: 0, rsiStrength: 0,
        trendText: "Waiting for verified price history", recentMoves: [] as number[],
        note: response?.error || "At least 15 valid candles are required for a more stable technical reading.",
      };
    }

    const closes = candles.map((c) => c.close);
    const recentCloses = closes.slice(-20);
    const sma = recentCloses.reduce((sum, n) => sum + n, 0) / recentCloses.length;
    const anchor = closes[Math.max(0, closes.length - 6)];
    const momentumPct = anchor ? ((closes[closes.length - 1] - anchor) / anchor) * 100 : 0;

    // Wilder-style RSI approximation over up to 14 recent close-to-close changes.
    const changes = closes.slice(-15).slice(1).map((close, i) => close - closes.slice(-15)[i]);
    const avgGain = changes.reduce((sum, delta) => sum + Math.max(0, delta), 0) / Math.max(1, changes.length);
    const avgLoss = changes.reduce((sum, delta) => sum + Math.max(0, -delta), 0) / Math.max(1, changes.length);
    const rsi = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);

    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    // Continuous component strengths reduce the impact of tiny moves around thresholds.
    const trendStrength = clamp(((price - sma) / sma) * 100 / 0.20);
    const momentumStrength = clamp(momentumPct / 0.15);
    const rsiStrength = clamp((rsi - 50) / 15);
    const raw = trendStrength * 0.45 + momentumStrength * 0.35 + rsiStrength * 0.20;
    // Deliberately cap this heuristic at 25–75; it is a directional index, not a probability.
    const score = Math.round(50 + raw * 25);
    const signal: Signal = score >= 58 ? "Bullish" : score <= 42 ? "Bearish" : "Neutral";
    const strength = Math.abs(score - 50);
    const conviction = signal === "Neutral" ? "Low / neutral" : strength < 13 ? "Mild bias" : strength < 20 ? "Moderate bias" : "Strong technical bias";
    const recentMoves = candles.slice(-28).map((c) => ((c.close - c.open) / Math.max(Math.abs(c.open), 0.000001)) * 100);
    return {
      available: true, price, score, signal, conviction, sma, momentumPct, rsi,
      trendStrength, momentumStrength, rsiStrength, recentMoves,
      trendText: signal === "Bullish"
        ? "Price and short-term momentum lean higher, but the score is capped and is not a win probability."
        : signal === "Bearish"
          ? "Price and short-term momentum lean lower, but the score is capped and is not a win probability."
          : "Current technical inputs are mixed or too close to neutral for a directional bias.",
      note: response?.data?.dataNote || "Heuristic score uses price versus a recent moving average, short-term momentum, and approximate RSI.",
    };
  }, [response]);

  const bearishPct = 100 - analysis.score;
  const bearish = analysis.signal === "Bearish";
  const bullish = analysis.signal === "Bullish";
  const updatedAt = response?.data?.updatedAt ? new Date(response.data.updatedAt).toLocaleTimeString() : null;

  return (
    <section className="mce-shell">
      <header className="mce-heading">
        <div className="mce-title-block">
          <span className="mce-title-icon"><Activity size={18} /></span>
          <div>
            <h2>Master Confluence &amp; Probability Engine</h2>
            <p>Synthesizing available price history into a transparent technical bias.</p>
          </div>
        </div>
        <div className={`mce-conviction ${bearish ? "is-bearish" : bullish ? "is-bullish" : "is-neutral"}`}>
          <small>DIRECTIONAL INDEX · NOT PROBABILITY</small>
          <strong>{analysis.available ? `${(bearish ? bearishPct : analysis.score).toFixed(0)} / 100 ${bearish ? "BEARISH" : bullish ? "BULLISH" : "NEUTRAL"}` : "AWAITING DATA"}</strong>
        </div>
      </header>

      <div className="mce-meter-labels"><span>BEARISH (0%)</span><span>BULLISH (100%)</span></div>
      <div className="mce-meter" role="img" aria-label={`Bullish technical score ${analysis.score} percent`}>
        <div className={`mce-meter-fill ${bearish ? "bearish" : bullish ? "bullish" : "neutral"}`} style={{ width: `${analysis.score}%` }} />
      </div>

      <div className="mce-main-grid">
        <div className={`mce-regime-card ${bearish ? "bearish" : bullish ? "bullish" : "neutral"}`}>
          <div className="mce-eyebrow">MARKET REGIME INTERPRETER</div>
          <h3>{analysis.available ? (bearish ? `${analysis.conviction} · Bearish` : bullish ? `${analysis.conviction} · Bullish` : "Neutral / Mixed Regime") : "Waiting for market data"}</h3>
          <p><b>Market status:</b> {analysis.trendText}</p>
          <div className="mce-guidance-row">
            {bearish ? <ArrowDownRight size={17} /> : bullish ? <ArrowUpRight size={17} /> : <CircleHelp size={17} />}
            <span>{bearish ? "Watch whether rallies fail near recent resistance; avoid assuming a reversal." : bullish ? "Watch whether pullbacks hold; avoid chasing extended moves." : "Wait for trend and momentum to align before assigning a directional bias."}</span>
          </div>
          <div className="mce-signal-banner">
            <span className="mce-signal-dot" />
            {analysis.available ? `${analysis.signal.toUpperCase()} · ${analysis.conviction.toUpperCase()}` : "NO VERIFIED SIGNAL"}
          </div>
          <button className="mce-guide-button" onClick={() => setShowGuide((v) => !v)}>
            <BookOpen size={15} /> {showGuide ? "HIDE SCORING GUIDE" : "SCORING GUIDE"}
          </button>
        </div>

        <div className="mce-pressure-card">
          <div className="mce-card-topline">
            <div className="mce-eyebrow">GOLD PRICE MOMENTUM PROFILE <span className="mce-live-dot" /></div>
            <span className={`mce-status-chip ${response?.status === "live" ? "live" : "muted"}`}>{response?.status === "live" ? "PROVIDER LIVE" : "DATA STATUS CHECK"}</span>
          </div>
          <div className="mce-stats-row">
            <div><small>{asset} PRICE</small><strong>{fmt(analysis.price, 2)}</strong></div>
            <div><small>5-CANDLE MOMENTUM</small><strong className={(analysis.momentumPct ?? 0) > 0 ? "mce-positive" : (analysis.momentumPct ?? 0) < 0 ? "mce-negative" : ""}>{analysis.momentumPct == null ? "—" : `${analysis.momentumPct > 0 ? "+" : ""}${fmt(analysis.momentumPct, 3)}%`}</strong></div>
            <div><small>RSI (APPROX.)</small><strong>{fmt(analysis.rsi, 1)}</strong></div>
          </div>
          <div className="mce-histogram" aria-label="Recent candle return histogram">
            {analysis.recentMoves.length ? analysis.recentMoves.map((move, i) => (
              <span key={i} className={move >= 0 ? "positive" : "negative"} style={{ height: `${Math.max(5, Math.min(100, Math.abs(move) * 3500))}%` }} title={`${move.toFixed(3)}% candle return`} />
            )) : <div className="mce-no-histogram">Candle history is not available from the current provider.</div>}
          </div>
          <div className="mce-data-note"><AlertTriangle size={14} /><span>{analysis.note}</span></div>
        </div>
      </div>

      {analysis.available && (
        <div className="mce-breakdown-panel">
          <div className="mce-breakdown-heading">
            <div><b>Directional score breakdown</b><span>Weighted technical inputs · updates with candle data</span></div>
            <small>{analysis.conviction.toUpperCase()}</small>
          </div>
          {([
            { label: "Price vs. moving average", weight: 45, strength: analysis.trendStrength },
            { label: "5-candle momentum", weight: 35, strength: analysis.momentumStrength },
            { label: "Approximate RSI", weight: 20, strength: analysis.rsiStrength },
          ] as const).map((item) => (
            <div className="mce-breakdown-row" key={item.label}>
              <span>{item.label}<small>{item.weight}% weight</small></span>
              <div className="mce-breakdown-track"><i className={item.strength > 0.08 ? "positive" : item.strength < -0.08 ? "negative" : "neutral"} style={{ width: `${Math.abs(item.strength) * 100}%` }} /></div>
              <strong className={item.strength > 0.08 ? "tone-positive" : item.strength < -0.08 ? "tone-negative" : "tone-neutral"}>{item.strength > 0.08 ? "Bullish" : item.strength < -0.08 ? "Bearish" : "Neutral"}</strong>
            </div>
          ))}
          <p>Scores near 50 are neutral. A directional reading is a technical index, not a probability of profit.</p>
        </div>
      )}

      <div className="mce-summary-strip">
        <Sparkles size={18} />
        <p><b>Confluence summary:</b> {analysis.available ? `${analysis.conviction}. The directional index combines three technical inputs and is intentionally capped to avoid implying a calibrated probability.` : "No directional index is calculated until verified candle history is available."} DXY, macro, trade-level delta, and order-book data are not connected to this score.</p>
      </div>

      <div className="mce-metrics-grid">
        <Metric label="TECHNICAL EDGE" value={analysis.available ? `${analysis.score - 50 > 0 ? "+" : ""}${(analysis.score - 50).toFixed(0)}` : "N/A"} tone={analysis.score > 55 ? "positive" : analysis.score < 45 ? "negative" : "neutral"} detail={analysis.available ? "Trend, momentum & RSI blend" : "Awaiting price history"} />
        <Metric label="GOLD ↔ DXY CORRELATION" value={correlation?.status === "ok" && typeof correlation.matrix?.[0]?.[2] === "number" ? `${correlation.matrix[0][2]! > 0 ? "+" : ""}${(correlation.matrix[0][2]! * 100).toFixed(0)}%` : context?.dxy ? `${context.dxy.value.toFixed(2)} DXY` : "N/A"} tone={correlation?.status === "ok" && typeof correlation.matrix?.[0]?.[2] === "number" ? (correlation.matrix[0][2]! < 0 ? "positive" : "negative") : "neutral"} detail={correlation?.status === "ok" && typeof correlation.matrix?.[0]?.[2] === "number" ? `90D return correlation · ${correlation.observations ?? ""} observations` : context?.dxy ? `DXY daily ${context.dxy.changePct == null ? "change unavailable" : `${context.dxy.changePct > 0 ? "+" : ""}${context.dxy.changePct.toFixed(2)}%`} · daily feed` : "DXY feed unavailable"} />
        <Metric label="MACRO ENVIRONMENT" value={context?.us10y ? `${context.us10y.value.toFixed(2)}%` : "N/A"} tone={context?.us10y?.change == null ? "neutral" : context.us10y.change > 0 ? "negative" : context.us10y.change < 0 ? "positive" : "neutral"} detail={context?.us10y ? `US 10Y yield · daily ${context.us10y.change == null ? "change n/a" : `${context.us10y.change > 0 ? "+" : ""}${context.us10y.change.toFixed(2)} pp`}${calendar?.status === "live" ? " · calendar feed live" : calendar?.status === "unavailable" ? " · calendar API not configured" : ""}` : "US 10Y daily feed unavailable"} />
        <Metric label="VOLUMETRIC DELTA (EST.)" value={analysis.available ? estimatedDelta(response?.data?.candles || []).label : "N/A"} tone={analysis.available ? estimatedDelta(response?.data?.candles || []).tone : "neutral"} detail={analysis.available ? `Candle-direction × provider volume · ${estimatedDelta(response?.data?.candles || []).count} bars; not trade-side delta` : "Provider candle volume unavailable"} />
        <Metric label="ORDER BOOK DEPTH (L2)" value="Unavailable" tone="neutral" detail="No free consolidated XAU/USD L2 feed; not estimated or fabricated" />
      </div>

      <div className="mce-footer">
        <span><Clock3 size={12} /> {updatedAt ? `Last provider timestamp: ${updatedAt}` : busy ? "Refreshing market data…" : "No provider timestamp available"}</span>
        <span><ShieldAlert size={13} /> Educational market context — not a verified probability or investment advice.</span>
      </div>

      {showGuide && (
        <div className="mce-guide-panel">
          <h4><Gauge size={16} /> How the score works</h4>
          <p>Price relative to a recent moving average contributes 45%, short-term momentum contributes 35%, and approximate RSI contributes 20%. Each input is normalized to a range from −1 to +1, then combined into a directional index deliberately capped between 25 and 75. Values near 50 are neutral; 42–58 is treated as the neutral zone. This is a heuristic indicator, not a statistically calibrated probability.</p>
          <p>Connected context feeds: DXY/gold 90-day return correlation from the existing correlation endpoint and US 10-year Treasury yield from daily market history. The economic calendar status reflects the configured calendar API, not the embedded TradingView widget. The volume figure is a candle-direction estimate using provider volume and is not trade-aggressor delta. Genuine Level 2 depth is unavailable for the current free spot-gold feed; it is intentionally not fabricated.</p>
        </div>
      )}
    </section>
  );
}

function estimatedDelta(candles: Candle[]) {
  const valid = candles.filter(c => Number.isFinite(c.open) && Number.isFinite(c.close) && Number.isFinite(c.volume) && (c.volume ?? 0) > 0).slice(-10);
  if (!valid.length) return { label: "N/A", tone: "neutral" as const, count: 0 };
  const delta = valid.reduce((sum, c) => {
    const range = Math.max(c.high - c.low, Math.abs(c.close - c.open), 0.000001);
    return sum + (c.close - c.open) / range * (c.volume ?? 0);
  }, 0);
  return { label: `${delta > 0 ? "+" : ""}${Math.round(delta).toLocaleString("en-US")}`, tone: delta > 0 ? "positive" as const : delta < 0 ? "negative" as const : "neutral" as const, count: valid.length };
}

function Metric({ label, value, tone, detail }: { label: string; value: string; tone: "positive" | "negative" | "neutral"; detail: string }) {
  return (
    <div className="mce-metric-card">
      <small>{label}</small>
      <strong className={`tone-${tone}`}>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
