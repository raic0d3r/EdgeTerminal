 "use client";

import { marketApiUrl, fetchMarketData } from "@/lib/market-selection";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, RefreshCw, Layers3, Eye, EyeOff } from "lucide-react";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null; tickVolume?: number | null };
type MarketApi = { status?: string; disclaimer?: string; error?: string; data?: { price?: number | null; source?: string; updatedAt?: string | null; candles?: Candle[] } };
type Session = "ALL" | "ASIA" | "LON" | "NY";
const fmt = (n:number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vol = (c:Candle) => Math.max(0, Number(c.tickVolume ?? c.volume) || 0);
function sessionMinute(raw:string, zone:string) {
  const d = new Date(raw); if (!Number.isFinite(d.getTime())) return null;
  try { const p = new Intl.DateTimeFormat("en-GB", {timeZone:zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d); return Number(p.find(x=>x.type==="hour")?.value)*60+Number(p.find(x=>x.type==="minute")?.value); } catch { return null; }
}
function inSession(c:Candle,s:Session) {
  if(s==="ALL") return true;
  const zone=s==="ASIA"?"Asia/Tokyo":s==="LON"?"Europe/London":"America/New_York";
  const m=sessionMinute(c.time,zone); if(m==null)return true;
  if(s==="ASIA")return m>=0&&m<9*60;
  return m>=8*60&&m<17*60;
}
export default function InstitutionalLiquidityHeatmap({asset,interval,theme}:{asset:string;interval:string;theme:"dark"|"light"}) {
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const [api,setApi]=useState<MarketApi|null>(null); const [loading,setLoading]=useState(false);
 const [lookback,setLookback]=useState(90); const [bins,setBins]=useState(36); const [session,setSession]=useState<Session>("ALL");
 const [showCandles,setShowCandles]=useState(true); const [showLevels,setShowLevels]=useState(true); const [showBubbles,setShowBubbles]=useState(true); const [intensity,setIntensity]=useState(1);
 const [lastUpdated,setLastUpdated]=useState<string|null>(null);
 const [chartZoom,setChartZoom]=useState(1);
 const [chartPan,setChartPan]=useState(0);
 const dragRef=useRef<{x:number;pan:number}|null>(null);
 const apiInterval:Record<string,string>={"1m":"1min","5m":"5min","10m":"5min","15m":"15min","30m":"30min","1h":"1h","4h":"4h","1d":"1day","1w":"1day","1mo":"1day"};
 const fetchMarket=async()=>{setLoading(true);try{const r=await fetchMarketData(marketApiUrl(asset, apiInterval[interval]||"15min"),{cache:"no-store"});const j=await r.json();setApi(j);setLastUpdated(new Date().toISOString());}catch{setApi({status:"unavailable",error:"Could not load market candles."});}finally{setLoading(false);}};
 useEffect(()=>{let alive=true;const run=async()=>{try{const r=await fetchMarketData(marketApiUrl(asset, apiInterval[interval]||"15min"),{cache:"no-store"});const j=await r.json();if(alive){setApi(j);setLastUpdated(new Date().toISOString());}}catch{if(alive)setApi({status:"unavailable",error:"Could not load market candles."});}};void run();const t=window.setInterval(run,60000);return()=>{alive=false;window.clearInterval(t)}; // eslint-disable-next-line react-hooks/exhaustive-deps
 },[asset,interval]);
 const result=useMemo(()=>{
  const candles=(api?.data?.candles||[]).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.high>=c.low&&inSession(c,session)).slice(-lookback);
  const current=Number(api?.data?.price??candles.at(-1)?.close);
  if(!candles.length)return {candles,price:null as number|null,low:0,high:1,step:1,heat:[] as number[][],profile:[] as number[],levels:[] as {price:number;type:string;strength:number}[],source:api?.data?.source||"Market provider"};
  const low=Math.min(...candles.map(c=>c.low)), high=Math.max(...candles.map(c=>c.high)); const step=Math.max((high-low)/bins,Math.abs(current||high)*0.000001,0.00001);
  const heat=Array.from({length:bins},()=>Array(candles.length).fill(0));
  candles.forEach((c,ci)=>{const v=vol(c);const a=Math.max(0,Math.min(bins-1,Math.floor((c.low-low)/step)));const b=Math.max(a,Math.min(bins-1,Math.floor((c.high-low)/step)));for(let bi=a;bi<=b;bi++)heat[bi][ci]+=v/(b-a+1);});
  // Smooth neighbouring time buckets so the display reads as persistent horizontal heat bands.
  const smoothed=heat.map(row=>row.map((v,i)=>((row[i-1]||0)*.22+v*.56+(row[i+1]||0)*.22)));
  const profile=smoothed.map(row=>row.reduce((a,b)=>a+b,0));
  const pivots:{price:number;type:string;strength:number}[]=[];
  for(let i=2;i<candles.length-2;i++){if(candles[i].high>candles[i-1].high&&candles[i].high>candles[i-2].high&&candles[i].high>=candles[i+1].high&&candles[i].high>=candles[i+2].high)pivots.push({price:candles[i].high,type:"Buy-side liquidity estimate",strength:vol(candles[i])});if(candles[i].low<candles[i-1].low&&candles[i].low<candles[i-2].low&&candles[i].low<=candles[i+1].low&&candles[i].low<=candles[i+2].low)pivots.push({price:candles[i].low,type:"Sell-side liquidity estimate",strength:vol(candles[i])});}
  const levels=pivots.sort((a,b)=>Math.abs(a.price-(current||0))-Math.abs(b.price-(current||0))).filter((x,i,a)=>a.findIndex(y=>Math.abs(y.price-x.price)<step*1.2)===i).slice(0,10);
  return {candles,price:Number.isFinite(current)?current:null,low,high,step,heat:smoothed,profile,levels,source:api?.data?.source||"Market provider"};
 },[api,lookback,bins,session]);
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext("2d");if(!ctx)return;
  const width=Math.max(320,canvas.clientWidth),height=590,dpr=window.devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;ctx.scale(dpr,dpr);
  const dark=theme!=="light",bg=dark?"#17252b":"#f4f7f9",grid=dark?"#35515a":"#d4dfe4",text=dark?"#a8bdc5":"#52656d";ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  const left=36,right=64,top=10,bottom=30,plotW=width-left-right,plotH=height-top-bottom;ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.fillStyle=text;ctx.font="10px system-ui";
  const totalN=result.candles.length;
  const n=totalN ? Math.max(8,Math.min(totalN,Math.ceil(totalN/chartZoom))) : 0;
  const maxPan=Math.max(0,totalN-n);
  const start=Math.max(0,Math.min(maxPan,Math.round(chartPan)));
  const visibleCandles=result.candles.slice(start,start+n);
  for(let i=0;i<=10;i++){const y=top+plotH*i/10;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+plotW,y);ctx.stroke();const p=result.high-(result.high-result.low)*i/10;ctx.fillText(fmt(p),left+plotW+7,y+3);}
  if(!n){ctx.fillText("Waiting for market candles…",left+20,top+40);return;}
  const cellW=plotW/n, binH=plotH/bins;
  // Bookmap-inspired time × price intensity field.
  // Candle volume is distributed through each candle's traded range, then smoothed
  // across nearby price rows and time columns to create persistent horizontal bands.
  // This remains a candle-derived activity estimate, NOT resting order-book depth.
  const rawGrid = result.heat.map(row => row.slice(start,start+n));
  const smoothedGrid = rawGrid.map((row, bi) => row.map((value, ci) => {
    const priceSmoothed =
      value * .52 +
      (rawGrid[bi-1]?.[ci] || 0) * .16 +
      (rawGrid[bi+1]?.[ci] || 0) * .16 +
      (rawGrid[bi-2]?.[ci] || 0) * .08 +
      (rawGrid[bi+2]?.[ci] || 0) * .08;
    return priceSmoothed;
  }));
  // Spread activity forward/backward across time with a decaying footprint.
  // This produces continuous bands instead of isolated blocks at candle positions.
  for(let bi=0;bi<bins;bi++){
    for(let ci=0;ci<n;ci++){
      const center = smoothedGrid[bi][ci] || 0;
      const left1 = rawGrid[bi][ci-1] || 0, right1 = rawGrid[bi][ci+1] || 0;
      const left2 = rawGrid[bi][ci-2] || 0, right2 = rawGrid[bi][ci+2] || 0;
      smoothedGrid[bi][ci] = center*.58 + (left1+right1)*.17 + (left2+right2)*.04;
    }
  }
  const cellMax = Math.max(1, ...smoothedGrid.flat());
  const bookmapCellWidth = plotW/n, bookmapBinHeight = plotH/bins;
  // Deep blue base layer, matching the reference palette.
  ctx.fillStyle = dark ? "#102f3d" : "#dcecf3";
  ctx.fillRect(left, top, plotW, plotH);
  const colorFor = (q:number) => {
    if(q < .16) return {rgb:"0,89,145",a:.24+q*.55};
    if(q < .34) return {rgb:"0,137,196",a:.34+q*.58};
    if(q < .53) return {rgb:"0,190,225",a:.40+q*.52};
    if(q < .70) return {rgb:"0,214,178",a:.44+q*.52};
    if(q < .84) return {rgb:"255,191,30",a:.55+q*.48};
    if(q < .94) return {rgb:"255,112,15",a:.66+q*.34};
    return {rgb:"255,43,36",a:.76+q*.23};
  };
  for(let bi=0;bi<bins;bi++){
    const y=top+plotH-(bi+1)*bookmapBinHeight;
    for(let ci=0;ci<n;ci++){
      const value=smoothedGrid[bi][ci]||0;
      const q=Math.min(1,value/cellMax);
      // Keep low-intensity blues visible to form the continuous heatmap background.
      if(q<.018) continue;
      const c=colorFor(q);
      const alpha=Math.min(.98,c.a*intensity);
      ctx.fillStyle=`rgba(${c.rgb},${alpha})`;
      ctx.fillRect(left+ci*bookmapCellWidth,y,Math.max(1,bookmapCellWidth+.5),bookmapBinHeight+.6);
    }
  }
  // Strong repeated price-level activity is emphasized as longer horizontal bands.
  const rowStrength=smoothedGrid.map(row=>row.reduce((sum,v)=>sum+v,0));
  const strongest=Math.max(1,...rowStrength);
  rowStrength.forEach((strength,bi)=>{
    const q=strength/strongest;
    if(q<.62)return;
    const y=top+plotH-(bi+.5)*bookmapBinHeight;
    ctx.fillStyle=q>.86?"rgba(255,224,90,.18)":q>.74?"rgba(0,205,220,.14)":"rgba(0,137,205,.12)";
    ctx.fillRect(left,y-bookmapBinHeight*.32,plotW,bookmapBinHeight*.64);
  });
  // Horizontal price levels stay visible across the whole chart, like an order-flow liquidity ladder.
  for(let i=0;i<=10;i++){const y=top+plotH*i/10;ctx.strokeStyle=dark?"rgba(171,202,209,.15)":"rgba(75,100,110,.14)";ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+plotW,y);ctx.stroke();}
  const py=(p:number)=>top+plotH-(p-result.low)/(result.high-result.low||1)*plotH;
  if(showCandles){const cw=Math.max(1.6,Math.min(7,bookmapCellWidth*.5));visibleCandles.forEach((c,i)=>{const x=left+i*bookmapCellWidth+bookmapCellWidth/2,up=c.close>=c.open;ctx.strokeStyle=up?"#00e0a0":"#ff4e57";ctx.fillStyle=up?"#00d39b":"#ff4d57";ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(x,py(c.high));ctx.lineTo(x,py(c.low));ctx.stroke();const y1=py(Math.max(c.open,c.close)),y2=py(Math.min(c.open,c.close));ctx.globalAlpha=.9;ctx.fillRect(x-cw/2,y1,cw,Math.max(1.4,y2-y1));ctx.globalAlpha=1;});}
  if(showBubbles){const maxVol=Math.max(1,...visibleCandles.map(vol));visibleCandles.forEach((c,i)=>{const v=vol(c);if(v<maxVol*.42)return;const x=left+i*bookmapCellWidth+bookmapCellWidth/2,y=py(c.close),r=2+Math.sqrt(v/maxVol)*9;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=c.close>=c.open?"rgba(0,235,154,.42)":"rgba(255,76,81,.45)";ctx.fill();ctx.strokeStyle=c.close>=c.open?"rgba(0,255,174,.7)":"rgba(255,95,99,.7)";ctx.stroke();});}
  if(showLevels){result.levels.forEach(l=>{if(l.price<result.low||l.price>result.high)return;const y=py(l.price);ctx.strokeStyle=l.type.includes("Buy-side")?"#ff5965":"#00d7a0";ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+plotW,y);ctx.stroke();ctx.setLineDash([]);});}
  if(result.price!=null&&result.price>=result.low&&result.price<=result.high){const y=py(result.price);ctx.strokeStyle="#ffca28";ctx.lineWidth=1.5;ctx.setLineDash([7,4]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+plotW,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#ffca28";ctx.fillText(fmt(result.price),left+plotW+7,y-6);}
  ctx.fillStyle=text;ctx.font="10px system-ui";ctx.fillText(visibleCandles[0]?.time?.slice(11,16)||"",left,height-9);ctx.fillText(visibleCandles.at(-1)?.time?.slice(11,16)||"",left+plotW-35,height-9);
 },[result,theme,showCandles,showLevels,showBubbles,intensity,chartZoom,chartPan]);
 const maxProfile=Math.max(1,...result.profile);const recent=[...result.candles].slice(-18).reverse();
 const berlin=lastUpdated?new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Berlin",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(lastUpdated)):"—";
 return <section className={`ilh-shell ${theme==="light"?"ilh-light":""}`}>
  <div className="ilh-heading"><div><div className="ilh-eyebrow"><Layers3 size={14}/> EDGE TERMINAL · MARKET MICROSTRUCTURE</div><h2>Institutional Liquidity Heatmap</h2><p>Liquidity-style time × price map with activity bubbles, depth profile and recent candle-derived prints.</p></div><button className="ilh-refresh" onClick={()=>void fetchMarket()} disabled={loading}><RefreshCw size={14} className={loading?"ilh-spin":""}/>{loading?"Updating":"Refresh"}</button></div>
  <div className="ilh-metrics"><article><span>Current price</span><strong>{result.price==null?"—":fmt(result.price)}</strong></article><article><span>Bars in view</span><strong>{result.candles.length}</strong></article><article><span>Data source</span><strong>{result.source}</strong></article><article><span>Updated · Berlin</span><strong>{berlin}</strong></article></div>
  <div className="ilh-controls"><div className="ilh-segment">{(["ALL","ASIA","LON","NY"] as Session[]).map(s=><button key={s} className={session===s?"selected":""} onClick={()=>setSession(s)}>{s}</button>)}</div><label>History<select value={lookback} onChange={e=>setLookback(Number(e.target.value))}><option value={45}>45 bars</option><option value={90}>90 bars</option><option value={150}>150 bars</option><option value={240}>240 bars</option></select></label><label>Price bins<select value={bins} onChange={e=>setBins(Number(e.target.value))}><option value={24}>24</option><option value={36}>36</option><option value={48}>48</option><option value={64}>64</option></select></label><label>Intensity<select value={intensity} onChange={e=>setIntensity(Number(e.target.value))}><option value={0.7}>Low</option><option value={1}>Medium</option><option value={1.5}>High</option></select></label><button className={`ilh-toggle ${showCandles?"on":""}`} onClick={()=>setShowCandles(v=>!v)}>{showCandles?<Eye size={13}/>:<EyeOff size={13}/>} Candles</button><button className={`ilh-toggle ${showBubbles?"on":""}`} onClick={()=>setShowBubbles(v=>!v)}>{showBubbles?<Eye size={13}/>:<EyeOff size={13}/>} Activity bubbles</button><button className={`ilh-toggle ${showLevels?"on":""}`} onClick={()=>setShowLevels(v=>!v)}>{showLevels?<Eye size={13}/>:<EyeOff size={13}/>} Liquidity levels</button></div>
  <div className="ilh-terminal-layout">
   <div className="ilh-main-chart"><div className="ilh-chart-tabs"><span>PRICE / LIQUIDITY MAP</span><span className="ilh-chart-actions"><button type="button" onClick={()=>setChartZoom(z=>Math.max(1,Math.round((z-0.5)*10)/10))} disabled={chartZoom<=1} aria-label="Zoom out">−</button><b>{Math.round(chartZoom*100)}%</b><button type="button" onClick={()=>setChartZoom(z=>Math.min(6,Math.round((z+0.5)*10)/10))} disabled={chartZoom>=6} aria-label="Zoom in">+</button><button type="button" onClick={()=>{setChartZoom(1);setChartPan(0)}}>Reset view</button></span><span>{asset} · {interval}</span></div><div className="ilh-chart-wrap"><canvas ref={canvasRef} className="ilh-canvas" aria-label="Interactive liquidity-style heatmap. Drag to pan and use the mouse wheel to zoom." onPointerDown={e=>{dragRef.current={x:e.clientX,pan:chartPan};e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.classList.add("ilh-dragging")}} onPointerMove={e=>{if(!dragRef.current)return;const rect=e.currentTarget.getBoundingClientRect();const total=Math.max(8,result.candles.length);const visible=Math.max(8,Math.ceil(total/chartZoom));const delta=Math.round((dragRef.current.x-e.clientX)/Math.max(1,rect.width)*visible);setChartPan(Math.max(0,Math.min(total-visible,dragRef.current.pan+delta)))}} onPointerUp={e=>{dragRef.current=null;e.currentTarget.classList.remove("ilh-dragging")}} onPointerCancel={e=>{dragRef.current=null;e.currentTarget.classList.remove("ilh-dragging")}} onWheel={e=>{e.preventDefault();setChartZoom(z=>Math.max(1,Math.min(6,Math.round((z+(e.deltaY<0?0.25:-0.25))*100)/100)))}}/></div><div className="ilh-legend"><span><i className="ilh-blue"/>Lower activity</span><span><i className="ilh-green"/>Moderate</span><span><i className="ilh-yellow"/>High</span><span><i className="ilh-red"/>Highest</span><span><i className="ilh-dash"/>Current price</span><span><i className="ilh-bubble"/>Activity bubble*</span></div></div>
   <aside className="ilh-sidebook">
    <div className="ilh-side-title"><b>COB</b><b>SVP</b><b>T&amp;S</b></div>
    <div className="ilh-book-columns"><div className="ilh-book-col"><div className="ilh-side-caption">Depth proxy</div>{Array.from({length:Math.min(22,bins)},(_,i)=>{const bi=bins-1-Math.round(i*(bins-1)/(Math.min(22,bins)-1||1));const v=result.profile[bi]||0;return <div className="ilh-depth-row" key={i}><span>{fmt(result.low+(bi+.5)*result.step)}</span><i style={{width:`${Math.max(3,v/maxProfile*100)}%`,background:bi%2?"#ed4a55":"#00bd85"}}/></div>})}</div>
     <div className="ilh-book-col"><div className="ilh-side-caption">Volume profile</div>{Array.from({length:Math.min(22,bins)},(_,i)=>{const bi=bins-1-Math.round(i*(bins-1)/(Math.min(22,bins)-1||1));const v=result.profile[bi]||0;return <div className="ilh-svp-row" key={i}><i style={{width:`${Math.max(3,v/maxProfile*100)}%`}}/></div>})}</div>
     <div className="ilh-trades-col"><div className="ilh-side-caption">Recent proxy</div>{recent.slice(0,22).map((c,i)=><div className={`ilh-trade-row ${c.close>=c.open?"buy":"sell"}`} key={`${c.time}-${i}`}><span>{c.time.slice(11,19)||"—"}</span><b>{fmt(c.close)}</b><small>{Math.round(vol(c)).toLocaleString("en-US")}</small></div>)}</div></div>
    <div className="ilh-side-note">COB/SVP/T&amp;S are candle-derived estimates, not live order-book orders or exchange time-and-sales.</div>
   </aside>
  </div>
  <div className="ilh-depth-grid"><div className="ilh-info-card"><h3><Activity size={14}/> Liquidity interpretation</h3><p>Horizontal bands show relative historical activity allocated across candle price ranges. Larger bubbles indicate higher provider-reported candle/tick-volume proxies. They are not individual trades.</p></div><div className="ilh-info-card"><h3><Layers3 size={14}/> Nearby potential liquidity zones</h3>{result.levels.length?result.levels.slice(0,5).map((l,i)=><div className="ilh-level" key={`${l.price}-${i}`}><span className={l.type.includes("Buy-side")?"sell":"buy"}>{l.type.includes("Buy-side")?"BUY-SIDE EST.":"SELL-SIDE EST."}</span><b>{fmt(l.price)}</b><small>{l.type.includes("Buy-side")?"Prior swing high":"Prior swing low"}</small></div>):<p>Waiting for enough candle history to identify swing levels.</p>}</div></div>
  {api?.status==="unavailable"||api?.error?<div className="ilh-warning">{api.error||api.disclaimer||"Market data is currently unavailable."}</div>:null}
  <p className="ilh-disclaimer">Important: this reference-inspired layout is an estimated heatmap, not a true Bookmap/Level 2 feed. Current provider data cannot verify resting orders, bid/ask depth, individual trade bubbles, or true aggressor side. COB, SVP and T&amp;S panels are explicitly candle-derived proxies. Source: {result.source}.</p>
 </section>;
}
