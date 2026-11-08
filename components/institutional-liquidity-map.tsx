"use client";

import { marketApiUrl, fetchMarketData } from "@/lib/market-selection";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Layers3, RefreshCw, ShieldAlert, Target } from "lucide-react";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null; tickVolume?: number | null };
type MarketResponse = { status?: string; disclaimer?: string; error?: string; data?: { price?: number | null; source?: string; updatedAt?: string | null; candles?: Candle[] } };
type LiquidityLevel = { price: number; strength: number; type: "Buy-side liquidity" | "Sell-side liquidity" | "High-volume node"; detail: string };

const fmt = (n: number, digits = 2) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function InstitutionalLiquidityMap({ asset, interval, theme }: { asset: string; interval: string; theme: "dark" | "light" }) {
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookback, setLookback] = useState(120);
  const [levelsCount, setLevelsCount] = useState(10);
  const [view, setView] = useState<"map" | "levels">("map");
  const [showGuide, setShowGuide] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const apiInterval: Record<string, string> = { "1m": "1min", "5m": "5min", "10m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "4h": "4h", "1d": "1day", "1w": "1day", "1mo": "1day" };
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetchMarketData(marketApiUrl(asset, apiInterval[interval] || "15min"), { cache: "no-store" });
        const json = await response.json();
        if (active) { setMarket(json); setLastUpdated(new Date().toISOString()); }
      } catch {
        if (active) setMarket({ status: "unavailable", error: "Unable to retrieve market candles." });
      } finally { if (active) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, interval]);

  const analysis = useMemo(() => {
    const candles = (market?.data?.candles || []).filter(c => [c.open,c.high,c.low,c.close].every(Number.isFinite) && c.high >= c.low).slice(-lookback);
    const price = Number(market?.data?.price ?? candles.at(-1)?.close);
    if (!candles.length || !Number.isFinite(price)) return { price: null as number|null, levels: [] as LiquidityLevel[], range: null as {low:number;high:number}|null, candles: 0, volumeProxy: false };
    const lows = candles.map(c=>c.low), highs = candles.map(c=>c.high);
    const rangeLow = Math.min(...lows), rangeHigh = Math.max(...highs);
    const step = Math.max((rangeHigh-rangeLow)/32, Math.abs(price)*0.00008, 0.01);
    const bins = Array.from({length:32},(_,i)=>({price:rangeLow+step*(i+.5),volume:0}));
    for (const c of candles) {
      const v = Math.max(0, Number(c.tickVolume ?? c.volume) || 0);
      if (!v) continue;
      const first = Math.max(0, Math.min(31, Math.floor((c.low-rangeLow)/step)));
      const last = Math.max(first, Math.min(31, Math.floor((c.high-rangeLow)/step)));
      for (let i=first;i<=last;i++) bins[i].volume += v/(last-first+1);
    }
    const maxVol = Math.max(1,...bins.map(b=>b.volume));
    const candidates: LiquidityLevel[] = [];
    // Pivot highs/lows approximate where stops may cluster; these are not observed orders.
    for (let i=2;i<candles.length-2;i++) {
      const c=candles[i];
      if (c.high > candles[i-1].high && c.high > candles[i-2].high && c.high >= candles[i+1].high && c.high >= candles[i+2].high) {
        candidates.push({price:c.high,strength:Math.min(100,55+(i/candles.length)*20+Math.min(25,(c.high-price)/Math.max(step,0.01))),type:"Buy-side liquidity",detail:"Prior swing high · potential stops above"});
      }
      if (c.low < candles[i-1].low && c.low < candles[i-2].low && c.low <= candles[i+1].low && c.low <= candles[i+2].low) {
        candidates.push({price:c.low,strength:Math.min(100,55+(i/candles.length)*20+Math.min(25,(price-c.low)/Math.max(step,0.01))),type:"Sell-side liquidity",detail:"Prior swing low · potential stops below"});
      }
    }
    for (const b of bins.filter(b=>b.volume>0).sort((a,b)=>b.volume-a.volume).slice(0,8)) {
      candidates.push({price:b.price,strength:Math.round(35+65*b.volume/maxVol),type:"High-volume node",detail:`Volume-at-price proxy · ${Math.round(b.volume).toLocaleString("en-US")} units`});
    }
    const sorted = candidates.sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price));
    const unique: LiquidityLevel[]=[];
    for (const item of sorted) if (!unique.some(x=>Math.abs(x.price-item.price)<step*0.8 && x.type===item.type)) unique.push(item);
    return { price, levels: unique.slice(0,levelsCount).sort((a,b)=>b.price-a.price), range:{low:rangeLow,high:rangeHigh}, candles:candles.length, volumeProxy:candles.some(c=>Number(c.tickVolume ?? c.volume)>0) };
  }, [market, lookback, levelsCount]);

  const isLight = theme === "light";
  const panel = { background: isLight ? "#fff" : "#17191f", color: isLight ? "#172033" : "#e8edf5", border: `1px solid ${isLight ? "#dce2ea" : "#2b303b"}` };
  const muted = isLight ? "#657187" : "#98a3b5";
  const levels = analysis.levels;
  const maxStrength = Math.max(1,...levels.map(l=>l.strength));

  return <section className="ilm-root" style={{...panel,borderRadius:16,padding:18,display:"grid",gap:16,minWidth:0}}>
    <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{display:"grid",placeItems:"center",width:38,height:38,borderRadius:10,background:"rgba(0,196,140,.12)",color:"#00c48c"}}><Layers3 size={20}/></span><div><h2 style={{fontSize:20,fontWeight:750,margin:0}}>Institutional Liquidity &amp; Book Depth Map</h2><p style={{fontSize:12,color:muted,margin:"4px 0 0"}}>{asset} · {interval} · Historical liquidity-zone analysis</p></div></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="ilm-button" onClick={()=>setShowGuide(v=>!v)}>{showGuide?"Hide guide":"How to read"}</button><button className="ilm-button" onClick={()=>{setLoading(true);fetchMarketData(marketApiUrl(asset, apiInterval[interval]||"15min"),{cache:"no-store"}).then(r=>r.json()).then(setMarket).catch(()=>setMarket({status:"unavailable",error:"Unable to retrieve market candles."})).finally(()=>setLoading(false));}}><RefreshCw size={14}/> Refresh</button></div>
    </header>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{display:"flex",padding:3,borderRadius:9,background:isLight?"#f1f4f8":"#101217",gap:3}}>{([ ["map","Liquidity Map"],["levels","Key Levels"]] as const).map(([v,label])=><button key={v} onClick={()=>setView(v)} style={{border:0,borderRadius:7,padding:"8px 12px",background:view===v?"#246bfe":"transparent",color:view===v?"white":muted,fontWeight:700,cursor:"pointer"}}>{label}</button>)}</div>
      <label style={{fontSize:12,color:muted,display:"flex",alignItems:"center",gap:7}}>Lookback <select value={lookback} onChange={e=>setLookback(Number(e.target.value))} style={{background:isLight?"white":"#20242d",color:panel.color,border:panel.border,borderRadius:7,padding:"7px 9px"}}>{[60,120,200,300].map(n=><option key={n} value={n}>{n} candles</option>)}</select></label>
      <label style={{fontSize:12,color:muted,display:"flex",alignItems:"center",gap:7}}>Levels <select value={levelsCount} onChange={e=>setLevelsCount(Number(e.target.value))} style={{background:isLight?"white":"#20242d",color:panel.color,border:panel.border,borderRadius:7,padding:"7px 9px"}}>{[6,10,14,18].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <span style={{marginLeft:"auto",fontSize:11,color:muted}}>{loading?"Updating…":lastUpdated?`Updated ${new Date(lastUpdated).toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"})} CET/CEST`:"Waiting for data"}</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10}}>
      {[{label:"CURRENT PRICE",value:analysis.price==null?"—":`$${fmt(analysis.price)}`,color:"#f5b942"},{label:"VISIBLE ZONES",value:String(levels.length),color:"#42a5ff"},{label:"ABOVE PRICE",value:String(levels.filter(l=>l.price>=(analysis.price||0)).length),color:"#ff6874"},{label:"BELOW PRICE",value:String(levels.filter(l=>l.price<(analysis.price||0)).length),color:"#00c48c"}].map(c=><div key={c.label} style={{...panel,padding:14,borderRadius:11}}><div style={{fontSize:10,fontWeight:800,letterSpacing:1,color:muted}}>{c.label}</div><div style={{fontSize:24,fontWeight:800,color:c.color,marginTop:7}}>{c.value}</div></div>)}
    </div>
    {!analysis.price || !levels.length ? <div style={{...panel,padding:22,borderRadius:12,textAlign:"center"}}><Activity size={25} style={{margin:"0 auto 10px",color:"#f5b942"}}/><b>{market?.error||"Waiting for market history"}</b><p style={{color:muted,fontSize:13}}>The map appears when the configured market provider returns usable candles. No fabricated order-book feed is substituted.</p></div> : view === "map" ? <div style={{...panel,borderRadius:12,padding:12,overflow:"hidden"}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:muted,marginBottom:10}}><span>ESTIMATED LIQUIDITY ZONES</span><span>Price scale · USD</span></div>
      <div style={{display:"grid",gap:5}}>{levels.map((l,i)=>{const above=l.price>=analysis.price!;const color=l.type==="High-volume node"?"#eab308":above?"#ff5968":"#00c48c";const width=Math.max(12,l.strength/maxStrength*100);return <div key={`${l.type}-${l.price}-${i}`} style={{display:"grid",gridTemplateColumns:"minmax(86px,120px) minmax(80px,1fr) minmax(112px,190px)",gap:10,alignItems:"center",minHeight:36}}><strong style={{fontSize:12,color}}>${fmt(l.price)}</strong><div style={{height:24,position:"relative",background:isLight?"#f0f3f7":"#101319",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${width}%`,background:`linear-gradient(90deg, ${color}22, ${color}88)`,borderRight:`2px solid ${color}`}}/><div style={{position:"absolute",left:"50%",top:0,bottom:0,borderLeft:`1px dashed ${muted}55`}}/></div><div style={{fontSize:11,minWidth:0}}><b style={{color}}>{l.type}</b><div style={{color:muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{l.detail}</div></div></div>})}</div>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:11,color:muted,marginTop:12,borderTop:panel.border,paddingTop:10}}><span>🟥 Potential buy-side stops above swing highs</span><span>🟩 Potential sell-side stops below swing lows</span><span>🟨 Historical volume-at-price node</span></div>
    </div> : <div style={{...panel,borderRadius:12,overflow:"hidden"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.3fr .5fr",gap:8,padding:"11px 14px",background:isLight?"#f1f4f8":"#20242d",fontSize:10,fontWeight:800,color:muted}}><span>PRICE</span><span>ZONE TYPE</span><span>INTERPRETATION</span><span>STRENGTH</span></div>{levels.map((l,i)=><div key={`${l.price}-${i}`} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1.3fr .5fr",gap:8,padding:"12px 14px",borderTop:panel.border,alignItems:"center",fontSize:12}}><b style={{color:l.type==="High-volume node"?"#eab308":l.price>=(analysis.price||0)?"#ff5968":"#00c48c"}}>${fmt(l.price)}</b><span>{l.type}</span><span style={{color:muted}}>{l.detail}</span><b>{Math.round(l.strength)}%</b></div>)}</div>}
    <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:12,borderRadius:10,background:"rgba(245,185,66,.08)",border:"1px solid rgba(245,185,66,.25)",fontSize:12,lineHeight:1.5}}><AlertTriangle size={17} color="#f5b942" style={{flexShrink:0,marginTop:1}}/><div><b style={{color:"#f5b942"}}>Important data limitation</b><p style={{margin:"4px 0 0",color:muted}}>The configured free XAU/USD spot feed does not provide a verified, exchange-level Level 2 order book or individual resting orders. Buy-side and sell-side zones are inferred from historical swing highs/lows; yellow nodes use provider candle-volume/tick-volume proxies. This is <b>not live order-book depth</b>, and it cannot confirm institutional orders or actual stop placement.</p><p style={{margin:"5px 0 0",color:muted}}>Source: {market?.data?.source||"configured market provider"}{market?.data?.updatedAt?` · Provider timestamp: ${market.data.updatedAt}`:""} · {analysis.candles} candles analysed{analysis.volumeProxy?" · volume proxy available":" · volume data unavailable"}.</p></div></div>
    {showGuide&&<div style={{...panel,padding:16,borderRadius:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:14}}><div><b><Target size={15} style={{verticalAlign:"middle",marginRight:6,color:"#ff6874"}}/>Buy-side liquidity</b><p style={{fontSize:12,color:muted,lineHeight:1.6}}>Prior swing highs can be watched as areas where breakout orders and protective buy stops may cluster. The map infers these areas; it does not see actual stops.</p></div><div><b><ShieldAlert size={15} style={{verticalAlign:"middle",marginRight:6,color:"#00c48c"}}/>Sell-side liquidity</b><p style={{fontSize:12,color:muted,lineHeight:1.6}}>Prior swing lows can be watched for possible sell-stop concentration and liquidity sweeps. Confirm any reaction with current price action.</p></div><div><b><Activity size={15} style={{verticalAlign:"middle",marginRight:6,color:"#eab308"}}/>Volume nodes</b><p style={{fontSize:12,color:muted,lineHeight:1.6}}>Historical candle volume or tick-count proxy is distributed across each candle's range. It is not true traded volume at each price or bid/ask depth.</p></div></div>}
  </section>;
}
