"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildFootprint, buildVolumeProfile, calculateValueArea, type TradePrint } from "@/lib/orderflow/engine";
import { auth } from "@/lib/firebase";

type ReplayTrade = TradePrint & { id: number; source: string };
type ReplayResponse = { status: string; instrument: string; dataNote?: string; tradeCount?: number; truncated?: boolean; trades?: ReplayTrade[]; error?: string };
const money = (n: number, digits = 2) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function OrderFlowMarketReplay() {
  const [instrument, setInstrument] = useState<"GC" | "SI">("GC");
  const [trades, setTrades] = useState<ReplayTrade[]>([]);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "playing" | "paused" | "error">("idle");
  const [message, setMessage] = useState("Load stored trades to begin replay.");
  const [rangeHours, setRangeHours] = useState(24);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => () => stopTimer(), []);

  const load = async () => {
    stopTimer(); setStatus("loading"); setCursor(0);
    try {
      const to = Date.now() + 1;
      const from = to - rangeHours * 60 * 60 * 1000;
      const user = auth?.currentUser;
      if (!user) throw new Error("Sign in to access Order Flow replay.");
      const token = await user.getIdToken();
      const response = await fetch(`/api/orderflow/replay?instrument=${instrument}&from=${from}&to=${to}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const json: ReplayResponse = await response.json();
      if (!response.ok || json.status !== "ok") throw new Error(json.error || "Unable to load replay history");
      setTrades(json.trades || []); setStatus("ready");
      setMessage(json.tradeCount ? `${json.tradeCount.toLocaleString()} stored trades loaded${json.truncated ? " (first 5,000; range truncated)" : ""}. ${json.dataNote || ""}` : "No stored trades in this time range. Generate demo records or choose a wider range.");
    } catch (error) { setTrades([]); setStatus("error"); setMessage(error instanceof Error ? error.message : "Replay history could not be loaded."); }
  };

  const visibleTrades = useMemo(() => trades.slice(0, cursor), [trades, cursor]);
  const footprint = useMemo(() => buildFootprint(visibleTrades, { tickSize: instrument === "GC" ? 0.1 : 0.005, intervalMs: 5 * 60 * 1000 }), [visibleTrades, instrument]);
  const profile = useMemo(() => buildVolumeProfile(visibleTrades, instrument === "GC" ? 0.1 : 0.005), [visibleTrades, instrument]);
  const valueArea = useMemo(() => calculateValueArea(profile, 70), [profile]);
  const current = visibleTrades[visibleTrades.length - 1];
  const currentBar = footprint[footprint.length - 1];
  const play = () => {
    if (!trades.length) { setMessage("Load history before starting replay."); return; }
    if (cursor >= trades.length) setCursor(0);
    stopTimer(); setStatus("playing");
    timer.current = setInterval(() => setCursor(position => {
      const next = position >= trades.length ? trades.length : position + speed;
      if (next >= trades.length) { stopTimer(); setStatus("paused"); }
      return next;
    }), 250);
  };
  const pause = () => { stopTimer(); setStatus("paused"); };
  const reset = () => { stopTimer(); setCursor(0); setStatus(trades.length ? "ready" : "idle"); };

  return <section className="ofr-panel">
    <div className="ofr-heading"><div><span className="ofr-eyebrow">HISTORICAL ANALYTICS</span><h3>Market Replay</h3><p>Replay saved trade prints chronologically and rebuild analytics from the visible portion only.</p></div><span className="ofr-demo-badge">STORED DATA</span></div>
    <div className="ofr-controls"><label>Instrument<select value={instrument} onChange={e=>{setInstrument(e.target.value as "GC"|"SI");setTrades([]);setCursor(0);setStatus("idle");}}><option value="GC">GC · Gold futures</option><option value="SI">SI · Silver futures</option></select></label><label>History window<select value={rangeHours} onChange={e=>setRangeHours(Number(e.target.value))}><option value={1}>Last 1 hour</option><option value={6}>Last 6 hours</option><option value={24}>Last 24 hours</option><option value={72}>Last 3 days</option><option value={168}>Last 7 days</option></select></label><label>Speed<select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={1}>1x · one trade / step</option><option value={2}>2x</option><option value={5}>5x</option><option value={10}>10x</option></select></label><button onClick={load} disabled={status === "loading"}>{status === "loading" ? "Loading…" : "Load history"}</button></div>
    <div className="ofr-transport"><button onClick={play} disabled={!trades.length || status === "playing"}>▶ Play</button><button onClick={pause} disabled={status !== "playing"}>Ⅱ Pause</button><button onClick={reset} disabled={!trades.length}>↺ Reset</button><span>{cursor.toLocaleString()} / {trades.length.toLocaleString()} trades</span></div>
    <div className="ofr-progress"><div style={{ width: `${trades.length ? cursor / trades.length * 100 : 0}%` }}/></div>
    <input className="ofr-scrubber" aria-label="Replay position" type="range" min={0} max={Math.max(1,trades.length)} value={cursor} onChange={e=>{pause();setCursor(Number(e.target.value));}} disabled={!trades.length}/>
    <p className="ofr-message" role="status">{message}</p>
    <div className="ofr-stats"><article><small>LAST TRADE</small><b>{current ? money(current.price, instrument === "GC" ? 1 : 3) : "—"}</b><span>{current ? new Date(current.timestamp).toLocaleTimeString() : "Waiting"}</span></article><article><small>VISIBLE DELTA</small><b className={(footprint.reduce((s,b)=>s+b.delta,0)>=0?"positive":"negative")}>{footprint.reduce((s,b)=>s+b.delta,0)>=0?"+":""}{money(footprint.reduce((s,b)=>s+b.delta,0),0)}</b><span>Replayed trades only</span></article><article><small>CVD</small><b>{currentBar ? (currentBar.cvd >= 0 ? "+" : "") + money(currentBar.cvd,0) : "—"}</b><span>Current loaded replay window</span></article><article><small>VALUE AREA POC</small><b>{valueArea.poc == null ? "—" : money(valueArea.poc, instrument === "GC" ? 1 : 3)}</b><span>VAH {valueArea.vah == null ? "—" : money(valueArea.vah, instrument === "GC" ? 1 : 3)} · VAL {valueArea.val == null ? "—" : money(valueArea.val, instrument === "GC" ? 1 : 3)}</span></article></div>
    <div className="ofr-bottom"><div><b>Replay footprint bars</b><span>{footprint.length} completed / active 5-minute bars</span></div><div><b>Volume profile levels</b><span>{profile.length} price levels · {visibleTrades.length.toLocaleString()} trades included</span></div></div>
    <div className="ofr-note">Replay is a historical analysis tool, not a live feed. Data quality depends on the original provider; synthetic demo records are not exchange data. CVD is recalculated from the replay start.</div>
  </section>;
}
