"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchMarketData } from "@/lib/market-selection";
import EdgeLightweightChart from "@/components/edge-lightweight-chart";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type Indicator = { id: string; name: string; kind: "ema" | "sma" | "zigzag"; period: number; color: string; source: "builtin" | "pine" };
type PinePlot = { name: string; kind: "ema" | "sma" | "close"; period: number; color: string };

const API_INTERVAL: Record<string, string> = {
  "1m": "1min", "2m": "1min", "3m": "1min", "5m": "5min", "10m": "10min", "15m": "15min", "30m": "30min", "45m": "15min",
  "1h": "1h", "2h": "1h", "3h": "1h", "4h": "4h", "1d": "1day", "1w": "1day", "1mo": "1day", "3mo": "1day", "6mo": "1day", "12mo": "1day",
};

function aggregateCandles(rows: Candle[], interval: string): Candle[] {
  const minuteMatch = /^(\d+)m$/.exec(interval);
  const hourMatch = /^(\d+)h$/.exec(interval);
  const monthMatch = /^(\d+)mo$/.exec(interval);
  if (!minuteMatch && !hourMatch && !["1w", "1d"].includes(interval) && !monthMatch) return rows;
  const bucketStart = (time: string) => {
    const date = new Date(time);
    const epoch = date.getTime();
    if (!Number.isFinite(epoch)) return 0;
    if (minuteMatch) { const size = Number(minuteMatch[1]) * 60_000; return Math.floor(epoch / size) * size; }
    if (hourMatch) { const size = Number(hourMatch[1]) * 3_600_000; return Math.floor(epoch / size) * size; }
    if (interval === "1d") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    if (interval === "1w") { const day = (date.getUTCDay() + 6) % 7; return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day); }
    const months = Number(monthMatch?.[1] || 1);
    const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth();
    const startMonth = Math.floor(monthIndex / months) * months;
    return Date.UTC(Math.floor(startMonth / 12), startMonth % 12, 1);
  };
  const buckets = new Map<number, Candle>();
  for (const row of rows) {
    const key = bucketStart(row.time);
    if (!key) continue;
    const current = buckets.get(key);
    if (!current) buckets.set(key, { ...row, time: new Date(key).toISOString() });
    else { current.high = Math.max(current.high, row.high); current.low = Math.min(current.low, row.low); current.close = row.close; current.volume = (Number(current.volume) || 0) + (Number(row.volume) || 0); }
  }
  return [...buckets.entries()].sort((a,b)=>a[0]-b[0]).map(([, candle])=>candle);
}

const PRESETS: Indicator[] = [
  { id: "ema-20", name: "EMA 20", kind: "ema", period: 20, color: "#f5b942", source: "builtin" },
  { id: "ema-50", name: "EMA 50", kind: "ema", period: 50, color: "#4aa3ff", source: "builtin" },
  { id: "sma-200", name: "SMA 200", kind: "sma", period: 200, color: "#c084fc", source: "builtin" },
  { id: "zigzag-12", name: "ZigZag (12, 0.5%)", kind: "zigzag", period: 12, color: "#e879f9", source: "builtin" },
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

export default function EdgeChartStudio({ symbol, interval, provider, onIntervalChange, toolsVisible = false }: { symbol: string; interval: string; provider: "ctrader" | "exness"; onIntervalChange?: (value: string) => void; toolsVisible?: boolean }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [quoteMode, setQuoteMode] = useState("waiting");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading broker candles…");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Indicator[]>([]);
  const [studioOpen, setStudioOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [showFvg, setShowFvg] = useState(false);
  const [fvgFilter, setFvgFilter] = useState<"FVG Only" | "BAG Only" | "Both">("FVG Only");
  const [fvgMinGap, setFvgMinGap] = useState("0.5");
  const [fvgExtend, setFvgExtend] = useState(true);
  const [script, setScript] = useState('//@version=5\nindicator("My EMA", overlay=true)\nplot(ta.ema(close, 20), title="EMA 20", color=color.orange)');
  const [scriptError, setScriptError] = useState("");
  const [scriptNote, setScriptNote] = useState("");
  const [savedScripts, setSavedScripts] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(2500);
  const [viewEnd, setViewEnd] = useState<number | null>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [drawingTool, setDrawingTool] = useState<"cursor" | "trend" | "horizontal" | "vertical" | "label" | "fib" | "fib-extension">("cursor");
  const [drawingCategory, setDrawingCategory] = useState<string | null>(null);
  const [clearDrawingsVersion, setClearDrawingsVersion] = useState(0);
  const dragRef = useRef<{ x: number; end: number | null } | null>(null);

  async function load() {
    setBusy(true);
    setStatus("Loading broker candles…");
    try {
      const response = await fetchMarketData(`/api/market?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(API_INTERVAL[interval] || interval)}&provider=${provider}&historyBars=2500`);
      const body = await response.json();
      if (!response.ok || !Array.isArray(body?.data?.candles)) throw new Error(body?.error || "Broker candle history is unavailable.");
      const rawRows = body.data.candles.map((c: Candle) => ({
        ...c, open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
      })).filter((c: Candle) =>
        Number.isFinite(c.open) && Number.isFinite(c.high) &&
        Number.isFinite(c.low) && Number.isFinite(c.close) &&
        c.high >= c.low && c.high >= Math.max(c.open, c.close) &&
        c.low <= Math.min(c.open, c.close)
      );
      const rows = aggregateCandles(rawRows, interval);
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
  const chartTop = 34, chartBottom = 342, volumeTop = 360, volumeBottom = 408, timeAxisTop = 414, timeAxisBottom = 520, chartLeft = 18, chartRight = 900;
  const x = (i: number) => chartLeft + (i / Math.max(1, displayCandles.length - 1)) * (chartRight-chartLeft);
  const y = (v: number) => chartTop + ((maxPrice - v) / (maxPrice - minPrice)) * (chartBottom-chartTop);
  const pointerPoint = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(chartLeft, Math.min(chartRight, (e.clientX - rect.left) / rect.width * 1000)), y: Math.max(chartTop, Math.min(chartBottom, (e.clientY - rect.top) / rect.height * 414)) };
  };

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

  useEffect(() => { setReplayIndex(null); setReplayPlaying(false); setViewEnd(null); setVisibleCount(2500); }, [symbol, interval, provider]);

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
    <div className="edge-chart-studio-toolbar edge-chart-studio-toolbar-compact">
      <div><strong>EDGE CHART</strong><span className="edge-chart-beta">BETA</span><small>{symbol} · {interval} · {provider.toUpperCase()}</small></div>
    </div>
    {replayIndex !== null && <div className="edge-replay-timeline"><span>REPLAY · {candles[replayIndex]?.time ? new Date(candles[replayIndex].time).toLocaleString() : ""}</span><input aria-label="Replay position" type="range" min="1" max={Math.max(1, candles.length - 1)} value={replayIndex} onChange={e => { setReplayPlaying(false); setReplayIndex(Number(e.target.value)); }} /></div>}
    <div className="edge-chart-status"><span className={quoteMode === "live" ? "edge-live-dot" : "edge-stale-dot"}/> {status} · {quoteMode === "live" ? "Live broker quote · 5s refresh" : "Broker last close · waiting for live quote"}{lastUpdate ? ` · ${new Date(lastUpdate).toLocaleTimeString()}` : ""}</div>
    {candles.length > 0 ? <div className="edge-chart-canvas-wrap">
      {toolsVisible && <aside className="edge-drawing-toolbar" aria-label="Chart drawing tools">
        <div className="edge-drawing-rail">
          <button type="button" title="Cursor" aria-label="Cursor" className={drawingTool === "cursor" ? "selected" : ""} onClick={() => { setDrawingTool("cursor"); setDrawingCategory(null); }}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3v15M24 30v15M3 24h15M30 24h15"/></svg></button>
          <button type="button" title="Lines" aria-label="Lines" className={drawingCategory === "lines" || ["trend","horizontal","vertical"].includes(drawingTool) ? "selected" : ""} onClick={() => setDrawingCategory(v => v === "lines" ? null : "lines")}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 24h40"/><circle cx="24" cy="24" r="5"/></svg></button>
          <button type="button" title="Fibonacci tools" aria-label="Fibonacci tools" className={drawingCategory === "fib" || drawingTool.startsWith("fib") ? "selected" : ""} onClick={() => setDrawingCategory(v => v === "fib" ? null : "fib")}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 10h30M13 20h30M5 30h30M13 40h30"/><circle cx="38" cy="20" r="4"/><circle cx="7" cy="40" r="4"/></svg></button>
          <button type="button" title="Pattern tools" aria-label="Pattern tools" className={drawingCategory === "patterns" ? "selected" : ""} onClick={() => setDrawingCategory(v => v === "patterns" ? null : "patterns")}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 39 15 9 30 29 40 12 44 37 15 9"/><circle cx="7" cy="39" r="3.5"/><circle cx="15" cy="9" r="3.5"/><circle cx="30" cy="29" r="3.5"/><circle cx="40" cy="12" r="3.5"/><circle cx="44" cy="37" r="3.5"/></svg></button>
          <button type="button" title="Text and notes" aria-label="Text and notes" className={drawingTool === "label" ? "selected" : ""} onClick={() => { setDrawingTool("label"); setDrawingCategory(null); }}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 9h34M24 9v33M17 42h14"/></svg></button>
          <button type="button" title="Measure" aria-label="Measure" className={drawingCategory === "measure" ? "selected" : ""} onClick={() => setDrawingCategory(v => v === "measure" ? null : "measure")}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 37 37 7l5 5-30 30zM17 27l5 5M23 21l5 5M29 15l5 5"/></svg></button>
          <span className="edge-drawing-toolbar-divider" />
          <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setVisibleCount(v => Math.max(25, Math.round(v / 1.25)))}><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="20" cy="20" r="13"/><path d="M30 30 43 43M20 13v14M13 20h14"/></svg></button>
          <span className="edge-drawing-toolbar-divider" />
          <button type="button" title="Magnet" aria-label="Magnet" onClick={() => setDrawingCategory(v => v === "magnet" ? null : "magnet")}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 27V16a14 14 0 0 1 28 0v11h-9V16a5 5 0 0 0-10 0v11zM10 27v8h9v-8M29 27v8h9v-8"/></svg></button>
          <button type="button" title="Lock drawings" aria-label="Lock drawings" onClick={() => setDrawingCategory(v => v === "lock" ? null : "lock")}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 21 34 4l7 7-24 24H10zM10 21l10 10M34 4l7 7M34 31v-3a6 6 0 0 1 12 0"/><rect x="31" y="31" width="15" height="13" rx="2"/></svg></button>
          <button type="button" title="Unlock drawings" aria-label="Unlock drawings" onClick={() => setDrawingCategory(v => v === "unlock" ? null : "unlock")}><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="21" width="32" height="23" rx="4"/><path d="M16 21v-7a9 9 0 0 1 17-4"/><circle cx="24" cy="32" r="2"/></svg></button>
          <button type="button" title="Hide drawings" aria-label="Hide drawings" onClick={() => setDrawingCategory(v => v === "visibility" ? null : "visibility")}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M3 24s8-14 21-14 21 14 21 14-8 14-21 14S3 24 3 24z"/><circle cx="24" cy="24" r="7"/><path d="M6 43 42 5"/></svg></button>
          <span className="edge-drawing-toolbar-divider" />
          <button type="button" title="Clear drawings" aria-label="Clear drawings" onClick={() => setClearDrawingsVersion(v => v + 1)}><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 13h32M18 13V7h12v6M12 13l3 30h18l3-30"/></svg></button>
        </div>
        {drawingCategory === "lines" && <div className="edge-drawing-submenu" role="menu" aria-label="Lines">
          <div className="edge-drawing-submenu-heading">LINES</div>
          {[
            ["trend", "Trendline", "／"], ["ray", "Ray", "／"], ["info", "Info line", "／"], ["extended", "Extended line", "／"], ["angle", "Trend angle", "∠"], ["horizontal", "Horizontal line", "—"], ["horizontal-ray", "Horizontal ray", "—"], ["vertical", "Vertical line", "│"], ["crossline", "Crossline", "＋"]
          ].map(([tool, label, icon]) => {
            const supported = ["trend", "horizontal", "vertical"].includes(tool);
            return <button key={tool} type="button" role="menuitem" disabled={!supported} className={drawingTool === tool ? "selected" : ""} title={supported ? label : `${label} — not available yet`} onClick={() => { if (supported) { setDrawingTool(tool as typeof drawingTool); setDrawingCategory(null); } }}><span className="edge-drawing-submenu-icon">{icon}</span><span>{label}</span>{!supported && <small>soon</small>}</button>;
          })}
        </div>}
        {drawingCategory === "fib" && <div className="edge-drawing-submenu" role="menu" aria-label="Fibonacci tools">
          <div className="edge-drawing-submenu-heading">FIBONACCI</div>
          <button type="button" role="menuitem" onClick={() => { setDrawingTool("fib"); setDrawingCategory(null); }}><span className="edge-drawing-submenu-icon">F</span>Fib retracement</button>
          <button type="button" role="menuitem" onClick={() => { setDrawingTool("fib-extension"); setDrawingCategory(null); }}><span className="edge-drawing-submenu-icon">Fₓ</span>Trend-based Fib extension</button>
        </div>}
        {drawingCategory === "measure" && <div className="edge-drawing-submenu" role="menu"><div className="edge-drawing-submenu-heading">MEASURE</div><p>Measurement tools are not available yet.</p></div>}
      </aside>}
      <div className="edge-chart-plot-stack">
        <EdgeLightweightChart
          symbol={symbol}
          interval={interval}
          onIntervalChange={onIntervalChange}
          candles={displayCandles}
          indicators={active}
          fvgSettings={{ enabled: showFvg, filter: fvgFilter, minGap: Number(fvgMinGap) || 0, extendRight: fvgExtend }}
          livePrice={replayIndex === null && viewEnd === null ? livePrice : null}
          quoteMode={quoteMode}
          drawingTool={drawingTool}
          clearDrawingsVersion={clearDrawingsVersion}
          toolbarControls={<>
            <div className="edge-tv-indicator-menu-wrap">
              <button type="button" className={`edge-tv-indicator-menu-trigger ${indicatorsOpen ? "active" : ""}`} aria-haspopup="menu" aria-expanded={indicatorsOpen} onClick={() => setIndicatorsOpen(v => !v)}>▥ Indicators <span className="edge-tv-caret">⌄</span></button>
              {indicatorsOpen && <div className="edge-tv-indicator-menu" role="menu" aria-label="Chart indicators">
                <div className="edge-tv-indicator-menu-title">OVERLAYS</div>
                <button type="button" role="menuitemcheckbox" aria-checked={showFvg} className={showFvg ? "selected" : ""} onClick={() => setShowFvg(v => !v)}><span>Fair Value Gaps (FVG)</span><span className="edge-tv-indicator-check">{showFvg ? "✓" : ""}</span></button>
                {showFvg && <div className="edge-fvg-menu-settings"><label>Gap filter<select value={fvgFilter} onChange={e => setFvgFilter(e.target.value as typeof fvgFilter)}><option>FVG Only</option><option>BAG Only</option><option>Both</option></select></label><label>Minimum gap<input type="number" min="0" step="0.01" value={fvgMinGap} onChange={e => setFvgMinGap(e.target.value)} /></label><label className="edge-fvg-extend"><input type="checkbox" checked={fvgExtend} onChange={e => setFvgExtend(e.target.checked)} /> Extend to right</label></div>}
                {PRESETS.map(item => <button type="button" role="menuitemcheckbox" aria-checked={active.some(a => a.id === item.id)} key={item.id} className={active.some(a => a.id === item.id) ? "selected" : ""} onClick={() => setActive(current => current.some(a => a.id === item.id) ? current.filter(a => a.id !== item.id) : [...current, item])}><span>{item.name}</span><span className="edge-tv-indicator-check">{active.some(a => a.id === item.id) ? "✓" : ""}</span></button>)}
                {active.filter(a => a.source === "pine").map(a => <button type="button" role="menuitem" key={a.id} className="selected" onClick={() => setActive(current => current.filter(v => v.id !== a.id))}><span>{a.name}</span><span>×</span></button>)}
              </div>}
            </div>
            <div className="edge-tv-inline-group edge-tv-navigation-controls" aria-label="Chart navigation">
              <button type="button" onClick={() => { setViewEnd(null); setReplayIndex(null); setVisibleCount(2500); }} title="Reset chart view">↺</button>
              <button type="button" className={replayIndex !== null ? "active" : ""} onClick={beginReplay} disabled={candles.length < 3} title="Bar replay">▷</button>
              {replayIndex !== null && <>
                <button type="button" onClick={() => setReplayPlaying(v => !v)}>{replayPlaying ? "Ⅱ" : "▶"}</button>
                <button type="button" onClick={() => setReplayIndex(v => Math.max(1, (v ?? 1) - 1))}>◀</button>
                <button type="button" onClick={() => setReplayIndex(v => Math.min(candles.length - 1, (v ?? 1) + 1))}>▶</button>
                <select aria-label="Replay speed" value={replaySpeed} onChange={e => setReplaySpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option></select>
                <button type="button" onClick={stopReplay}>Exit</button>
              </>}
            </div>
          </>}
          toolbarActions={<>
            <button type="button" className="edge-tv-pine-button" title="Pine Script Studio" aria-label="Pine Script Studio" onClick={() => setStudioOpen(v => !v)}>{studioOpen ? "Close Pine Studio" : "Pine Script Studio"}</button>
          </>}
        />
      </div>
    </div> : <div className="edge-chart-empty">No chart rendered because verified broker candle data is unavailable. Check the selected broker connection and instrument.</div>}
    <div className="edge-chart-footer"><span>{replayIndex !== null ? `Replay close: ${candles[replayIndex]?.close ?? "—"}` : livePrice != null ? `Live price: ${livePrice.toFixed(symbol === "BTC/USD" ? 1 : 2)}` : candles.length ? `Latest close: ${candles[candles.length-1].close}` : "Waiting for verified data"}</span><span>{replayIndex !== null ? "Historical replay · future candles hidden" : "Broker OHLC + quote · No synthetic candles"}</span></div>
    {studioOpen && <div className="edge-pine-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setStudioOpen(false); }}>
      <section className="edge-pine-studio edge-pine-studio-modal" role="dialog" aria-modal="true" aria-label="Pine Script Studio">
        <div className="edge-pine-heading"><div><strong>Pine Script Studio</strong><small>Paste Pine v5/v6 source. Supported plots are converted into native overlays.</small></div><span>LIMITED COMPATIBILITY</span><button type="button" className="edge-pine-close" onClick={() => setStudioOpen(false)} aria-label="Close Pine Script Studio">×</button></div>
        <textarea value={script} onChange={e => { setScript(e.target.value); setScriptError(""); setScriptNote(""); }} spellCheck={false} aria-label="Pine Script source editor"/>
        <div className="edge-pine-controls"><button type="button" onClick={applyPine}>Validate & Convert</button><button type="button" className="secondary" onClick={() => setScript('//@version=5\nindicator("EMA 20 and SMA 50", overlay=true)\nplot(ta.ema(close, 20), title="EMA 20", color=color.orange)\nplot(ta.sma(close, 50), title="SMA 50", color=color.blue)')}>Load example</button></div>
        {scriptError && <p className="edge-pine-error">{scriptError}</p>}
        {scriptNote && <p className="edge-pine-success">{scriptNote}</p>}
        {savedScripts.length > 0 && <div className="edge-pine-saved"><b>Saved scripts</b>{savedScripts.map((s,i)=><button type="button" key={i} onClick={()=>setScript(s)}>Script {i+1}</button>)}</div>}
        <p className="edge-pine-disclaimer">Not a Pine Script execution environment. This first release converts a small, explicit subset: indicator()/study() declarations and plot(close), plot(ta.ema(close, N)), plot(ta.sma(close, N)). Inputs, security(), strategies, alerts, drawings, custom functions and most Pine features are not supported. Original source is retained locally.</p>
      </section>
    </div>}
  </div>;
}
