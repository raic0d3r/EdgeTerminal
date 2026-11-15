"use client";

import { marketApiUrl, fetchMarketData } from "@/lib/market-selection";
import { calculateUnifiedBias } from "@/lib/market-intelligence/unified-bias";
import { appendBiasSnapshot, evaluateBiasHistory, evaluateSelectedTimeframeOutcomes, getDirectionalSignalHistory, type BiasSnapshot } from "@/lib/market-intelligence/bias-validation";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Bell, BellRing, Download, Info, RefreshCw } from "lucide-react";
import PushNotifications from "@/components/push-notifications";
import { auth } from "@/lib/firebase";
import { getIdToken } from "firebase/auth";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type MarketResponse = { status?: string; error?: string; disclaimer?: string; data?: { price?: number | null; source?: string; updatedAt?: string | null; candles?: Candle[]; dataNote?: string; sourceCandleInterval?: string } };
type ContextSignal = { status: string; bias: Bias; contrarianBias?: Bias; provider?: string; url?: string; source?: string; detail?: string; reportDate?: string; weeklyChange?: number | null; percentile52w?: number | null; netContracts?: number; openInterest?: number | null; reportCategory?: string; leveragedLong?: number | null; leveragedShort?: number | null; assetManagerNet?: number | null; dealerNet?: number | null; longPositionPercentage?: number; shortPositionPercentage?: number; previousLongPositionPercentage?: number | null; previousShortPositionPercentage?: number | null; longChangeReported?: number | null; shortChangeReported?: number | null; currentTimestamp?: string; previousTimestamp?: string | null; freshness?: string; score?: number | null; inputs?: Record<string, { value: number; date: string; previousValue?: number | null; comparisonDate?: string | null; change?: number | null } | null> };
type ContextResponse = { cot?: ContextSignal; retailSentiment?: ContextSignal; fundamentals?: ContextSignal; updatedAt?: string };
type Bias = "Bullish" | "Bearish" | "Neutral";
type TFResult = { label: string; bias: Bias; rsi: number | null; change: number | null; candles: Candle[]; status: string };
type AlertLevel = { name: string; price: number; kind: "support" | "resistance" };
type PriceAlertConfig = { asset: string; mode: "swing" | "scalp"; levels: AlertLevel[]; lastPrice: number; lastHigh?: number; lastLow?: number; lastCandleTime?: string; armedAt: number; triggered: string[] };

const TF_CONFIG = [
  { label: "5M", api: "5min", key: "5m" },
  { label: "15M", api: "15min", key: "15m" },
  { label: "1H", api: "1h", key: "1h" },
  { label: "4H", api: "4h", key: "4h" },
  { label: "DAILY", api: "1day", key: "1d" },
];

function fmt(n: number | null | undefined, digits = 2) {
  return n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function rsiOf(closes: number[]) {
  if (closes.length < 15) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}
function aggregateSelectedCandles(candles: Candle[], interval: string): Candle[] {
  if (!["10m", "30m", "1w", "1mo"].includes(interval)) return candles;
  const buckets = new Map<number, Candle[]>();
  for (const candle of candles) {
    const timestamp = Date.parse(candle.time);
    if (!Number.isFinite(timestamp)) continue;
    const date = new Date(timestamp);
    let key: number;
    if (interval === "10m") key = Math.floor(timestamp / 600_000);
    else if (interval === "30m") key = Math.floor(timestamp / 1_800_000);
    else if (interval === "1w") {
      const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      key = monday.getTime();
    } else key = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    buckets.set(key, [...(buckets.get(key) || []), candle]);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([key, rows]) => ({
    time: new Date(key * (interval === "10m" ? 600_000 : interval === "30m" ? 1_800_000 : 1)).toISOString(),
    open: rows[0].open, high: Math.max(...rows.map(row => row.high)),
    low: Math.min(...rows.map(row => row.low)), close: rows[rows.length - 1].close,
    volume: rows.reduce((sum, row) => sum + (row.volume || 0), 0),
  }));
}

function analyse(candles: Candle[], label: string, status: string): TFResult {
  const sorted = [...candles].filter(c => [c.open,c.high,c.low,c.close].every(n => Number.isFinite(n) && n > 0)).sort((a,b) => Date.parse(a.time)-Date.parse(b.time));
  const closes = sorted.map(c => c.close);
  const last = closes.at(-1), previous = closes.length > 5 ? closes.at(-6) : closes.at(-2);
  const smaWindow = closes.slice(-Math.min(20, closes.length));
  const sma = smaWindow.length ? smaWindow.reduce((a,b)=>a+b,0)/smaWindow.length : null;
  const change = last != null && previous != null && previous !== 0 ? (last-previous)/previous*100 : null;
  const bias: Bias = last == null || sma == null ? "Neutral" : last > sma && (change ?? 0) >= 0 ? "Bullish" : last < sma && (change ?? 0) <= 0 ? "Bearish" : "Neutral";
  return { label, bias, rsi: rsiOf(closes), change, candles: sorted, status };
}

async function syncServerAlert(asset: string, alert: PriceAlertConfig | null) {
  if (!auth?.currentUser) return;
  try { const token=await getIdToken(auth.currentUser); await fetch("/api/push/alerts",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({asset,alert})}); } catch { /* Local alerts remain available; server sync can be retried. */ }
}

export default function MasterScorecard({ asset = "XAU/USD", interval = "15m", theme = "dark" }: { asset?: string; interval?: string; theme?: "dark" | "light" }) {
  const [responses, setResponses] = useState<Record<string, MarketResponse>>({});
  const [contextData, setContextData] = useState<ContextResponse | null>(null);
  const [biasValidation, setBiasValidation] = useState<ReturnType<typeof evaluateBiasHistory> | null>(null);
  const [validationByAsset, setValidationByAsset] = useState<Record<string, ReturnType<typeof evaluateBiasHistory> | null>>({});
  const [signalHistory, setSignalHistory] = useState<BiasSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"swing" | "scalp">("swing");
  const [showGuide, setShowGuide] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlertConfig | null>(null);
  const [alertsReady, setAlertsReady] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  async function load() {
    setBusy(true);
    const entries = await Promise.all(TF_CONFIG.map(async tf => {
      try {
        const res = await fetchMarketData(marketApiUrl(asset, tf.api), { cache: "no-store" });
        return [tf.key, await res.json() as MarketResponse] as const;
      } catch {
        return [tf.key, { status: "unavailable", error: "Market data request failed." } as MarketResponse] as const;
      }
    }));
    setResponses(Object.fromEntries(entries));
    try {
      const contextResponse = await fetch(`/api/market-context?asset=${encodeURIComponent(asset)}`, { cache: "no-store" });
      if (contextResponse.ok) setContextData(await contextResponse.json() as ContextResponse);
      else setContextData(null);
    } catch { setContextData(null); }
    setLastUpdated(new Date());
    setBusy(false);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  const frames = useMemo(() => TF_CONFIG.map(tf => {
    const response = responses[tf.key];
    return { ...analyse(response?.data?.candles || [], tf.label, response?.status || "loading"), response };
  }), [responses]);
  const activeResponse = responses[interval === "1m" || interval === "5m" || interval === "10m" ? "5m" : interval === "15m" || interval === "30m" ? "15m" : interval === "1h" ? "1h" : interval === "4h" ? "4h" : "1d"];
  const selectedCandles = useMemo(() => aggregateSelectedCandles(activeResponse?.data?.candles || [], interval), [activeResponse, interval]);
  const selectedAnalysis = useMemo(() => analyse(selectedCandles, interval.toUpperCase(), activeResponse?.status || "loading"), [selectedCandles, interval, activeResponse?.status]);
  const currentPrice = activeResponse?.data?.price ?? frames.flatMap(f => f.candles).at(-1)?.close ?? null;
  const availableFrames = frames.filter(f => f.candles.length >= 5);
  const bullish = availableFrames.filter(f => f.bias === "Bullish").length;
  const bearish = availableFrames.filter(f => f.bias === "Bearish").length;
  const score = availableFrames.length ? Math.round(50 + ((bullish - bearish) / availableFrames.length) * 50) : null;
  const technicalBias: Bias = score == null ? "Neutral" : score >= 60 ? "Bullish" : score <= 40 ? "Bearish" : "Neutral";
  const unifiedBias = calculateUnifiedBias([
    { key: "technical", label: "Technical + multi-timeframe", bias: technicalBias, weight: 40, active: availableFrames.length > 0, detail: `${availableFrames.length}/5 timeframes loaded; 5M, 15M, 1H, 4H, Daily` },
    { key: "cot", label: "CFTC institutional positioning", bias: contextData?.cot?.bias || "Neutral", weight: 20, active: contextData?.cot?.status === "connected", detail: contextData?.cot?.status === "connected" ? `Weekly report ${contextData.cot.reportDate || "date unavailable"}` : "Unavailable; excluded" },
    { key: "retail", label: "Retail directional positioning", bias: contextData?.retailSentiment?.bias || "Neutral", weight: 15, active: contextData?.retailSentiment?.status === "connected", detail: contextData?.retailSentiment?.status === "connected" ? `${contextData.retailSentiment.provider || "Provider"} · directional positioning` : "Unavailable; excluded" },
    { key: "fundamentals", label: "Macro fundamentals", bias: contextData?.fundamentals?.bias || "Neutral", weight: 25, active: contextData?.fundamentals?.status === "connected", detail: contextData?.fundamentals?.status === "connected" ? "FRED yield and broad USD directional proxy" : "Unavailable; excluded" },
  ]);
  const bias: Bias = unifiedBias.bias;
  // Use the connected broker's completed 1H candles to evaluate matured forecasts.
  // The market route already respects the selected cTrader/Exness provider.
  const validationResponse = responses["1h"];
  const validationBrokerCandles = validationResponse?.data?.sourceCandleInterval && validationResponse.data.sourceCandleInterval !== "1h"
    ? []
    : validationResponse?.data?.candles || [];
  const sourceSignature = JSON.stringify(unifiedBias.sources.map(item => ({ key: item.key, bias: item.bias, active: item.active })));
  useEffect(() => {
    try {
      const assets = ["XAU/USD", "XAG/USD"];
      const histories: Record<string, ReturnType<typeof evaluateBiasHistory> | null> = {};
      const combinedHistory: BiasSnapshot[] = [];
      for (const item of assets) {
        const raw = JSON.parse(window.localStorage.getItem(`edge-unified-bias-history:${item}:${interval}`) || (interval === "15m" ? window.localStorage.getItem(`edge-unified-bias-history:${item}`) : "[]") || "[]");
        const rows: BiasSnapshot[] = Array.isArray(raw) ? raw.map((row: BiasSnapshot) => ({ ...row, timeframe: row.timeframe || "15m" })) : [];
        histories[item] = evaluateBiasHistory(rows, item, Date.now(), interval);
        combinedHistory.push(...rows);
      }
      setSignalHistory(combinedHistory);
      setValidationByAsset(histories);
    } catch {
      setValidationByAsset({});
      setSignalHistory([]);
    }
  }, [asset, interval]);

  useEffect(() => {
    if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) return;
    const saveSnapshot = () => {
      try {
        const key = `edge-unified-bias-history:${asset}:${interval}`;
        const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
        const history: BiasSnapshot[] = Array.isArray(parsed) ? parsed : [];
        const next = appendBiasSnapshot(history, {
          asset, timeframe: interval, timestamp: new Date().toISOString(), price: currentPrice,
          bias: unifiedBias.bias, score: unifiedBias.score,
          sources: unifiedBias.sources.map(item => ({ key: item.key, bias: item.bias, active: item.active })),
        });
        if (next.length !== history.length) window.localStorage.setItem(key, JSON.stringify(next));
        setBiasValidation(evaluateBiasHistory(next, asset, Date.now(), interval, validationBrokerCandles));
        const otherAsset = asset === "XAU/USD" ? "XAG/USD" : "XAU/USD";
        const otherKey = `edge-unified-bias-history:${otherAsset}:${interval}`;
        const otherRaw = JSON.parse(window.localStorage.getItem(otherKey) || "[]");
        const otherHistory: BiasSnapshot[] = Array.isArray(otherRaw) ? otherRaw : [];
        setSignalHistory([...next, ...otherHistory]);
        setValidationByAsset({
          [asset]: evaluateBiasHistory(next, asset, Date.now(), interval, validationBrokerCandles),
          [otherAsset]: evaluateBiasHistory(otherHistory, otherAsset, Date.now(), interval),
        });
      } catch {
        setBiasValidation(null);
      }
    };
    saveSnapshot();
    const timer = window.setInterval(saveSnapshot, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [asset, interval, currentPrice, unifiedBias.bias, unifiedBias.score, sourceSignature, validationBrokerCandles]);
  const timelineDates = [...new Set((biasValidation?.performanceTimeline || []).map(point => point.date))].slice(-14);
  const chartSeries = [
    { hours: 1, color: "#38BDF8" },
    { hours: 4, color: "#34D399" },
    { hours: 12, color: "#FBBF24" },
    { hours: 24, color: "#FB7185" },
  ].map(series => {
    const points = timelineDates.map(date => biasValidation?.performanceTimeline.find(point => point.date === date && point.horizonHours === series.hours)).filter((point): point is NonNullable<typeof point> => Boolean(point && point.accuracy != null));
    const coordinates = points.map(point => {
      const x = timelineDates.length <= 1 ? 300 : 12 + (timelineDates.indexOf(point.date) / (timelineDates.length - 1)) * 576;
      const y = 164 - (Math.max(0, Math.min(100, point.accuracy || 0)) / 100) * 140;
      return `${x},${y}`;
    }).join(" ");
    return { ...series, points, coordinates };
  });
  const validationAssets = ["XAU/USD", "XAG/USD"];
  const selectedOutcomeRows = useMemo(() => evaluateSelectedTimeframeOutcomes(
    signalHistory, asset, interval,
    interval === "1m" ? [] : selectedCandles.map(candle => ({ time: candle.time, close: candle.close })),
  ), [signalHistory, asset, interval, selectedCandles]);
  const selectedOutcomeByTimestamp = new Map(selectedOutcomeRows.map(row => [row.timestamp, row]));
  const recentSignals = getDirectionalSignalHistory(signalHistory, 8).map(snapshot => {
    const selectedOutcome = selectedOutcomeByTimestamp.get(snapshot.timestamp);
    // Only score against candles for the currently selected instrument. Other-instrument
    // rows remain explicitly unverified until that instrument's own candles are loaded.
    const isCurrentAsset = snapshot.asset === asset;
    const outcome = isCurrentAsset ? selectedOutcome?.outcome || "Awaiting Price" : "Awaiting Price";
    const returnPct = isCurrentAsset ? selectedOutcome?.returnPct ?? null : null;
    return { ...snapshot, returnPct, outcome };
  });
  const source = activeResponse?.data?.source || frames.find(f => f.response?.data?.source)?.response?.data?.source || "Market provider";
  const retailProviderName = asset === "XAU/USD" ? "Sentmo" : "TradeLytics";
  const baseCandles = (activeResponse?.data?.candles || frames.find(f => f.candles.length)?.candles || []).slice(-100);
  const levels = useMemo(() => {
    if (!baseCandles.length || currentPrice == null) return [];
    const recent = baseCandles.slice(-(mode === "swing" ? 60 : 20));
    const highs = recent.map(c => c.high).filter(Number.isFinite);
    const lows = recent.map(c => c.low).filter(Number.isFinite);
    const high = Math.max(...highs), low = Math.min(...lows);
    const range = Math.max(high - low, currentPrice * 0.0005);
    const candidates = [
      { name: "RESISTANCE 3", price: currentPrice + range * 0.75, kind: "resistance", note: "Range extension" },
      { name: "RESISTANCE 2", price: high, kind: "resistance", note: "Recent swing high" },
      { name: "RESISTANCE 1", price: currentPrice + range * 0.25, kind: "resistance", note: "Near-term target" },
      { name: "LIVE PRICE", price: currentPrice, kind: "current", note: "Current market price" },
      { name: "SUPPORT 1", price: currentPrice - range * 0.25, kind: "support", note: "Near-term target" },
      { name: "SUPPORT 2", price: low, kind: "support", note: "Recent swing low" },
      { name: "SUPPORT 3", price: currentPrice - range * 0.75, kind: "support", note: "Range extension" },
    ];
    return candidates.sort((a,b) => b.price-a.price);
  }, [baseCandles, currentPrice, mode]);

  // Restore the user's armed level snapshot. Levels stay fixed until the user rearms them.
  useEffect(() => {
    try {
      setPriceAlerts(null);
      const raw = window.localStorage.getItem(`edge-price-alerts:${asset}`);
      if (raw) {
        const saved = JSON.parse(raw) as PriceAlertConfig;
        if (saved.asset === asset && saved.levels?.length === 6) setPriceAlerts(saved);
      }
    } catch { /* Ignore malformed local preference data. */ }
    setAlertsReady(true);
  }, [asset]);

  useEffect(() => {
    if (!alertsReady || !priceAlerts || priceAlerts.asset !== asset || currentPrice == null || !Number.isFinite(currentPrice)) return;
    const previous = priceAlerts.lastPrice;
    const latestCandle = baseCandles.at(-1);
    if (!Number.isFinite(previous)) {
      setPriceAlerts({ ...priceAlerts, lastPrice: currentPrice, lastHigh: latestCandle?.high, lastLow: latestCandle?.low, lastCandleTime: latestCandle?.time });
      return;
    }
    const sameCandle = !!latestCandle && latestCandle.time === priceAlerts.lastCandleTime;
    const touched = priceAlerts.levels.find(level => {
      if (priceAlerts.triggered.includes(level.name)) return false;
      const crossedByPrice = (previous < level.price && currentPrice >= level.price) || (previous > level.price && currentPrice <= level.price);
      const expandedHigh = sameCandle && Number.isFinite(latestCandle?.high) && (priceAlerts.lastHigh == null || priceAlerts.lastHigh < level.price) && (latestCandle?.high ?? -Infinity) >= level.price;
      const expandedLow = sameCandle && Number.isFinite(latestCandle?.low) && (priceAlerts.lastLow == null || priceAlerts.lastLow > level.price) && (latestCandle?.low ?? Infinity) <= level.price;
      const isNewPostArmCandle = !!latestCandle && latestCandle.time !== priceAlerts.lastCandleTime && Date.parse(latestCandle.time) > priceAlerts.armedAt;
      const touchedInNewCandle = isNewPostArmCandle && (latestCandle?.low ?? Infinity) <= level.price && (latestCandle?.high ?? -Infinity) >= level.price;
      return crossedByPrice || expandedHigh || expandedLow || touchedInNewCandle;
    });
    if (touched) {
      const direction = currentPrice >= touched.price ? "up to" : "down to";
      const title = `${asset} touched ${touched.name}`;
      const body = `${asset} moved ${direction} ${fmt(touched.price)}.`;
      setAlertMessage(`${title} · ${body}`);
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try { new Notification(title, { body, tag: `edge-level-${asset}-${touched.name}` }); } catch { /* In-app alert remains available. */ }
      }
      const next = { ...priceAlerts, lastPrice: currentPrice, lastHigh: latestCandle?.high, lastLow: latestCandle?.low, lastCandleTime: latestCandle?.time, triggered: [...priceAlerts.triggered, touched.name] };
      setPriceAlerts(next);
      try { window.localStorage.setItem(`edge-price-alerts:${asset}`, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
      return;
    }
    if (previous !== currentPrice) {
      const next = { ...priceAlerts, lastPrice: currentPrice, lastHigh: latestCandle?.high, lastLow: latestCandle?.low, lastCandleTime: latestCandle?.time };
      setPriceAlerts(next);
      try { window.localStorage.setItem(`edge-price-alerts:${asset}`, JSON.stringify(next)); } catch { /* Storage may be unavailable. */ }
    }
  }, [alertsReady, asset, currentPrice, priceAlerts, baseCandles]);

  async function togglePriceAlerts() {
    if (priceAlerts?.asset === asset) {
      setPriceAlerts(null);
      setAlertMessage("Price alerts are paused.");
      try { window.localStorage.removeItem(`edge-price-alerts:${asset}`); } catch { /* Ignore storage failures. */ }
      void syncServerAlert(asset, null);
      return;
    }
    if (currentPrice == null || levels.length !== 7) {
      setAlertMessage("Price data is not ready yet. Refresh market data and try again.");
      return;
    }
    let permission = "unsupported";
    if ("Notification" in window) {
      permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
    }
    const snapshot: PriceAlertConfig = {
      asset,
      mode,
      levels: levels.filter(level => level.kind === "support" || level.kind === "resistance").map(level => ({ name: level.name, price: level.price, kind: level.kind as "support" | "resistance" })),
      lastPrice: currentPrice,
      lastHigh: baseCandles.at(-1)?.high,
      lastLow: baseCandles.at(-1)?.low,
      lastCandleTime: baseCandles.at(-1)?.time,
      armedAt: Date.now(),
      triggered: [],
    };
    setPriceAlerts(snapshot);
    setAlertMessage(permission === "granted" ? "Price alerts armed. Browser notifications are enabled." : "Price alerts armed in EdgeTerminal. Allow browser notifications to receive system alerts.");
    try { window.localStorage.setItem(`edge-price-alerts:${asset}`, JSON.stringify(snapshot)); } catch { /* In-app alerts still work during this session. */ }
    void syncServerAlert(asset, snapshot);
  }

  const technicalScore = score;
  const latestMove = selectedAnalysis;
  const rsi = selectedAnalysis.rsi;

  function downloadTargets() {
    // Generate a standalone, branded PDF in the browser without a paid service or CSV export.
    const W = 842, H = 595;
    const commands: string[] = [];
    const esc = (value: string) => value.replace(/[^\x20-\x7E]/g, "-").replace(/([\\()])/g, "\\$1");
    const color = (hex: string) => {
      const n = hex.replace("#", "");
      return `${parseInt(n.slice(0,2),16)/255} ${parseInt(n.slice(2,4),16)/255} ${parseInt(n.slice(4,6),16)/255}`;
    };
    const rect = (x:number,y:number,w:number,h:number,fill:string) => commands.push(`${color(fill)} rg ${x} ${y} ${w} ${h} re f`);
    const text = (x:number,y:number,size:number,value:string,fill="#E8EAF0",font="F1") => commands.push(`${color(fill)} rg BT /${font} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`);
    const line = (x1:number,y1:number,x2:number,y2:number,stroke="#2A2D35",width=0.7) => commands.push(`${color(stroke)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);

    rect(0, 0, W, H, "#101116");
    rect(0, H-7, W, 7, "#F5B400");
    text(38, 548, 23, "EDGE TERMINAL", "#F5F6FA", "F2");
    text(38, 526, 11, `MASTER SCORECARD & KEY LEVELS - ${asset}`, "#F5B400", "F2");
    text(38, 506, 9, "Market context report | Educational use only", "#A9AFBC");
    rect(38, 445, W-76, 45, "#1B1E27");
    text(52, 472, 8, "CURRENT PRICE", "#9CA4B4");
    text(52, 454, 14, currentPrice == null ? "Unavailable" : `$${fmt(currentPrice)}`, "#F5B400", "F2");
    text(230, 472, 8, "MASTER BIAS", "#9CA4B4");
    text(230, 454, 13, bias.toUpperCase(), bias === "Bullish" ? "#00D49A" : bias === "Bearish" ? "#FF5364" : "#F5B400", "F2");
    text(390, 472, 8, "TECHNICAL SCORE", "#9CA4B4");
    text(390, 454, 13, score == null ? "Unavailable" : `${score}/100`, "#E8EAF0", "F2");
    text(555, 472, 8, "SETUP", "#9CA4B4");
    text(555, 454, 12, mode.toUpperCase(), "#E8EAF0", "F2");
    text(38, 425, 12, "Calculated Support & Resistance Levels", "#F5F6FA", "F2");
    text(38, 408, 8, `Generated: ${new Date().toLocaleString("en-GB", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" })} (Germany time)`, "#A9AFBC");
    text(38, 395, 8, `Data source: ${source} | Calculation: recent ${mode === "swing" ? "60" : "20"}-candle range`, "#A9AFBC");

    const left = 38, tableW = W-76, headerY = 362, rowH = 31;
    rect(left, headerY, tableW, 24, "#252936");
    text(left+12, headerY+8, 8, "ZONE / LEVEL", "#F5B400", "F2");
    text(left+270, headerY+8, 8, "PRICE", "#F5B400", "F2");
    text(left+390, headerY+8, 8, "MARKET CONTEXT", "#F5B400", "F2");
    levels.forEach((level, i) => {
      const y = headerY - (i+1)*rowH;
      const bg = level.kind === "resistance" ? (i%2 ? "#21191D" : "#26191D") : level.kind === "support" ? (i%2 ? "#15231F" : "#172823") : "#1D2C46";
      rect(left, y, tableW, rowH, bg);
      rect(left, y, 4, rowH, level.kind === "resistance" ? "#FF5364" : level.kind === "support" ? "#00C995" : "#4385FF");
      text(left+12, y+12, 9, level.name, level.kind === "resistance" ? "#FF9BA5" : level.kind === "support" ? "#7DE6C7" : "#9FC3FF", "F2");
      text(left+270, y+12, 10, `$${fmt(level.price)}`, "#F5F6FA", "F2");
      text(left+390, y+12, 8, level.note, "#B7BDCA");
      line(left, y, left+tableW, y, "#303440", 0.4);
    });
    const footY = 43;
    line(38, footY+18, W-38, footY+18, "#343844", 0.7);
    text(38, footY, 8, "Not financial advice. Levels are estimates derived from available candle data; they are not guaranteed targets.", "#A9AFBC");
    text(38, 25, 7, "EDGE TERMINAL | Generated from the current dashboard snapshot", "#747D8D");

    const stream = commands.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
      `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((obj, i) => {
      offsets.push(new TextEncoder().encode(pdf).length);
      pdf += `${i+1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => pdf += `${String(offset).padStart(10,"0")} 00000 n \n`);
    pdf += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const blob = new Blob([pdf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Edge-Terminal-${asset.replace("/", "-")}-Key-Levels.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className={`msc-shell ${theme === "light" ? "msc-light" : ""}`}>
    <div className="msc-topline">
      <div><span className="msc-eyebrow">EDGE TERMINAL · MARKET CONTEXT</span><h2>Master Scorecard <span>&amp; Key Levels</span></h2><p>Multi-timeframe technical alignment and calculated price zones</p></div>
      <div className="msc-actions"><span className={`msc-status ${busy ? "busy" : ""}`}><i />{busy ? "Updating" : "Market data"}</span><button onClick={() => void load()} title="Refresh market data" className="msc-icon-btn"><RefreshCw size={15}/></button><button onClick={() => setShowGuide(v=>!v)} className="msc-help-btn"><Info size={15}/> {showGuide ? "Hide guide" : "Scorecard guide"}</button></div>
    </div>
    {showGuide && <div className="msc-guide"><b>How the unified score works</b><p>{unifiedBias.methodology} Technical bias aggregates available 5M, 15M, 1H, 4H and Daily candle trends. CFTC COT is institutional trader-category positioning, not retail-client sentiment. Retail directional bias follows the larger reported long/short position; contrarian crowding is displayed separately. Missing feeds are excluded, never treated as bearish.</p></div>}
    <div className="msc-overview">
      <article className="msc-card msc-bias-card"><div className="msc-card-head">MASTER BIAS <Info size={13}/></div><strong className={`msc-bias msc-bias-underline ${bias.toLowerCase()}`}>{bias.toUpperCase()}</strong><div className="msc-score-track"><span style={{width:`${unifiedBias.score ?? 50}%`}}/></div><div className="msc-card-foot"><span>Unified score · {unifiedBias.activeInputs}/{unifiedBias.totalInputs} active sources</span><b>{unifiedBias.score == null ? "—" : `${unifiedBias.score}/100`}</b></div><div className="msc-unified-breakdown"><div className="msc-unified-breakdown-head"><b>Source contribution</b><span>Confidence {unifiedBias.confidence}%</span></div>{unifiedBias.sources.map(item => <div className="msc-score-row" key={item.key}><span>{item.label} <small>{item.active ? `${item.weight}% weight` : "Not included"}</small></span><b className={item.active ? `msc-bias-underline ${item.bias.toLowerCase()}` : "msc-muted"}>{item.active ? `${item.bias} · ${item.contribution > 0 ? "+" : ""}${item.contribution.toFixed(1)}` : "N/A"}</b></div>)}<small className="msc-signal-detail">Confidence represents the share of configured source weight currently available, not statistical forecast probability. Available weights are normalized; missing sources do not count as bearish.</small></div>
        <div className="msc-bias-validation">
          <div className="msc-unified-breakdown-head"><b>Historical bias validation</b><span>{biasValidation?.snapshots ?? 0} saved snapshots · local history</span></div>
          <div className="msc-validation-grid">{(biasValidation?.horizons || []).map(item => <div className="msc-validation-item" key={item.horizonHours}>
            <b>{item.horizonHours}H</b><strong>{item.validationAccuracy == null ? "—" : `${Math.round(item.validationAccuracy)}%`}</strong><small>Out-of-sample directional accuracy</small>
            <small>{item.correct} correct · {item.incorrect} incorrect · {item.flat} flat</small>
            <small>{item.pending} pending · {item.awaitingPrice} awaiting price</small>
            <small>{item.validationSignals} test · {item.directionalSignals} directional</small>
            <small>Bull {item.bullishAccuracy == null ? "—" : `${Math.round(item.bullishAccuracy)}%`} · Bear {item.bearishAccuracy == null ? "—" : `${Math.round(item.bearishAccuracy)}%`}</small>
            <small>Neutral {item.neutralSignals} · avg move {item.neutralAverageAbsoluteReturnPct == null ? "—" : `${item.neutralAverageAbsoluteReturnPct.toFixed(3)}%`}</small>
            <small>Test avg signed {item.validationAverageSignedReturnPct == null ? "—" : `${item.validationAverageSignedReturnPct.toFixed(3)}%`}</small>
            <small>{item.validationSignals < 30 ? "Insufficient validation sample (<30)" : "Validation sample: exploratory"}</small>
          </div>)}</div>
          <div className="msc-validation-section">
            <div className="msc-unified-breakdown-head"><b>Historical performance chart</b><span>Daily directional accuracy</span></div>
            <div className="msc-validation-legend">{chartSeries.map(series => <span key={series.hours}><i style={{background:series.color}}/>{series.hours}H</span>)}</div>
            {timelineDates.length >= 2 ? <svg className="msc-validation-chart" viewBox="0 0 600 190" role="img" aria-label="Historical daily directional accuracy by forecast horizon">
              {[0,25,50,75,100].map(value => <g key={value}><line x1="12" x2="588" y1={164-value*1.4} y2={164-value*1.4} stroke="currentColor" opacity=".12" strokeDasharray="3 4"/><text x="4" y={168-value*1.4} fontSize="9" fill="currentColor" opacity=".6">{value}</text></g>)}
              {chartSeries.map(series => series.coordinates ? <polyline key={series.hours} points={series.coordinates} fill="none" stroke={series.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/> : null)}
              <text x="12" y="184" fontSize="9" fill="currentColor" opacity=".65">{timelineDates[0]}</text><text x="588" y="184" textAnchor="end" fontSize="9" fill="currentColor" opacity=".65">{timelineDates.at(-1)}</text>
            </svg> : <small className="msc-signal-detail">The chart will appear after snapshots mature into at least two calendar-day buckets for one or more horizons.</small>}
          </div>
          <div className="msc-validation-section">
            <div className="msc-unified-breakdown-head"><b>Gold / Silver comparison</b><span>Separate instrument histories</span></div>
            <div className="msc-validation-compare">{validationAssets.map(item => {
              const report = validationByAsset[item] || (item === asset ? biasValidation : null);
              const oneHour = report?.horizons.find(h => h.horizonHours === 1);
              return <div className="msc-validation-compare-card" key={item}><b>{item === "XAU/USD" ? "XAUUSD · Gold" : "XAGUSD · Silver"}</b><strong>{report?.snapshots ?? 0} snapshots</strong><small>1H accuracy: {oneHour?.validationAccuracy == null ? "—" : `${oneHour.validationAccuracy.toFixed(1)}%`}</small><small>1H: {oneHour?.correct ?? 0} correct · {oneHour?.incorrect ?? 0} incorrect · {oneHour?.flat ?? 0} flat</small><small>1H: {oneHour?.pending ?? 0} pending · {oneHour?.awaitingPrice ?? 0} awaiting price</small><small>1H test sample: {oneHour?.validationSignals ?? 0}</small><small>24H accuracy: {report?.horizons.find(h=>h.horizonHours===24)?.validationAccuracy == null ? "—" : `${report?.horizons.find(h=>h.horizonHours===24)?.validationAccuracy?.toFixed(1)}%`}</small><small>24H pending: {report?.horizons.find(h=>h.horizonHours===24)?.pending ?? 0}</small></div>;
            })}</div>
          </div>
          <div className="msc-validation-section">
            <div className="msc-unified-breakdown-head"><b>Recent signal history</b><span>Latest 8 · {interval.toUpperCase()} outcome tracking</span></div>
            {recentSignals.length ? <><div className="msc-validation-table-wrap msc-desktop-signals"><table className="msc-validation-table"><thead><tr><th>Time</th><th>Asset</th><th>Timeframe</th><th>Bias</th><th>Price</th><th>Score</th><th>{interval.toUpperCase()} outcome</th><th>Return</th></tr></thead><tbody>{recentSignals.map((row,index)=><tr key={`${row.timestamp}-${index}`}><td>{new Date(row.timestamp).toLocaleString()}</td><td>{row.asset === "XAU/USD" ? "XAU" : "XAG"}</td><td>{row.timeframe || "15m"}</td><td><b className={`msc-bias-underline ${row.bias.toLowerCase()}`}>{row.bias}</b></td><td>{fmt(row.price, row.asset === "XAU/USD" ? 2 : 3)}</td><td>{row.score == null ? "—" : row.score}</td><td>{row.outcome}</td><td>{row.returnPct == null ? "—" : `${row.returnPct > 0 ? "+" : ""}${row.returnPct.toFixed(3)}%`}</td></tr>)}</tbody></table></div><div className="msc-mobile-signals">{recentSignals.map((row,index)=><article className="msc-mobile-signal" key={`${row.timestamp}-mobile-${index}`}><div className="msc-mobile-signal-head"><b>{row.asset === "XAU/USD" ? "XAUUSD · Gold" : "XAGUSD · Silver"}</b><b className={`msc-bias-underline ${row.bias.toLowerCase()}`}>{row.bias}</b></div><time>{new Date(row.timestamp).toLocaleString()}</time><div className="msc-mobile-signal-grid"><span>Timeframe<strong>{row.timeframe || "15m"}</strong></span><span>Price<strong>{fmt(row.price, row.asset === "XAU/USD" ? 2 : 3)}</strong></span><span>Score<strong>{row.score == null ? "—" : row.score}</strong></span><span>{interval.toUpperCase()} outcome<strong>{row.outcome}</strong></span><span>Return<strong>{row.returnPct == null ? "—" : `${row.returnPct > 0 ? "+" : ""}${row.returnPct.toFixed(3)}%`}</strong></span></div></article>)}</div></> : <small className="msc-signal-detail">No Bullish or Bearish signals recorded yet. Neutral readings remain in internal validation history and are not shown as trading signals.</small>}
          </div>
          <small className="msc-signal-detail">{biasValidation?.methodology || "Historical snapshots will be recorded locally as live prices and verified source readings arrive."}</small>
          <small className="msc-signal-detail">Collection begins with this version and persists in browser local storage separately for Gold/Silver and each selected timeframe. Recent Signal History displays Bullish and Bearish signals only; Neutral readings remain in internal research history and are excluded from the trade-signal ledger. Correct, incorrect and flat directional outcomes are separated; Neutral forecasts are never counted as directional wins or losses. Recent Signal History uses the globally selected header timeframe and its completed candles. Pending = selected timeframe has not elapsed; awaiting price = timeframe elapsed but no eligible completed candle was available. The separate 1H/4H/12H/24H research cards remain multi-horizon analysis. Validation uses chronological 70/30 development/test splits. Fewer than 30 directional test observations is insufficient for a meaningful accuracy claim. Results exclude costs, spreads and slippage.</small>
        </div></article>
      <article className="msc-card"><div className="msc-card-head">TECHNICAL SUMMARY <Info size={13}/></div><div className="msc-summary-row"><span>{interval.toUpperCase()} trend</span><b className={`msc-pill msc-bias-underline ${(latestMove?.bias || "Neutral").toLowerCase()}`}>{latestMove?.bias || "Unavailable"}</b></div><div className="msc-summary-row"><span>RSI (14) · {interval.toUpperCase()}</span><b>{rsi == null ? "—" : `${fmt(rsi,1)} ${rsi >= 70 ? "· Overbought" : rsi <= 30 ? "· Oversold" : ""}`}</b></div><div className="msc-summary-row"><span>Timeframes loaded</span><b>{availableFrames.length}/5</b></div></article>
      <article className="msc-card"><div className="msc-card-head">INSTITUTIONAL POSITIONING <Info size={13}/></div>
        <div className="msc-summary-row"><span>COT positioning</span><b className={`msc-signal-value ${contextData?.cot?.status === "connected" ? `msc-bias-underline ${contextData.cot.bias.toLowerCase()}` : "msc-muted"}`}>{contextData?.cot?.status === "connected" ? contextData.cot.bias : contextData?.cot?.status === "unavailable" ? "Unavailable" : "Not connected"}</b></div>
        {contextData?.cot?.status === "unavailable" && <div className="msc-cot-native" role="status">
          <div className="msc-signal-detail">CFTC COT feed unavailable · source excluded from Master Bias</div>
          <small className="msc-signal-detail">{contextData.cot.detail || "No CFTC response details were returned."}</small>
        </div>}
        {contextData?.cot?.status === "connected" && <div className="msc-cot-native" role="status">
          <div className="msc-signal-detail">{asset === "BTC/USD" ? "CFTC CME Bitcoin Futures · TFF · Leveraged Funds" : "CFTC Disaggregated Futures Only · Managed Money"}</div>
          <div className="msc-summary-row"><span>{asset === "BTC/USD" ? "Leveraged Funds net" : "Managed Money net"}</span><b>{contextData.cot.netContracts?.toLocaleString() ?? "—"} contracts</b></div>
          {asset === "BTC/USD" && <>
            <div className="msc-summary-row"><span>Leveraged Funds long / short</span><b>{contextData.cot.leveragedLong?.toLocaleString() ?? "—"} / {contextData.cot.leveragedShort?.toLocaleString() ?? "—"}</b></div>
            <div className="msc-summary-row"><span>Asset Manager net</span><b>{contextData.cot.assetManagerNet?.toLocaleString() ?? "—"} contracts</b></div>
            <div className="msc-summary-row"><span>Dealer net</span><b>{contextData.cot.dealerNet?.toLocaleString() ?? "—"} contracts</b></div>
          </>}
          <div className="msc-summary-row"><span>Weekly net change</span><b>{contextData.cot.weeklyChange == null ? "—" : `${contextData.cot.weeklyChange > 0 ? "+" : ""}${contextData.cot.weeklyChange.toLocaleString()}`}</b></div>
          <div className="msc-summary-row"><span>Open interest</span><b>{contextData.cot.openInterest?.toLocaleString() ?? "—"}</b></div>
          <div className="msc-summary-row"><span>52-week net-position percentile</span><b>{contextData.cot.percentile52w == null ? "—" : `${contextData.cot.percentile52w}/100`}</b></div>
          <small className="msc-signal-detail">Report date {contextData.cot.reportDate || "—"} · {contextData.cot.freshness || "Weekly"}. {contextData.cot.detail}</small>
        </div>}
        <div className="msc-summary-row"><span>Retail sentiment</span><b className={`msc-signal-value ${contextData?.retailSentiment?.status === "connected" ? `msc-bias-underline ${contextData.retailSentiment.bias.toLowerCase()}` : "msc-muted"}`}>{contextData?.retailSentiment?.status === "connected" ? contextData.retailSentiment.bias : contextData?.retailSentiment?.status === "unavailable" ? "Unavailable" : contextData?.retailSentiment?.status === "external_only" ? "External dashboard" : "Not available"}</b></div>
        {(contextData?.retailSentiment?.status === "connected" || contextData?.retailSentiment?.status === "external_only" || contextData?.retailSentiment?.status === "unavailable") && <div className="msc-retail-native" role="status">
          <div className="msc-retail-native-head"><span>{contextData.retailSentiment.provider || retailProviderName} retail sentiment</span><b>{contextData.retailSentiment.status === "connected" ? "LIVE DATA" : contextData.retailSentiment.status === "unavailable" ? "DATA UNAVAILABLE" : "NOT IMPORTED"}</b></div>
          <div className="msc-retail-native-grid">
            <div><small>Long positioning</small><strong>{contextData.retailSentiment.longPositionPercentage == null ? "—" : `${contextData.retailSentiment.longPositionPercentage}%`}</strong>{contextData.retailSentiment.previousLongPositionPercentage != null && <small>24h ago {contextData.retailSentiment.previousLongPositionPercentage}%</small>}</div>
            <div><small>Short positioning</small><strong>{contextData.retailSentiment.shortPositionPercentage == null ? "—" : `${contextData.retailSentiment.shortPositionPercentage}%`}</strong>{contextData.retailSentiment.previousShortPositionPercentage != null && <small>24h ago {contextData.retailSentiment.previousShortPositionPercentage}%</small>}</div>
            <div><small>Directional sentiment</small><strong className={contextData.retailSentiment.status === "connected" ? `msc-bias-underline ${contextData.retailSentiment.bias.toLowerCase()}` : "msc-muted"}>{contextData.retailSentiment.status === "connected" ? contextData.retailSentiment.bias : "Not verified"}</strong></div>
          </div>
          {contextData.retailSentiment.status === "connected" && <small className="msc-retail-native-note">24h reported change: Long {contextData.retailSentiment.longChangeReported == null ? "—" : `${contextData.retailSentiment.longChangeReported > 0 ? "+" : ""}${contextData.retailSentiment.longChangeReported}`} · Short {contextData.retailSentiment.shortChangeReported == null ? "—" : `${contextData.retailSentiment.shortChangeReported > 0 ? "+" : ""}${contextData.retailSentiment.shortChangeReported}`} · Last data {contextData.retailSentiment.currentTimestamp ? new Date(contextData.retailSentiment.currentTimestamp).toLocaleString() : "—"}. {contextData.retailSentiment.freshness}. {contextData.retailSentiment.detail}</small>}
          {contextData.retailSentiment.status === "connected" && contextData.retailSentiment.contrarianBias && <div className="msc-summary-row msc-retail-contrarian"><span>Contrarian interpretation · crowded positioning</span><b className={`msc-signal-value msc-bias-underline ${contextData.retailSentiment.contrarianBias.toLowerCase()}`}>{contextData.retailSentiment.contrarianBias}</b></div>}
          {contextData.retailSentiment.status !== "connected" && <small className="msc-retail-native-note">{contextData.retailSentiment.detail || "Provider data is not available. No values are fabricated."} This source is excluded from Master Bias.</small>}
        </div>}
        <div className="msc-summary-row"><span>Fundamentals</span><b className={`msc-signal-value ${contextData?.fundamentals?.status === "connected" ? `msc-bias-underline ${contextData.fundamentals.bias.toLowerCase()}` : "msc-muted"}`}>{contextData?.fundamentals?.status === "connected" ? contextData.fundamentals.bias : contextData?.fundamentals?.status === "not_configured" ? "Setup required" : contextData?.fundamentals?.status === "unavailable" ? "Unavailable" : "Loading"}</b></div>
        {contextData?.fundamentals?.status === "connected" && <>
          <div className="msc-fundamentals-grid">
            {([
              ["10Y Treasury yield", contextData.fundamentals.inputs?.tenYearYield, "%"],
              ["Broad USD index", contextData.fundamentals.inputs?.broadDollarIndex, ""],
              ["Federal Funds Rate", contextData.fundamentals.inputs?.fedFundsRate, "%"],
              ["CPI index", contextData.fundamentals.inputs?.cpi, ""],
            ] as const).map(([label, item, suffix]) => <div className="msc-fundamental-item" key={label}>
              <small>{label}</small>
              <strong>{item?.value == null ? "—" : `${fmt(item.value, 2)}${suffix}`}</strong>
              <small>{item?.date || "No observation"}</small>
              {"change" in (item || {}) && item?.change != null && <small>Change vs {item.comparisonDate || "prior sample"}: {item.change > 0 ? "+" : ""}{fmt(item.change, 4)}</small>}
            </div>)}
          </div>
          <small className="msc-signal-detail">Directional proxy: recent 10Y yield and broad USD changes. Fed Funds and CPI are context only. {contextData.fundamentals.freshness}. Source: FRED.</small>
        </>}
        {contextData?.fundamentals?.status === "unavailable" && <small className="msc-signal-detail">FRED data could not be retrieved. Check the server API key and network connection; unavailable values are excluded from Master Bias.</small>}
        <small className="msc-signal-detail">CFTC COT and macro inputs are included in Master Bias only when connected. COT is weekly institutional positioning, not retail sentiment.</small></article>
    </div>
    <div className="msc-main-grid">
      <div className="msc-left-col">
        <article className="msc-card msc-live-card"><div className="msc-card-head"><span><Activity size={14}/> LIVE ENGINE</span><span className="msc-live-dot">● {activeResponse?.status === "live" ? "LIVE" : activeResponse?.status === "unavailable" ? "UNAVAILABLE" : "FEED"}</span></div><strong className="msc-price">{currentPrice == null ? "—" : `$${fmt(currentPrice)}`}</strong><div className={`msc-momentum ${bias.toLowerCase()}`}>{bias === "Bullish" ? <ArrowUpRight size={14}/> : bias === "Bearish" ? <ArrowDownRight size={14}/> : <Activity size={14}/>} MASTER BIAS: {bias.toUpperCase()}</div><p>Source: {source}{lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : ""}</p>{activeResponse?.error && <small>{activeResponse.error}</small>}</article>
        <article className="msc-card msc-scoreboard"><div className="msc-card-head">SCOREBOARD <Info size={13}/></div><div className="msc-gauge"><div className="msc-gauge-inner"><strong>{score == null ? "—" : score}</strong><span>TECHNICAL</span></div></div><div className="msc-score-row"><span>Trend alignment</span><b>{technicalScore == null ? "—" : `${technicalScore >= 60 ? "+" : ""}${technicalScore-50}`}</b></div><div className="msc-score-row"><span>COT / sentiment</span><b className={contextData?.cot?.status === "connected" ? `msc-bias-underline ${contextData.cot.bias.toLowerCase()}` : "msc-muted"}>{contextData?.cot?.status === "connected" ? contextData.cot.bias : "Partial / N/A"}</b></div><div className="msc-score-row"><span>Fundamentals</span><b className={contextData?.fundamentals?.status === "connected" ? `msc-bias-underline ${contextData.fundamentals.bias.toLowerCase()}` : "msc-muted"}>{contextData?.fundamentals?.status === "connected" ? contextData.fundamentals.bias : "N/A"}</b></div></article>
      </div>
      <article className="msc-card msc-target-card"><div className="msc-target-head"><div><div className="msc-card-head"><Bell size={14}/> KEY LEVELS & TARGETS</div><p>Calculated from recent candle range · {mode === "swing" ? "Swing" : "Scalp"} setup</p></div><div className="msc-mode-switch"><button className={mode==="swing"?"active":""} onClick={()=>setMode("swing")}>SWING <small>Standard</small></button><button className={mode==="scalp"?"active":""} onClick={()=>setMode("scalp")}>SCALP <small>Intraday</small></button></div></div>
        <div className="msc-target-toolbar"><span>{asset} · {mode === "swing" ? "60-candle range" : "20-candle range"}</span><div className="msc-target-tools"><button className={`msc-alert-btn ${priceAlerts?.asset === asset ? "armed" : ""}`} onClick={() => void togglePriceAlerts()}>{priceAlerts?.asset === asset ? <BellRing size={13}/> : <Bell size={13}/>} {priceAlerts?.asset === asset ? "Pause alerts" : "Enable price alerts"}</button><button onClick={downloadTargets}><Download size={13}/> Download levels</button></div></div>
        <PushNotifications />
        {alertMessage && <div className={`msc-alert-message ${priceAlerts?.asset === asset ? "armed" : ""}`} role="status">{alertMessage}</div>}
        {priceAlerts?.asset === asset && <div className="msc-armed-levels">Watching {priceAlerts.levels.length} saved levels: {priceAlerts.levels.map(level => `${level.name} ${fmt(level.price)}`).join(" · ")}. Levels stay fixed until you pause and re-enable alerts.</div>}
        <div className="msc-level-list">{levels.map(level=><div key={level.name} className={`msc-level ${level.kind}`}><span className="msc-level-icon">{level.kind==="resistance" ? <ArrowUpRight size={15}/> : level.kind==="support" ? <ArrowDownRight size={15}/> : <Activity size={15}/>}</span><b>{level.name}</b><span className="msc-level-note">{level.note}</span><strong>{`$${fmt(level.price)}`}</strong><small>{currentPrice && level.kind !== "current" ? `${level.price > currentPrice ? "+" : ""}${fmt(level.price-currentPrice)} (${fmt((level.price-currentPrice)/currentPrice*100,2)}%)` : "Reference"}</small></div>)}</div>
      </article>
    </div>
    <article className="msc-card msc-mtf"><div className="msc-card-head"><span><Activity size={14}/> MTF ALIGNMENT MATRIX</span><small>Trend uses available candle history</small></div><div className="msc-mtf-grid">{frames.map(frame=><div className="msc-mtf-item" key={frame.label}><div><b>{frame.label}</b><span className={`msc-pill ${frame.bias.toLowerCase()}`}>{frame.candles.length >= 5 ? frame.bias : "Waiting for data"}</span></div><div className="msc-mtf-bottom"><span>RSI {fmt(frame.rsi,1)}</span><strong className={(frame.change ?? 0) >= 0 ? "positive" : "negative"}>{frame.change == null ? "—" : `${frame.change > 0 ? "+" : ""}${fmt(frame.change,2)}%`}</strong></div><div className="msc-mini-track"><i style={{width:`${frame.rsi ?? 50}%`}}/></div></div>)}</div></article>
    <footer className="msc-footnote">Market prices and technical readings depend on provider availability. Key levels are calculated estimates, not guaranteed targets or financial advice. {activeResponse?.data?.dataNote || ""}</footer>
  </section>;
}
