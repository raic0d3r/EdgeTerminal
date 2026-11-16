"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMarketData } from "@/lib/market-selection";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type Indicator = { id: string; name: string; kind: "ema" | "sma"; period: number; color: string; source: "builtin" | "pine" };
type PinePlot = { name: string; kind: "ema" | "sma" | "close"; period: number; color: string };

const API_INTERVAL: Record<string, string> = { "1m": "1min", "5m": "5min", "10m": "10min", "15m": "15min", "30m": "30min", "1h": "1h", "4h": "4h", "1d": "1day", "1w": "1week", "1mo": "1month" };

const PRESETS: Indicator[] = [
  { id: "ema-20", name: "EMA 20", kind: "ema", period: 20, color: "#f5b942", source: "builtin" },
  { id: "ema-50", name: "EMA 50", kind: "ema", period: 50, color: "#4aa3ff", source: "builtin" },
  { id: "sma-200", name: "SMA 200", kind: "sma", period: 200, color: "#c084fc", source: "builtin" },
];

function average(values: number[], period: number, exponential: boolean) {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (!period || values.length < period) return out;
  if (!exponential) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
  } else {
    const alpha = 2 / (period + 1);
    let previous = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = previous;
    for (let i = period; i < values.length; i++) {
      previous = values[i] * alpha + previous * (1 - alpha);
      out[i] = previous;
    }
  }
  return out;
}

function parsePine(source: string): { plots: PinePlot[]; error: string | null } {
  if (!/^\s*\/\/@version\s*=\s*[56]/m.test(source)) {
    return { plots: [], error: "Add //@version=5 or //@version=6. Only a documented Pine-compatible subset is currently supported." };
  }
  if (!/\b(indicator|study)\s*\(/.test(source)) {
    return { plots: [], error: "Add an indicator(...) declaration before plot() statements." };
  }
  const plots: PinePlot[] = [];
  const regex = /plot\s*\(\s*(?:(ta\.)?(ema|sma)\s*\(\s*close\s*,\s*(\d{1,3})\s*\)|close)\s*(?:,\s*title\s*=\s*"([^"]*)")?(?:,\s*color\s*=\s*(color\.\w+|#[0-9a-fA-F]{6}))?[^)]*\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source))) {
    const kind = match[2]?.toLowerCase() as "ema" | "sma" | undefined;
    const period = kind ? Number(match[3]) : 1;
    const rawColor = match[5] || "";
    const color = rawColor.startsWith("#") ? rawColor : rawColor === "color.red" ? "#fb5364" : rawColor === "color.green" ? "#00c896" : rawColor === "color.blue" ? "#4aa3ff" : "#f5b942";
    plots.push({ name: match[4] || (kind ? `${kind.toUpperCase()} ${period}` : "Close"), kind: kind || "close", period, color });
  }
  if (!plots.length) return { plots: [], error: "No supported plot() found. Supported forms: plot(close), plot(ta.ema(close, 20)), plot(ta.sma(close, 50))." };
  return { plots, error: null };
}

export default function EdgeChartStudio({ symbol, interval, provider }: { symbol: string; interval: string; provider: "ctrader" | "exness" }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [quoteMode, setQuoteMode] = useState("waiting");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading broker candles…");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Indicator[]>(PRESETS.slice(0, 2));
  const [studioOpen, setStudioOpen] = useState(false);
  const [script, setScript] = useState('//@version=5\nindicator("My EMA", overlay=true)\nplot(ta.ema(close, 20), title="EMA 20", color=color.orange)');
  const [scriptError, setScriptError] = useState("");
  const [scriptNote, setScriptNote] = useState("");
  const [savedScripts, setSavedScripts] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(140);
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [drawingTool, setDrawingTool] = useState<"cursor" | "trend" | "horizontal" | "vertical">("cursor");
  const [drawings, setDrawings] = useState<Array<{ id: number; tool: "trend" | "horizontal" | "vertical"; x1: number; y1: number; x2: number; y2: number }>>([]);
  const drawingRef = useRef<{ tool: "trend" | "horizontal" | "vertical"; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragRef = useRef<{ x: number; end: number | null } | null>(null);

  async function load() {
    setBusy(true);
    setStatus("Loading broker candles…");
    try {
      const response = await fetchMarketData(`/api/market?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(API_INTERVAL[interval] || interval)}&provider=${provider}&historyBars=500`);
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.data?.candles)) throw new Error(body?.error || "Broker candle history is unavailable.");
      const rows = body.data.candles.map((c: Candle) => ({
        ...c, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
      })).filter((c: Candle) =>
        Number.isFinite(c.open) && Number.isFinite(c.high) &&
        Number.isFinite(c.low) && Number.isFinite(c.close) &&
        c.high >= c.low && c.high >= Math.max(c.open, c.close) &&
        c.low <= Math.min(c.open, c.close)
      );
      if (!rows.length) throw new Error("No verified candles were returned by the selected broker.");
      setCandles(rows);
      const price = Number(body?.data?.price);
      setLivePrice(Number.isFinite(price) && price > 0 ? price : rows.at(-1)?.close ?? null);
      setQuoteMode(body?.data?.mode || body?.status || "unknown");
      setLastUpdate(body?.data?.updatedAt || new Date().toISOString());
      setStatus(`${body.provider || provider} · ${rows.length} broker candles · ${body.status || "data"} · ${body?.data?.mode === "live" ? "LIVE QUOTE" : "LAST CLOSE"}`);
    } catch (e) {
      setCandles([]);
      setStatus(e instanceof Error ? e.message : "Unable to load broker data.");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    let active = true;
    void load();
    // Poll the selected broker quote and candle history. A live quote updates
    // the forming candle visually; no synthetic market prices are generated.
    const timer = window.setInterval(() => { if (active) void load(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [symbol, interval, provider]);
  useEffect(() => {
    try { setSavedScripts(JSON.parse(localStorage.getItem("edge-chart-pine-scripts") || "[]")); } catch { setSavedScripts([]); }
  }, []);

  const effectiveEnd = Math.min(replayIndex ?? viewEnd ?? candles.length, candles.length);
  const visibleStart = Math.max(0, effectiveEnd - visibleCount);
  const visibleCandles = useMemo(() => candles.slice(visibleStart, effectiveEnd), [candles, visibleStart, effectiveEnd]);
  const displayCandles = useMemo(() => {
    if (replayIndex !== null || viewEnd !== null || !visibleCandles.length || livePrice == null || quoteMode !== "live") return visibleCandles;
    const next = [...visibleCandles];
    const last = { ...next[next.length - 1] };
    last.high = Math.max(last.high, livePrice);
    last.low = Math.min(last.low, livePrice);
    last.close = livePrice;
    next[next.length - 1] = last;
    return next;
  }, [visibleCandles, livePrice, quoteMode, replayIndex, viewEnd]);
  const closes = useMemo(() => candles.map(c => Number(c.close)), [candles]);
  const priceRange = useMemo(() => {
    if (!displayCandles.length) return { min: 0, max: 1 };
    const lows = displayCandles.map(c => c.low);
    const highs = displayCandles.map(c => c.high);
    if (replayIndex === null && viewEnd === null && livePrice != null) { lows.push(livePrice); highs.push(livePrice); }
    const low = Math.min(...lows), high = Math.max(...highs);
    const span = Math.max(high - low, Math.abs(high) * 0.0005, 0.01);
    return { min: low - span * 0.08, max: high + span * 0.08 };
  }, [displayCandles, livePrice, replayIndex, viewEnd]);
  const minPrice = priceRange.min, maxPrice = priceRange.max;
  const chartTop = 34, chartBottom = 350, volumeTop = 372, volumeBottom = 418, chartLeft = 18, chartRight = 900;
  const x = (i: number) => chartLeft + (i / Math.max(1, displayCandles.length - 1)) * (chartRight-chartLeft);
  const y = (v: number) => chartTop + ((maxPrice - v) / (maxPrice - minPrice)) * (chartBottom-chartTop);
  const pointerPoint = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(chartLeft, Math.min(chartRight, (e.clientX - rect.left) / rect.width * 1000)), y: Math.max(chartTop, Math.min(chartBottom, (e.clientY - rect.top) / rect.height * 440)) };
  };
  const series = (kind: "ema" | "sma", period: number) => average(closes, period, kind === "ema");
  const paths = useMemo(() => active.map(ind => {
    const values = series(ind.kind, ind.period).slice(visibleStart, effectiveEnd);
    let started = false;
    const d = values.map((v, i) => {
      if (v == null) return "";
      const command = started ? "L" : "M"; started = true;
      return `${command} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`;
    }).filter(Boolean).join(" ");
    return { ...ind, d };
  }), [active, candles, visibleStart, effectiveEnd, minPrice, maxPrice, displayCandles.length]);

  useEffect(() => {
    if (!replayPlaying || replayIndex === null) return;
    const timer = window.setInterval(() => {
      setReplayIndex(current => {
        if (current === null || current >= candles.length - 1) { setReplayPlaying(false); return current; }
        return current + 1;
      });
    }, Math.max(80, 1000 / replaySpeed));
    return () => window.clearInterval(timer);
  }, [replayPlaying, replayIndex, replaySpeed, candles.length]);

  useEffect(() => { setReplayIndex(null); setReplayPlaying(false); setViewEnd(null); setVisibleCount(140); }, [symbol, interval, provider]);

  function beginReplay() {
    const end = viewEnd ?? candles.length;
    setReplayIndex(Math.max(2, end - 1));
    setReplayPlaying(false);
  }
  function stopReplay() { setReplayPlaying(false); setReplayIndex(null); setViewEnd(null); }
  function applyPine() {
    const result = parsePine(script);
    if (result.error) { setScriptError(result.error); setScriptNote(""); return; }
    const converted: Indicator[] = result.plots.filter(p => p.kind !== "close").map((p, i) => ({
      id: `pine-${Date.now()}-${i}`, name: p.name, kind: p.kind as "ema" | "sma", period: p.period, color: p.color, source: "pine",
    }));
    if (!converted.length) {
      setScriptError("The script is valid, but plot(close) is not added as a separate indicator overlay.");
      return;
    }
    setActive(current => [...current.filter(v => v.source !== "pine"), ...converted]);
    setScriptError("");
    setScriptNote(`Converted ${converted.length} plot(s) to native EdgeTerminal overlays. This is a limited converter, not a full Pine Script runtime.`);
    const next = [script, ...savedScripts.filter(s => s !== script)].slice(0, 10);
    setSavedScripts(next);
    try { localStorage.setItem("edge-chart-pine-scripts", JSON.stringify(next)); } catch {}
  }

  return <div className="edge-chart-studio">
    <div className="edge-chart-studio-toolbar">
      <div><strong>EDGE CHART</strong><span className="edge-chart-beta">BETA</span><small>{symbol} · {interval} · {provider.toUpperCase()}</small></div>
      <div className="edge-chart-actions">
        <button type="button" onClick={() => setStudioOpen(v => !v)}>{studioOpen ? "Close Pine Studio" : "Pine Script Studio"}</button>
        <button type="button" onClick={() => void load()} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>
    </div>
    <div className="edge-chart-indicators">
      <span>INDICATORS</span>
      {PRESETS.map(item => <button type="button" key={item.id} className={active.some(a => a.id === item.id) ? "active" : ""} onClick={() => setActive(current => current.some(a => a.id === item.id) ? current.filter(a => a.id !== item.id) : [...current, item])}>{item.name}</button>)}
      {active.filter(a => a.source === "pine").map(a => <button type="button" key={a.id} className="active pine-indicator" onClick={() => setActive(current => current.filter(v => v.id !== a.id))}>{a.name} ×</button>)}
    </div>
    <div className="edge-chart-nav">
      <button type="button" onClick={() => setVisibleCount(v => Math.max(25, Math.round(v / 1.25)))}>＋ Zoom in</button>
      <button type="button" onClick={() => setVisibleCount(v => Math.min(candles.length || 500, Math.round(v * 1.25)))}>－ Zoom out</button>
      <button type="button" onClick={() => { setViewEnd(null); setReplayIndex(null); setVisibleCount(140); }}>Reset view</button>
      <button type="button" className={replayIndex !== null ? "active" : ""} onClick={beginReplay} disabled={candles.length < 3}>▶ Bar Replay</button>
      {replayIndex !== null && <>
        <button type="button" onClick={() => setReplayPlaying(v => !v)}>{replayPlaying ? "Ⅱ Pause" : "▶ Play"}</button>
        <button type="button" onClick={() => setReplayIndex(v => Math.max(1, (v ?? 1) - 1))}>◀ Step</button>
        <button type="button" onClick={() => setReplayIndex(v => Math.min(candles.length - 1, (v ?? 1) + 1))}>Step ▶</button>
        <select aria-label="Replay speed" value={replaySpeed} onChange={e => setReplaySpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option></select>
        <button type="button" onClick={stopReplay}>Exit Replay</button>
      </>}
    </div>
    {replayIndex !== null && <div className="edge-replay-timeline"><span>REPLAY · {candles[replayIndex]?.time ? new Date(candles[replayIndex].time).toLocaleString() : ""}</span><input aria-label="Replay position" type="range" min="1" max={Math.max(1, candles.length - 1)} value={replayIndex} onChange={e => { setReplayPlaying(false); setReplayIndex(Number(e.target.value)); }} /></div>}
    <div className="edge-chart-status"><span className={quoteMode === "live" ? "edge-live-dot" : "edge-stale-dot"}/> {status} · {quoteMode === "live" ? "Live broker quote · 5s refresh" : "Broker last close · waiting for live quote"}{lastUpdate ? ` · ${new Date(lastUpdate).toLocaleTimeString()}` : ""}</div>
    {candles.length > 0 ? <div className="edge-chart-canvas-wrap">
      <aside className="edge-drawing-toolbar" aria-label="Chart drawing tools">
        <button type="button" title="Cursor / pan" aria-label="Cursor / pan" className={drawingTool === "cursor" ? "selected" : ""} onClick={() => setDrawingTool("cursor")}>↖</button>
        <button type="button" title="Trend line" aria-label="Trend line" className={drawingTool === "trend" ? "selected" : ""} onClick={() => setDrawingTool("trend")}>／</button>
        <button type="button" title="Horizontal line" aria-label="Horizontal line" className={drawingTool === "horizontal" ? "selected" : ""} onClick={() => setDrawingTool("horizontal")}>━</button>
        <button type="button" title="Vertical line" aria-label="Vertical line" className={drawingTool === "vertical" ? "selected" : ""} onClick={() => setDrawingTool("vertical")}>┃</button>
        <button type="button" title="Clear drawings" aria-label="Clear drawings" onClick={() => setDrawings([])}>⌫</button>
      </aside>
      <svg className={`edge-chart-canvas${dragging ? " is-dragging" : ""}`} viewBox="0 0 1000 440" preserveAspectRatio="none" role="img" aria-label={`${symbol} ${interval} candlestick chart with enabled indicators`} onWheel={e => { e.preventDefault(); setVisibleCount(v => Math.max(25, Math.min(candles.length || 500, Math.round(v * (e.deltaY > 0 ? 1.12 : 0.89))))); }} onPointerDown={e => { (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId); if (drawingTool !== "cursor") { const p = pointerPoint(e); drawingRef.current = { tool: drawingTool, x1: p.x, y1: p.y, x2: p.x, y2: p.y }; return; } dragRef.current = { x: e.clientX, end: effectiveEnd }; setDragging(true); }} onPointerMove={e => { if (drawingRef.current) { const p = pointerPoint(e); drawingRef.current = { ...drawingRef.current, x2: p.x, y2: p.y }; return; } if (!dragRef.current) return; const dx = e.clientX - dragRef.current.x; const shift = Math.round(dx / Math.max(1, e.currentTarget.clientWidth) * visibleCount); const base = dragRef.current.end ?? candles.length; setViewEnd(Math.max(Math.min(candles.length, visibleCount), Math.min(candles.length, base - shift))); setReplayPlaying(false); }} onPointerUp={() => { if (drawingRef.current) { const d = drawingRef.current; setDrawings(current => [...current, { ...d, id: Date.now() }]); drawingRef.current = null; return; } dragRef.current = null; setDragging(false); }} onPointerCancel={() => { drawingRef.current = null; dragRef.current = null; setDragging(false); }}>
        {[0,1,2,3,4].map(i => <g key={i}><line x1="12" x2="910" y1={chartTop+i*((chartBottom-chartTop)/4)} y2={chartTop+i*((chartBottom-chartTop)/4)} stroke="#34363d" strokeDasharray="2 5"/><text x="918" y={chartTop+4+i*((chartBottom-chartTop)/4)} fill="#a0a7b4" fontSize="11">{(maxPrice-(i/4)*(maxPrice-minPrice)).toFixed(symbol==="BTC/USD"?1:2)}</text></g>)}
        {displayCandles.map((c, i) => {
          if (i === 0) return null;
          const previousDay = new Date(displayCandles[i - 1].time).toLocaleDateString();
          const currentDay = new Date(c.time).toLocaleDateString();
          return previousDay !== currentDay ? <g key={`day-${c.time}`}><line x1={x(i)} x2={x(i)} y1={chartTop} y2={volumeBottom+7} stroke="#7d8796" strokeDasharray="4 5" opacity=".7"/><text x={x(i)+4} y="436" fill="#a0a7b4" fontSize="10">{new Date(c.time).toLocaleDateString(undefined,{day:"2-digit",month:"short"})}</text></g> : null;
        })}
        {drawings.map(d => <g key={d.id} pointerEvents="none"><line x1={d.tool === "vertical" ? d.x1 : d.x1} x2={d.tool === "vertical" ? d.x1 : d.tool === "horizontal" ? 910 : d.x2} y1={d.tool === "horizontal" ? d.y1 : d.y1} y2={d.tool === "horizontal" ? d.y1 : d.tool === "vertical" ? volumeBottom : d.y2} stroke="#f5c451" strokeWidth="1.5" strokeDasharray="5 3"/></g>)}
        <line x1="12" x2="910" y1={volumeTop-8} y2={volumeTop-8} stroke="#34363d"/><text x="18" y={volumeTop+10} fill="#a0a7b4" fontSize="10">VOL · BROKER TICKS</text>
        {(() => { const maxVol = Math.max(1, ...displayCandles.map(c => Number(c.volume) || 0)); return displayCandles.map((c,i) => { const v = Number(c.volume) || 0; const h = v / maxVol * (volumeBottom-volumeTop-12); const w = Math.max(1.5, Math.min(8, 880/displayCandles.length*0.72)); return <rect key={`vol-${c.time}-${i}`} x={x(i)-w/2} y={volumeBottom-h} width={w} height={h} fill={c.close>=c.open ? "#087f70" : "#8d3945"} opacity="0.78"/>; }); })()}
        {(() => { const c = displayCandles.at(-1); return c ? <text x="18" y="18" fill="#d8dce4" fontSize="12" fontWeight="600">O {c.open.toFixed(symbol==="BTC/USD"?1:2)}  H {c.high.toFixed(symbol==="BTC/USD"?1:2)}  L {c.low.toFixed(symbol==="BTC/USD"?1:2)}  C {c.close.toFixed(symbol==="BTC/USD"?1:2)}</text> : null; })()}
        {displayCandles.map((c,i) => {
          const cx=x(i), bodyTop=y(Math.max(c.open,c.close)), bodyBottom=y(Math.min(c.open,c.close));
          const up=c.close>=c.open, color=up?"#00c896":"#f05265";
          const width=Math.max(2, Math.min(8, 880/displayCandles.length*0.68));
          return <g key={`${c.time}-${i}`}><line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.2"/><rect x={cx-width/2} y={bodyTop} width={width} height={Math.max(1.5,bodyBottom-bodyTop)} fill={color}/></g>;
        })}
        {paths.map(p => <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/> )}
        {(() => { const displayedPrice = replayIndex === null ? livePrice : candles[replayIndex]?.close; return displayedPrice != null && Number.isFinite(displayedPrice) ? <g><line x1="12" x2="910" y1={y(displayedPrice)} y2={y(displayedPrice)} stroke={replayIndex === null && quoteMode === "live" ? "#e6b84b" : "#87909e"} strokeDasharray="5 4" strokeWidth="1.2"/><rect x="914" y={y(displayedPrice)-10} width="78" height="20" rx="3" fill={replayIndex === null && quoteMode === "live" ? "#d9a52e" : "#626b78"}/><text x="953" y={y(displayedPrice)+4} textAnchor="middle" fill="#111317" fontSize="11" fontWeight="700">{displayedPrice.toFixed(symbol === "BTC/USD" ? 1 : 2)}</text></g> : null; })()}
        {Array.from({ length: 6 }, (_, tick) => {
          const index = Math.min(displayCandles.length - 1, Math.round(tick * (displayCandles.length - 1) / 5));
          const candle = displayCandles[index];
          if (!candle) return null;
          const date = new Date(candle.time);
          const label = displayCandles.some((item, i) => i < index && new Date(item.time).toDateString() !== date.toDateString())
            ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
          return <g key={`time-tick-${tick}`}><line x1={x(index)} x2={x(index)} y1={volumeBottom + 2} y2={volumeBottom + 6} stroke="#7d8796"/><text x={x(index)} y="436" textAnchor={tick === 0 ? "start" : tick === 5 ? "end" : "middle"} fill="#a0a7b4" fontSize="10">{label}</text></g>;
        })}
      </svg>
    </div> : <div className="edge-chart-empty">No chart rendered because verified broker candle data is unavailable. Check the selected broker connection and instrument.</div>}
    <div className="edge-chart-footer"><span>{replayIndex !== null ? `Replay close: ${candles[replayIndex]?.close ?? "—"}` : livePrice != null ? `Live price: ${livePrice.toFixed(symbol === "BTC/USD" ? 1 : 2)}` : candles.length ? `Latest close: ${candles[candles.length-1].close}` : "Waiting for verified data"}</span><span>{replayIndex !== null ? "Historical replay · future candles hidden" : "Broker OHLC + quote · No synthetic candles"}</span></div>
    {studioOpen && <section className="edge-pine-studio">
      <div className="edge-pine-heading"><div><strong>Pine Script Studio</strong><small>Paste Pine v5/v6 source. Supported plots are converted into native overlays.</small></div><span>LIMITED COMPATIBILITY</span></div>
      <textarea value={script} onChange={e => { setScript(e.target.value); setScriptError(""); setScriptNote(""); }} spellCheck={false} aria-label="Pine Script source editor"/>
      <div className="edge-pine-controls"><button type="button" onClick={applyPine}>Validate & Convert</button><button type="button" className="secondary" onClick={() => setScript('//@version=5\nindicator("EMA 20 and SMA 50", overlay=true)\nplot(ta.ema(close, 20), title="EMA 20", color=color.orange)\nplot(ta.sma(close, 50), title="SMA 50", color=color.blue)')}>Load example</button></div>
      {scriptError && <p className="edge-pine-error">{scriptError}</p>}
      {scriptNote && <p className="edge-pine-success">{scriptNote}</p>}
      {savedScripts.length > 0 && <div className="edge-pine-saved"><b>Saved scripts</b>{savedScripts.map((s,i)=><button type="button" key={i} onClick={()=>setScript(s)}>Script {i+1}</button>)}</div>}
      <p className="edge-pine-disclaimer">Not a Pine Script execution environment. This first release converts a small, explicit subset: indicator()/study() declarations and plot(close), plot(ta.ema(close, N)), plot(ta.sma(close, N)). Inputs, security(), strategies, alerts, drawings, custom functions and most Pine features are not supported. Original source is retained locally.</p>
    </section>}
  </div>;
}
