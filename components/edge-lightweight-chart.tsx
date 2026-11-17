"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type Indicator = { id: string; name: string; kind: "ema" | "sma" | "zigzag"; period: number; color: string };
type FvgSettings = { enabled: boolean; filter: "FVG Only" | "BAG Only" | "Both"; minGap: number; extendRight: boolean };
type FvgZone = { id: string; direction: "bull" | "bear"; start: number; top: number; bottom: number; label: string };
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

function zigZagPoints(rows: Candle[], depth = 12, deviationPercent = 0.5) {
  if (rows.length < depth * 2 + 1) return [] as Array<{ time: number; value: number }>;
  const pivots: Array<{ index: number; price: number; type: "high" | "low" }> = [];
  for (let i = depth; i < rows.length - depth; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - depth; j <= i + depth; j++) {
      if (j === i) continue;
      if (rows[j].high > rows[i].high) isHigh = false;
      if (rows[j].low < rows[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (!isHigh && !isLow) continue;
    const candidates = [
      ...(isHigh ? [{ index: i, price: rows[i].high, type: "high" as const }] : []),
      ...(isLow ? [{ index: i, price: rows[i].low, type: "low" as const }] : []),
    ];
    for (const candidate of candidates) {
      const last = pivots[pivots.length - 1];
      if (!last) { pivots.push(candidate); continue; }
      if (candidate.type === last.type) {
        if ((candidate.type === "high" && candidate.price > last.price) || (candidate.type === "low" && candidate.price < last.price)) pivots[pivots.length - 1] = candidate;
        continue;
      }
      const change = Math.abs(candidate.price - last.price) / Math.max(Math.abs(last.price), 1e-9) * 100;
      if (change >= deviationPercent) pivots.push(candidate);
    }
  }
  return pivots.map(p => ({ time: toEpoch(rows[p.index].time), value: p.price })).filter(p => p.time > 0);
}

export default function EdgeLightweightChart({
  symbol, interval, candles, indicators, fvgSettings = { enabled: false, filter: "FVG Only", minGap: 0, extendRight: true }, livePrice, quoteMode, drawingTool = "cursor", clearDrawingsVersion = 0, onChartType, onIntervalChange, toolbarControls, toolbarActions,
}: {
  symbol: string; interval: string; candles: Candle[]; indicators: Indicator[]; fvgSettings?: FvgSettings;
  livePrice: number | null; quoteMode: string; drawingTool?: "cursor" | "trend" | "horizontal" | "vertical" | "label" | "fib" | "fib-extension"; clearDrawingsVersion?: number; onChartType?: (type: string) => void; onIntervalChange?: (value: string) => void; toolbarControls?: ReactNode; toolbarActions?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [drawings, setDrawings] = useState<Array<{ id: number; tool: "trend" | "horizontal" | "vertical" | "label" | "fib" | "fib-extension"; t1: any; p1: number; t2: any; p2: number; t3?: any; p3?: number; text?: string; locked?: boolean }>>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<number | null>(null);
  const dragDrawingRef = useRef<{ id: number; startX: number; startY: number; original: any } | null>(null);
  const [draft, setDraft] = useState<{ tool: "trend" | "horizontal" | "vertical" | "fib" | "fib-extension"; t1: any; p1: number; t2: any; p2: number; t3?: any; p3?: number; locked?: boolean; text?: string } | null>(null);
  const [drawVersion, setDrawVersion] = useState(0);
  const [fibStep, setFibStep] = useState(0);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const indicatorSeriesRef = useRef<Map<string, any>>(new Map());
  const drawingPriceLinesRef = useRef<Array<{ series: any; line: any }>>([]);
  const [module, setModule] = useState<ChartModule | null>(null);
  const [chartType, setChartType] = useState<"candles" | "bars" | "line">("candles");
  const [timeframeOpen, setTimeframeOpen] = useState(false);
  const [ohlc, setOhlc] = useState<Candle | null>(null);
  const [loadError, setLoadError] = useState("");
  const digits = symbol === "BTC/USD" ? 1 : 2;
  const drawingMode = drawingTool !== "cursor";

  useEffect(() => { setDrawings([]); setDraft(null); }, [clearDrawingsVersion]);

  function drawingPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const time = chart.timeScale().coordinateToTime(px);
    const price = series.coordinateToPrice(py);
    return time != null && price != null && Number.isFinite(Number(price)) ? { time, price: Number(price) } : null;
  }

  function startDrawing(event: React.PointerEvent<SVGSVGElement>) {
    if (drawingTool === "cursor") {
      // Resolve the nearest drawing element: SVG clicks can land on nested text,
      // groups, or transparent hit areas rather than the visible line itself.
      const target = event.target as Element;
      const hit = target.closest?.("[data-drawing-id]") as SVGElement | null;
      const rawId = hit?.getAttribute("data-drawing-id");
      const id = rawId == null ? NaN : Number(rawId);
      if (!Number.isFinite(id)) { setSelectedDrawing(null); dragDrawingRef.current = null; return; }
      const item = drawings.find(d => d.id === id);
      if (!item) return;
      setSelectedDrawing(id);
      if (item.locked) return;
      const point = drawingPoint(event);
      if (!point) return;
      event.preventDefault();
      event.stopPropagation();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      dragDrawingRef.current = { id, startX: event.clientX, startY: event.clientY, original: { ...item, point } };
      return;
    }
    const point = drawingPoint(event);
    if (!point) return;
    if (drawingTool === "label") {
      const text = window.prompt("Enter chart label:", "Label");
      if (text?.trim()) setDrawings(current => [...current, { id: Date.now() + current.length, tool: "label", t1: point.time, p1: point.price, t2: point.time, p2: point.price, text: text.trim() }]);
      return;
    }
    const tool = drawingTool as "trend" | "horizontal" | "vertical" | "fib" | "fib-extension";
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedDrawing(null);
    if (tool === "fib-extension" && draft?.tool === "fib-extension") {
      if (fibStep === 1) { setDraft(current => current ? { ...current, t2: point.time, p2: point.price } : null); setFibStep(2); }
      else if (fibStep === 2) { setDraft(current => current ? { ...current, t3: point.time, p3: point.price } : null); setFibStep(3); }
      return;
    }
    setDraft({ tool, t1: point.time, p1: point.price, t2: point.time, p2: point.price });
    if (tool === "fib-extension") setFibStep(1);
  }
  function moveDrawing(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragDrawingRef.current;
    if (drag) {
      const point = drawingPoint(event);
      if (!point) return;
      const original = drag.original;
      const deltaPrice = point.price - original.point.price;
      const timeScale = chartRef.current?.timeScale();
      const startX = timeScale?.timeToCoordinate(original.t1);
      const currentX = timeScale?.timeToCoordinate(point.time);
      const shift = startX != null && currentX != null ? currentX - startX : 0;
      const shiftedTime = (value: any) => {
        const x = timeScale?.timeToCoordinate(value);
        return x == null ? value : (timeScale.coordinateToTime(x + shift) ?? value);
      };
      setDrawings(current => current.map(d => d.id !== drag.id ? d : d.tool === "horizontal" ? { ...d, p1: d.p1 + deltaPrice, p2: d.p2 + deltaPrice } : d.tool === "vertical" ? { ...d, t1: shiftedTime(d.t1), t2: shiftedTime(d.t2) } : { ...d, t1: shiftedTime(d.t1), t2: shiftedTime(d.t2), ...(d.t3 != null ? { t3: shiftedTime(d.t3), p3: (d.p3 ?? 0) + deltaPrice } : {}), p1: d.p1 + deltaPrice, p2: d.p2 + deltaPrice }));
      dragDrawingRef.current = { ...drag, original: { ...original, point } };
      return;
    }
    if (!draft) return;
    const point = drawingPoint(event);
    if (point) setDraft(current => current ? current.tool === "fib-extension" && fibStep === 3 ? { ...current, t3: point.time, p3: point.price } : { ...current, t2: point.time, p2: point.price } : null);
  }
  function finishDrawing() {
    if (dragDrawingRef.current) { dragDrawingRef.current = null; return; }
    if (!draft) return;
    if (draft.tool === "fib-extension" && fibStep < 3) return;
    setDrawings(current => [...current, { ...draft, id: Date.now() + current.length }]);
    setDraft(null);
    setFibStep(0);
  }
  function drawingCoordinates(item: { tool: "trend" | "horizontal" | "vertical" | "label" | "fib" | "fib-extension"; t1: any; p1: number; t2: any; p2: number; t3?: any; p3?: number }) {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const timeScale = chart.timeScale();
    const x1 = timeScale.timeToCoordinate(item.t1);
    const x2 = timeScale.timeToCoordinate(item.t2);
    const y1 = series.priceToCoordinate(item.p1);
    const y2 = series.priceToCoordinate(item.p2);
    const x3 = item.t3 != null ? timeScale.timeToCoordinate(item.t3) : null;
    const y3 = item.p3 != null ? series.priceToCoordinate(item.p3) : null;
    if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
    return { x1, x2, y1, y2, x3, y3 };
  }

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
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => setDrawVersion(v => v + 1));
    setDrawVersion(v => v + 1);
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
      if (box && box.width > 0 && box.height > 0) { chart.applyOptions({ width: Math.floor(box.width), height: Math.floor(box.height) }); setDrawVersion(v => v + 1); }
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
      const points = indicator.kind === "zigzag" ? zigZagPoints(cleanCandles, indicator.period, 0.5) : movingAverage(cleanCandles, indicator.period, indicator.kind === "ema");
      line.setData(points.map(p => ({ time: p.time as any, value: p.value })));
      indicatorSeriesRef.current.set(indicator.id, line);
    }
  }, [module, indicators, cleanCandles]);

  // Render horizontal drawings as native Lightweight Charts price lines so each
  // level also receives a matching, readable marker on the right price scale.
  useEffect(() => {
    for (const item of drawingPriceLinesRef.current) {
      try { item.series.removePriceLine(item.line); } catch {}
    }
    drawingPriceLinesRef.current = [];
    const series = candleSeriesRef.current;
    if (!series) return;
    const horizontalItems = [...drawings, ...(draft ? [{ ...draft, id: -1 }] : [])].filter(item => item.tool === "horizontal");
    for (const item of horizontalItems) {
      const line = series.createPriceLine({
        price: item.p1,
        color: "#f4bd45",
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
      });
      drawingPriceLinesRef.current.push({ series, line });
    }
    return () => {
      for (const item of drawingPriceLinesRef.current) {
        try { item.series.removePriceLine(item.line); } catch {}
      }
      drawingPriceLinesRef.current = [];
    };
  }, [drawings, draft, module, chartType]);

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

  const fvgZones = useMemo(() => {
    if (!fvgSettings?.enabled || cleanCandles.length < 3) return [] as FvgZone[];
    const zones: FvgZone[] = [];
    for (let i = 2; i < cleanCandles.length; i++) {
      const a = cleanCandles[i - 2], b = cleanCandles[i - 1], c = cleanCandles[i];
      const bullGap = c.low >= a.high;
      const bearGap = a.low >= c.high;
      if (bullGap) {
        const isFvg = c.close <= b.high;
        const isBag = c.close > b.high;
        if ((fvgSettings.filter === "FVG Only" && !isFvg) || (fvgSettings.filter === "BAG Only" && !isBag)) continue;
        const bottom = a.high, top = c.low;
        if (top - bottom < Math.max(0, fvgSettings.minGap)) continue;
        let liveTop = top, filled = false;
        for (let j = i + 1; j < cleanCandles.length; j++) {
          const next = cleanCandles[j];
          if (next.low < bottom) { filled = true; break; }
          if (next.low < liveTop) liveTop = next.low;
        }
        if (!filled && liveTop > bottom) zones.push({ id: `bull-${toEpoch(c.time)}`, direction: "bull", start: toEpoch(a.time), top: liveTop, bottom, label: `${interval} FVG` });
      }
      if (bearGap) {
        const isFvg = c.close >= b.low;
        const isBag = c.close < b.low;
        if ((fvgSettings.filter === "FVG Only" && !isFvg) || (fvgSettings.filter === "BAG Only" && !isBag)) continue;
        const top = a.low, bottom = c.high;
        if (top - bottom < Math.max(0, fvgSettings.minGap)) continue;
        let liveBottom = bottom, filled = false;
        for (let j = i + 1; j < cleanCandles.length; j++) {
          const next = cleanCandles[j];
          if (next.high > top) { filled = true; break; }
          if (next.high > liveBottom) liveBottom = next.high;
        }
        if (!filled && top > liveBottom) zones.push({ id: `bear-${toEpoch(c.time)}`, direction: "bear", start: toEpoch(a.time), top, bottom: liveBottom, label: `${interval} FVG` });
      }
    }
    return zones.slice(-80);
  }, [cleanCandles, fvgSettings, interval]);

  return <div className="edge-tv-chart-shell">
    <div className="edge-tv-chart-toolbar">
      <div className="edge-tv-symbol"><span className="edge-tv-search">⌕</span><strong>{symbol.replace("/", "")}</strong><button type="button" title="Symbol">＋</button></div>
      <div className="edge-tv-timeframe-wrap">
        <button type="button" className={`edge-tv-timeframes ${timeframeOpen ? "active" : ""}`} aria-haspopup="dialog" aria-expanded={timeframeOpen} onClick={() => setTimeframeOpen(v => !v)}><span>{interval}</span><span className="edge-tv-caret">⌄</span></button>
        {timeframeOpen && <div className="edge-tv-timeframe-menu" role="dialog" aria-label="Select chart timeframe">
          {[
            { title: "MINUTES", items: [["1m", "1 minute"], ["2m", "2 minutes"], ["3m", "3 minutes"], ["5m", "5 minutes"], ["10m", "10 minutes"], ["15m", "15 minutes"], ["30m", "30 minutes"], ["45m", "45 minutes"]] },
            { title: "HOURS", items: [["1h", "1 hour"], ["2h", "2 hours"], ["3h", "3 hours"], ["4h", "4 hours"]] },
            { title: "DAYS", items: [["1d", "1 day"], ["1w", "1 week"], ["1mo", "1 month"], ["3mo", "3 months"], ["6mo", "6 months"], ["12mo", "12 months"]] },
          ].map(group => <div className="edge-tv-timeframe-group" key={group.title}><div className="edge-tv-timeframe-group-title">{group.title}</div>{group.items.map(([value, label]) => <button type="button" key={value} className={interval === value ? "selected" : ""} onClick={() => { onIntervalChange?.(value); setTimeframeOpen(false); }}>{label}{interval === value && <span>✓</span>}</button>)}</div>)}
        </div>}
      </div>
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
    <div className="edge-tv-chart-stage">
      <div ref={hostRef} className="edge-tv-chart-host" aria-label={`${symbol} ${interval} broker candlestick chart`} />
      {fvgSettings?.enabled && <div className="edge-fvg-overlay" style={{ width: chartRef.current?.timeScale().width() ?? 0, height: hostRef.current ? hostRef.current.clientHeight - (chartRef.current?.timeScale().height() ?? 0) : 0 }} aria-label="Fair Value Gap zones">
        {fvgZones.map(zone => {
          const left = chartRef.current?.timeScale().timeToCoordinate(zone.start);
          const top = candleSeriesRef.current?.priceToCoordinate(zone.top);
          const bottom = candleSeriesRef.current?.priceToCoordinate(zone.bottom);
          if (left == null || top == null || bottom == null) return null;
          const width = chartRef.current?.timeScale().width() ?? 0;
          const right = fvgSettings.extendRight ? width : Math.max(left + 8, chartRef.current?.timeScale().timeToCoordinate(toEpoch(cleanCandles.at(-1)?.time || "")) ?? width);
          return <div key={zone.id} className={`edge-fvg-zone ${zone.direction}`} style={{ left, top: Math.min(top, bottom), width: Math.max(3, right - left), height: Math.max(2, Math.abs(bottom - top)) }}><span>{zone.label}</span></div>;
        })}
      </div>}
      <svg data-draw-version={drawVersion} className={`edge-tv-drawing-overlay ${drawingMode ? "drawing-active" : "cursor-active"}`} style={{ width: chartRef.current?.timeScale().width() ?? 0, height: hostRef.current ? hostRef.current.clientHeight - (chartRef.current?.timeScale().height() ?? 0) : 0 }} onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={finishDrawing} onPointerCancel={() => { setDraft(null); setFibStep(0); dragDrawingRef.current = null; }} aria-label="Chart drawing surface">
        {[...drawings, ...(draft ? [{ ...draft, id: -1 }] : [])].map(item => {
          const c = drawingCoordinates(item);
          if (!c) return null;
          const width = chartRef.current?.timeScale().width() ?? 0;
          const height = hostRef.current ? hostRef.current.clientHeight - (chartRef.current?.timeScale().height() ?? 0) : 0;
          const selected = selectedDrawing === item.id;
          const common = { "data-drawing-id": String(item.id), stroke: selected ? "#60a5fa" : "#f4bd45", strokeWidth: selected ? 3 : 2, style: { pointerEvents: "stroke" as const, cursor: item.locked ? "not-allowed" : "move" } };
          if (item.tool === "label") return <g key={item.id} data-drawing-id={item.id} style={{ pointerEvents: "all", cursor: item.locked ? "not-allowed" : "move" }}><rect x={c.x1} y={c.y1 - 24} width={Math.max(70, (item.text || "Label").length * 8 + 18)} height={28} rx={5} fill="#202833" stroke={selected ? "#60a5fa" : "#f4bd45"} data-drawing-id={item.id}/><text x={c.x1 + 9} y={c.y1 - 5} fill="#fff" fontSize="13" data-drawing-id={item.id}>{item.text}</text></g>;
          if (item.tool === "fib" || item.tool === "fib-extension") {
            const ratios = item.tool === "fib" ? [0, .236, .382, .5, .618, .786, 1] : [0, .618, 1, 1.618, 2.618];
            const base = item.tool === "fib" ? item.p1 : (item.p3 ?? item.p2);
            const span = item.tool === "fib" ? item.p2 - item.p1 : item.p2 - item.p1;
            const left = item.tool === "fib" ? Math.min(c.x1, c.x2) : (c.x3 ?? c.x2);
            const right = item.tool === "fib" ? Math.max(c.x1, c.x2) : width;
            return <g key={item.id} data-drawing-id={item.id} style={{ pointerEvents: "stroke", cursor: item.locked ? "not-allowed" : "move" }}>
              {ratios.map(r => { const price = base + span * r; const y = candleSeriesRef.current?.priceToCoordinate(price); if (y == null) return null; return <g key={r}><line x1={left} x2={right} y1={y} y2={y} stroke={selected ? "#60a5fa" : "#d6a94b"} strokeWidth={selected ? 2.5 : 1.4} strokeDasharray="5 3" data-drawing-id={item.id}/><text x={Math.min(right - 48, left + 5)} y={y - 4} fill={selected ? "#93c5fd" : "#e6c36d"} fontSize="10" data-drawing-id={item.id}>{(r * 100).toFixed(r === 1.618 || r === 2.618 ? 1 : 1)}% · {price.toFixed(digits)}</text></g>; })}
              <rect x={Math.max(0, Math.min(left, right))} y={0} width={Math.max(24, Math.abs(right - left))} height={height} fill="transparent" stroke="transparent" data-drawing-id={item.id} style={{ pointerEvents: "all", cursor: item.locked ? "not-allowed" : "move" }}/>
              <line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="transparent" strokeWidth="18" data-drawing-id={item.id} style={{ pointerEvents: "stroke" }}/>
              {item.tool === "fib-extension" && c.x3 != null && c.y3 != null && <line x1={c.x2} y1={c.y2} x2={c.x3} y2={c.y3} stroke="transparent" strokeWidth="14" data-drawing-id={item.id}/>}
            </g>;
          }
          if (item.tool === "horizontal") return <g key={item.id}><line x1={0} x2={width} y1={c.y1} y2={c.y1} {...common} strokeDasharray="7 4" /><line x1={0} x2={width} y1={c.y1} y2={c.y1} stroke="transparent" strokeWidth="18" data-drawing-id={item.id} style={{ pointerEvents: "stroke", cursor: item.locked ? "not-allowed" : "move" }}/></g>;
          if (item.tool === "vertical") return <g key={item.id}><line x1={c.x1} x2={c.x1} y1={0} y2={height} {...common} strokeDasharray="6 4" /><line x1={c.x1} x2={c.x1} y1={0} y2={height} stroke="transparent" strokeWidth="18" data-drawing-id={item.id} style={{ pointerEvents: "stroke", cursor: item.locked ? "not-allowed" : "move" }}/></g>;
          return <g key={item.id}><line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} {...common} /><line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="transparent" strokeWidth="14" data-drawing-id={item.id} style={{ pointerEvents: "stroke", cursor: item.locked ? "not-allowed" : "move" }} /></g>;
        })}
      </svg>
      {selectedDrawing !== null && <div className="edge-drawing-selection-tools"><button type="button" onClick={() => setDrawings(current => current.map(d => d.id === selectedDrawing ? { ...d, locked: !d.locked } : d))}>{drawings.find(d => d.id === selectedDrawing)?.locked ? "Unlock" : "Lock"}</button><button type="button" onClick={() => { setDrawings(current => current.filter(d => d.id !== selectedDrawing)); setSelectedDrawing(null); }}>Delete</button><button type="button" onClick={() => setSelectedDrawing(null)}>Done</button></div>}
    </div>
  </div>;
}
