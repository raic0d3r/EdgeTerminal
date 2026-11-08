"use client";

import { useEffect, useMemo, useState } from "react";
import { getActiveMarketBroker, type MarketBroker } from "@/lib/market-selection";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Props = { symbol: "XAU/USD" | "XAG/USD"; entry: string; stop: string; capital: string; risk: string; lots: number };
type Tab = "ticket" | "positions" | "history";

function formatHistoryMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  // Keep the amount currency-neutral. The account's currency is broker-owned
  // metadata and must not be guessed or hard-coded as USD/EUR.
  const formatted = new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(Math.abs(amount));
  return amount > 0 ? `+${formatted}` : amount < 0 ? `-${formatted}` : formatted;
}


export default function LiveTradingPanel({ symbol, entry, stop, capital, risk, lots }: Props) {
  const [tab, setTab] = useState<Tab>("ticket");
  const [broker, setBroker] = useState<MarketBroker>("ctrader");
  const [permission, setPermission] = useState<"checking" | "view-only" | "trading" | "offline">("checking");
  const [orderType, setOrderType] = useState<"BUY_MARKET" | "SELL_MARKET" | "BUY_LIMIT" | "SELL_LIMIT" | "BUY_STOP" | "SELL_STOP">("BUY_MARKET");
  const [entryPrice, setEntryPrice] = useState(entry);
  const side = orderType.startsWith("BUY") ? "BUY" : "SELL";
  const executionType = orderType.endsWith("MARKET") ? "MARKET" : orderType.endsWith("LIMIT") ? "LIMIT" : "STOP";
  const [volume, setVolume] = useState(lots > 0 ? lots.toFixed(2) : "0.01");
  const [sl, setSl] = useState(stop);
  const [tp, setTp] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [skipReview, setSkipReview] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Array<{ctidTraderAccountId:string;isLive:boolean;brokerTitleShort?:string|null}>>([]);
  const [accountCapital, setAccountCapital] = useState<{balance:number|null;moneyDigits:number;depositAssetId:string|null}|null>(null);
  const [capitalLoading, setCapitalLoading] = useState(false);
  const [capitalError, setCapitalError] = useState("");
  const [records, setRecords] = useState<any[]>([]);
  const [historyDays, setHistoryDays] = useState(30);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;
  const historyPageCount = Math.max(1, Math.ceil(records.length / HISTORY_PAGE_SIZE));
  const visibleHistoryRecords = records.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editingPosition, setEditingPosition] = useState<any | null>(null);
  const [editStopLoss, setEditStopLoss] = useState("");
  const [editTakeProfit, setEditTakeProfit] = useState("");

  useEffect(() => {
    try { setSkipReview(window.localStorage.getItem("edgeterminal.skip-order-review") === "true"); } catch { /* storage may be unavailable */ }
  }, []);

  useEffect(() => {
    const syncBroker = () => setBroker(getActiveMarketBroker());
    syncBroker();
    window.addEventListener("edge-terminal-broker-change", syncBroker);
    return () => window.removeEventListener("edge-terminal-broker-change", syncBroker);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refreshConnection = async () => {
      setPermission("checking");
      try {
        const endpoint = broker === "exness" ? "/api/exness/status" : "/api/ctrader/status";
        const headers: Record<string, string> = {};
        // Both broker connections are scoped to the signed-in Firebase user.
        if (!auth?.currentUser) throw new Error("Sign in to verify your broker connection.");
        headers.Authorization = `Bearer ${await getIdToken(auth.currentUser)}`;
        const response = await fetch(endpoint, { headers, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data?.connected) {
          if (active) setPermission("offline");
          return;
        }
        if (!active) return;
        if (broker === "ctrader") { setPermission("trading"); }
        else setPermission("trading");
      } catch {
        if (active) setPermission("offline");
      }
    };
    void refreshConnection();
    timer = setInterval(() => { void refreshConnection(); }, 20000);
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [broker]);

  useEffect(() => { setSl(stop); }, [stop]);
  useEffect(() => { setEntryPrice(entry); }, [entry]);
  useEffect(() => { if (lots > 0 && Number.isFinite(lots)) setVolume(lots.toFixed(2)); }, [lots]);
  const riskCash = useMemo(() => Math.max(0, Number(capital) || 0) * Math.max(0, Number(risk) || 0) / 100, [capital, risk]);
  const locked = permission !== "trading" || busy;
  const brokerName = broker === "exness" ? "Exness" : "cTrader";
  const permissionLabel = permission === "checking" ? "Checking account…" : permission === "offline" ? `${brokerName} not connected` : permission === "trading" ? "Broker trading API available · selected account type is respected" : "VIEW ONLY";

  const brokerRequest = async (url: string, init: RequestInit = {}) => {
    if (!auth?.currentUser) throw new Error("Sign in first.");
    const token = await getIdToken(auth.currentUser);
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) }, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "Broker request failed.");
    return data;
  };
  const loadRecords = async (kind: "positions" | "history") => {
    setBusy(true); setNotice("");
    try {
      const range = kind === "history" ? `&days=${historyDays}` : "";
      if (kind === "history") setHistoryPage(1);
      if (broker === "exness") { const result = await brokerRequest(`/api/exness/trading?kind=${kind}${range}`); const d=result.data||{}; setRecords(kind === "history" ? (result.records||d.items||d.deals||d.deal||[]).filter((r:any)=>r.isClosedDeal===true || /close|closed/i.test(String(r.dealRole||r.action||r.dealAction||""))) : (result.records||d.position||d.positions||[])); }
      else { if (!accountId) throw new Error("Select a cTrader account first."); const result=await brokerRequest(`/api/ctrader/trading?kind=${kind}&accountId=${encodeURIComponent(accountId)}${range}`); setRecords(kind === "history" ? (result.data.deals||[]).filter((r:any)=>r.isClosedDeal===true || r.dealRole==="Close") : (result.data.positions||[])); if (kind === "history" && result.data.note) setNotice(result.data.note); }
    } catch(e) { setNotice(e instanceof Error ? e.message : "Unable to load broker data."); setRecords([]); } finally { setBusy(false); }
  };
  const openModifyPosition = (position:any) => {
    setEditingPosition(position);
    setEditStopLoss(position.stopLoss == null ? "" : String(position.stopLoss));
    setEditTakeProfit(position.takeProfit == null ? "" : String(position.takeProfit));
    setNotice("");
  };
  const modifyPosition = async () => {
    if (!editingPosition || broker !== "ctrader" || !accountId) return;
    const stopLoss = editStopLoss.trim() ? Number(editStopLoss) : undefined;
    const takeProfit = editTakeProfit.trim() ? Number(editTakeProfit) : undefined;
    if (stopLoss === undefined && takeProfit === undefined) { setNotice("Enter at least one new stop loss or take profit price."); return; }
    if ((stopLoss !== undefined && (!Number.isFinite(stopLoss) || stopLoss <= 0)) || (takeProfit !== undefined && (!Number.isFinite(takeProfit) || takeProfit <= 0))) { setNotice("Stop loss and take profit must be positive prices."); return; }
    setBusy(true); setNotice("");
    try {
      const result = await brokerRequest("/api/ctrader/trading", { method: "POST", body: JSON.stringify({ action: "modify", accountId, positionId: String(editingPosition.positionId), stopLoss, takeProfit }) });
      setNotice(result.note || "Position modification submitted. Refresh to verify the broker's updated SL/TP.");
      setEditingPosition(null);
      await loadRecords("positions");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Unable to modify position."); }
    finally { setBusy(false); }
  };
  const closePosition = async (position:any) => {
    setBusy(true);setNotice("");try { if(broker==="exness"){await brokerRequest(`/api/exness/trading?positionId=${encodeURIComponent(String(position.position_id||position.positionId||position.id||""))}`,{method:"DELETE"});}else{await brokerRequest("/api/ctrader/trading",{method:"POST",body:JSON.stringify({action:"close",accountId,positionId:String(position.positionId),volume:Number(position.volume||0)/100})});}setNotice("Close request accepted. Refresh positions to verify final state.");await loadRecords("positions");}catch(e){setNotice(e instanceof Error?e.message:"Unable to close position.");}finally{setBusy(false);}
  };
  const reviewOrSubmitOrder = () => {
    if (skipReview) void submitOrder();
    else setConfirm(true);
  };
  const confirmAndSubmitOrder = async () => { await submitOrder(); };
  const updateSkipReview = (checked: boolean) => {
    setSkipReview(checked);
    try { window.localStorage.setItem("edgeterminal.skip-order-review", checked ? "true" : "false"); } catch { /* preference remains active for this session */ }
  };
  const submitOrder = async () => {
    setBusy(true); setNotice("");
    try {
      if (broker === "exness") { const result=await brokerRequest("/api/exness/trading",{method:"POST",body:JSON.stringify({instrument:symbol.replace("/",""),side:side.toLowerCase(),type:executionType.toLowerCase(),volume,price:executionType==="MARKET"?undefined:Number(entryPrice),stopLoss:sl?Number(sl):undefined,takeProfit:tp?Number(tp):undefined})}); setNotice(result.note || "Exness accepted the order request; check final operation status."); }
      else { if(!accountId) throw new Error("Select a cTrader account first."); const result=await brokerRequest("/api/ctrader/trading",{method:"POST",body:JSON.stringify({action:"place",accountId,symbol:symbol.replace("/",""),side,type:executionType,volume:Number(volume),price:executionType==="MARKET"?undefined:Number(entryPrice),stopLoss:sl?Number(sl):undefined,takeProfit:tp?Number(tp):undefined})}); setNotice(result.note || "cTrader order request submitted."); }
      setConfirm(false);
    } catch(e) { setNotice(e instanceof Error?e.message:"Order submission failed."); } finally { setBusy(false); }
  };
  useEffect(()=>{ if(broker!=="ctrader")return; void brokerRequest("/api/ctrader/accounts").then(r=>{const linked=(r.accounts||[]);setAccounts(linked);if(!accountId&&linked[0])setAccountId(linked[0].ctidTraderAccountId);}).catch(()=>setAccounts([])); },[broker]);
  useEffect(()=>{ let active=true; if(broker!=="ctrader"||!accountId){setAccountCapital(null);setCapitalError("");return;} setCapitalLoading(true);setCapitalError(""); void brokerRequest(`/api/ctrader/trading?kind=account&accountId=${encodeURIComponent(accountId)}`).then(result=>{if(active)setAccountCapital(result.data||null);}).catch(error=>{if(active){setAccountCapital(null);setCapitalError(error instanceof Error?error.message:"Unable to load account capital.");}}).finally(()=>{if(active)setCapitalLoading(false);}); return ()=>{active=false;}; },[broker,accountId]);
  useEffect(()=>{if(tab==="positions"||tab==="history")void loadRecords(tab);},[tab,broker,accountId,historyDays]);

  return <section className="live-trading-workspace" aria-label="Live trading workspace">
    <header className="ltw-header"><div><span className="ltw-kicker">{brokerName.toUpperCase()}</span><h2>Trading Terminal</h2></div><span className={`ltw-permission ${permission}`}>{permissionLabel}</span></header>
    <nav className="ltw-tabs"><button className={tab === "ticket" ? "active" : ""} onClick={() => setTab("ticket")}>Order ticket</button><button className={tab === "positions" ? "active" : ""} onClick={() => setTab("positions")}>Positions</button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button></nav>
    {tab === "ticket" ? <div className="ltw-ticket"><div className="ltw-order-fields">{broker === "ctrader" && <label>Trading account<select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Select account</option>{accounts.map(a=><option key={a.ctidTraderAccountId} value={a.ctidTraderAccountId}>{a.brokerTitleShort || "cTrader"} · {a.ctidTraderAccountId}</option>)}</select></label>}<div className="ltw-symbol-row"><b>{symbol.replace("/", "")}</b><span>{broker === "exness" ? "Connected Exness account" : (accounts.find(a=>a.ctidTraderAccountId===accountId)?.isLive ? "cTrader LIVE account" : "cTrader DEMO account")}</span></div>{broker === "ctrader" && <div className="ltw-account-capital" aria-live="polite"><span>Account capital</span><strong>{capitalLoading ? "Loading…" : accountCapital?.balance != null ? accountCapital.balance.toLocaleString(undefined,{minimumFractionDigits:accountCapital.moneyDigits,maximumFractionDigits:accountCapital.moneyDigits}) : "—"}</strong>{capitalError && <small>{capitalError}</small>}</div>}<label>Order type<select value={orderType} onChange={e => setOrderType(e.target.value as typeof orderType)}><option value="BUY_MARKET">Buy Market</option><option value="SELL_MARKET">Sell Market</option><option value="BUY_LIMIT">Buy Limit</option><option value="SELL_LIMIT">Sell Limit</option><option value="BUY_STOP">Buy Stop</option><option value="SELL_STOP">Sell Stop</option></select></label><label>Volume (lots)<input inputMode="decimal" value={volume} onChange={e => setVolume(e.target.value)} /></label><div className="ltw-two"><label>Entry price<input value={entryPrice} readOnly={executionType === "MARKET"} onChange={e=>setEntryPrice(e.target.value)} /></label><label>Stop loss<input value={sl} onChange={e => setSl(e.target.value)} /></label></div><label>Take profit<input value={tp} onChange={e => setTp(e.target.value)} placeholder="Optional price" /></label><div className="ltw-risk-preview"><span>Planned risk budget</span><b>{riskCash.toFixed(2)} · {risk}%</b></div><label className="ltw-skip-review ltw-skip-review-ticket"><input type="checkbox" checked={skipReview} onChange={e=>updateSkipReview(e.target.checked)} /> Skip order confirmation popup</label><button className="ltw-submit" disabled={locked || !(Number(volume) > 0) || !(Number(entryPrice) > 0)} onClick={reviewOrSubmitOrder}>{locked ? "LIVE EXECUTION LOCKED" : `${skipReview ? "SUBMIT" : "REVIEW"} ${side} ORDER`}</button><p className="ltw-disclaimer">Demo and live accounts are supported. Orders are sent only to the connected/selected broker account. Live orders can cause real financial losses. Broker acceptance is not proof of a fill.</p></div><aside className="ltw-summary"><h3>Order summary</h3><dl><dt>Instrument</dt><dd>{symbol}</dd><dt>Direction</dt><dd>{side}</dd><dt>Order</dt><dd>{orderType.replace("_", " ")}</dd><dt>Volume</dt><dd>{volume || "—"} lots</dd><dt>Entry</dt><dd>{entryPrice || "—"}</dd><dt>Stop loss</dt><dd>{sl || "Not set"}</dd><dt>Take profit</dt><dd>{tp || "Not set"}</dd></dl><div className="ltw-warning">Risk sizing is an estimate. Confirm contract size, tick value, margin, spread and broker volume limits before execution.</div></aside></div> : <div className="ltw-empty">{broker === "ctrader" && <label className="ltw-data-account">Trading account<select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Select cTrader account</option>{accounts.map(a=><option key={a.ctidTraderAccountId} value={a.ctidTraderAccountId}>{a.brokerTitleShort || "cTrader"} · {a.ctidTraderAccountId} · {a.isLive ? "LIVE" : "DEMO"}</option>)}</select></label>}<b>{tab === "positions" ? "Open positions" : "Trade history"}</b><button disabled={busy || (broker === "ctrader" && !accountId)} onClick={()=>void loadRecords(tab)}>{busy?"Loading…":"Refresh"}</button>{broker === "ctrader" && accountId && <p className="ltw-account-context">Showing {accounts.find(a=>a.ctidTraderAccountId===accountId)?.isLive ? "LIVE" : "DEMO"} account {accountId}</p>}{tab === "history" && <div className="ltw-history-controls"><label>Show last <select value={historyDays} disabled={busy} onChange={e=>{setHistoryDays(Number(e.target.value));setHistoryPage(1);}}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select></label><span>{records.length} closed trades · 10 per page</span></div>}{notice&&<p role="status">{notice}</p>}{records.length===0&&!notice?<p>No {tab} returned by the selected broker.</p>:records.length===0?null:tab==="history"?<div className="ltw-records"><div className="ltw-history-table-wrap"><table className="ltw-history-table"><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Deal</th><th>Volume</th><th>Execution price</th><th>Realized P&amp;L</th><th>Commission</th><th>Net P&amp;L</th><th>Status</th></tr></thead><tbody>{visibleHistoryRecords.map((r:any,i:number)=><tr key={String(r.dealId||i)}><td>{r.time?new Date(r.time).toLocaleString():"—"}</td><td>{r.symbolName||r.symbol||r.symbolId||"—"}</td><td>{r.side||r.tradeSide||"—"}</td><td>{r.dealRole|| (r.closePositionDetail?"Close":"Execution")}</td><td>{r.volumeUnits!=null?Number(r.volumeUnits).toLocaleString():r.volume??"—"}</td><td>{r.price??r.executionPrice??"—"}</td><td>{formatHistoryMoney(r.realizedPnl ?? r.grossPnl ?? r.pnl)}</td><td>{formatHistoryMoney(r.commission)}</td><td>{formatHistoryMoney(r.netPnl ?? r.pnl)}</td><td>{r.status??r.dealStatus??"Executed"}</td></tr>)}</tbody></table></div><div className="ltw-history-pagination"><button type="button" disabled={historyPage<=1||busy} onClick={()=>setHistoryPage(p=>Math.max(1,p-1))}>Previous</button><span>Page {historyPage} of {historyPageCount}</span><button type="button" disabled={historyPage>=historyPageCount||busy} onClick={()=>setHistoryPage(p=>Math.min(historyPageCount,p+1))}>Next</button></div></div>:<div className="ltw-records ltw-position-list">{records.map((r:any,i:number)=><article className="ltw-position-card" key={String(r.positionId||r.dealId||i)}>
            <header><strong>{r.symbolName||r.symbol||r.symbolId||"Unknown symbol"}</strong><span className={r.side==="SELL"?"ltw-side-sell":"ltw-side-buy"}>{r.side||"—"}</span><small>Position #{r.positionId||"—"}</small></header>
            <dl>
              <div><dt>Volume</dt><dd>{r.volumeUnits!=null?`${Number(r.volumeUnits).toLocaleString()} units`:"—"}</dd></div>
              <div><dt>Entry price</dt><dd>{r.entryPrice??r.price??"—"}</dd></div>
              <div><dt>Stop loss</dt><dd>{r.stopLoss??"—"}</dd></div>
              <div><dt>Take profit</dt><dd>{r.takeProfit??"—"}</dd></div>
              <div><dt>Swap</dt><dd>{r.swap??"—"}</dd></div>
              <div><dt>Commission</dt><dd>{r.commission??"—"}</dd></div>
              <div><dt>Unrealized P&amp;L</dt><dd>{r.unrealizedPnl??"Not provided by broker"}</dd></div>
            </dl>
            <div className="ltw-position-actions">
              <button type="button" disabled={busy||!r.positionId} onClick={()=>openModifyPosition(r)}>Modify SL / TP</button>
              <button type="button" disabled={busy||!r.positionId||!(Number(r.volume)>0)} onClick={()=>void closePosition(r)}>Close position</button>
            </div>
          </article>)}</div>}</div>}

    {editingPosition && <div className="ltw-confirm-backdrop" role="presentation"><div className="ltw-confirm" role="dialog" aria-modal="true" aria-labelledby="ltw-modify-title"><h3 id="ltw-modify-title">Modify position #{editingPosition.positionId}</h3><p>{editingPosition.symbolName || editingPosition.symbolId || "Position"} · {editingPosition.side || "—"}</p><label>Stop loss<input inputMode="decimal" value={editStopLoss} onChange={e=>setEditStopLoss(e.target.value)} placeholder="Leave unchanged" /></label><label>Take profit<input inputMode="decimal" value={editTakeProfit} onChange={e=>setEditTakeProfit(e.target.value)} placeholder="Leave unchanged" /></label><p className="ltw-warning">Only fields with a price are sent for modification. Blank fields are left unchanged. Check the direction and price before applying changes to a live position.</p><button disabled={busy} onClick={()=>setEditingPosition(null)}>Cancel</button><button disabled={busy || (!editStopLoss.trim() && !editTakeProfit.trim())} onClick={()=>void modifyPosition()}>{busy ? "Updating…" : "Update position"}</button></div></div>}
    {confirm && <div className="ltw-confirm-backdrop" role="presentation"><div className="ltw-confirm" role="dialog" aria-modal="true" aria-labelledby="ltw-confirm-title"><h3 id="ltw-confirm-title">Review live order</h3><p>{side} {volume} lots of {symbol} · {orderType.replace("_", " ")}</p><p>Entry {entryPrice} · SL {sl || "none"} · TP {tp || "none"}</p><p className="ltw-warning">You are submitting to the selected broker account. If this is a LIVE account, this order can cause real financial losses. Verify symbol, volume, SL/TP and account before confirming. Broker acceptance does not guarantee execution.</p><button disabled={busy} onClick={() => setConfirm(false)}>Cancel</button><button disabled={busy} onClick={()=>void confirmAndSubmitOrder()}>{busy?"Submitting…":"Confirm order"}</button></div></div>}
  </section>;
}
