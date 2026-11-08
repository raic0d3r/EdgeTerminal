"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, BookOpen, ChevronDown, CircleHelp, Download, Expand, Minus, Plus, RotateCcw, Settings, Signal, X, ZoomIn, ZoomOut } from "lucide-react";

import { marketApiUrl, getActiveMarketBroker, fetchMarketData } from "@/lib/market-selection";
import { auth } from "@/lib/firebase";

import {
  buildFootprint,
  buildVolumeProfile,
  calculateValueArea,
} from "@/lib/orderflow/engine";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type ApiQuote = { status: string; data?: { price?: number | null; source?: string; updatedAt?: string | null; candles?: Candle[] }; error?: string };
type AbsorptionCandidate = { timestamp: number; price: number; type: "buy-absorption" | "sell-absorption"; aggressorSide: "buy" | "sell"; aggressorVolume: number; opposingVolume: number; followThroughTicks: number; strength: "low" | "moderate" | "high"; evidence: string };
type AbsorptionResponse = { status: string; dataNote?: string; candidateCount?: number; candidates?: AbsorptionCandidate[]; error?: string };

function fmt(n: number, digits = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function timeLabel(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value.slice(-5) : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }); }

export default function OrderFlowFootprint({ asset = "XAU/USD", interval = "5min" }: { asset?: string; interval?: string }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [source, setSource] = useState("");
  const [marketProvider, setMarketProvider] = useState<"ctrader" | "exness">("ctrader");
  useEffect(() => { const sync = () => setMarketProvider(getActiveMarketBroker()); sync(); window.addEventListener("edge-terminal-broker-change", sync); return () => window.removeEventListener("edge-terminal-broker-change", sync); }, []);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState("loading");
  const [absorptionCandidates, setAbsorptionCandidates] = useState<AbsorptionCandidate[]>([]);
  const [absorptionStatus, setAbsorptionStatus] = useState<"loading" | "ready" | "error">("loading");
  const [absorptionNote, setAbsorptionNote] = useState("");
  const [zoom, setZoom] = useState(100);
  const [wrapWidth, setWrapWidth] = useState(1100);
  const [showSignals, setShowSignals] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    if (!showSettings) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest(".ofp-settings-menu") && !target.closest(".ofp-settings-button")) {
        setShowSettings(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowSettings(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showSettings]);
  useEffect(() => {
    if (!showHelp) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setShowHelp(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showHelp]);
  const [indicators, setIndicators] = useState({
    pocBox: true, diagonalImbalances: true, totalCandleVolume: true,
    candleDelta: true, deltaDivergence: true, wickAbsorption: true,
    stackedImbalances: true, zeroPrints: true, unfinishedAuctions: true,
  });
  const toggleIndicator = (key: keyof typeof indicators) => setIndicators(current => ({ ...current, [key]: !current[key] }));
  const [viewMode, setViewMode] = useState<"beginner" | "pro">("pro");
  const [legend, setLegend] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; scrollLeft: number; pointerId: number } | null>(null);

  useEffect(() => {
    const node = chartWrapRef.current;
    if (!node) return;
    const measure = () => setWrapWidth(node.clientWidth || 1100);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const changeZoom = (nextZoom: number) => {
    const node = chartWrapRef.current;
    if (!node) { setZoom(nextZoom); return; }
    const oldWidth = Math.max(node.scrollWidth, 1);
    const centerRatio = (node.scrollLeft + node.clientWidth / 2) / oldWidth;
    setZoom(nextZoom);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const updated = chartWrapRef.current;
      if (!updated) return;
      updated.scrollLeft = Math.max(0, centerRatio * updated.scrollWidth - updated.clientWidth / 2);
    }));
  };

  const onChartPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select")) return;
    event.preventDefault();
    dragState.current = { startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("ofp-dragging");
  };
  const onChartPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = event.clientX - dragState.current.startX;
    event.preventDefault();
    event.currentTarget.scrollLeft = dragState.current.scrollLeft - dx;
  };
  const onChartPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current && event.currentTarget.hasPointerCapture(dragState.current.pointerId)) {
      event.currentTarget.releasePointerCapture(dragState.current.pointerId);
    }
    dragState.current = null;
    event.currentTarget.classList.remove("ofp-dragging");
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const symbol = asset.includes("XAG") ? "XAG/USD" : "XAU/USD";
        const res = await fetchMarketData(marketApiUrl(symbol, interval), { cache: "no-store" });
        const json: ApiQuote = await res.json();
        if (!alive) return;
        // Exness can return verified historical candles while its live tick
        // stream is unavailable (for example, outside market hours). Render
        // those candles instead of requiring status === "live".
        const hasVerifiedCandles = Array.isArray(json.data?.candles) && json.data.candles.length > 0;
        if (json.data && (json.status === "live" || json.status === "historical" || json.status === "closed") && hasVerifiedCandles) {
          setCandles(json.data.candles || []);
          setPrice(json.data.price ?? null);
          setSource(json.data.source || "Market provider");
          setUpdatedAt(json.data.updatedAt || null);
          setStatus(json.status);
        } else {
          setStatus(json.status || "unavailable");
          setCandles([]);
          setPrice(null);
        }
      } catch { if (alive) setStatus("unavailable"); }
    };
    load();
    const timer = window.setInterval(load, 5_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [asset, interval, marketProvider]);

  useEffect(() => {
    let alive = true;
    const loadAbsorption = async () => {
      setAbsorptionStatus("loading");
      try {
        const instrument = asset.includes("XAG") ? "SI" : "GC";
        const user = auth?.currentUser;
        if (!user) throw new Error("Sign in to access Order Flow Footprint.");
        const token = await user.getIdToken();
        const response = await fetch(`/api/orderflow/absorption?instrument=${instrument}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        const json: AbsorptionResponse = await response.json();
        if (!alive) return;
        if (!response.ok || json.status !== "ok") throw new Error(json.error || "Absorption data unavailable");
        setAbsorptionCandidates(json.candidates || []);
        setAbsorptionNote(json.dataNote || "");
        setAbsorptionStatus("ready");
      } catch {
        if (alive) { setAbsorptionCandidates([]); setAbsorptionStatus("error"); }
      }
    };
    loadAbsorption();
    const timer = window.setInterval(loadAbsorption, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [asset]);

  const rows = 10;
  const bars = useMemo(() => candles.slice(-24).map((c, index) => {
    const span = Math.max(c.high - c.low, 0.01);
    const base = Math.max(1, Math.round(c.volume || 0));
    const closeStrength = Math.min(0.9, Math.max(0.1, (c.close - c.low) / span));
    const buyShare = c.close >= c.open ? 0.53 + closeStrength * 0.25 : 0.48 - (1 - closeStrength) * 0.25;
    const totalBuy = Math.round(base * buyShare);
    const totalSell = Math.max(0, base - totalBuy);
    const levels = Array.from({ length: rows }, (_, row) => {
      const weight = 0.45 + Math.max(0, 1 - Math.abs(row - (rows - 1) * closeStrength / 1.0) / (rows * 0.8)) * 1.4;
      const sell = Math.round(totalSell * weight / 5.4);
      const buy = Math.round(totalBuy * weight / 5.4);
      return { sell, buy, delta: buy - sell };
    });
    const max = Math.max(...levels.flatMap(l => [l.sell, l.buy]), 1);
    return { ...c, index, levels, max, totalBuy, totalSell, delta: totalBuy - totalSell, time: timeLabel(c.time) };
  }), [candles]);
  const current = bars[bars.length - 1];
  const cvd = bars.reduce((sum, b) => sum + b.delta, 0);
  const volume = current ? current.totalBuy + current.totalSell : 0;
  const delta = current?.delta || 0;
  const poc = price ?? current?.close ?? null;
  const minPrice = bars.length ? Math.min(...bars.map(b => b.low)) : (price || 4000) - 4;
  const maxPrice = bars.length ? Math.max(...bars.map(b => b.high)) : (price || 4000) + 4;
  const range = Math.max(maxPrice - minPrice, 0.1);
  const priceLevels = Array.from({ length: rows }, (_, i) => maxPrice - (range * i / (rows - 1)));
  const lastCandle = current;

  // Mark divergence only when price makes a fresh local extreme while estimated
  // delta fails to confirm it. This replaces the old volume-threshold rule,
  // which incorrectly printed DIV on many unrelated candles.
  const divergenceForBar = (index: number): "Bullish DIV" | "Bearish DIV" | null => {
    const bar = bars[index];
    if (!bar || index < 3) return null;
    const previous = bars.slice(Math.max(0, index - 3), index);
    if (previous.length < 3) return null;
    const priorHigh = Math.max(...previous.map(item => item.high));
    const priorLow = Math.min(...previous.map(item => item.low));
    const priorDeltaHigh = Math.max(...previous.map(item => item.delta));
    const priorDeltaLow = Math.min(...previous.map(item => item.delta));
    const deltaRange = Math.max(1, ...previous.map(item => Math.abs(item.delta)));
    const meaningfulDeltaDifference = Math.abs(bar.delta - (bar.high > priorHigh ? priorDeltaHigh : priorDeltaLow)) >= deltaRange * 0.15;
    if (bar.high > priorHigh && bar.delta < priorDeltaHigh && meaningfulDeltaDifference) return "Bearish DIV";
    if (bar.low < priorLow && bar.delta > priorDeltaLow && meaningfulDeltaDifference) return "Bullish DIV";
    return null;
  };

  const exportPdf = () => {
    if (!bars.length) return;
    // Build a dedicated audit report instead of printing the whole webpage.
    // The browser print dialog lets the user save this report as a PDF.
    const reportWindow = window.open("", "_blank", "width=1400,height=900");
    if (!reportWindow) {
      window.alert("Please allow pop-ups for this site to export the footprint PDF report.");
      return;
    }
    const escapeMap: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    const esc = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, ch => escapeMap[ch] || ch);
    const reportBars = bars.slice(-5);
    const pinned = reportBars[reportBars.length - 1];
    const reportRows = Array.from({ length: rows }, (_, rowIndex) => {
      const priceLevel = maxPrice - (range * rowIndex / (rows - 1));
      const cells = reportBars.map((bar, colIndex) => {
        // Rows are a candle-derived volume-at-price estimate, not exchange trade data.
        const level = bar.levels[rows - 1 - rowIndex];
        const imbalance = level && (level.buy >= Math.max(1, level.sell) * 3 || level.sell >= Math.max(1, level.buy) * 3);
        const pocRow = rowIndex === Math.round((rows - 1) * 0.5);
        const tone = imbalance ? (level.buy > level.sell ? "buy" : "sell") : (pocRow ? "poc" : "");
        return `<td class="${tone}">${level ? `${level.sell.toLocaleString("en-US")} × ${level.buy.toLocaleString("en-US")}` : "—"}</td>`;
      }).join("");
      return `<tr><th>$${fmt(priceLevel)}</th>${cells}</tr>`;
    }).join("");
    const headers = reportBars.map((bar, i) => {
      const title = i === reportBars.length - 1 ? "[PINNED] TARGET" : `T-${reportBars.length - 1 - i}`;
      return `<th class="${i === reportBars.length - 1 ? "pinned" : ""}">${title}<br>${esc(bar.time)} UK<br>O:${fmt(bar.open)} H:${fmt(bar.high)}<br>L:${fmt(bar.low)} C:${fmt(bar.close)}<br>Vol:${(bar.totalBuy + bar.totalSell).toLocaleString("en-US")} · Δ:${bar.delta > 0 ? "+" : ""}${bar.delta}<br>CVD:${reportBars.slice(0, i + 1).reduce((sum, item) => sum + item.delta, 0)}</th>`;
    }).join("");
    const totalBuy = reportBars.reduce((sum, bar) => sum + bar.totalBuy, 0);
    const totalSell = reportBars.reduce((sum, bar) => sum + bar.totalSell, 0);
    const sequenceDelta = totalBuy - totalSell;
    const buyPercent = totalBuy + totalSell ? Math.round(totalBuy / (totalBuy + totalSell) * 100) : 0;
    const divergence = divergenceForBar(bars.length - 1);
    const imbalanceText = pinned ? pinned.levels.filter(level => level.buy >= Math.max(1, level.sell) * 3 || level.sell >= Math.max(1, level.buy) * 3).length : 0;
    const generatedAt = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "medium" });
    reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Order Flow Footprint Audit</title><style>
      @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;background:#10131a;color:#e7edf8;font:11px Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:10px 12px;border-top:5px solid #e5bc36}h1{font-size:23px;margin:0 0 5px}h2{font-size:12px;margin:0;padding:8px 10px;background:#242b3a;color:#fff;text-transform:uppercase;letter-spacing:.3px}.sub{color:#e6b52a;font-size:14px;margin-bottom:12px}.top{display:flex;justify-content:space-between;align-items:start;gap:15px;margin-bottom:10px}.stamp{background:#1b2230;border:1px solid #354158;padding:10px 12px;border-radius:7px;min-width:260px}.stamp b{color:#ffb000;font-size:13px}.stamp div{color:#9db0c9;margin-top:5px}.cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}.card{border:1px solid #354158;border-radius:7px;overflow:hidden;background:#171c26;min-height:105px}.body{padding:10px 12px;line-height:1.6}.label{color:#90a8c7}.gold{color:#ffb600;font-weight:bold}.red{color:#ff535b;font-weight:bold}.green{color:#00d69a;font-weight:bold}.muted{color:#8290a5}.tablewrap{margin-top:7px}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:9px}th,td{border:1px solid #293244;padding:4px 3px;text-align:center;overflow-wrap:anywhere}thead th{background:#202736;font-size:9px;line-height:1.35}thead th:first-child{width:95px}.pinned{background:#332c18;color:#ffbd20}tbody th{background:#202633;color:#ffb000;text-align:right;white-space:nowrap}tbody td{background:#151923;color:#d8e0ef}.buy{background:#12372a;color:#35e4a0;font-weight:bold}.sell{background:#421e25;color:#ff7278;font-weight:bold}.poc{background:#3b3215;color:#ffdb61;font-weight:bold}.foot{margin-top:10px;color:#8491a4;font-size:9px;display:flex;justify-content:space-between;gap:10px}.note{margin-top:9px;border-top:1px solid #2c3444;padding-top:7px;color:#8f9db1;font-size:9px}@media print{body{background:#10131a}.page{padding:0}.card,table{break-inside:avoid}}
      </style></head><body><main class="page"><div class="top"><div><h1>EDGE TERMINAL</h1><div class="sub">ORDER FLOW FOOTPRINT MICRO-STRUCTURE &amp; CONFLUENCE AUDIT</div></div><div class="stamp"><b>ASSET: ${esc(asset.includes("XAG") ? "SILVER" : "GOLD")} | TF: ${esc(interval.toUpperCase())}</b><div>${esc(generatedAt)} (UK Time)</div><div>Provider: ${esc(source || "Unavailable")} · ${esc(status)}</div></div></div>
      <div class="cards"><section class="card"><h2>Pinned Candle Metadata</h2><div class="body"><span class="label">Time:</span> <b>${esc(pinned?.time)}</b> &nbsp;&nbsp; <span class="label">OHLC:</span> <b>${pinned ? `${fmt(pinned.open)} / ${fmt(pinned.high)} / ${fmt(pinned.low)} / ${fmt(pinned.close)}` : "—"}</b><br><span class="label">Total Vol:</span> <b>${(pinned?.totalBuy + pinned?.totalSell || 0).toLocaleString("en-US")}</b> &nbsp;&nbsp; <span class="label">Delta:</span> <b class="${(pinned?.delta || 0) < 0 ? "red" : "green"}">${(pinned?.delta || 0) > 0 ? "+" : ""}${pinned?.delta ?? 0} (${100 - buyPercent}% sell est.)</b><br><span class="label">POC Level:</span> <b class="gold">${poc === null ? "—" : "$" + fmt(poc)} (price proxy)</b><br><span class="label">Seq. Cumulative Delta:</span> <b class="${sequenceDelta < 0 ? "red" : "green"}">${sequenceDelta > 0 ? "+" : ""}${sequenceDelta}</b><br><span class="muted">(Sequence of ${reportBars.length} candles; estimated)</span></div></section>
      <section class="card"><h2>Imbalance &amp; Absorption Callouts</h2><div class="body">• <b>${divergence ? esc(divergence) : "No confirmed local delta divergence"}</b> on the pinned candle under the current estimated-data rule.<br>• <b>${imbalanceText}</b> price levels show a 3:1 diagonal buy/sell imbalance in the pinned candle (estimated).<br>• <span class="muted">Wick absorption is not confirmed by this candle-only feed.</span><br>• <span class="muted">Treat these as analytical estimates, not institutional trade prints.</span></div></section>
      <section class="card"><h2>Technical Confluence</h2><div class="body"><span class="label">Current price:</span> <b class="gold">${price === null ? "Unavailable" : "$" + fmt(price)}</b><br><span class="label">5-candle estimated delta:</span> <b class="${sequenceDelta < 0 ? "red" : "green"}">${sequenceDelta > 0 ? "+" : ""}${sequenceDelta}</b><br><span class="label">Estimated buy share:</span> <b>${buyPercent}%</b><br><span class="label">Bias:</span> <b class="${sequenceDelta < 0 ? "red" : "green"}">${sequenceDelta < 0 ? "SELLER LEAN (EST.)" : "BUYER LEAN (EST.)"}</b><br><span class="muted">RSI/MACD are omitted because this report uses the currently loaded candle window only.</span></div></section></div>
      <div class="tablewrap"><table><thead><tr><th>PRICE TICK ($)</th>${headers}</tr></thead><tbody>${reportRows}</tbody></table></div>
      <div class="foot"><span>Generated from the current Order Flow Footprint view · ${esc(source || "Market provider")}</span><span>Report time: ${esc(generatedAt)} UK</span></div><div class="note"><b>DATA TRANSPARENCY:</b> Buy/sell split, delta, price-level cells, and imbalances are candle-derived estimates. They are not exchange-reported bid/ask trades. True footprint delta requires trade-level data with aggressor-side classification. This report is informational, not financial advice.</div></main><script>window.onload=()=>setTimeout(()=>window.print(),350);</script></body></html>`);
    reportWindow.document.close();
  };

  return <section className={`ofp-shell ${expanded ? "ofp-expanded" : ""}`}>
    <div className="ofp-toolbar"><div className="ofp-left-tools"><span className="ofp-symbol">{asset.includes("XAG") ? "XAGUSD" : "XAUUSD"}</span><span className="ofp-provider-control ofp-provider-fixed" aria-label="Market data provider"><span>DATA</span><b>{marketProvider === "exness" ? "Exness" : "cTrader"}</b></span><button type="button" className={`ofp-chip ofp-mode ${viewMode === "beginner" ? "selected" : ""}`} aria-pressed={viewMode === "beginner"} onClick={() => setViewMode("beginner")}><Activity size={12}/> Candles</button><button type="button" className={`ofp-chip ofp-pro ofp-mode ${viewMode === "pro" ? "selected" : ""}`} aria-pressed={viewMode === "pro"} onClick={() => setViewMode("pro")}>▰ Footprint</button><span className="ofp-chip ofp-time">◷ {updatedAt ? timeLabel(updatedAt) : "LIVE"}</span></div><div className="ofp-right-tools"><button onClick={() => { setZoom(100); if (chartWrapRef.current) chartWrapRef.current.scrollLeft = 0; }}><RotateCcw size={13}/> RESET</button><button aria-label="Zoom out" onClick={() => changeZoom(Math.max(50, zoom - 10))}><ZoomOut size={13}/></button><b>{zoom}%</b><button aria-label="Zoom in" onClick={() => changeZoom(Math.min(200, zoom + 10))}><ZoomIn size={13}/></button><button className={`ofp-signals ${showSignals ? "active" : ""}`} onClick={() => setShowSignals(v => !v)}><Signal size={13}/> Signals</button><button onClick={exportPdf}><Download size={13}/> Export PDF</button><button aria-label="Help" title="Beginner order flow cheat sheet" onClick={() => setShowHelp(true)}><CircleHelp size={15}/></button><button aria-label="Settings" title="Core footprint indicators" aria-expanded={showSettings} className={showSettings ? "ofp-settings-button active" : "ofp-settings-button"} onClick={() => setShowSettings(v => !v)}><Settings size={15}/></button><button aria-label="Toggle full chart" onClick={() => setExpanded(v => !v)}><Expand size={15}/></button></div>
      {showSettings && <div className="ofp-settings-menu" role="group" aria-label="Core footprint indicators">
        <strong>CORE FOOTPRINT INDICATORS</strong>
        {([
          ["pocBox", "POC Box"], ["diagonalImbalances", "Diagonal Imbalances"],
          ["totalCandleVolume", "Total Candle Volume"], ["candleDelta", "Candle Delta"],
          ["deltaDivergence", "Delta Divergence (DIV)"], ["wickAbsorption", "Wick Absorption"],
          ["stackedImbalances", "Stacked Imbalances"], ["zeroPrints", "Zero Prints (Exhaustion)"],
          ["unfinishedAuctions", "Unfinished Auctions (*)"],
        ] as [keyof typeof indicators, string][]).map(([key, label]) => <label key={key}>
          <input type="checkbox" checked={indicators[key]} onChange={() => toggleIndicator(key)} />
          <span>{label}</span>
        </label>)}
        <small>Signals are estimated from candle data, not exchange-reported bid/ask trades.</small>
      </div>}
    </div>
    {showHelp && <div className="ofp-help-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHelp(false); }}>
      <section className="ofp-help-modal" role="dialog" aria-modal="true" aria-labelledby="ofp-help-title">
        <header className="ofp-help-header"><div className="ofp-help-icon"><BookOpen size={22}/></div><div><h2 id="ofp-help-title">Beginner&apos;s Order Flow Cheat Sheet</h2><p>How to read footprints and interpret the current market auction</p></div><button type="button" aria-label="Close cheat sheet" onClick={() => setShowHelp(false)}><X size={22}/></button></header>
        <div className="ofp-help-content">
          <section className="ofp-help-routine"><h3>✧ THE 3-STEP BEGINNER ORDER FLOW ROUTINE</h3><div className="ofp-help-steps"><article><h4>1. Check CVD Gauge</h4><p>Compare estimated buying and selling activity across the visible candles. Positive delta suggests more estimated buying; negative delta suggests more estimated selling.</p></article><article><h4>2. Read Trade Context</h4><p>Review the signal banner, candle direction, delta and divergence together. No single indicator confirms a trade or guarantees the next move.</p></article><article><h4>3. Watch the POC</h4><p>The yellow POC marker indicates an estimated high-volume price area. Watch how price reacts if it returns to that level.</p></article></div></section>
          <h3 className="ofp-help-section-title">CORE CONCEPTS EXPLAINED</h3>
          <article className="ofp-help-concept"><b className="ofp-help-badge bidask">Bid|Ask</b><div><h4>Left (Red) vs Right (Green) <span>Inside Candle</span></h4><p><strong className="ofp-red">Left numbers (Bid):</strong> estimated sell-side activity. <strong className="ofp-green">Right numbers (Ask):</strong> estimated buy-side activity. These values are modelled from candle/provider data, not actual exchange trade prints.</p></div></article>
          <article className="ofp-help-concept"><b className="ofp-help-badge poc">POC</b><div><h4>Point of Control <span>High-volume estimate</span></h4><p>The POC marks the estimated price area with the greatest modelled volume. It can be used as a reference for support, resistance or a retest, not as a guaranteed institutional level.</p></div></article>
          <article className="ofp-help-concept"><b className="ofp-help-badge div">DIV</b><div><h4>Candle Delta &amp; Divergence <span>Potential warning</span></h4><p><strong className="ofp-green">Delta</strong> is estimated buying minus estimated selling. <strong className="ofp-gold">Divergence</strong> appears when price makes a local high/low that estimated delta does not confirm. It is a clue to investigate, not a standalone reversal signal.</p></div></article>
          <article className="ofp-help-concept"><b className="ofp-help-badge abs">ABS</b><div><h4>Wick Absorption <span>Possible rejection</span></h4><p>A long wick can indicate rejection of a price area. Candle-only data cannot prove that large market orders were absorbed by passive limit orders, so this marker is only an estimate.</p></div></article>
          <div className="ofp-help-disclaimer">DATA TRANSPARENCY: This version estimates bid/ask splits and order-flow signals from candle data and provider volume proxies. It does not contain exchange-reported aggressor-side trade data.</div>
        </div>
        <footer className="ofp-help-footer"><span>Current mode: <b>{viewMode === "pro" ? "Pro Mode" : "Beginner Mode"}</b></span><div><button type="button" onClick={() => { setViewMode("beginner"); setShowHelp(false); }}>✧ Switch to Beginner View</button><button type="button" className="primary" onClick={() => { setViewMode("pro"); setShowHelp(false); }}>▰ Switch to Pro View</button></div></footer>
      </section>
    </div>}
    <div className="ofp-metrics">
      <article><label>VISIBLE CVD <small>Est.</small></label><strong className={cvd < 0 ? "negative" : "positive"}>{cvd > 0 ? "+" : ""}{Math.round(cvd).toLocaleString("en-US")}</strong><span>A: {bars.reduce((s,b)=>s+b.totalBuy,0).toLocaleString("en-US")} &nbsp; B: {bars.reduce((s,b)=>s+b.totalSell,0).toLocaleString("en-US")}</span></article>
      <article><label>INSPECT VOLUME</label><strong>{volume.toLocaleString("en-US")}</strong><span>Provider volume proxy</span></article>
      <article><label>INSPECT DELTA</label><strong className={delta < 0 ? "negative" : "positive"}>{delta > 0 ? "+" : ""}{delta.toLocaleString("en-US")}</strong><span>{volume ? Math.round((current?.totalBuy || 0) / volume * 100) : 0}% Buy · estimated</span></article>
      <article><label>INSPECT POC</label><strong className="gold">{poc === null ? "—" : "$" + fmt(poc)}</strong><span>Current price proxy</span></article>
    </div>
    {showSignals && <div className="ofp-signalbar"><b className={delta < 0 ? "negative" : "positive"}>↘ {delta < 0 ? "SELLING PRESSURE (EST.)" : "BUYING PRESSURE (EST.)"}</b><span>Volume-at-price estimate</span><strong>{price === null ? "Price unavailable" : "$" + fmt(price)}</strong><small>{status === "live" ? `Source: ${source}` : "Waiting for verified live provider data"}</small></div>}
    <div ref={chartWrapRef} className="ofp-chart-wrap" onPointerDown={onChartPointerDown} onPointerMove={onChartPointerMove} onPointerUp={onChartPointerUp} onPointerCancel={onChartPointerUp}>
      <div className="ofp-chart" style={{ width: `${Math.max(wrapWidth, 1100) * zoom / 100}px`, minWidth: `${Math.max(wrapWidth, 1100) * zoom / 100}px`, height: `${480 * zoom / 100}px`, "--ofp-zoom": Math.max(0.65, Math.min(1.6, zoom / 100)) } as React.CSSProperties & { "--ofp-zoom": number }}>
        <div className="ofp-price-axis">{priceLevels.map((p,i)=><div key={i} style={{ top: `${i/(rows-1)*100}%` }}>${fmt(p)}</div>)}</div>
        <div className="ofp-grid">{priceLevels.map((p,i)=><div key={i} className="ofp-gridline" style={{ top: `${i/(rows-1)*100}%` }} />)}
          {indicators.pocBox && poc !== null && poc >= minPrice && poc <= maxPrice && <div className="ofp-vpoc-line" style={{ top: `${(maxPrice-poc)/range*100}%` }}><span>vPOC EST. ${fmt(poc)}</span></div>}
          {bars.length ? bars.map((bar, bi) => {
            const plotWidth = 78;
            const candleTop = Math.max(0, (maxPrice - bar.high) / range * 100);
            const candleHeight = Math.max(2, (bar.high - bar.low) / range * 100);
            return <div className="ofp-bar-column" key={`${bar.time}-${bi}`} style={{ left: `${bi / Math.max(1,bars.length) * plotWidth}%`, width: `${plotWidth / bars.length * 0.76}%` }}>
              <div className="ofp-candle-wick" style={{ top: `${candleTop}%`, height: `${candleHeight}%` }} />
              {(() => {
                const bodyTop = (maxPrice - Math.max(bar.open, bar.close)) / range * 100;
                const bodyHeight = Math.max(1.1, Math.abs(bar.close - bar.open) / range * 100);
                const bullish = bar.close >= bar.open;
                return <>
                  <div className="ofp-candle-wick ofp-beginner-wick" style={{ top: `${candleTop}%`, height: `${candleHeight}%`, background: bullish ? "#20ad65" : "#e14c53" }} />
                  {viewMode === "beginner" && <div className={`ofp-beginner-body ${bullish ? "up" : "down"}`} style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }} />}
                  {viewMode === "beginner" && <div className="ofp-beginner-poc" style={{ top: `${(maxPrice - (bar.high - (bar.high - bar.low) * 0.5)) / range * 100}%` }} title="Estimated point of control">POC</div>}
                  {viewMode === "pro" && <div className={`ofp-candle-outline ${bullish ? "up" : "down"}`} style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }} />}
                </>;
              })()}
              {viewMode === "pro" && <div className="ofp-footprint-levels" style={{ top: `${candleTop}%`, height: `${candleHeight}%` }}>{bar.levels.map((level, ri) => {
                const sellIntensity = level.sell / Math.max(1, bar.max);
                const buyIntensity = level.buy / Math.max(1, bar.max);
                const sellImbalance = indicators.diagonalImbalances && level.sell >= Math.max(1, level.buy) * 1.5;
                const buyImbalance = indicators.diagonalImbalances && level.buy >= Math.max(1, level.sell) * 1.5;
                // Variable-width bid/ask bars expand away from the centre, matching a stepped footprint ladder.
                const sellWidth = Math.min(49, 25 + sellIntensity * 24);
                const buyWidth = Math.min(49, 25 + buyIntensity * 24);
                const isPocRow = indicators.pocBox && ri === Math.round((bar.high - bar.close) / Math.max(0.0001, bar.high - bar.low) * (rows - 1));
                const sellAlpha = 0.28 + sellIntensity * 0.66;
                const buyAlpha = 0.28 + buyIntensity * 0.66;
                return <div key={ri} className={`ofp-level ${isPocRow ? "poc-level" : ""} ${buyImbalance ? "buy-heavy" : sellImbalance ? "sell-heavy" : ""} ${indicators.stackedImbalances && (buyImbalance || sellImbalance) ? "stacked-imbalance" : ""}`} title={`Estimated bid ${level.sell.toLocaleString("en-US")} · ask ${level.buy.toLocaleString("en-US")}`}>
                  <span className={sellImbalance ? "imbalance-sell" : ""} style={{ width: `${sellWidth}%`, backgroundColor: `rgba(205, 54, 65, ${sellAlpha})` }}>{level.sell.toLocaleString("en-US")}</span>
                  <span className={buyImbalance ? "imbalance-buy" : ""} style={{ width: `${buyWidth}%`, backgroundColor: `rgba(0, 169, 98, ${buyAlpha})` }}>{level.buy.toLocaleString("en-US")}</span>
                </div>;
              })}</div>}
              <div className="ofp-bar-stats">{indicators.totalCandleVolume && <span>{(bar.totalBuy+bar.totalSell).toLocaleString("en-US")}</span>}{indicators.candleDelta && <b className={bar.delta < 0 ? "negative" : "positive"}>{bar.delta > 0 ? "+" : ""}{bar.delta}</b>}{indicators.deltaDivergence && showSignals && divergenceForBar(bi) && <small title={`${divergenceForBar(bi)}: price extreme is not confirmed by estimated delta`}>{divergenceForBar(bi)}</small>}{indicators.wickAbsorption && (bar.high - Math.max(bar.open,bar.close) > (bar.high-bar.low)*0.35 || Math.min(bar.open,bar.close)-bar.low > (bar.high-bar.low)*0.35) && <em title="Possible wick absorption (estimated)">✦</em>}{indicators.zeroPrints && bar.levels.some(level => level.sell === 0 || level.buy === 0) && <i title="Possible zero print (estimated)">Z</i>}{indicators.unfinishedAuctions && (bar.close === bar.high || bar.close === bar.low) && <u title="Possible unfinished auction (estimated)">*</u>}</div>
              <div className="ofp-bar-time">{bar.time}</div>
            </div>;
          }) : <div className="ofp-empty">{status === "loading" ? "Loading market candles…" : "No verified live candles available. Check the market-data provider configuration."}</div>}
        </div>
      </div>
    </div>
    <section className="ofp-absorption-panel" aria-label="Absorption candidates">
      <div className="ofp-absorption-heading"><div><span>TRADE-PRINT ANALYTICS</span><h3>Absorption Candidates</h3></div><b>{absorptionStatus === "loading" ? "LOADING" : absorptionStatus === "error" ? "UNAVAILABLE" : `${absorptionCandidates.length} FOUND`}</b></div>
      <p className="ofp-absorption-disclaimer">Heuristic candidates from stored trade prints. These are separate from the candle-derived footprint above and do not confirm hidden or institutional orders.</p>
      {absorptionStatus === "error" ? <p className="ofp-absorption-empty">Absorption data could not be loaded. Check the stored-trade API.</p> : absorptionStatus === "loading" ? <p className="ofp-absorption-empty">Loading stored trade-print candidates…</p> : absorptionCandidates.length === 0 ? <p className="ofp-absorption-empty">No absorption candidates in the available stored-trade window.</p> : <div className="ofp-absorption-list">{absorptionCandidates.slice(0, 12).map((candidate, index) => <article key={`${candidate.timestamp}-${candidate.price}-${index}`} className={candidate.type === "buy-absorption" ? "buy" : "sell"}><div><b>{candidate.type === "buy-absorption" ? "BUY ABSORPTION" : "SELL ABSORPTION"}</b><span className={`strength ${candidate.strength}`}>{candidate.strength.toUpperCase()}</span></div><strong>{fmt(candidate.price, 2)}</strong><small>{new Date(candidate.timestamp).toLocaleString()} · Aggressor {candidate.aggressorSide} {fmt(candidate.aggressorVolume, 0)} · Follow-through {candidate.followThroughTicks} ticks</small><p>{candidate.evidence}</p></article>)}</div>}
      {absorptionNote && <small className="ofp-absorption-source">{absorptionNote}</small>}
    </section>
    <div className="ofp-data-note">DATA TRANSPARENCY: The cells and buy/sell split are <b>candle-derived estimates</b>, not exchange-reported bid/ask volume. True footprint delta requires trade-level aggressor-side data. {source && `Provider: ${source}.`}</div>
    <button className="ofp-legend-toggle" onClick={() => setLegend(v => !v)}><b>Order Flow Footprint Legend &amp; Indicators</b><span>Estimated view · {source || "Market feed"}</span><ChevronDown size={16}/></button>
    {legend && <div className="ofp-legend"><span><i className="buy"></i> Relative buy-side estimate</span><span><i className="sell"></i> Relative sell-side estimate</span><span><i className="poc"></i> Last price reference</span><p>Numbers are modelled from candle direction and provider volume/tick-volume proxies; they are not real bid × ask prints, and should not be used as verified order-flow signals.</p></div>}
  </section>;
}
