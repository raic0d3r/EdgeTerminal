"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchMarketData } from "@/lib/market-selection";
import EdgeLightweightChart from "@/components/edge-lightweight-chart";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type Indicator = { id: string; name: string; kind: "ema" | "sma"; period: number; color: string; source: "builtin" | "pine" };
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

export default function EdgeChartStudio({ symbol, interval, provider, onIntervalChange }: { symbol: string; interval: string; provider: "ctrader" | "exness"; onIntervalChange?: (value: string) => void }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [quoteMode, setQuoteMode] = useState("waiting");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading broker candles…");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Indicator[]>(PRESETS.slice(0, 2));
  const [studioOpen, setStudioOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
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
  const [clearDrawingsVersion, setClearDrawingsVersion] = useState(0);
  const dragRef = useRef<{ x: number; end: number | null } | null>(null);

  async function load() {
    setBusy(true);
    setStatus("Loading broker candles…");
    try {
      const response = await fetchMarketData(`/api/market?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(API_INTERVAL[interval] || interval)}&provider=${provider}&historyBars=500`);
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
  const chartTop = 34, chartBottom = 342, volumeTop = 360, volumeBottom = 408, timeAxisTop = 414, timeAxisBottom = 520, chartLeft = 18, chartRight = 900;
  const x = (i: number) => chartLeft + (i / Math.max(1, displayCandles.length - 1)) * (chartRight-chartLeft);
  const y = (v: number) => chartTop + ((maxPrice - v) / (maxPrice - minPrice)) * (chartBottom-chartTop);
  const pointerPoint = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(chartLeft, Math.min(chartRight, (e.clientX - rect.left) / rect.width * 1000)), y: Math.max(chartTop, Math.min(chartBottom, (e.clientY - rect.top) / rect.height * 414)) };
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
    <div className="edge-chart-studio-toolbar edge-chart-studio-toolbar-compact">
      <div><strong>EDGE CHART</strong><span className="edge-chart-beta">BETA</span><small>{symbol} · {interval} · {provider.toUpperCase()}</small></div>
    </div>
    {replayIndex !== null && <div className="edge-replay-timeline"><span>REPLAY · {candles[replayIndex]?.time ? new Date(candles[replayIndex].time).toLocaleString() : ""}</span><input aria-label="Replay position" type="range" min="1" max={Math.max(1, candles.length - 1)} value={replayIndex} onChange={e => { setReplayPlaying(false); setReplayIndex(Number(e.target.value)); }} /></div>}
    <div className="edge-chart-status"><span className={quoteMode === "live" ? "edge-live-dot" : "edge-stale-dot"}/> {status} · {quoteMode === "live" ? "Live broker quote · 5s refresh" : "Broker last close · waiting for live quote"}{lastUpdate ? ` · ${new Date(lastUpdate).toLocaleTimeString()}` : ""}</div>
    {candles.length > 0 ? <div className="edge-chart-canvas-wrap">
      <aside className="edge-drawing-toolbar" aria-label="Chart drawing tools">
        <button type="button" title="Cursor / pan" aria-label="Cursor / pan" className={drawingTool === "cursor" ? "selected" : ""} onClick={() => setDrawingTool("cursor")}>↖</button>
        <button type="button" title="Trend line" aria-label="Trend line" className={drawingTool === "trend" ? "selected" : ""} onClick={() => setDrawingTool("trend")}>／</button>
        <button type="button" title="Horizontal line" aria-label="Horizontal line" className={drawingTool === "horizontal" ? "selected" : ""} onClick={() => setDrawingTool("horizontal")}>━</button>
        <button type="button" title="Vertical line" aria-label="Vertical line" className={drawingTool === "vertical" ? "selected" : ""} onClick={() => setDrawingTool("vertical")}>┃</button>
        <button type="button" title="Clear drawings" aria-label="Clear drawings" onClick={() => setClearDrawingsVersion(v => v + 1)}>⌫</button>
      </aside>
      <div className="edge-chart-plot-stack">
        <EdgeLightweightChart
          symbol={symbol}
          interval={interval}
          onIntervalChange={onIntervalChange}
          candles={displayCandles}
          indicators={active}
          livePrice={replayIndex === null && viewEnd === null ? livePrice : null}
          quoteMode={quoteMode}
          drawingTool={drawingTool}
          clearDrawingsVersion={clearDrawingsVersion}
          toolbarControls={<>
            <div className="edge-tv-indicator-menu-wrap">
              <button type="button" className={`edge-tv-indicator-menu-trigger ${indicatorsOpen ? "active" : ""}`} aria-haspopup="menu" aria-expanded={indicatorsOpen} onClick={() => setIndicatorsOpen(v => !v)}>▥ Indicators <span className="edge-tv-caret">⌄</span></button>
              {indicatorsOpen && <div className="edge-tv-indicator-menu" role="menu" aria-label="Chart indicators">
                <div className="edge-tv-indicator-menu-title">OVERLAYS</div>
                {PRESETS.map(item => <button type="button" role="menuitemcheckbox" aria-checked={active.some(a => a.id === item.id)} key={item.id} className={active.some(a => a.id === item.id) ? "selected" : ""} onClick={() => setActive(current => current.some(a => a.id === item.id) ? current.filter(a => a.id !== item.id) : [...current, item])}><span>{item.name}</span><span className="edge-tv-indicator-check">{active.some(a => a.id === item.id) ? "✓" : ""}</span></button>)}
                {active.filter(a => a.source === "pine").map(a => <button type="button" role="menuitem" key={a.id} className="selected" onClick={() => setActive(current => current.filter(v => v.id !== a.id))}><span>{a.name}</span><span>×</span></button>)}
              </div>}
            </div>
            <div className="edge-tv-inline-group edge-tv-navigation-controls" aria-label="Chart navigation">
              <button type="button" onClick={() => setVisibleCount(v => Math.max(25, Math.round(v / 1.25)))}>＋</button>
              <button type="button" onClick={() => setVisibleCount(v => Math.min(candles.length || 500, Math.round(v * 1.25)))}>－</button>
              <button type="button" onClick={() => { setViewEnd(null); setReplayIndex(null); setVisibleCount(140); }}>Reset</button>
              <button type="button" className={replayIndex !== null ? "active" : ""} onClick={beginReplay} disabled={candles.length < 3}>▶ Replay</button>
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
            <button type="button" className="edge-tv-pine-button" onClick={() => setStudioOpen(v => !v)}>{studioOpen ? "Close Pine Studio" : "Pine Script Studio"}</button>
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
