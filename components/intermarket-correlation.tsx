"use client";
import React, { useEffect, useState } from "react";
import { ExternalLink, Info, Activity, TrendingUp } from "lucide-react";

const assets=[
 {s:"XAU",n:"Gold Spot (XAU/USD)",tv:"OANDA:XAUUSD",ticker:"XAUS spot"},
 {s:"XAG",n:"Silver futures proxy",tv:"COMEX:SI1!",ticker:"SI=F"},
 {s:"DXY",n:"US Dollar Index",tv:"TVC:DXY",ticker:"DX-Y.NYB"},
 {s:"US10Y",n:"US 10-Year Treasury yield",tv:"TVC:US10Y",ticker:"^TNX"},
 {s:"SPY",n:"S&P 500 ETF",tv:"AMEX:SPY",ticker:"SPY"}
];
type ApiData={status:"ok";period:string;observations:number;from:string;to:string;updatedAt:string;source:string;matrix:(number|null)[][];notes:Record<string,string>} | {status:"error";error:string};
function color(v:number|null){if(v===null)return "corr-neutral";if(v>=.6)return "corr-pos-strong";if(v>=.25)return "corr-pos";if(v<=-.6)return "corr-neg-strong";if(v<=-.25)return "corr-neg";return "corr-neutral"}
function fmtDate(value:string){return new Date(value).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}
export default function IntermarketCorrelation(){
 const [selected,setSelected]=useState<[number,number]>([0,2]);
 const [period,setPeriod]=useState("90D");
 const [showChart,setShowChart]=useState(false);
 const [data,setData]=useState<ApiData|null>(null);
 const [loading,setLoading]=useState(true);
 const [reload,setReload]=useState(0);
 const [a,b]=selected;
 useEffect(()=>{let active=true;setLoading(true);fetch(`/api/correlation?period=${period}&refresh=${reload}`,{cache:"no-store"}).then(async r=>{const json=await r.json();if(!r.ok||json.status!=="ok")throw new Error(json.error||"Market data is currently unavailable.");return json as ApiData}).then(json=>{if(active)setData(json)}).catch(err=>{if(active)setData({status:"error",error:err instanceof Error?err.message:"Unable to load market history."})}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[period,reload]);
 const matrix=data?.status==="ok"?data.matrix:null;
 const val=matrix?.[a]?.[b]??null;
 const strength=val===null?"Unavailable":Math.abs(val)>=.7?"Strong":Math.abs(val)>=.4?"Moderate":Math.abs(val)>=.2?"Weak":"Very weak";
 const relation=val===null?"":val>.15?"positive":val<-.15?"negative":"near-zero";
 const pairText=val===null?"Historical correlation is unavailable until the provider returns enough aligned observations.":a===b?"An asset is perfectly correlated with itself by definition.":`Over ${data?.status==="ok"?data.observations:""} aligned daily return observations, ${assets[a].n} and ${assets[b].n} showed a ${relation} relationship. Correlation describes historical co-movement; it does not establish causation or predict the next move.`;
 return <div className="intermarket-panel">
  <div className="intermarket-heading"><div><div className="intermarket-eyebrow"><Activity size={13}/> MACRO RELATIONSHIPS</div><h3>Intermarket Correlation Heatmap</h3><p>Calculated from aligned historical daily returns.</p></div><div className="intermarket-controls"><label>Window <select value={period} onChange={e=>setPeriod(e.target.value)}><option>30D</option><option>90D</option><option>180D</option><option>1Y</option></select></label><button type="button" className="corr-chart-button" style={{marginTop:0,width:"auto",padding:"9px 12px"}} onClick={()=>setReload(v=>v+1)} disabled={loading}>{loading?"Updating…":"Refresh"}</button><span className="corr-status"><i/>{loading?"LOADING":data?.status==="ok"?"HISTORICAL DATA":"DATA UNAVAILABLE"}</span></div></div>
  <div className="corr-warning"><Info size={15}/><span>This matrix calculates Pearson correlation from aligned daily returns. Gold uses XAU/USD spot history from XAUS (not futures). Silver uses a futures proxy; US10Y uses the ^TNX yield index. Other instruments use Yahoo Finance daily data, whose chart endpoint is unofficial.</span></div>
  <div className="intermarket-layout"><div className="corr-matrix-wrap"><div className="corr-matrix" style={{gridTemplateColumns:`76px repeat(${assets.length}, minmax(58px,1fr))`}}><div className="corr-corner">ASSET</div>{assets.map(x=><div className="corr-col-label" key={x.s} title={x.n}>{x.s}</div>)}{assets.map((row,i)=><React.Fragment key={row.s}><div className="corr-row-label">{row.s}</div>{assets.map((col,j)=>{const v=matrix?.[i]?.[j]??null;return <button key={`${row.s}-${col.s}`} aria-label={`${row.n} versus ${col.n}: ${v===null?"unavailable":v.toFixed(2)}`} onClick={()=>setSelected([i,j])} className={`corr-cell ${color(v)} ${a===i&&b===j||a===j&&b===i?"corr-selected":""}`} disabled={v===null}>{v===null?"—":v.toFixed(2)}</button>})}</React.Fragment>)}</div><div className="corr-legend"><span>−1.0 Negative</span><div><i className="legend-neg"/><i className="legend-mid"/><i className="legend-pos"/></div><span>Positive +1.0</span></div><p className="corr-method">Pearson correlation of aligned daily percentage returns · {period} window · {data?.status==="ok"?`${data.observations} observations (${data.from} to ${data.to})`:"waiting for historical data"}.</p></div>
  <aside className="corr-detail"><div className="corr-detail-top"><span>SELECTED PAIR</span><span className="corr-preview-tag">{data?.status==="ok"?"CALCULATED":"NO DATA"}</span></div><div className="corr-pair"><div><b>{assets[a].s}</b><small>{assets[a].n}</small></div><span className="corr-link">↔</span><div><b>{assets[b].s}</b><small>{assets[b].n}</small></div></div><div className={`corr-score ${color(val)}`}><span>Correlation coefficient</span><strong>{val===null?"—":val.toFixed(2)}</strong><small>{strength}{relation?` ${relation} relationship`:""}</small></div><div className="corr-observation"><b>How to read this</b><p>{pairText}</p><p>Correlation is not a trading signal and can change across market regimes.</p></div><button className="corr-chart-button" onClick={()=>setShowChart(v=>!v)}>{showChart?"Hide TradingView links":"View pair on TradingView"}<ExternalLink size={14}/></button>{showChart&&<div className="corr-tv-links">{[assets[a],assets[b]].map(x=><a key={x.s} href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(x.tv)}`} target="_blank" rel="noreferrer">{x.s} · {x.tv} <ExternalLink size={12}/></a>)}</div>}<div className="corr-data-note"><TrendingUp size={14}/><span>{loading?"Fetching historical data…":data?.status==="ok"?`Last retrieved: ${fmtDate(data.updatedAt)}. Source: Yahoo Finance chart endpoint.`:`Historical feed unavailable: ${data?.status==="error"?data.error:"No data returned."}`}</span></div></aside></div>
  <div className="corr-footer"><span><i/> {data?.status==="ok"?"Historical calculations":"Waiting for data provider"}</span><span>Market data via Yahoo Finance chart endpoint · not an official TradingView API</span></div>
 </div>
}
