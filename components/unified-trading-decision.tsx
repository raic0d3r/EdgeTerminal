"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/auth-client";
import { fetchMarketData } from "@/lib/market-selection";
import { calculateUnifiedBias } from "@/lib/market-intelligence/unified-bias";
import { appendUnifiedDecisionSnapshot, evaluateUnifiedDecisionPerformance, mergeValidationPrices, type UnifiedDecisionSnapshot, type ValidationPrice } from "@/lib/market-intelligence/unified-decision-validation";
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldAlert } from "lucide-react";

type Direction = "BUY" | "SELL" | "WAIT";
type Trend = "bullish" | "bearish" | "range" | "unclear" | "unavailable";
type Candle = { time: string; open: number; high: number; low: number; close: number };
type LowerEvidence = { direction: "BUY" | "SELL" | "NEUTRAL"; confirmed: boolean; reason: string; price: number | null };
type Forecast = {
  action: Direction; currentPrice: number; confidence: number; validity: string;
  confirmation: { direction: Trend; score: number; status: string; components: Array<{ name: string; points: number; maximum: number; state: string }>; rationale: string[]; rule: string };
  structure: { trend: Trend; higherTimeframeTrend: Trend; higherTimeframe: string | null; breakType: string; explanation: string[] };
  multiTimeframe: Array<{ timeframe: string; trend: Trend; candles: number; status: string }>;
  liquidity: { sweep: string; explanation: string };
  zones: Array<{ type: string; low: number; high: number; distancePercent: number }>;
  historical: { samples: number; wins: number; losses: number; unresolved: number; winRate: number | null; averageR: number | null; methodology: string };
  strategyBacktest: { trades: number; wins: number; losses: number; unresolved: number; winRate: number | null; expectancyR: number | null; profitFactor: number | null; maxDrawdownR: number; inSample: { trades: number; expectancyR: number | null; winRate: number | null }; outOfSample: { trades: number; wins: number; losses: number; unresolved: number; expectancyR: number | null; winRate: number | null; profitFactor: number | null; maxDrawdownR: number; startTime: string | null; endTime: string | null }; sampleAdequacy: string; methodology: string };
  strategyByTimeframe: Array<{ timeframe: string; candles: number; trades: number; outOfSampleTrades: number; outOfSampleExpectancyR: number | null; outOfSampleWinRate: number | null; status: string }>;
  strategyByInstrument: Array<{ symbol: string; candles: number; trades: number; outOfSampleTrades: number; outOfSampleExpectancyR: number | null; outOfSampleWinRate: number | null; status: string }>;
  riskPlan: { status: string; direction: Trend; entry: number | null; stop: number | null; targets: number[]; riskDistance: number | null; methodology: string };
  evidence: string[]; uncertainty: string[]; data: { source: string; mode: string; candles: number; latestCandle: string | null; note: string };
};
type LiquidityMap = {
  sweepEvents: Array<{ side: string; level: number; time: string; confirmed: boolean; quality: string }>;
  pools: Array<{ side: string; level: number; touches: number; distancePercent: number; strength: string }>;
  fairValueGaps: Array<{ direction: string; low: number; high: number; status: string; distancePercent: number }>;
  displacement: string; displacementRatio: number;
  brokerVolume: { available: boolean; relative: number | null; directionalBias: string; latest: number | null };
  note: string;
};
type FlowData = { status: string; providerStatus?: string; storedTradeCount?: number; candidateCount?: number; candidates?: Array<{ type: string; price: number; strength: string; evidence: string }>; dataNote?: string; error?: string };
type ContextSignal = { status: string; bias: "Bullish" | "Bearish" | "Neutral"; contrarianBias?: "Bullish" | "Bearish" | "Neutral"; provider?: string; source?: string; detail?: string; reportDate?: string; weeklyChange?: number | null; percentile52w?: number | null; netContracts?: number; longPositionPercentage?: number; shortPositionPercentage?: number; freshness?: string; score?: number | null; inputs?: Record<string, { value: number; date: string; previousValue?: number | null; comparisonDate?: string | null; change?: number | null } | null> };
type ContextResponse = { cot?: ContextSignal; retailSentiment?: ContextSignal; fundamentals?: ContextSignal; updatedAt?: string };
type EvidenceRow = { module: string; signal: string; detail: string; state: "support" | "oppose" | "neutral" | "missing" };
type FedPolicyContext = { status?: string; pressure?: { label?: string; score?: number | null; inputsAvailable?: number; inputsTotal?: number }; policyRate?: { value?: number; date?: string } | null; nextMeeting?: { label?: string } | null };

const INTERVALS: Record<string, string> = { "1m":"1min", "5m":"5min", "10m":"10min", "15m":"15min", "30m":"30min", "1h":"1h", "4h":"4h", "1d":"1day", "1w":"1week", "1mo":"1month" };
const LOWER: Record<string,string> = { "1m":"1min", "5m":"1min", "10m":"5min", "15m":"5min", "30m":"15min", "1h":"15min", "4h":"1h", "1d":"4h", "1w":"1day", "1mo":"1week" };
const HIGHER: Record<string,string> = { "1m":"15min", "5m":"15min", "10m":"1h", "15m":"4h", "30m":"4h", "1h":"4h", "4h":"1day", "1d":"1week", "1w":"1month", "1mo":"1month" };

function inspectEntry(candles: Candle[]): LowerEvidence {
  const rows = candles.filter(c => [c.open,c.high,c.low,c.close].every(v => Number.isFinite(v) && v > 0)).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  if (rows.length < 20) return { direction:"NEUTRAL", confirmed:false, reason:`Insufficient entry-timeframe candles (${rows.length}/20).`, price:rows.at(-1)?.close ?? null };
  const closes = rows.map(c=>c.close), sma = closes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const momentum = closes.at(-1)! - closes.at(-6)!;
  const last = rows.at(-1)!; const prior = rows.slice(-6,-1);
  const up = last.close > sma && momentum > 0, down = last.close < sma && momentum < 0;
  const direction = up ? "BUY" : down ? "SELL" : "NEUTRAL";
  const confirmed = direction === "BUY" ? last.close > Math.max(...prior.map(c=>c.high)) && last.close > last.open : direction === "SELL" ? last.close < Math.min(...prior.map(c=>c.low)) && last.close < last.open : false;
  return { direction, confirmed, reason: direction === "BUY" ? "Lower timeframe has positive momentum and a bullish close above the prior five-bar high." : direction === "SELL" ? "Lower timeframe has negative momentum and a bearish close below the prior five-bar low." : "Lower-timeframe trend and momentum do not align.", price:last.close };
}

function trendSignal(trend: Trend): Direction { return trend === "bullish" ? "BUY" : trend === "bearish" ? "SELL" : "WAIT"; }
function formatPrice(value: number | null | undefined, digits: number) { return value == null || !Number.isFinite(value) ? "—" : value.toLocaleString(undefined,{minimumFractionDigits:digits,maximumFractionDigits:digits}); }

export default function UnifiedTradingDecision({ asset, interval, broker }: { asset:string; interval:string; broker:string }) {
  const [forecast,setForecast] = useState<Forecast | null>(null);
  const [liquidity,setLiquidity] = useState<LiquidityMap | null>(null);
  const [flow,setFlow] = useState<FlowData | null>(null);
  const [context,setContext] = useState<ContextResponse | null>(null);
  const [fedPolicy,setFedPolicy] = useState<FedPolicyContext | null>(null);
  const [entry,setEntry] = useState<LowerEvidence | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [updated,setUpdated] = useState("");
  const [validationSnapshots,setValidationSnapshots] = useState<UnifiedDecisionSnapshot[]>([]);
  const [validationPrices,setValidationPrices] = useState<Record<string,ValidationPrice[]>>({});
  const [performance,setPerformance] = useState<ReturnType<typeof evaluateUnifiedDecisionPerformance>>([]);
  const [refreshKey,setRefreshKey] = useState(0);
  const mounted = useRef(true);
  const validationStorageKey = "edge-terminal-unified-decision-validation-v1";
  const pricesStorageKey = "edge-terminal-unified-decision-prices-v1";
  const selected = INTERVALS[interval.toLowerCase()] || "15min";
  const lower = LOWER[interval.toLowerCase()] || "5min";
  const higher = HIGHER[interval.toLowerCase()] || "4h";
  const lowerLabel = Object.entries(LOWER).find(([,value])=>value===lower)?.[0] || lower;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const user = auth?.currentUser;
      if (!user) throw new Error("Sign in to load broker-backed unified analysis.");
      const token = await user.getIdToken();
      const query = new URLSearchParams({ symbol:asset, interval:selected, provider:broker });
      const lowerQuery = new URLSearchParams({ symbol:asset, interval:lower, provider:broker, purpose:"analysis" });
      const [miResponse, lowerResponse, flowResponse, contextResponse, fedPolicyResponse] = await Promise.all([
        fetch(`/api/market-intelligence?${query}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"}),
        fetchMarketData(`/api/market?${lowerQuery.toString()}`,{cache:"no-store"}),
        (asset === "BTC/USD" ? Promise.resolve(null) : fetch(`/api/orderflow/absorption?instrument=${asset === "XAU/USD" ? "GC" : "SI"}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"}).catch(()=>null)),
        fetch(`/api/market-context?asset=${encodeURIComponent(asset)}`,{cache:"no-store"}).catch(()=>null),
        fetch("/api/fed-intelligence",{cache:"no-store"}).catch(()=>null),
      ]);
      const miBody = await miResponse.json();
      if (!miResponse.ok || !miBody?.forecast) throw new Error(miBody?.error || `Market Intelligence unavailable (${miResponse.status}).`);
      const lowerBody = await lowerResponse.json();
      const lowerCandles = Array.isArray(lowerBody?.data?.candles) ? lowerBody.data.candles : [];
      let flowBody: FlowData | null = null;
      if (flowResponse?.ok) flowBody = await flowResponse.json();
      const contextBody: ContextResponse | null = contextResponse?.ok ? await contextResponse.json() : null;
      const fedPolicyBody: FedPolicyContext | null = fedPolicyResponse?.ok ? await fedPolicyResponse.json() : null;
      const validationKey = `${asset}|${interval}`;
      const incomingPrices: ValidationPrice[] = Array.isArray(miBody.validationPrices) ? miBody.validationPrices : [];
      setValidationPrices(previous => {
        const merged = mergeValidationPrices(previous[validationKey] || [], incomingPrices);
        const next = { ...previous, [validationKey]: merged };
        try { localStorage.setItem(pricesStorageKey, JSON.stringify(next)); } catch { /* Local cache is optional; no server data is changed. */ }
        return next;
      });
      if (!mounted.current) return;
      setForecast(miBody.forecast as Forecast);
      setLiquidity(miBody.liquidityMap as LiquidityMap || null);
      setEntry(inspectEntry(lowerCandles));
      setFlow(flowBody);
      setContext(contextBody);
      setFedPolicy(fedPolicyBody);
      setUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      if (!mounted.current) return;
      setForecast(null); setLiquidity(null); setFlow(null); setContext(null); setFedPolicy(null); setEntry(null);
      setError(e instanceof Error ? e.message : "Unified analysis failed.");
    } finally { if (mounted.current) setLoading(false); }
  },[asset,broker,selected,lower,refreshKey]);

  useEffect(() => {
    mounted.current = true;
    try {
      const savedSnapshots = JSON.parse(localStorage.getItem(validationStorageKey) || "[]");
      const savedPrices = JSON.parse(localStorage.getItem(pricesStorageKey) || "{}");
      if (Array.isArray(savedSnapshots)) setValidationSnapshots(savedSnapshots);
      if (savedPrices && typeof savedPrices === "object") setValidationPrices(savedPrices);
    } catch { /* Corrupt browser-local validation data is ignored, never used as evidence. */ }
    void load();
    const timer = window.setInterval(()=>void load(),60_000);
    return ()=>{mounted.current=false;window.clearInterval(timer);};
  },[load]);

  useEffect(() => {
    setPerformance(evaluateUnifiedDecisionPerformance(validationSnapshots, validationPrices));
    try { localStorage.setItem(validationStorageKey, JSON.stringify(validationSnapshots)); } catch { /* Storage may be unavailable or full. */ }
  },[validationSnapshots,validationPrices]);

  const unifiedBias = useMemo(() => {
    const frames = forecast?.multiTimeframe.filter(frame=>frame.status==="available" && frame.trend!=="range" && frame.trend!=="unclear") || [];
    const bullish = frames.filter(frame=>frame.trend==="bullish").length;
    const bearish = frames.filter(frame=>frame.trend==="bearish").length;
    const technicalBias: "Bullish" | "Bearish" | "Neutral" = !frames.length ? "Neutral" : bullish>bearish && (bullish-bearish)/frames.length>=0.2 ? "Bullish" : bearish>bullish && (bearish-bullish)/frames.length>=0.2 ? "Bearish" : "Neutral";
    return calculateUnifiedBias([
      {key:"technical",label:"Technical + multi-timeframe",bias:technicalBias,weight:40,active:frames.length>0,detail:`${frames.length} usable timeframe trends from broker candles`},
      {key:"cot",label:"CFTC institutional positioning",bias:context?.cot?.bias||"Neutral",weight:20,active:context?.cot?.status==="connected",detail:context?.cot?.status==="connected"?`Weekly report ${context.cot.reportDate||"date unavailable"} · net change ${context.cot.weeklyChange??"—"}`:context?.cot?.detail||"Unavailable; excluded"},
      {key:"retail",label:"Retail directional positioning",bias:context?.retailSentiment?.bias||"Neutral",weight:15,active:context?.retailSentiment?.status==="connected",detail:context?.retailSentiment?.status==="connected"?`${context.retailSentiment.provider||"Provider"} · ${context.retailSentiment.longPositionPercentage??"—"}% long / ${context.retailSentiment.shortPositionPercentage??"—"}% short`:context?.retailSentiment?.detail||"Unavailable; excluded"},
      {key:"fundamentals",label:"Macro fundamentals",bias:context?.fundamentals?.bias||"Neutral",weight:25,active:context?.fundamentals?.status==="connected",detail:context?.fundamentals?.detail||"FRED data unavailable; excluded"},
    ]);
  },[forecast,context,fedPolicy]);

  const model = useMemo(() => {
    if (!forecast) return { decision:"WAIT" as Direction, rows:[] as EvidenceRow[], reasons:[] as string[], conflicts:[] as string[], agreement:0, opposition:0, unifiedBias };
    const base = forecast.action;
    const htfSignal = trendSignal(forecast.structure.higherTimeframeTrend);
    const structureSignal = trendSignal(forecast.structure.trend);
    const entrySignal = entry?.direction || "WAIT";
    const rows: EvidenceRow[] = [];
    const technicalSource = unifiedBias.sources.find(source=>source.key==="technical");
    rows.push({module:"Technical analysis",signal:structureSignal,detail:`${forecast.structure.trend} structure · ${forecast.structure.breakType.replaceAll("-"," ")} · ${technicalSource?.weight??40}% configured weight · contribution ${technicalSource?.contribution??0}`,state:structureSignal===base&&base!=="WAIT"?"support":structureSignal!=="WAIT"&&base!=="WAIT"?"oppose":"neutral"});
    rows.push({module:"Higher-timeframe context",signal:htfSignal,detail:`${forecast.structure.higherTimeframe || higher} structure`,state:htfSignal===base&&base!=="WAIT"?"support":htfSignal!=="WAIT"&&base!=="WAIT"?"oppose":"neutral"});
    rows.push({module:"Selected timeframe setup",signal:base,detail:`${forecast.confirmation.score}/100 confirmation · ${forecast.confirmation.status}`,state:base==="WAIT"?"neutral":"support"});
    rows.push({module:"Entry timeframe",signal:entrySignal,detail:entry?.reason || "Entry timeframe data unavailable.",state:entry?.confirmed&&entrySignal===base&&base!=="WAIT"?"support":entrySignal!=="WAIT"&&base!=="WAIT"&&entrySignal!==base?"oppose":"missing"});
    const availableFrames = forecast.multiTimeframe.filter(frame=>frame.status==="available" && frame.trend!=="range" && frame.trend!=="unclear");
    const bullishFrames = availableFrames.filter(frame=>frame.trend==="bullish").length;
    const bearishFrames = availableFrames.filter(frame=>frame.trend==="bearish").length;
    const mtfSignal: Direction = bullishFrames>bearishFrames && availableFrames.length>=2 ? "BUY" : bearishFrames>bullishFrames && availableFrames.length>=2 ? "SELL" : "WAIT";
    rows.push({module:"Market bias · multi-timeframe",signal:mtfSignal,detail:`${bullishFrames} bullish · ${bearishFrames} bearish · ${availableFrames.length} usable timeframe trends. Selected ${interval} remains the primary setup timeframe.`,state:mtfSignal===base&&base!=="WAIT"?"support":mtfSignal!=="WAIT"&&base!=="WAIT"?"oppose":availableFrames.length<2?"missing":"neutral"});
    const sweepSignal = forecast.liquidity.sweep === "sell-side" ? "BUY" : forecast.liquidity.sweep === "buy-side" ? "SELL" : "WAIT";
    rows.push({module:"Liquidity",signal:sweepSignal,detail:forecast.liquidity.explanation,state:sweepSignal===base&&base!=="WAIT"?"support":sweepSignal!=="WAIT"&&base!=="WAIT"?"oppose":"neutral"});
    const volumeSignal = liquidity?.brokerVolume?.directionalBias === "buyer-leaning" ? "BUY" : liquidity?.brokerVolume?.directionalBias === "seller-leaning" ? "SELL" : "WAIT";
    rows.push({module:"Volume pressure (tick-volume proxy)",signal:volumeSignal,detail:liquidity?.brokerVolume?.available?`Broker tick-volume candle proxy · relative activity ${liquidity.brokerVolume.relative?.toFixed(2) ?? "—"}×`:"No usable broker volume data.",state:volumeSignal===base&&base!=="WAIT"?"support":volumeSignal!=="WAIT"&&base!=="WAIT"?"oppose":"missing"});
    rows.push({module:"Support / resistance",signal:"LEVELS",detail:forecast.zones.length?forecast.zones.slice(0,2).map(z=>`${z.type} ${formatPrice(z.low,asset==="BTC/USD"?2:asset==="XAU/USD"?2:3)}–${formatPrice(z.high,asset==="BTC/USD"?2:asset==="XAU/USD"?2:3)} (${z.distancePercent}% away)`).join(" · "):"No qualifying supply/demand zone detected.",state:forecast.zones.length?"neutral":"missing"});
    const flowCount = Number(flow?.candidateCount || 0);
    rows.push({module:"Order Flow",signal:flowCount>0?"OBSERVATIONS":"UNAVAILABLE",detail:flow?.dataNote || "No verified broker spot trade-print feed is connected. OHLC/tick volume is not aggressor-side order flow.",state:"missing"});
    const cot = context?.cot;
    const cotSource = unifiedBias.sources.find(source=>source.key==="cot");
    const cotVote = cot?.bias==="Bullish"?"BUY":cot?.bias==="Bearish"?"SELL":"WAIT";
    rows.push({module:"COT institutional positioning",signal:cot?.status==="connected"?(cotVote==="WAIT"?"NEUTRAL":cotVote):"UNAVAILABLE",detail:cot?.status==="connected"?`${cot.source||"CFTC"} · report ${cot.reportDate||"date unavailable"} · net weekly change ${cot.weeklyChange??"—"} contracts · ${cotSource?.weight??20}% weight · ${cotSource?.contribution??0} contribution`:cot?.detail||"CFTC report unavailable; excluded from the composite.",state:cot?.status==="connected"?(cotVote===base&&base!=="WAIT"?"support":cotVote!=="WAIT"&&base!=="WAIT"?"oppose":"neutral"):"missing"});
    const retail = context?.retailSentiment;
    const retailSource = unifiedBias.sources.find(source=>source.key==="retail");
    const retailVote = retail?.bias==="Bullish"?"BUY":retail?.bias==="Bearish"?"SELL":"WAIT";
    rows.push({module:"Retail sentiment",signal:retail?.status==="connected"?(retailVote==="WAIT"?"NEUTRAL":retailVote):"UNAVAILABLE",detail:retail?.status==="connected"?`${retail.provider||"Provider"} · ${retail.longPositionPercentage??"—"}% long / ${retail.shortPositionPercentage??"—"}% short · ${retail.freshness||"provider data"} · ${retailSource?.weight??15}% weight · ${retailSource?.contribution??0} contribution`:retail?.detail||"No validated retail-positioning feed; excluded.",state:retail?.status==="connected"?(retailVote===base&&base!=="WAIT"?"support":retailVote!=="WAIT"&&base!=="WAIT"?"oppose":"neutral"):"missing"});
    const macro = context?.fundamentals;
    const macroSource = unifiedBias.sources.find(source=>source.key==="fundamentals");
    const macroVote = macro?.bias==="Bullish"?"BUY":macro?.bias==="Bearish"?"SELL":"WAIT";
    rows.push({module:"Fundamentals / macro",signal:macro?.status==="connected"?(macroVote==="WAIT"?"NEUTRAL":macroVote):"UNAVAILABLE",detail:`${macro?.detail||"FRED macro inputs unavailable; excluded from the composite."} · ${macroSource?.weight??25}% configured weight · ${macroSource?.contribution??0} contribution`,state:macro?.status==="connected"?(macroVote===base&&base!=="WAIT"?"support":macroVote!=="WAIT"&&base!=="WAIT"?"oppose":"neutral"):"missing"});
    rows.push({module:"Fed monetary policy context",signal:fedPolicy?.pressure?.label?.toUpperCase()||"UNAVAILABLE",detail:`Economic pressure heuristic only; ${fedPolicy?.pressure?.inputsAvailable??0}/${fedPolicy?.pressure?.inputsTotal??4} indicators available. Effective Fed Funds ${fedPolicy?.policyRate?.value==null?"unavailable":`${fedPolicy.policyRate.value}%`}; next FOMC ${fedPolicy?.nextMeeting?.label||"date unavailable"}. Not a market-implied probability and not an independent BUY/SELL vote.`,state:"neutral"});
    const compositeSignal = unifiedBias.bias==="Bullish"?"BUY":unifiedBias.bias==="Bearish"?"SELL":"WAIT";
    rows.push({module:"Unified weighted market bias",signal:compositeSignal==="WAIT"?"NEUTRAL":compositeSignal,detail:`${unifiedBias.bias} · ${unifiedBias.score??"—"}/100 · ${unifiedBias.activeInputs}/${unifiedBias.totalInputs} active sources · ${unifiedBias.confidence}% source coverage. ${unifiedBias.methodology}`,state:compositeSignal===base&&base!=="WAIT"?"support":compositeSignal!=="WAIT"&&base!=="WAIT"?"oppose":"neutral"});
    const hist = forecast.historical;
    const oos = forecast.strategyBacktest.outOfSample;
    rows.push({module:"Historical validation",signal:hist.samples>=5&&hist.winRate!=null?`${hist.winRate}% historical`:`${hist.samples} samples`,detail:`Pattern sample: ${hist.wins} wins · ${hist.losses} losses · ${hist.unresolved} unresolved. Walk-forward holdout: ${oos.trades} trades · ${oos.winRate==null?"win rate n/a":`${oos.winRate}% wins`} · ${oos.expectancyR==null?"expectancy n/a":`${oos.expectancyR}R`}. ${forecast.strategyBacktest.sampleAdequacy} sample; context only, not a directional vote.`,state:hist.samples>=5?"neutral":"missing"});
    rows.push({module:"Dynamic risk plan",signal:forecast.riskPlan.status.toUpperCase(),detail:`Entry ${formatPrice(forecast.riskPlan.entry,asset==="BTC/USD"?2:asset==="XAU/USD"?2:3)} · SL ${formatPrice(forecast.riskPlan.stop,asset==="BTC/USD"?2:asset==="XAU/USD"?2:3)} · Targets ${forecast.riskPlan.targets.map(x=>formatPrice(x,asset==="BTC/USD"?2:asset==="XAU/USD"?2:3)).join(" / ")||"—"}`,state:forecast.riskPlan.status==="active"?"support":forecast.riskPlan.status==="conditional"?"neutral":"missing"});

    const directionalRows = rows.filter(r=>r.signal==="BUY"||r.signal==="SELL");
    const agreement = directionalRows.filter(r=>r.signal===base&&base!=="WAIT").length;
    const opposition = directionalRows.filter(r=>r.signal!==base&&base!=="WAIT").length;
    const conflicts = rows.filter(r=>r.state==="oppose").map(r=>`${r.module} points ${r.signal}, against the selected ${base} bias.`);
    const reasons = [...forecast.confirmation.rationale,...forecast.structure.explanation,...forecast.uncertainty];
    const entryConfirmed = Boolean(entry?.confirmed && entry.direction===base);
    const hasHardConflict = rows.some(r=>r.module==="Entry timeframe"&&r.state==="oppose");
    const compositeDirection = unifiedBias.bias==="Bullish"?"BUY":unifiedBias.bias==="Bearish"?"SELL":"WAIT";
    const compositeConflict = compositeDirection!=="WAIT" && base!=="WAIT" && compositeDirection!==base;
    const decision: Direction = base!=="WAIT" && forecast.confirmation.status==="confirmed" && entryConfirmed && !hasHardConflict && !compositeConflict && forecast.riskPlan.status==="active" ? base : "WAIT";
    if (!entryConfirmed) conflicts.push("Lower-timeframe entry confirmation is not present; the engine remains WAIT.");
    if (base==="WAIT") conflicts.push("The selected-timeframe Market Intelligence engine has not confirmed a directional setup.");
    if (compositeConflict) conflicts.push(`The weighted market bias is ${unifiedBias.bias}, opposing the selected-timeframe ${base} setup; final decision is WAIT.`);
    return {decision,rows,reasons,conflicts,agreement,opposition,unifiedBias};
  },[forecast,liquidity,flow,entry,context,asset,selected,higher,interval,unifiedBias]);

  useEffect(() => {
    if (!forecast || loading || error || (model.decision !== "BUY" && model.decision !== "SELL") || !forecast.data.latestCandle) return;
    const next: UnifiedDecisionSnapshot = {
      asset: asset as "XAU/USD" | "XAG/USD" | "BTC/USD", timeframe: interval,
      signalTime: forecast.data.latestCandle, price: forecast.currentPrice, direction: model.decision,
    };
    setValidationSnapshots(previous => appendUnifiedDecisionSnapshot(previous, next));
  },[forecast,loading,error,model.decision,asset,interval]);

  const digits = asset === "BTC/USD" ? 2 : asset === "XAU/USD" ? 2 : 3;
  const decision = loading ? "WAIT" : model.decision;
  return <section className="utde-panel" aria-label="Unified Trading Decision Engine">
    <div className="utde-head"><div><span className="utde-kicker"><Activity size={13}/> EDGE TERMINAL · UNIFIED DECISION</span><h2>Unified Trading Decision Engine</h2><p>{asset} · Selected: {interval} · Context: {higher} · Entry check: {lowerLabel} · {broker.toUpperCase()}</p></div><div className="utde-head-actions"><button type="button" className="utde-refresh" onClick={()=>setRefreshKey(v=>v+1)} disabled={loading} aria-label="Refresh unified decision"><RefreshCw size={14}/></button><span className={`utde-badge ${decision.toLowerCase()}`}>{loading?"ANALYSING":decision}</span></div></div>
    {error ? <div className="utde-data-note"><AlertTriangle size={14}/>{error} No directional signal is generated without source data.</div> : <>
      <div className="utde-summary"><div><small>FINAL DECISION</small><strong className={decision.toLowerCase()}>{loading?"—":decision}</strong><span>{decision==="WAIT"?"Setup or entry confirmation incomplete":"Selected-timeframe setup and lower-timeframe entry confirmed"}</span></div><div><small>WEIGHTED MARKET BIAS</small><strong>{model.unifiedBias.score==null?"—":`${model.unifiedBias.score}/100`}</strong><span>{model.unifiedBias.bias} · {model.unifiedBias.confidence}% source coverage</span></div><div><small>MODULE ALIGNMENT</small><strong>{model.agreement} / {model.agreement+model.opposition}</strong><span>{model.opposition} directional disagreements · neutral/missing excluded</span></div></div>
      <div className="utde-section-title">MODULE CONTRIBUTIONS · LIVE DATA ONLY</div>
      <div className="utde-module-grid">{model.rows.map(row=><article className={`utde-module utde-${row.state}`} key={row.module}><div><b>{row.module}</b><strong className={row.signal === "BUY" ? "utde-signal-buy" : row.signal === "SELL" ? "utde-signal-sell" : ""}>{row.signal}</strong></div><p>{row.detail}</p></article>)}</div>
      <div className="utde-section-title">WHY THIS DECISION?</div>
      <ul className="utde-reasons">{model.reasons.slice(0,6).map((reason,i)=><li key={`r-${i}`}><CheckCircle2 size={14}/>{reason}</li>)}{model.conflicts.map((reason,i)=><li className="warning" key={`c-${i}`}><AlertTriangle size={14}/>{reason}</li>)}{!model.conflicts.length&&<li><CheckCircle2 size={14}/>No directional conflict was detected in the currently available directional evidence.</li>}</ul>
      {forecast && <div className="utde-validation">
        <div className="utde-section-title">LIVE DECISION PERFORMANCE · PROSPECTIVE VALIDATION</div>
        <p className="utde-validation-note">Only actual final BUY/SELL decisions are recorded. Outcomes use the next selected-timeframe candle close. Data is stored in this browser and separated by instrument and timeframe. This measures directional follow-through, not executable P&amp;L.</p>
        {(() => { const current = performance.find(row => row.asset === asset && row.timeframe === interval); return <div className="utde-validation-summary">
          <div><small>{asset} · {interval} ACCURACY</small><strong>{current?.accuracy == null ? "—" : `${current.accuracy.toFixed(1)}%`}</strong><span>{current?.matured ?? 0} matured · {current?.pending ?? 0} pending</span></div>
          <div><small>AVG DIRECTIONAL RETURN</small><strong>{current?.averageSignedReturnPct == null ? "—" : `${current.averageSignedReturnPct.toFixed(3)}%`}</strong><span>BUY/SELL signed close-to-close return</span></div>
          <div><small>CHRONOLOGICAL HOLDOUT</small><strong>{current?.validationAccuracy == null ? "—" : `${current.validationAccuracy.toFixed(1)}%`}</strong><span>{current?.validationSignals ?? 0} newest 30% matured signals</span></div>
          <div><small>SAMPLE STATUS</small><strong>{(current?.status || "insufficient").toUpperCase()}</strong><span>{current?.matured ?? 0}/30 minimum directional outcomes</span></div>
        </div>; })()}
        <div className="utde-validation-table-wrap"><table className="utde-validation-table"><thead><tr><th>Instrument</th><th>Timeframe</th><th>Signals</th><th>Matured</th><th>Accuracy</th><th>Avg signed return</th><th>BUY / SELL accuracy</th><th>Status</th></tr></thead><tbody>
          {performance.map(row=><tr key={`${row.asset}-${row.timeframe}`}><td>{row.asset}</td><td>{row.timeframe}</td><td>{row.signals}</td><td>{row.matured} ({row.flat} flat)</td><td>{row.accuracy==null?"—":`${row.accuracy.toFixed(1)}%`}</td><td>{row.averageSignedReturnPct==null?"—":`${row.averageSignedReturnPct.toFixed(3)}%`}</td><td>{row.buyAccuracy==null?"—":`${row.buyAccuracy.toFixed(1)}%`} / {row.sellAccuracy==null?"—":`${row.sellAccuracy.toFixed(1)}%`}</td><td>{row.status}</td></tr>)}
          {!performance.length && <tr><td colSpan={8}>No confirmed BUY/SELL decisions have been recorded yet. WAIT decisions are not counted as trades.</td></tr>}
        </tbody></table></div>
        <p className="utde-validation-note">A result remains descriptive until at least 30 matured decisions exist for that instrument/timeframe. 100+ matured decisions are required before the panel labels a sample measured. No spread, slippage, commissions, stop-loss or take-profit execution is simulated. Browser-local history is not shared across devices.</p>
      </div>}
      {forecast && <div className="utde-riskline"><b>Risk plan:</b> {forecast.riskPlan.status.toUpperCase()} · Entry {formatPrice(forecast.riskPlan.entry,digits)} · Stop {formatPrice(forecast.riskPlan.stop,digits)} · Targets {forecast.riskPlan.targets.map(x=>formatPrice(x,digits)).join(" / ")||"Unavailable"}</div>}
      <div className="utde-data-note"><ShieldAlert size={14}/><span>Data integrity: Unavailable COT, retail, macro and verified aggressor-side order-flow feeds are excluded from the weighted composite. Connected CFTC, retail and FRED readings contribute at their configured weights; available weights are renormalized. Broker tick volume is shown only as a candle-volume proxy. Historical results are measured from the returned broker history and are not a promise of future performance. No automatic execution.</span></div>
    </>}
    <div className="utde-footer">{forecast?`${forecast.data.candles} selected-timeframe candles · ${forecast.data.source} · latest ${forecast.data.latestCandle?new Date(forecast.data.latestCandle).toLocaleString():"unknown"} · Updated ${updated||"—"}. `:""}Refreshed every 60 seconds. BUY/SELL requires the selected-timeframe engine confirmation, lower-timeframe breakout confirmation and an active risk plan. This is analytical decision support, not financial advice.</div>
  </section>;
}
