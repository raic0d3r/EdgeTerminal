"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type Indicator = { id: string; name: string; kind: "ema" | "sma"; period: number; color: string };
type ChartModule = {
  createChart: (el: HTMLElement, options: Record<string, unknown>) => any;
  CandlestickSeries: any; BarSeries: any; LineSeries: any; HistogramSeries: any;
  ColorType: any; CrosshairMode: any;
};

function toEpoch(value: string): number {
  const n = Date.parse(value);
  return Number.isFinite(n) ? Math.floor(n / 1000) : 0;
}
function movingAverage(rows: Candle[], period: number, exponential: boolean) {
  const values: Array<{ time: number; value: number }> = [];
  if (rows.length < period) return values;
  if (!exponential) {
    let sum = 0;
    rows.forEach((row, i) => {
      sum += row.close;
      if (i >= period) sum -= rows[i - period].close;
      if (i >= period - 1) values.push({ time: toEpoch(row.time), value: sum / period });
    });
  } else {
    const alpha = 2 / (period + 1);
    let prev = rows.slice(0, period).reduce((a, b) => a + b.close, 0) / period;
    values.push({ time: toEpoch(rows[period - 1].time), value: prev });
    for (let i = period; i < rows.length; i++) {
      prev = rows[i].close * alpha + prev * (1 - alpha);
      values.push({ time: toEpoch(rows[i].time), value: prev });
    }
  }
  return values;
}

export default function EdgeLightweightChart({
  symbol, interval, candles, indicators, livePrice, quoteMode, onChartType, toolbarControls, toolbarActions,
}: {
  symbol: string; interval: string; candles: Candle[]; indicators: Indicator[];
  livePrice: number | null; quoteMode: string; onChartType?: (type: string) => void; toolbarControls?: ReactNode; toolbarActions?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const indicatorSeriesRef = useRef<Map<string, any>>(new Map());
  const [module, setModule] = useState<ChartModule | null>(null);
  const [chartType, setChartType] = useState<"candles" | "bars" | "line">("candles");
  const [ohlc, setOhlc] = useState<Candle | null>(null);
  const [loadError, setLoadError] = useState("");
  const digits = symbol === "BTC/USD" ? 1 : 2;

  useEffect(() => {
    let alive = true;
    // Load the open-source TradingView Lightweight Charts runtime without
    // bundling a second copy into the Next.js server build.
    const importer = new Function("url", "return import(url)") as (url: string) => Promise<ChartModule>;
    importer("https://cdn.jsdelivr.net/npm/lightweight-charts@5.0.8/+esm")
      .then((m) => { if (alive) { setModule(m); setLoadError(""); } })
      .catch(() => { if (alive) setLoadError("Chart engine could not load. Check browser access to jsDelivr and refresh."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!module || !hostRef.current) return;
    const el = hostRef.current;
    const chart = module.createChart(el, {
      width: el.clientWidth || 900,
      height: el.clientHeight || 480,
      layout: { background: { type: module.ColorType.Solid, color: "#050607" }, textColor: "#b8c0cc", fontFamily: "Arial, sans-serif", fontSize: 12 },
      grid: { vertLines: { color: "rgba(130,140,155,.14)", style: 1 }, horzLines: { color: "rgba(130,140,155,.18)", style: 1 } },
      crosshair: { mode: module.CrosshairMode.Normal, vertLine: { color: "#8b95a5", width: 1, style: 2, labelBackgroundColor: "#303743" }, horzLine: { color: "#8b95a5", width: 1, style: 2, labelBackgroundColor: "#303743" } },
      rightPriceScale: { visible: true, borderColor: "#30343d", scaleMargins: { top: 0.08, bottom: 0.2 }, entireTextOnly: true },
      timeScale: { visible: true, borderColor: "#30343d", timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 8, minBarSpacing: 2, fixLeftEdge: false, fixRightEdge: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true, axisDoubleClickReset: true },
      localization: { priceFormatter: (price: number) => price.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) },
    });
    chartRef.current = chart;
    const candleSeries = chart.addSeries(module.CandlestickSeries, {
      upColor: "#089981", downColor: "#f23645", borderUpColor: "#089981", borderDownColor: "#f23645",
      wickUpColor: "#089981", wickDownColor: "#f23645", priceLineVisible: true, lastValueVisible: true,
    });
    const volumeSeries = chart.addSeries(module.HistogramSeries, {
      priceScaleId: "volume", priceLineVisible: false, lastValueVisible: false, base: 0,
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    const resize = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0 && box.height > 0) chart.applyOptions({ width: Math.floor(box.width), height: Math.floor(box.height) });
    });
    resize.observe(el);
    chart.subscribeCrosshairMove((param: any) => {
      const point = param?.seriesData?.get(candleSeries);
      if (point && Number.isFinite(point.open)) setOhlc({ time: String(param.time), open: point.open, high: point.high, low: point.low, close: point.close });
    });
    return () => { resize.disconnect(); chart.remove(); chartRef.current = null; candleSeriesRef.current = null; volumeSeriesRef.current = null; indicatorSeriesRef.current.clear(); };
  }, [module, digits]);

  const cleanCandles = useMemo(() => candles.map((c) => ({ ...c, epoch: toEpoch(c.time) })).filter(c => c.epoch > 0 && [c.open,c.high,c.low,c.close].every(Number.isFinite)).sort((a,b)=>a.epoch-b.epoch).filter((c,i,a)=>i===0 || c.epoch>a[i-1].epoch), [candles]);

  useEffect(() => {
    if (!module || !candleSeriesRef.current || !volumeSeriesRef.current || !cleanCandles.length) return;
    const candleData = cleanCandles.map(c => ({ time: c.epoch as any, open: c.open, high: c.high, low: c.low, close: c.close }));
    const volumeData = cleanCandles.map(c => ({ time: c.epoch as any, value: Math.max(0, Number(c.volume) || 0), color: c.close >= c.open ? "rgba(8,153,129,.48)" : "rgba(242,54,69,.48)" }));
    if (chartType === "line") candleSeriesRef.current.setData(cleanCandles.map(c => ({ time: c.epoch as any, value: c.close })));
    else candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    if (livePrice != null && quoteMode === "live") {
      const last = candleData[candleData.length - 1];
      if (chartType === "line") candleSeriesRef.current.update({ time: last.time, value: livePrice });
      else candleSeriesRef.current.update({ ...last, close: livePrice, high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice) });
    }
    const chart = chartRef.current;
    if (chart && chart.timeScale().getVisibleLogicalRange() === null) chart.timeScale().fitContent();
    setOhlc(cleanCandles.at(-1) || null);
  }, [module, cleanCandles, livePrice, quoteMode, chartType]);

  useEffect(() => {
    if (!module || !chartRef.current || !candleSeriesRef.current) return;
    const chart = chartRef.current;
    for (const series of indicatorSeriesRef.current.values()) chart.removeSeries(series);
    indicatorSeriesRef.current.clear();
    for (const indicator of indicators) {
      const line = chart.addSeries(module.LineSeries, { color: indicator.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: indicator.name });
      line.setData(movingAverage(cleanCandles, indicator.period, indicator.kind === "ema").map(p => ({ time: p.time as any, value: p.value })));
      indicatorSeriesRef.current.set(indicator.id, line);
    }
  }, [module, indicators, cleanCandles]);

  useEffect(() => {
    if (!module || !chartRef.current || !cleanCandles.length) return;
    const chart = chartRef.current;
    const old = candleSeriesRef.current;
    if (old) chart.removeSeries(old);
    const next = chart.addSeries(chartType === "bars" ? module.BarSeries : chartType === "line" ? module.LineSeries : module.CandlestickSeries,
      chartType === "line" ? { color: "#26a69a", lineWidth: 2, priceLineVisible: true } : chartType === "bars" ? { upColor: "#089981", downColor: "#f23645", thinBars: false } : { upColor: "#089981", downColor: "#f23645", borderUpColor: "#089981", borderDownColor: "#f23645", wickUpColor: "#089981", wickDownColor: "#f23645" });
    candleSeriesRef.current = next;
    if (chartType === "line") next.setData(cleanCandles.map(c=>({time:toEpoch(c.time) as any,value:c.close})));
    else next.setData(cleanCandles.map(c=>({time:toEpoch(c.time) as any,open:c.open,high:c.high,low:c.low,close:c.close})));
    setOhlc(cleanCandles.at(-1) || null);
    next.applyOptions({ priceLineVisible: true, lastValueVisible: true });
    chart.subscribeCrosshairMove((param: any) => {
      const point = param?.seriesData?.get(next);
      if (point && Number.isFinite(point.open)) setOhlc({ time: String(param.time), open: point.open, high: point.high, low: point.low, close: point.close });
      else if (point && Number.isFinite(point.value)) setOhlc({ time: String(param.time), open: point.value, high: point.value, low: point.value, close: point.value });
    });
  }, [chartType, module]);

  return <div className="edge-tv-chart-shell">
    <div className="edge-tv-chart-toolbar">
      <div className="edge-tv-symbol"><span className="edge-tv-search">⌕</span><strong>{symbol.replace("/", "")}</strong><button type="button" title="Symbol">＋</button></div>
      <div className="edge-tv-timeframes"><span>{interval}</span><span className="edge-tv-caret">⌄</span></div>
      <div className="edge-tv-chart-types" aria-label="Chart type">
        <button type="button" className={chartType === "bars" ? "active" : ""} onClick={() => { setChartType("bars"); onChartType?.("bars"); }} title="Bars">☷</button>
        <button type="button" className={chartType === "candles" ? "active" : ""} onClick={() => { setChartType("candles"); onChartType?.("candles"); }} title="Candles">▥</button>
        <button type="button" className={chartType === "line" ? "active" : ""} onClick={() => { setChartType("line"); onChartType?.("line"); }} title="Line">⌁</button>
      </div>
      {toolbarControls}
      <div className="edge-tv-toolbar-spacer" />
      {toolbarActions}
      <span className="edge-tv-feed-badge">{quoteMode === "live" ? "● LIVE" : "BROKER DATA"}</span>
    </div>
    <div className="edge-tv-ohlc"><span className="edge-tv-market-dot"/> <strong>{symbol}</strong><span>· {interval} · {quoteMode === "live" ? "LIVE BROKER" : "BROKER"}</span>{ohlc && <b>O {ohlc.open.toFixed(digits)} H {ohlc.high.toFixed(digits)} L {ohlc.low.toFixed(digits)} C {ohlc.close.toFixed(digits)}</b>}</div>
    {loadError && <div className="edge-tv-load-error">{loadError}</div>}
    <div ref={hostRef} className="edge-tv-chart-host" aria-label={`${symbol} ${interval} broker candlestick chart`} />
  </div>;
}
