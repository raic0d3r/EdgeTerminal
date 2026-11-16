"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [status, setStatus] = useState("Loading broker candles…");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Indicator[]>(PRESETS.slice(0, 2));
  const [studioOpen, setStudioOpen] = useState(false);
  const [script, setScript] = useState('//@version=5\nindicator("My EMA", overlay=true)\nplot(ta.ema(close, 20), title="EMA 20", color=color.orange)');
  const [scriptError, setScriptError] = useState("");
  const [scriptNote, setScriptNote] = useState("");
  const [savedScripts, setSavedScripts] = useState<string[]>([]);

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
      setStatus(`${body.provider || provider} · ${rows.length} broker candles · ${body.status || "data"} · ${body.data?.volumeType || "volume type unverified"}`);
    } catch (e) {
      setCandles([]);
      setStatus(e instanceof Error ? e.message : "Unable to load broker data.");
    } finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [symbol, interval, provider]);
  useEffect(() => {
    try { setSavedScripts(JSON.parse(localStorage.getItem("edge-chart-pine-scripts") || "[]")); } catch { setSavedScripts([]); }
  }, []);

  const closes = useMemo(() => candles.map(c => Number(c.close)), [candles]);
  // Derive the visible scale from the actual broker candle range.
  // Do not seed the minimum with zero: that compresses positive-price
  // instruments (for example XAUUSD) against the top of the chart.
  const priceRange = useMemo(() => {
    const valid = candles.filter(c =>
      Number.isFinite(c.high) && Number.isFinite(c.low) &&
      Number.isFinite(c.open) && Number.isFinite(c.close) &&
      c.high >= c.low
    );
    if (!valid.length) return { min: 0, max: 1 };
    const low = valid.reduce((v, c) => Math.min(v, c.low), Number.POSITIVE_INFINITY);
    const high = valid.reduce((v, c) => Math.max(v, c.high), Number.NEGATIVE_INFINITY);
    const rawSpan = high - low;
    const pad = rawSpan > 0 ? rawSpan * 0.08 : Math.max(Math.abs(high) * 0.001, 0.01);
    return { min: low - pad, max: high + pad };
  }, [candles]);
  const minPrice = priceRange.min, maxPrice = priceRange.max;
  const x = (i: number) => 20 + (i / Math.max(1, candles.length - 1)) * 940;
  const y = (v: number) => 20 + ((maxPrice - v) / (maxPrice - minPrice)) * 420;
  const series = (kind: "ema" | "sma", period: number) => average(closes, period, kind === "ema");
  const paths = useMemo(() => active.map(ind => {
    const values = series(ind.kind, ind.period);
    const d = values.map((v, i) => v == null ? "" : `${i === values.findIndex(a => a != null) ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).filter(Boolean).join(" ");
    return { ...ind, d };
  }), [active, candles, minPrice, maxPrice]);

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
    <div className="edge-chart-status">{status}</div>
    {candles.length > 0 ? <div className="edge-chart-canvas-wrap">
      <svg className="edge-chart-canvas" viewBox="0 0 1000 480" role="img" aria-label={`${symbol} ${interval} candlestick chart with enabled indicators`}>
        {[0,1,2,3,4].map(i => <g key={i}><line x1="20" x2="960" y1={20+i*105} y2={20+i*105} stroke="#34363d" strokeDasharray="3 5"/><text x="968" y={24+i*105} fill="#9297a3" fontSize="11">{(maxPrice-(i/4)*(maxPrice-minPrice)).toFixed(symbol==="BTC/USD"?1:2)}</text></g>)}
        {candles.map((c,i) => {
          const cx=x(i), bodyTop=y(Math.max(c.open,c.close)), bodyBottom=y(Math.min(c.open,c.close));
          const up=c.close>=c.open, color=up?"#00c896":"#f05265";
          const width=Math.max(1.2, Math.min(7, 880/candles.length*0.65));
          return <g key={`${c.time}-${i}`}><line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.2"/><rect x={cx-width/2} y={bodyTop} width={width} height={Math.max(1.5,bodyBottom-bodyTop)} fill={color}/></g>;
        })}
        {paths.map(p => <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/> )}
      </svg>
    </div> : <div className="edge-chart-empty">No chart rendered because verified broker candle data is unavailable. Check the selected broker connection and instrument.</div>}
    <div className="edge-chart-footer"><span>{candles.length ? `Latest close: ${candles[candles.length-1].close}` : "Waiting for verified data"}</span><span>Broker OHLC · No synthetic candles</span></div>
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
