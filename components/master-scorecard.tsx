"use client";

import { marketApiUrl, fetchMarketData } from "@/lib/market-selection";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Bell, BellRing, Download, Info, RefreshCw } from "lucide-react";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type MarketResponse = { status?: string; error?: string; disclaimer?: string; data?: { price?: number | null; source?: string; updatedAt?: string | null; candles?: Candle[]; dataNote?: string } };
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

export default function MasterScorecard({ asset = "XAU/USD", interval = "15m", theme = "dark" }: { asset?: string; interval?: string; theme?: "dark" | "light" }) {
  const [responses, setResponses] = useState<Record<string, MarketResponse>>({});
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
  const currentPrice = activeResponse?.data?.price ?? frames.flatMap(f => f.candles).at(-1)?.close ?? null;
  const availableFrames = frames.filter(f => f.candles.length >= 5);
  const bullish = availableFrames.filter(f => f.bias === "Bullish").length;
  const bearish = availableFrames.filter(f => f.bias === "Bearish").length;
  const score = availableFrames.length ? Math.round(50 + ((bullish - bearish) / availableFrames.length) * 50) : null;
  const bias: Bias = score == null ? "Neutral" : score >= 60 ? "Bullish" : score <= 40 ? "Bearish" : "Neutral";
  const source = activeResponse?.data?.source || frames.find(f => f.response?.data?.source)?.response?.data?.source || "Market provider";
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
  }

  const technicalScore = score;
  const latestMove = frames.find(f => f.label === "4H");
  const rsi = frames.find(f => f.label === "15M")?.rsi ?? frames.find(f => f.rsi != null)?.rsi ?? null;

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
    {showGuide && <div className="msc-guide"><b>How the score works</b><p>Technical bias compares recent closes with a short moving average and recent momentum on each timeframe. The composite score counts only timeframes with sufficient candle data. COT, sentiment, seasonality and fundamental feeds are not connected to this calculation and are not fabricated.</p></div>}
    <div className="msc-overview">
      <article className="msc-card msc-bias-card"><div className="msc-card-head">MASTER BIAS <Info size={13}/></div><strong className={`msc-bias ${bias.toLowerCase()}`}>{bias.toUpperCase()}</strong><div className="msc-score-track"><span style={{width:`${score ?? 50}%`}}/></div><div className="msc-card-foot"><span>Technical alignment score</span><b>{score == null ? "—" : `${score}/100`}</b></div></article>
      <article className="msc-card"><div className="msc-card-head">TECHNICAL SUMMARY <Info size={13}/></div><div className="msc-summary-row"><span>4H / Swing trend</span><b className={`msc-pill ${(latestMove?.bias || "Neutral").toLowerCase()}`}>{latestMove?.bias || "Unavailable"}</b></div><div className="msc-summary-row"><span>RSI (14) · 15M</span><b>{rsi == null ? "—" : `${fmt(rsi,1)} ${rsi >= 70 ? "· Overbought" : rsi <= 30 ? "· Oversold" : ""}`}</b></div><div className="msc-summary-row"><span>Timeframes loaded</span><b>{availableFrames.length}/5</b></div></article>
      <article className="msc-card"><div className="msc-card-head">INSTITUTIONAL POSITIONING <Info size={13}/></div><div className="msc-summary-row"><span>COT positioning</span><b className="msc-muted">Not connected</b></div><div className="msc-summary-row"><span>Retail sentiment</span><b className="msc-muted">Not connected</b></div><div className="msc-summary-row"><span>Fundamentals</span><b className="msc-muted">Not connected</b></div></article>
    </div>
    <div className="msc-main-grid">
      <div className="msc-left-col">
        <article className="msc-card msc-live-card"><div className="msc-card-head"><span><Activity size={14}/> LIVE ENGINE</span><span className="msc-live-dot">● {activeResponse?.status === "live" ? "LIVE" : activeResponse?.status === "unavailable" ? "UNAVAILABLE" : "FEED"}</span></div><strong className="msc-price">{currentPrice == null ? "—" : `$${fmt(currentPrice)}`}</strong><div className={`msc-momentum ${bias.toLowerCase()}`}>{bias === "Bullish" ? <ArrowUpRight size={14}/> : bias === "Bearish" ? <ArrowDownRight size={14}/> : <Activity size={14}/>} MOMENTUM: {bias.toUpperCase()}</div><p>Source: {source}{lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : ""}</p>{activeResponse?.error && <small>{activeResponse.error}</small>}</article>
        <article className="msc-card msc-scoreboard"><div className="msc-card-head">SCOREBOARD <Info size={13}/></div><div className="msc-gauge"><div className="msc-gauge-inner"><strong>{score == null ? "—" : score}</strong><span>TECHNICAL</span></div></div><div className="msc-score-row"><span>Trend alignment</span><b>{technicalScore == null ? "—" : `${technicalScore >= 60 ? "+" : ""}${technicalScore-50}`}</b></div><div className="msc-score-row"><span>Sentiment + COT</span><b className="msc-muted">N/A</b></div><div className="msc-score-row"><span>Fundamentals</span><b className="msc-muted">N/A</b></div></article>
      </div>
      <article className="msc-card msc-target-card"><div className="msc-target-head"><div><div className="msc-card-head"><Bell size={14}/> KEY LEVELS & TARGETS</div><p>Calculated from recent candle range · {mode === "swing" ? "Swing" : "Scalp"} setup</p></div><div className="msc-mode-switch"><button className={mode==="swing"?"active":""} onClick={()=>setMode("swing")}>SWING <small>Standard</small></button><button className={mode==="scalp"?"active":""} onClick={()=>setMode("scalp")}>SCALP <small>Intraday</small></button></div></div>
        <div className="msc-target-toolbar"><span>{asset} · {mode === "swing" ? "60-candle range" : "20-candle range"}</span><div className="msc-target-tools"><button className={`msc-alert-btn ${priceAlerts?.asset === asset ? "armed" : ""}`} onClick={() => void togglePriceAlerts()}>{priceAlerts?.asset === asset ? <BellRing size={13}/> : <Bell size={13}/>} {priceAlerts?.asset === asset ? "Pause alerts" : "Enable price alerts"}</button><button onClick={downloadTargets}><Download size={13}/> Download levels</button></div></div>
        {alertMessage && <div className={`msc-alert-message ${priceAlerts?.asset === asset ? "armed" : ""}`} role="status">{alertMessage}</div>}
        {priceAlerts?.asset === asset && <div className="msc-armed-levels">Watching {priceAlerts.levels.length} saved levels: {priceAlerts.levels.map(level => `${level.name} ${fmt(level.price)}`).join(" · ")}. Levels stay fixed until you pause and re-enable alerts.</div>}
        <div className="msc-level-list">{levels.map(level=><div key={level.name} className={`msc-level ${level.kind}`}><span className="msc-level-icon">{level.kind==="resistance" ? <ArrowUpRight size={15}/> : level.kind==="support" ? <ArrowDownRight size={15}/> : <Activity size={15}/>}</span><b>{level.name}</b><span className="msc-level-note">{level.note}</span><strong>{`$${fmt(level.price)}`}</strong><small>{currentPrice && level.kind !== "current" ? `${level.price > currentPrice ? "+" : ""}${fmt(level.price-currentPrice)} (${fmt((level.price-currentPrice)/currentPrice*100,2)}%)` : "Reference"}</small></div>)}</div>
      </article>
    </div>
    <article className="msc-card msc-mtf"><div className="msc-card-head"><span><Activity size={14}/> MTF ALIGNMENT MATRIX</span><small>Trend uses available candle history</small></div><div className="msc-mtf-grid">{frames.map(frame=><div className="msc-mtf-item" key={frame.label}><div><b>{frame.label}</b><span className={`msc-pill ${frame.bias.toLowerCase()}`}>{frame.candles.length >= 5 ? frame.bias : "Waiting for data"}</span></div><div className="msc-mtf-bottom"><span>RSI {fmt(frame.rsi,1)}</span><strong className={(frame.change ?? 0) >= 0 ? "positive" : "negative"}>{frame.change == null ? "—" : `${frame.change > 0 ? "+" : ""}${fmt(frame.change,2)}%`}</strong></div><div className="msc-mini-track"><i style={{width:`${frame.rsi ?? 50}%`}}/></div></div>)}</div></article>
    <footer className="msc-footnote">Market prices and technical readings depend on provider availability. Key levels are calculated estimates, not guaranteed targets or financial advice. {activeResponse?.data?.dataNote || ""}</footer>
  </section>;
}
