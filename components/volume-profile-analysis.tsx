"use client";

import { marketApiUrl, fetchMarketData } from "@/lib/market-selection";
import { useEffect, useMemo, useState } from "react";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number | null };
type Api = { status?: string; disclaimer?: string; error?: string; data?: { price?: number | null; source?: string; updatedAt?: string | null; candles?: Candle[] } };
type Level = { price: number; volume: number; buy: number; sell: number; delta: number };
type Session = "ALL" | "RTH" | "ETH" | "ASIA" | "LON" | "NY";
const SESSION_INFO: Record<Exclude<Session, "ALL">, { zone: string; start: number; end: number; label: string }> = {
  RTH: { zone: "America/New_York", start: 9 * 60 + 30, end: 16 * 60, label: "US regular trading · 09:30–16:00 New York" },
  ETH: { zone: "America/New_York", start: 18 * 60, end: 9 * 60 + 30, label: "US extended hours · 18:00–09:30 New York" },
  ASIA: { zone: "Asia/Tokyo", start: 0, end: 9 * 60, label: "Asia session · 00:00–09:00 Tokyo" },
  LON: { zone: "Europe/London", start: 8 * 60, end: 17 * 60, label: "London session · 08:00–17:00 London" },
  NY: { zone: "America/New_York", start: 8 * 60, end: 17 * 60, label: "New York FX session · 08:00–17:00 New York" },
};
function zonedMinutes(value: string, timeZone: string): number | null {
  let date = new Date(value);
  if (!Number.isFinite(date.getTime()) && /^\d{10,13}$/.test(value)) date = new Date(Number(value) * (value.length === 10 ? 1000 : 1));
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const hour = Number(parts.find(p => p.type === "hour")?.value);
    const minute = Number(parts.find(p => p.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  } catch { return null; }
}
function inSession(candle: Candle, session: Session): boolean {
  if (session === "ALL") return true;
  const info = SESSION_INFO[session];
  const minute = zonedMinutes(candle.time, info.zone);
  if (minute == null) return false;
  return info.start < info.end ? minute >= info.start && minute < info.end : minute >= info.start || minute < info.end;
}

export default function VolumeProfileAnalysis({ asset, interval, theme }: { asset: string; interval: string; theme: "dark" | "light" }) {
  const [api, setApi] = useState<Api | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookback, setLookback] = useState(100);
  const [binCount, setBinCount] = useState(36);
  const [view, setView] = useState<"profile" | "footprint">("profile");
  const [sortBy, setSortBy] = useState<"price" | "volume" | "delta">("price");
  const [showGuide, setShowGuide] = useState(false);
  const [session, setSession] = useState<Session>("ALL");
  const [displayTimeZone, setDisplayTimeZone] = useState("Europe/Berlin");

  const apiInterval: Record<string, string> = { "1m": "1min", "5m": "5min", "10m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "4h": "4h", "1d": "1day", "1w": "1day", "1mo": "1day" };
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchMarketData(marketApiUrl(asset, apiInterval[interval] || "15min"), { cache: "no-store" });
        const json = await res.json();
        if (active) setApi(json);
      } catch {
        if (active) setApi({ status: "unavailable", error: "Could not load market candles." });
      } finally { if (active) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, interval]);

  const result = useMemo(() => {
    const all = (api?.data?.candles || []).filter(c => [c.open,c.high,c.low,c.close].every(Number.isFinite) && c.high >= c.low && inSession(c, session));
    const candles = all.slice(-lookback);
    if (!candles.length) return { levels: [] as Level[], poc: null as number|null, vah: null as number|null, val: null as number|null, total: 0, price: api?.data?.price ?? null, buy: 0, sell: 0, count: 0 };
    const low = Math.min(...candles.map(c => c.low));
    const high = Math.max(...candles.map(c => c.high));
    const step = Math.max((high - low) / binCount, Math.abs(high) * 0.000001, 0.00001);
    const levels: Level[] = Array.from({length:binCount},(_,i)=>({price:low + step*(i+.5),volume:0,buy:0,sell:0,delta:0}));
    for (const c of candles) {
      const vol = Math.max(0, Number(c.volume) || 0);
      if (!vol) continue;
      const first = Math.max(0, Math.min(binCount-1, Math.floor((c.low-low)/step)));
      const last = Math.max(first, Math.min(binCount-1, Math.floor((c.high-low)/step)));
      const count = last-first+1;
      const bullishShare = c.close > c.open ? 0.65 : c.close < c.open ? 0.35 : 0.5;
      for (let i=first;i<=last;i++) {
        const portion = vol/count;
        levels[i].volume += portion;
        levels[i].buy += portion*bullishShare;
        levels[i].sell += portion*(1-bullishShare);
      }
    }
    levels.forEach(l => l.delta=l.buy-l.sell);
    const total = levels.reduce((s,l)=>s+l.volume,0);
    const pocIndex = levels.reduce((best,l,i)=>l.volume>levels[best].volume?i:best,0);
    let covered = levels[pocIndex].volume, left=pocIndex, right=pocIndex;
    while (total>0 && covered < total*.70 && (left>0 || right<levels.length-1)) {
      const lv=left>0?levels[left-1].volume:-1, rv=right<levels.length-1?levels[right+1].volume:-1;
      if (rv>lv) { right++; covered+=levels[right].volume; } else if (left>0) { left--; covered+=levels[left].volume; } else break;
    }
    return { levels, poc:levels[pocIndex].price, vah:levels[right].price, val:levels[left].price, total, price:api?.data?.price ?? candles[candles.length-1].close, buy:levels.reduce((s,l)=>s+l.buy,0), sell:levels.reduce((s,l)=>s+l.sell,0), count:candles.length };
  }, [api, lookback, binCount, session]);

  const fmt = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const nfmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const maxVol = Math.max(1,...result.levels.map(l=>l.volume));
  const sortedLevels = [...result.levels].sort((a,b)=>sortBy==="volume"?b.volume-a.volume:sortBy==="delta"?b.delta-a.delta:b.price-a.price);
  const isLight = theme === "light";

  return <div className={`vpa ${isLight ? "vpa-light" : ""}`}>
    <div className="vpa-top"><div><div className="vpa-eyebrow">EDGE TERMINAL · MARKET STRUCTURE</div><h2>Volume Profile &amp; Footprint Analysis</h2><p>{asset} · {interval} · {api?.data?.source || "Market data provider"} · {new Intl.DateTimeFormat("en-GB", { timeZone: displayTimeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date())} ({displayTimeZone})</p></div><span className={`vpa-status ${api?.status === "live" ? "live" : ""}`}>{loading ? "UPDATING" : api?.status === "live" ? "LIVE FEED" : "DATA STATUS: CHECK"}</span></div>
    <div className="vpa-toolbar"><div className="vpa-session-group" role="group" aria-label="Trading session">{(["ALL", "RTH", "ETH", "ASIA", "LON", "NY"] as Session[]).map(s => <button type="button" key={s} className={session === s ? "active" : ""} onClick={() => setSession(s)} aria-pressed={session === s}>{s}</button>)}</div><label className="vpa-timezone-label">Time zone<select value={displayTimeZone} onChange={e => setDisplayTimeZone(e.target.value)}><option value="Europe/Berlin">Germany · Berlin</option><option value="Europe/London">London</option><option value="America/New_York">New York</option><option value="Asia/Tokyo">Tokyo</option><option value="UTC">UTC</option></select></label><div className="vpa-tabs"><button className={view==="profile"?"active":""} onClick={()=>setView("profile")}>Volume Profile</button><button className={view==="footprint"?"active":""} onClick={()=>setView("footprint")}>Footprint Levels</button></div><label>Lookback<select value={lookback} onChange={e=>setLookback(Number(e.target.value))}><option value={50}>50 candles</option><option value={100}>100 candles</option><option value={200}>200 candles</option></select></label><label>Price rows<select value={binCount} onChange={e=>setBinCount(Number(e.target.value))}><option value={24}>24</option><option value={36}>36</option><option value={48}>48</option></select></label><button className="vpa-refresh" onClick={()=>{setLoading(true);fetchMarketData(marketApiUrl(asset, apiInterval[interval]||"15min"),{cache:"no-store"}).then(r=>r.json()).then(setApi).catch(()=>setApi({status:"unavailable",error:"Could not load market candles."})).finally(()=>setLoading(false));}}>↻ Refresh</button></div>
    <div className="vpa-stats"><article><span>LAST PRICE</span><b>{fmt(result.price)}</b><small>{asset}</small></article><article><span>POINT OF CONTROL</span><b className="gold">{fmt(result.poc)}</b><small>Highest estimated volume row</small></article><article><span>VALUE AREA HIGH</span><b>{fmt(result.vah)}</b><small>Approx. 70% volume range</small></article><article><span>VALUE AREA LOW</span><b>{fmt(result.val)}</b><small>Approx. 70% volume range</small></article><article><span>PROFILE VOLUME</span><b>{result.total ? nfmt(result.total) : "—"}</b><small>{result.count} candles · {session} session</small></article></div>
    {result.levels.length ? view === "profile" ? <section className="vpa-profile"><div className="vpa-section-title"><div><h3>Volume-at-Price Profile</h3><p>{session === "ALL" ? "All available candles." : SESSION_INFO[session].label}. Candle volume is distributed across each price range.</p></div><div className="vpa-legend"><i/> Volume <i className="poc-dot"/> POC <i className="va-dot"/> Value area</div></div><div className="vpa-profile-rows">{[...result.levels].reverse().map((l,i)=>{const poc=result.poc!=null&&Math.abs(l.price-result.poc)<(Math.max(...result.levels.map(x=>x.price))-Math.min(...result.levels.map(x=>x.price)))/(binCount-1)*.51; const va=result.val!=null&&result.vah!=null&&l.price>=result.val&&l.price<=result.vah; return <div className={`vpa-profile-row ${poc?"is-poc":""} ${va?"in-value-area":""}`} key={i}><span className="vpa-price">{fmt(l.price)}</span><div className="vpa-bar-track"><div className="vpa-bar" style={{width:`${l.volume/maxVol*100}%`}}/></div><b className="vpa-volume">{nfmt(l.volume)}</b>{poc&&<em>POC</em>}</div>})}</div><div className="vpa-profile-footer"><span>VAL <b>{fmt(result.val)}</b></span><span>VAH <b>{fmt(result.vah)}</b></span><span>POC <b>{fmt(result.poc)}</b></span></div></section> : <section className="vpa-footprint"><div className="vpa-section-title"><div><h3>Estimated Bid / Ask by Price Level</h3><p>{session === "ALL" ? "All available candles." : SESSION_INFO[session].label}. Directional split is a candle-based proxy, not exchange-reported bid/ask executions.</p></div><label>Sort by<select value={sortBy} onChange={e=>setSortBy(e.target.value as "price"|"volume"|"delta")}><option value="price">Price</option><option value="volume">Volume</option><option value="delta">Delta</option></select></label></div><div className="vpa-table-wrap"><table><thead><tr><th>PRICE</th><th>EST. BID</th><th>EST. ASK</th><th>VOLUME</th><th>DELTA (EST.)</th><th>BUY / SELL SPLIT</th></tr></thead><tbody>{sortedLevels.map((l,i)=>{const poc=result.poc!=null&&Math.abs(l.price-result.poc)<(Math.max(...result.levels.map(x=>x.price))-Math.min(...result.levels.map(x=>x.price)))/(binCount-1)*.51;return <tr key={i} className={poc?"is-poc":""}><td>{fmt(l.price)} {poc&&<em>POC</em>}</td><td className="sell-num">{nfmt(l.sell)}</td><td className="buy-num">{nfmt(l.buy)}</td><td>{nfmt(l.volume)}</td><td className={l.delta>=0?"buy-num":"sell-num"}>{l.delta>=0?"+":""}{nfmt(l.delta)}</td><td><div className="vpa-split"><span style={{width:`${l.volume?l.sell/l.volume*100:50}%`}}/><i style={{width:`${l.volume?l.buy/l.volume*100:50}%`}}/></div></td></tr>})}</tbody></table></div></section> : <div className="vpa-empty"><b>No usable candles returned</b><p>{api?.disclaimer || api?.error || "Check the market-data provider configuration, then refresh."}</p></div>}
    <button className="vpa-guide-toggle" onClick={()=>setShowGuide(v=>!v)} aria-expanded={showGuide}>{showGuide?"Hide data methodology":"Data methodology & limitations"}<span>{showGuide?"−":"+"}</span></button>{showGuide&&<div className="vpa-method"><b>How to read this module</b><p><strong>Volume Profile:</strong> candle-reported volume is spread evenly across each candle's high-low range; POC is the row with the most estimated volume and the value area expands around it to approximately 70% of the profile.</p><p><strong>Footprint Levels:</strong> the buy/sell split is inferred from candle direction and is only a visualization proxy. It is not true bid/ask footprint data, cumulative delta, or exchange-level aggressor volume. Spot gold and silver feeds generally do not provide a consolidated global tape.</p><p><strong>Session/time zone:</strong> Session filters use the relevant market time zone and automatically account for daylight-saving changes. The display clock defaults to Germany/Berlin; change it above if you prefer another clock. Session definitions: RTH 09:30–16:00 New York, ETH 18:00–09:30 New York, ASIA 00:00–09:00 Tokyo, LON 08:00–17:00 London, NY 08:00–17:00 New York.</p><p><strong>Data source:</strong> {api?.data?.source || "Configured market provider"}. The selected 1W/1M view uses daily candles when the provider does not expose weekly/monthly intervals; this is not a true native weekly/monthly feed.</p></div>}
  </div>;
}
