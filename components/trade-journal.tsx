"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Camera, CheckCircle2, Clock3, Info, Trash2, TrendingDown, TrendingUp } from "lucide-react";

type TradeSide = "Long" | "Short";
type TradeOutcome = "Open" | "Win" | "Loss";
type Trade = {
  id: string;
  asset: string;
  side: TradeSide;
  entryPrice: number;
  sizeLots: number;
  emotion: string;
  session: string;
  notes: string;
  createdAt: string;
  outcome: TradeOutcome;
  chartAsset: string;
  chartInterval: string;
};

const STORAGE_KEY = "edge-terminal-trade-journal-v1";
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TradeJournal({ asset, interval }: { asset: string; interval: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState({ asset: asset === "XAG/USD" ? "SILVER" : "GOLD", side: "Long" as TradeSide, entryPrice: "3995.38", sizeLots: "1.0", emotion: "Neutral", session: "New York", notes: "" });
  const [insights, setInsights] = useState("");
  const [insightBusy, setInsightBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setTrades(parsed);
      }
    } catch (error) {
      console.error("Could not load trade journal", error);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    } catch (error) {
      console.error("Could not save trade journal", error);
      setNotice("Could not save journal in this browser. Check available local storage.");
    }
  }, [trades, ready]);

  useEffect(() => {
    setForm((old) => ({ ...old, asset: asset === "XAG/USD" ? "SILVER" : "GOLD", entryPrice: asset === "XAG/USD" ? "53.828" : old.entryPrice === "53.828" ? "3995.38" : old.entryPrice }));
  }, [asset]);

  const stats = useMemo(() => {
    const closed = trades.filter((trade) => trade.outcome !== "Open");
    const wins = closed.filter((trade) => trade.outcome === "Win").length;
    const losses = closed.filter((trade) => trade.outcome === "Loss").length;
    return { total: trades.length, open: trades.length - closed.length, closed: closed.length, wins, losses, winRate: closed.length ? Math.round((wins / closed.length) * 100) : null };
  }, [trades]);

  function logTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entryPrice = Number(form.entryPrice.replace(",", "."));
    const sizeLots = Number(form.sizeLots.replace(",", "."));
    if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(sizeLots) || sizeLots <= 0) {
      setNotice("Enter a valid positive entry price and lot size.");
      return;
    }
    const trade: Trade = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      asset: form.asset,
      side: form.side,
      entryPrice,
      sizeLots,
      emotion: form.emotion,
      session: form.session,
      notes: form.notes.trim(),
      createdAt: new Date().toISOString(),
      outcome: "Open",
      chartAsset: asset,
      chartInterval: interval,
    };
    setTrades((old) => [trade, ...old]);
    setForm((old) => ({ ...old, notes: "" }));
    setNotice(`Trade logged with ${trade.chartAsset} · ${trade.chartInterval} chart context. The embedded chart image itself cannot be captured from this browser component.`);
    setInsights("");
  }

  function setOutcome(id: string, outcome: TradeOutcome) {
    setTrades((old) => old.map((trade) => trade.id === id ? { ...trade, outcome } : trade));
  }

  function deleteTrade(id: string) {
    setTrades((old) => old.filter((trade) => trade.id !== id));
  }

  async function generateInsights() {
    setInsightBusy(true);
    setInsights("");
    const emotionCounts = trades.reduce<Record<string, number>>((acc, trade) => { acc[trade.emotion] = (acc[trade.emotion] || 0) + 1; return acc; }, {});
    const commonEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0];
    const localSummary = trades.length === 0
      ? "Log a few trades first. Insights will summarize your win rate, repeated emotions, preferred sessions, and note patterns."
      : `Journal review (${trades.length} trades): ${stats.closed} closed, ${stats.open} still open${stats.winRate === null ? ". There are not enough closed trades to calculate a win rate yet." : `, win rate ${stats.winRate}% (${stats.wins} wins and ${stats.losses} losses).`}${commonEmotion ? ` Most frequently recorded emotion: ${commonEmotion[0]} (${commonEmotion[1]} trades).` : ""} Review whether your notes show a repeatable setup and avoid drawing conclusions from a small sample.`;
    try {
      let key = "";
      try { key = localStorage.getItem("edge-gemini-api-key") || ""; } catch {}
      if (key && trades.length) {
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + encodeURIComponent(key), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Review this trading journal for educational process improvement only. Do not give a live market prediction or promise returns. Distinguish observations from weak evidence, mention small sample limitations, and provide up to three practical review questions. Journal data: " + JSON.stringify(trades.map(({ asset, side, entryPrice, sizeLots, emotion, session, notes, outcome, createdAt }) => ({ asset, side, entryPrice, sizeLots, emotion, session, notes, outcome, createdAt }))) }] }] })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || "AI analysis request failed.");
        setInsights(data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") || localSummary);
      } else {
        setInsights(localSummary + (trades.length ? "\n\nFor AI-assisted review, add your Gemini API key in Edge Terminal Settings. This local summary does not infer profitability." : ""));
      }
    } catch (error) {
      setInsights(localSummary + `\n\nAI analysis was unavailable: ${error instanceof Error ? error.message : "request failed"}.`);
    } finally {
      setInsightBusy(false);
    }
  }

  return (
    <div className="accordion-body trade-journal-body">
      <div className="trade-journal-module">
        <div className="trade-journal-form-card">
          <h3>New Trade Entry</h3>
          <form onSubmit={logTrade}>
            <div className="trade-journal-fields">
              <label>ASSET<select value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })}><option>GOLD</option><option>SILVER</option><option>EUR/USD</option><option>GBP/USD</option><option>BTC/USD</option><option>OTHER</option></select></label>
              <label>SIDE<select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as TradeSide })}><option>Long</option><option>Short</option></select></label>
              <label>ENTRY PRICE<input value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} inputMode="decimal" placeholder="e.g. 3995.38" /></label>
              <label>SIZE (LOTS)<input value={form.sizeLots} onChange={(e) => setForm({ ...form, sizeLots: e.target.value })} inputMode="decimal" placeholder="1.0" /></label>
              <label>EMOTION<select value={form.emotion} onChange={(e) => setForm({ ...form, emotion: e.target.value })}><option>Neutral</option><option>Confident</option><option>Patient</option><option>Anxious</option><option>Fearful</option><option>FOMO</option><option>Frustrated</option></select></label>
              <label>SESSION<select value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })}><option>New York</option><option>London</option><option>Asia</option><option>London / New York overlap</option><option>Other</option></select></label>
              <label className="trade-journal-notes-field">NOTES<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Confluence at 15m order block" /></label>
            </div>
            <button className="trade-journal-save" type="submit"><Camera size={17} /> Log Trade & Capture Chart Context</button>
            <p className="trade-journal-capture-note"><Info size={13} /> Records the selected chart symbol and timeframe. Browser security prevents this component from taking a screenshot inside the embedded TradingView chart.</p>
          </form>
        </div>

        <div className="trade-journal-insights-card">
          <div className="trade-journal-insights-title"><span><BrainCircuit size={19} /> AI Trading Insights</span><button onClick={generateInsights} disabled={insightBusy}>{insightBusy ? "Analyzing…" : "Generate Analysis"}</button></div>
          {insights && <div className="trade-journal-insights-result">{insights}</div>}
        </div>

        <div className="trade-journal-stats">
          <div><small>TOTAL TRADES</small><strong>{stats.total}</strong></div>
          <div><small>OPEN</small><strong>{stats.open}</strong></div>
          <div><small>WIN RATE</small><strong>{stats.winRate === null ? "—" : `${stats.winRate}%`}</strong></div>
          <div><small>WINS / LOSSES</small><strong><span className="tj-win">{stats.wins}</span> / <span className="tj-loss">{stats.losses}</span></strong></div>
        </div>

        <div className="trade-journal-recent-heading"><h3><Clock3 size={17} /> Recent Trades</h3><span>{ready ? `${trades.length} saved locally` : "Loading journal…"}</span></div>
        {trades.length === 0 ? (
          <div className="trade-journal-empty">No trades logged yet.</div>
        ) : (
          <div className="trade-journal-table-wrap">
            <table className="trade-journal-table">
              <thead><tr><th>TRADE</th><th>ENTRY</th><th>SIZE</th><th>SESSION / EMOTION</th><th>CHART CONTEXT</th><th>OUTCOME</th><th>ACTIONS</th></tr></thead>
              <tbody>{trades.map((trade) => <tr key={trade.id}>
                <td><span className={`trade-journal-side ${trade.side.toLowerCase()}`}>{trade.side === "Long" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{trade.side}</span><b>{trade.asset}</b><small>{new Date(trade.createdAt).toLocaleString()}</small>{trade.notes && <p>{trade.notes}</p>}</td>
                <td>{money(trade.entryPrice)}</td><td>{trade.sizeLots.toLocaleString(undefined, { maximumFractionDigits: 3 })} lots</td>
                <td>{trade.session}<small>{trade.emotion}</small></td><td>{trade.chartAsset}<small>{trade.chartInterval} · context only</small></td>
                <td><select aria-label={`Outcome for ${trade.asset} trade`} value={trade.outcome} onChange={(e) => setOutcome(trade.id, e.target.value as TradeOutcome)} className={`trade-journal-outcome ${trade.outcome.toLowerCase()}`}><option>Open</option><option>Win</option><option>Loss</option></select></td>
                <td><button className="trade-journal-delete" onClick={() => deleteTrade(trade.id)} aria-label={`Delete ${trade.asset} trade`} title="Delete trade"><Trash2 size={15} /></button></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="trade-journal-footer"><span><CheckCircle2 size={14} /> Saved in this browser</span><span>Journal records are local to this device and browser.</span></div>
        {notice && <div className="trade-journal-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></div>}
      </div>
    </div>
  );
}
