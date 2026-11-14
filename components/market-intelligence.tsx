"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import type { MarketForecast } from "@/lib/market-intelligence/engine";
import { Activity, AlertTriangle, Clock3, RefreshCw, ShieldCheck, Target, Waves } from "lucide-react";

type Props = { asset: "XAU/USD" | "XAG/USD"; interval: string; broker: "ctrader" | "exness" };
type LiquidityMap = { equalHighs: number[]; equalLows: number[]; pools: Array<{ side: string; level: number; touches: number; distancePercent: number; strength: string }>; fairValueGaps: Array<{ direction: string; low: number; high: number; time: string; strength: number; status: string; distancePercent: number }>; orderBlocks: Array<{ direction: string; low: number; high: number; time: string; status: string; displacementRatio: number }>; sweepEvents: Array<{ side: string; level: number; time: string; confirmed: boolean; quality: string }>; displacement: string; displacementRatio: number; sweep: string; brokerVolume: { available: boolean; latest: number | null; median: number | null; relative: number | null; directionalBias: string }; note: string };
type FlowEvidence = { candidateCount: number; storedTradeCount: number; providerStatus: string; dataNote: string; candidates: Array<{ type: string; price: number; strength: string; evidence: string }> };

const fmt = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// API payloads can come from a locally cached/older dev server during upgrades.
// Normalize optional history counters before formatting so a missing field never
// crashes the entire dashboard render.
const formatCount = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(0, Math.trunc(safe)).toLocaleString("en-US");
};

export default function MarketIntelligence({ asset, interval, broker }: Props) {
  const [forecast, setForecast] = useState<MarketForecast | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("");
  const [flowEvidence, setFlowEvidence] = useState<FlowEvidence | null>(null);
  const [liquidityMap, setLiquidityMap] = useState<LiquidityMap | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const user = auth?.currentUser;
      if (!user) throw new Error("Sign in to analyze your connected broker history.");
      const token = await user.getIdToken();
      const query = new URLSearchParams({ symbol: asset, interval, provider: broker });
      const [response, footprintResponse] = await Promise.all([
        fetch(`/api/market-intelligence?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`/api/orderflow/absorption?instrument=${asset === "XAU/USD" ? "GC" : "SI"}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }).catch(() => null),
      ]);
      const body = await response.json();
      if (!response.ok || !body.forecast) throw new Error(body.error || "Market analysis is unavailable.");
      setForecast(body.forecast as MarketForecast);
      setLiquidityMap(body.liquidityMap as LiquidityMap || null);
      try {
        if (footprintResponse?.ok) {
          const flow = await footprintResponse.json();
          setFlowEvidence({
            candidateCount: Number(flow.candidateCount || 0),
            storedTradeCount: Number(flow.storedTradeCount || 0),
            providerStatus: String(flow.providerStatus || "unknown"),
            dataNote: `${String(flow.dataNote || "Stored Order Flow trade-print candidates.")}${flow.providerError ? ` Provider error: ${String(flow.providerError)}` : ""}`,
            candidates: Array.isArray(flow.candidates) ? flow.candidates.slice(0, 3) : [],
          });
        } else setFlowEvidence(null);
      } catch {
        setFlowEvidence(null);
      }
      setUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setForecast(null);
      setError(e instanceof Error ? e.message : "Market analysis failed.");
    } finally {
      setBusy(false);
    }
  }, [asset, interval, broker]);

  useEffect(() => { void load(); }, [load]);

  const digits = asset === "XAU/USD" ? 2 : 3;
  // A browser can briefly receive a stale API payload while Next.js recompiles
  // after an upgrade. Treat newly-added research fields as optional so one
  // missing field cannot crash the whole dashboard.
  const researchVariants = Array.isArray(forecast?.strategyBacktest?.researchVariants)
    ? forecast.strategyBacktest.researchVariants
    : [];
  const researchMethodology = forecast?.strategyBacktest?.researchMethodology
    || "Research variants are not present in this API response. Restart the dev server to load the current analysis route.";
  const actionClass = forecast?.action.toLowerCase() || "wait";
  const downloadTradeLedger = () => {
    const rows = forecast?.strategyBacktest.tradeLedger || [];
    if (!rows.length) return;
    const columns = ["id", "sample", "signalTime", "entryTime", "exitTime", "direction", "entry", "stop", "target", "outcome", "returnR", "session", "regime", "structureBreak", "trendAligned", "fvg"] as const;
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `market-intelligence-${asset.replace("/", "")}-${interval}-${broker}-trades.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const downloadEntryQuality = () => {
    const rows = Array.isArray(forecast?.strategyBacktest?.entryQuality) ? forecast.strategyBacktest.entryQuality : [];
    if (!rows.length) return;
    const columns = ["instrument", "broker", "timeframe", "variant", "rule", "trades", "developmentTrades", "developmentExpectancyR", "outOfSampleTrades", "outOfSampleExpectancyR", "outOfSampleWinRatePercent", "outOfSampleProfitFactor", "outOfSampleMaxDrawdownR", "netExpectancyAt010RCost", "medianDisplacementATR", "medianEntryGapATR", "medianSweepDepthATR", "medianReclaimATR", "filteredOutCandidates", "filteredOutWins", "filteredOutLosses", "evidenceStatus"] as const;
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csvRows = rows.map((row) => ({ instrument: asset, broker, timeframe: interval, variant: row.name, rule: row.rule,
      trades: row.trades, developmentTrades: row.developmentTrades, developmentExpectancyR: row.developmentExpectancyR,
      outOfSampleTrades: row.outOfSampleTrades, outOfSampleExpectancyR: row.outOfSampleExpectancyR,
      outOfSampleWinRatePercent: row.outOfSampleWinRate, outOfSampleProfitFactor: row.outOfSampleProfitFactor,
      outOfSampleMaxDrawdownR: row.outOfSampleMaxDrawdownR, netExpectancyAt010RCost: row.netExpectancyAt010R,
      medianDisplacementATR: row.medianDisplacementAtr, medianEntryGapATR: row.medianEntryGapAtr, medianSweepDepthATR: row.medianSweepDepthAtr, medianReclaimATR: row.medianReclaimAtr, filteredOutCandidates: row.filteredOutCandidates, filteredOutWins: row.filteredOutWins, filteredOutLosses: row.filteredOutLosses, evidenceStatus: row.status }));
    const csv = [columns.join(","), ...csvRows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `market-intelligence-${asset.replace("/", "")}-${interval}-${broker}-entry-quality.csv`;
    anchor.click(); URL.revokeObjectURL(url);
  };
  const downloadLiquidityContext = () => {
    const rows = Array.isArray(forecast?.strategyBacktest?.liquidityContext) ? forecast.strategyBacktest.liquidityContext : [];
    if (!rows.length) return;
    const columns = ["instrument", "broker", "timeframe", "context", "rule", "trades", "developmentTrades", "developmentExpectancyR", "outOfSampleTrades", "outOfSampleExpectancyR", "outOfSampleWinRatePercent", "outOfSampleProfitFactor", "outOfSampleMaxDrawdownR", "netExpectancyAt010RCost", "evidenceStatus"] as const;
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csvRows = rows.map(row => ({ instrument: asset, broker, timeframe: interval, context: row.name, rule: row.rule, trades: row.trades, developmentTrades: row.developmentTrades, developmentExpectancyR: row.developmentExpectancyR, outOfSampleTrades: row.outOfSampleTrades, outOfSampleExpectancyR: row.outOfSampleExpectancyR, outOfSampleWinRatePercent: row.outOfSampleWinRate, outOfSampleProfitFactor: row.outOfSampleProfitFactor, outOfSampleMaxDrawdownR: row.outOfSampleMaxDrawdownR, netExpectancyAt010RCost: row.netExpectancyAt010R, evidenceStatus: row.status }));
    const csv = [columns.join(","), ...csvRows.map(row => columns.map(column => escape(row[column])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `market-intelligence-${asset.replace("/", "")}-${interval}-${broker}-liquidity-context.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const downloadAdvancedValidation = () => {
    const report = forecast?.strategyBacktest?.advancedValidation;
    if (!report?.variants?.length) return;
    const columns = ["instrument","broker","timeframe","strategy","rule","trades","developmentTrades","validationTrades","finalTestTrades","developmentExpectancyR","validationExpectancyR","finalTestExpectancyR","finalTestWinRate","finalTestProfitFactor","finalTestMaxDrawdownR","netFinalTestAt010R","filteredCandidates","status"] as const;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = report.variants.map(row => ({ instrument: asset, broker, timeframe: interval, strategy: row.name, ...row }));
    const csv = [columns.join(","), ...rows.map(row => columns.map(col => esc((row as Record<string, unknown>)[col])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`market-intelligence-${asset.replace("/","")}-${interval}-${broker}-v22-advanced-validation.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const downloadRiskSensitivity = () => {
    const rows = Array.isArray(forecast?.strategyBacktest?.riskSensitivity)
      ? forecast.strategyBacktest.riskSensitivity
      : [];
    if (!rows.length) return;
    const columns = [
      "instrument", "broker", "timeframe", "configuration", "stopModel", "targetR",
      "totalTrades", "developmentTrades", "developmentExpectancyR", "outOfSampleTrades",
      "outOfSampleExpectancyR", "outOfSampleWinRatePercent", "outOfSampleProfitFactor",
      "outOfSampleMaxDrawdownR", "netExpectancyAt010RCost", "evidenceStatus",
    ] as const;
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csvRows = rows.map((row) => ({
      instrument: asset,
      broker,
      timeframe: interval,
      configuration: row.name,
      stopModel: row.stopModel,
      targetR: row.targetR,
      totalTrades: row.trades,
      developmentTrades: row.developmentTrades,
      developmentExpectancyR: row.developmentExpectancyR,
      outOfSampleTrades: row.outOfSampleTrades,
      outOfSampleExpectancyR: row.outOfSampleExpectancyR,
      outOfSampleWinRatePercent: row.outOfSampleWinRate,
      outOfSampleProfitFactor: row.outOfSampleProfitFactor,
      outOfSampleMaxDrawdownR: row.outOfSampleMaxDrawdownR,
      netExpectancyAt010RCost: row.netExpectancyAt010R,
      evidenceStatus: row.status,
    }));
    const csv = [columns.join(","), ...csvRows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `market-intelligence-${asset.replace("/", "")}-${interval}-${broker}-risk-sensitivity.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="market-intelligence">
      <header className="mi-header">
        <div className="mi-heading">
          <span className="mi-icon"><Activity size={19}/></span>
          <div><h2>Market Intelligence</h2><p>Historical pattern evidence · market structure · broker candle history</p></div>
        </div>
        <button className="mi-refresh" onClick={() => void load()} disabled={busy}><RefreshCw size={14} className={busy ? "mi-spinning" : ""}/>{busy ? "Analyzing" : "Refresh forecast"}</button>
      </header>
      <div className="mi-context"><span>{asset.replace("/", "")}</span><span>{broker === "ctrader" ? "cTrader" : "Exness"}</span><span>{interval}</span><span>{forecast?.data.candles ?? "…"} broker candles</span>{updated && <span>Updated {updated}</span>}</div>
      {error ? <div className="mi-error"><AlertTriangle size={17}/><span>{error}</span></div> : busy && !forecast ? <div className="mi-loading">Loading paginated broker history, checking multi-timeframe structure and running walk-forward validation…</div> : forecast ? <>
        <div className="mi-top-grid">
          <div className={`mi-action mi-${actionClass}`}>
            <small>FORECAST</small><strong>{forecast.action}</strong>
            <span>{forecast.confidence}% confluence score · {forecast.validity}</span>
          </div>
          <div className="mi-price-card"><small>LAST CANDLE CLOSE</small><strong>{fmt(forecast.currentPrice, digits)}</strong><span>{forecast.data.source} · {forecast.data.mode}</span></div>
          <div className="mi-price-card"><small>HISTORICAL MATCHES</small><strong>{forecast.historical.samples}</strong><span>{forecast.historical.winRate == null ? "Not enough resolved samples" : `${forecast.historical.winRate}% resolved win rate`}</span></div>
        </div>
        <article className="mi-panel mi-backtest-panel">
          <h3><Target size={15}/> Walk-forward breakout benchmark</h3>
          <div className="mi-stats">
            <span><b>{forecast.backtest.trades}</b> trades</span>
            <span><b>{forecast.backtest.winRate == null ? "—" : `${forecast.backtest.winRate}%`}</b> win rate</span>
            <span><b>{forecast.backtest.expectancyR == null ? "—" : `${forecast.backtest.expectancyR}R`}</b> expectancy</span>
            <span><b>{forecast.backtest.profitFactor == null ? "—" : forecast.backtest.profitFactor}</b> profit factor</span>
            <span><b>{forecast.backtest.maxDrawdownR}R</b> max drawdown</span>
          </div>
          <p>{forecast.backtest.wins} wins · {forecast.backtest.losses} losses · {forecast.backtest.unresolved} unresolved</p>
          <p>{forecast.backtest.methodology}</p>
        </article>
        <article className="mi-panel mi-backtest-panel">
          <div className="mi-panel-heading-row"><h3><Target size={15}/> Liquidity-confirmation strategy backtest · {asset} · {interval}</h3><button className="mi-export-button" onClick={downloadTradeLedger} disabled={!forecast.strategyBacktest.tradeLedger.length}>Export trade ledger CSV</button></div>
          <div className="mi-stats">
            <span><b>{forecast.strategyBacktest.trades}</b> trades</span>
            <span><b>{forecast.strategyBacktest.winRate == null ? "—" : `${forecast.strategyBacktest.winRate}%`}</b> win rate</span>
            <span><b>{forecast.strategyBacktest.expectancyR == null ? "—" : `${forecast.strategyBacktest.expectancyR}R`}</b> expectancy</span>
            <span><b>{forecast.strategyBacktest.profitFactor == null ? "—" : forecast.strategyBacktest.profitFactor}</b> profit factor</span>
            <span><b>{forecast.strategyBacktest.maxDrawdownR}R</b> max drawdown</span>
          </div>
          <p>{forecast.strategyBacktest.wins} wins · {forecast.strategyBacktest.losses} losses · {forecast.strategyBacktest.unresolved} unresolved</p>
          <p>{forecast.strategyBacktest.methodology}</p>
          <div className="mi-validation-grid">
            <div><small>DEVELOPMENT PERIOD · FIRST 70%</small><b>{forecast.strategyBacktest.inSample.trades} trades</b><span>{forecast.strategyBacktest.inSample.expectancyR == null ? "—" : `${forecast.strategyBacktest.inSample.expectancyR}R`} expectancy · {forecast.strategyBacktest.inSample.winRate == null ? "—" : `${forecast.strategyBacktest.inSample.winRate}%`} win rate</span></div>
            <div><small>OUT-OF-SAMPLE · FINAL 30%</small><b>{forecast.strategyBacktest.outOfSample.trades} trades</b><span>{forecast.strategyBacktest.outOfSample.expectancyR == null ? "—" : `${forecast.strategyBacktest.outOfSample.expectancyR}R`} expectancy · {forecast.strategyBacktest.outOfSample.winRate == null ? "—" : `${forecast.strategyBacktest.outOfSample.winRate}%`} win rate</span></div>
          </div>
          <p><b>Sample adequacy: {forecast.strategyBacktest.sampleAdequacy.replace("-", " ").toUpperCase()}</b> · Out-of-sample profit factor {forecast.strategyBacktest.outOfSample.profitFactor == null ? "—" : forecast.strategyBacktest.outOfSample.profitFactor} · OOS drawdown {forecast.strategyBacktest.outOfSample.maxDrawdownR}R</p>
          <div className="mi-stats">{forecast.strategyBacktest.costSensitivity.map((item) => <span key={item.costR}><b>{item.netExpectancyR == null ? "—" : `${item.netExpectancyR}R`}</b> net expectancy at {item.costR.toFixed(2)}R assumed cost</span>)}</div>
          {forecast.strategyBacktest.monthly.length > 0 && <div className="mi-validation-months">{forecast.strategyBacktest.monthly.map((month) => <span key={month.month}><b>{month.month}</b> {month.trades} trades · {month.expectancyR}R</span>)}</div>}
          <h4 className="mi-diagnostic-heading">Strategy research · fixed confirmation ablations</h4>
          <p>These are pre-declared research variants using the same sweep-and-displacement candidate universe. They are not live signals and the best-looking row must not be selected from this same holdout.</p>
          <div className="mi-research-table-wrap">
            <table className="mi-research-table">
              <thead><tr><th>Fixed rule</th><th>Trades</th><th>Dev exp.</th><th>OOS trades</th><th>OOS exp.</th><th>OOS win</th><th>PF</th><th>DD</th><th>Net exp. @0.10R</th><th>Evidence</th></tr></thead>
              <tbody>{researchVariants.map((variant) => <tr key={variant.name}>
                <td title={variant.rule}>{variant.name}</td><td>{variant.trades}</td>
                <td>{variant.developmentExpectancyR == null ? "—" : `${variant.developmentExpectancyR}R`}</td>
                <td>{variant.outOfSampleTrades}</td><td>{variant.outOfSampleExpectancyR == null ? "—" : `${variant.outOfSampleExpectancyR}R`}</td>
                <td>{variant.outOfSampleWinRate == null ? "—" : `${variant.outOfSampleWinRate}%`}</td>
                <td>{variant.outOfSampleProfitFactor == null ? "—" : variant.outOfSampleProfitFactor}</td>
                <td>{variant.outOfSampleMaxDrawdownR}R</td>
                <td>{variant.outOfSampleNetExpectancyAt010R == null ? "—" : `${variant.outOfSampleNetExpectancyAt010R}R`}</td>
                <td><span className={`mi-research-status mi-research-${variant.status}`}>{variant.status}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          <p>{researchMethodology}</p>
          <div className="mi-panel-heading-row mi-risk-export-heading"><h4 className="mi-diagnostic-heading">Risk parameter sensitivity · fixed entry candidates</h4><button className="mi-export-button" onClick={downloadRiskSensitivity} disabled={!Array.isArray(forecast.strategyBacktest.riskSensitivity) || forecast.strategyBacktest.riskSensitivity.length === 0}>Export risk sensitivity CSV</button></div>
          <p>Compares structural versus 1.0 ATR stops and 1R, 1.5R, 2R and 3R targets on the same causal sweep/displacement candidate universe. Each row is simulated independently with next-bar-open entries, a fixed maximum holding horizon and adverse-first same-candle ties. This isolates exit parameters; it does not prove the best setting or change live signals.</p>
          <div className="mi-research-table-wrap">
            <table className="mi-research-table">
              <thead><tr><th>Risk model</th><th>Trades</th><th>Dev trades</th><th>Dev exp.</th><th>OOS trades</th><th>OOS exp.</th><th>OOS win</th><th>PF</th><th>OOS DD</th><th>Net exp. @0.10R</th><th>Evidence</th></tr></thead>
              <tbody>{(forecast.strategyBacktest.riskSensitivity || []).map((item) => <tr key={item.name}>
                <td>{item.name}</td><td>{item.trades}</td><td>{item.developmentTrades}</td>
                <td>{item.developmentExpectancyR == null ? "—" : `${item.developmentExpectancyR}R`}</td>
                <td>{item.outOfSampleTrades}</td><td>{item.outOfSampleExpectancyR == null ? "—" : `${item.outOfSampleExpectancyR}R`}</td>
                <td>{item.outOfSampleWinRate == null ? "—" : `${item.outOfSampleWinRate}%`}</td>
                <td>{item.outOfSampleProfitFactor == null ? "—" : item.outOfSampleProfitFactor}</td>
                <td>{item.outOfSampleMaxDrawdownR}R</td>
                <td>{item.netExpectancyAt010R == null ? "—" : `${item.netExpectancyAt010R}R`}</td>
                <td><span className={`mi-research-status mi-research-${item.status}`}>{item.status}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="mi-panel-heading-row mi-risk-export-heading"><h4 className="mi-diagnostic-heading">Entry quality research · fixed 1.5R exits</h4><button className="mi-export-button" onClick={downloadEntryQuality} disabled={!Array.isArray(forecast.strategyBacktest.entryQuality) || forecast.strategyBacktest.entryQuality.length === 0}>Export entry research CSV</button></div>
          <p>Compares pre-declared entry filters and shallow/balanced/strong sweep-quality thresholds on the same causal sweep/reclaim candidate universe. Every row uses next-bar-open entry, the same structural/volatility stop, fixed 1.5R target, maximum holding horizon and adverse-first same-candle handling. The study does not change live forecasts.</p>
          <div className="mi-research-table-wrap">
            <table className="mi-research-table">
              <thead><tr><th>Entry rule</th><th>Trades</th><th>Dev exp.</th><th>OOS trades</th><th>OOS exp.</th><th>OOS win</th><th>PF</th><th>OOS DD</th><th>Net exp. @0.10R</th><th>Median displacement</th><th>Median entry gap</th><th>Median sweep depth</th><th>Median reclaim</th><th>Filtered candidates</th><th>Filtered wins</th><th>Filtered losses</th><th>Evidence</th></tr></thead>
              <tbody>{(Array.isArray(forecast.strategyBacktest.entryQuality) ? forecast.strategyBacktest.entryQuality : []).map((item) => <tr key={item.name}>
                <td title={item.rule}>{item.name}</td><td>{item.trades}</td><td>{item.developmentExpectancyR == null ? "—" : `${item.developmentExpectancyR}R`}</td>
                <td>{item.outOfSampleTrades}</td><td>{item.outOfSampleExpectancyR == null ? "—" : `${item.outOfSampleExpectancyR}R`}</td>
                <td>{item.outOfSampleWinRate == null ? "—" : `${item.outOfSampleWinRate}%`}</td><td>{item.outOfSampleProfitFactor == null ? "—" : item.outOfSampleProfitFactor}</td>
                <td>{item.outOfSampleMaxDrawdownR}R</td><td>{item.netExpectancyAt010R == null ? "—" : `${item.netExpectancyAt010R}R`}</td>
                <td>{item.medianDisplacementAtr == null ? "—" : `${item.medianDisplacementAtr}×`}</td><td>{item.medianEntryGapAtr == null ? "—" : `${item.medianEntryGapAtr}×`}</td><td>{item.medianSweepDepthAtr == null ? "—" : `${item.medianSweepDepthAtr}×`}</td><td>{item.medianReclaimAtr == null ? "—" : `${item.medianReclaimAtr}×`}</td><td>{item.filteredOutCandidates}</td><td>{item.filteredOutWins}</td><td>{item.filteredOutLosses}</td>
                <td><span className={`mi-research-status mi-research-${item.status}`}>{item.status}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
          <p>{forecast.strategyBacktest.entryQualityMethodology || "Entry-quality research is not present in this API response. Restart the dev server and refresh forecast."}</p>
          <div className="mi-panel-heading-row mi-risk-export-heading"><h4 className="mi-diagnostic-heading">Liquidity sweep context research · fixed 1.5R exits</h4><button className="mi-export-button" onClick={downloadLiquidityContext} disabled={!Array.isArray(forecast.strategyBacktest.liquidityContext) || forecast.strategyBacktest.liquidityContext.length === 0}>Export Liquidity Context CSV</button></div>
          <p>Compares previous-day levels, Asian-session levels (00:00–06:00 UTC), equal-high/low proxies, recent confirmed swings, displacement/BOS context and a same-timeframe higher-timeframe proxy. These are research labels, not live signals. Verify broker timestamp conventions before interpreting UTC sessions.</p>
          <div className="mi-research-table-wrap"><table className="mi-research-table">
            <thead><tr><th>Liquidity context</th><th>Trades</th><th>Dev trades</th><th>Dev exp.</th><th>OOS trades</th><th>OOS exp.</th><th>OOS win</th><th>PF</th><th>OOS DD</th><th>Net exp. @0.10R</th><th>Evidence</th></tr></thead>
            <tbody>{(Array.isArray(forecast.strategyBacktest.liquidityContext) ? forecast.strategyBacktest.liquidityContext : []).map(item => <tr key={item.name}><td title={item.rule}>{item.name}</td><td>{item.trades}</td><td>{item.developmentTrades}</td><td>{item.developmentExpectancyR == null ? "—" : `${item.developmentExpectancyR}R`}</td><td>{item.outOfSampleTrades}</td><td>{item.outOfSampleExpectancyR == null ? "—" : `${item.outOfSampleExpectancyR}R`}</td><td>{item.outOfSampleWinRate == null ? "—" : `${item.outOfSampleWinRate}%`}</td><td>{item.outOfSampleProfitFactor == null ? "—" : item.outOfSampleProfitFactor}</td><td>{item.outOfSampleMaxDrawdownR}R</td><td>{item.netExpectancyAt010R == null ? "—" : `${item.netExpectancyAt010R}R`}</td><td><span className={`mi-research-status mi-research-${item.status}`}>{item.status}</span></td></tr>)}</tbody>
          </table></div>
          <p>{forecast.strategyBacktest.liquidityContextMethodology || "Liquidity context results are not present in this API response. Restart the dev server and refresh forecast."}</p>
          <div className="mi-panel-heading-row mi-risk-export-heading"><h4 className="mi-diagnostic-heading">v22 · Advanced validation research</h4><button className="mi-export-button" onClick={downloadAdvancedValidation} disabled={!forecast.strategyBacktest.advancedValidation?.variants?.length}>Export v22 validation CSV</button></div>
          <p>Combined v19–v22 research: predeclared liquidity-confluence rules, multi-timeframe coverage, XAU/XAG comparison coverage and a chronological 60% development / 20% validation / 20% final-test split. Final-test data is not used to select settings. Fixed next-bar entry, 1.5R target, structural/volatility stop, 12-bar horizon and adverse-first same-candle handling. The 0.10R cost is illustrative, not your broker's measured spread or commission.</p>
          <div className="mi-stats"><span><b>{forecast.strategyBacktest.advancedValidation?.candles ?? 0}</b> valid candles</span><span>Development ends: <b>{forecast.strategyBacktest.advancedValidation?.split?.developmentEnd ? new Date(forecast.strategyBacktest.advancedValidation.split.developmentEnd).toLocaleDateString() : "—"}</b></span><span>Validation ends: <b>{forecast.strategyBacktest.advancedValidation?.split?.validationEnd ? new Date(forecast.strategyBacktest.advancedValidation.split.validationEnd).toLocaleDateString() : "—"}</b></span><span>Final test starts: <b>{forecast.strategyBacktest.advancedValidation?.split?.finalTestStart ? new Date(forecast.strategyBacktest.advancedValidation.split.finalTestStart).toLocaleDateString() : "—"}</b></span><span>Comparison instrument candles: <b>{forecast.strategyBacktest.advancedValidation?.comparisonCoverage?.candles ?? 0}</b></span></div>
          <div className="mi-research-table-wrap"><table className="mi-research-table"><thead><tr><th>Predeclared confluence</th><th>Total</th><th>Dev</th><th>Validation</th><th>Final test</th><th>Dev exp.</th><th>Validation exp.</th><th>Final exp.</th><th>Final win</th><th>PF</th><th>DD</th><th>Net @0.10R</th><th>Evidence</th></tr></thead><tbody>{(forecast.strategyBacktest.advancedValidation?.variants || []).map(row=><tr key={row.name}><td title={row.rule}>{row.name}</td><td>{row.trades}</td><td>{row.developmentTrades}</td><td>{row.validationTrades}</td><td>{row.finalTestTrades}</td><td>{row.developmentExpectancyR ?? "—"}</td><td>{row.validationExpectancyR ?? "—"}</td><td>{row.finalTestExpectancyR ?? "—"}</td><td>{row.finalTestWinRate == null ? "—" : `${row.finalTestWinRate}%`}</td><td>{row.finalTestProfitFactor ?? "—"}</td><td>{row.finalTestMaxDrawdownR}R</td><td>{row.netFinalTestAt010R ?? "—"}</td><td>{row.status}</td></tr>)}</tbody></table></div>
          <p>{forecast.strategyBacktest.advancedValidation?.methodology || "Advanced validation data is unavailable."}</p>
          <h4 className="mi-diagnostic-heading">Why did the strategy win or lose?</h4>
          <p>Diagnostic breakdowns use the same historical trades above. Small groups are descriptive only and should not be treated as statistically reliable.</p>
          <div className="mi-diagnostic-grid">
            <section><b>Direction</b>{forecast.strategyBacktest.diagnostics.byDirection.length ? forecast.strategyBacktest.diagnostics.byDirection.map((item) => <span key={item.label}><strong>{item.label}</strong> {item.trades} trades · {item.expectancyR ?? "—"}R · {item.winRate ?? "—"}% wins</span>) : <span>No trades</span>}</section>
            <section><b>Trading session</b>{forecast.strategyBacktest.diagnostics.bySession.length ? forecast.strategyBacktest.diagnostics.bySession.map((item) => <span key={item.label}><strong>{item.label}</strong> {item.trades} trades · {item.expectancyR ?? "—"}R · {item.winRate ?? "—"}% wins</span>) : <span>No trades</span>}</section>
            <section><b>Market regime</b>{forecast.strategyBacktest.diagnostics.byRegime.length ? forecast.strategyBacktest.diagnostics.byRegime.map((item) => <span key={item.label}><strong>{item.label}</strong> {item.trades} trades · {item.expectancyR ?? "—"}R · {item.winRate ?? "—"}% wins</span>) : <span>No trades</span>}</section>
            <section><b>Exit outcomes</b>{forecast.strategyBacktest.diagnostics.byExit.map((item) => <span key={item.label}><strong>{item.label}</strong> {item.trades} trades</span>)}</section>
            <section><b>Confirmation factors</b>{forecast.strategyBacktest.diagnostics.byFactor.map((item) => <span key={item.label}><strong>{item.label}</strong> {item.trades} trades · {item.expectancyR ?? "—"}R · {item.winRate ?? "—"}% wins</span>)}</section>
          </div>
          <p>{forecast.strategyBacktest.diagnostics.sessionTimezone}. Session attribution is indicative, not exchange-session proof.</p>
          <h4 className="mi-diagnostic-heading">Broker history quality audit</h4>
          <div className="mi-stats">
            <span><b>{forecast.data.quality?.validCandles ?? forecast.data.candles}</b> valid / {forecast.data.quality?.rawCandles ?? forecast.data.candles} received</span>
            <span><b>{forecast.data.quality?.duplicateTimestamps ?? 0}</b> duplicate timestamps</span>
            <span><b>{forecast.data.quality?.invalidOhlc ?? 0}</b> invalid OHLC bars</span>
            <span><b>{forecast.data.quality?.invalidTimestamp ?? 0}</b> invalid timestamps</span>
            <span><b>{forecast.data.quality?.outOfOrderTimestamps ?? 0}</b> out-of-order bars</span>
            <span><b>{forecast.data.quality?.volumeCoveragePercent ?? 0}%</b> volume coverage</span>
            <span><b>{forecast.data.quality?.timezoneOffsetCoveragePercent ?? 0}%</b> explicit timezone coverage</span>
            <span><b>{forecast.data.quality?.internalGapCount ?? 0}</b> internal gaps · {forecast.data.quality?.longClosureGapCount ?? 0} long closures</span>
            <span><b>{forecast.data.quality?.medianIntervalMinutes ?? "—"}</b> min median spacing</span>
            <span><b>{forecast.data.quality?.maxGapHours ?? "—"}</b> hours largest gap</span>
          </div>
          <p>{forecast.data.quality?.timestampAssumption || "Broker timestamp convention has not been independently verified."}</p>
          <p>Trade ledger rows include signal/entry/exit timestamps, direction, entry/stop/target, R outcome, session, regime and confirmation factors. Unresolved trades remain labelled unresolved; no trades are synthesized.</p>
          <p>Timeframe comparison · selected instrument and broker, each interval tested independently:</p>
          <div className="mi-validation-timeframes">{forecast.strategyByTimeframe.map((frame) => <span key={frame.timeframe}><b>{frame.timeframe}</b> {frame.status === "available" ? `${frame.outOfSampleTrades} OOS · ${frame.outOfSampleExpectancyR}R · ${frame.outOfSampleWinRate ?? "—"}%` : `${frame.candles} candles · insufficient OOS trades`}</span>)}</div>
          <p>Instrument comparison · same selected timeframe and broker:</p>
          <div className="mi-validation-timeframes">{forecast.strategyByInstrument.map((item) => <span key={item.symbol}><b>{item.symbol}</b> {item.status === "available" ? `${item.outOfSampleTrades} OOS · ${item.outOfSampleExpectancyR}R · ${item.outOfSampleWinRate ?? "—"}%` : `${item.candles} candles · insufficient OOS trades`}</span>)}</div>
          <p>Results apply only to the selected broker and the displayed instrument/timeframe. The instrument comparison fetches the other spot symbol from the same broker. Cost scenarios are illustrative R-based sensitivity checks, not measured spreads, commissions or slippage. Selected history: {formatCount(forecast.data?.candles)} of up to {formatCount(forecast.data?.requestedCandles, Number(forecast.data?.candles ?? 0))} requested broker candles. Earliest returned bar: {forecast.data.oldestCandle ? new Date(forecast.data.oldestCandle).toLocaleString() : "unavailable"}. The selected series is paginated in bounded pages; comparison timeframes and the alternate instrument use up to 500 bars each. Actual history may be lower when the broker has less data. No synthetic bars or trades are added.</p>
        </article>
        <article className="mi-panel mi-risk-plan">
          <h3><Target size={15}/> Dynamic risk plan · {forecast.riskPlan.status.toUpperCase()}</h3>
          <div className="mi-stats">
            <span><b>{forecast.riskPlan.direction.toUpperCase()}</b> bias</span>
            <span><b>{fmt(forecast.riskPlan.entry, digits)}</b> reference entry</span>
            <span><b>{fmt(forecast.riskPlan.stop, digits)}</b> structural stop</span>
            <span><b>{forecast.riskPlan.riskDistance == null ? "—" : fmt(forecast.riskPlan.riskDistance, digits)}</b> price risk</span>
          </div>
          <p>{forecast.riskPlan.targets.length ? forecast.riskPlan.targets.map((value, index) => `TP${index + 1} ${fmt(value, digits)}`).join(" · ") : "Risk levels unavailable for the current directional bias."}</p>
          <p>{forecast.riskPlan.methodology}</p>
        </article>
        <div className="mi-levels-grid">
          <div><small>ENTRY ZONE</small><strong>{forecast.entryZone ? `${fmt(forecast.entryZone.low, digits)} – ${fmt(forecast.entryZone.high, digits)}` : "Wait for confirmation"}</strong></div>
          <div><small>STOP LOSS</small><strong>{fmt(forecast.stopLoss, digits)}</strong></div>
          <div><small>TAKE PROFIT</small><strong>{forecast.targets.length ? forecast.targets.map((x) => fmt(x, digits)).join(" · ") : "—"}</strong></div>
        </div>
        <article className="mi-panel mi-confirmation-panel">
          <h3><ShieldCheck size={15}/> Liquidity-to-forecast confirmation</h3>
          <div className="mi-stats">
            <span><b>{forecast.confirmation.score}/100</b> setup score</span>
            <span><b>{forecast.confirmation.status.toUpperCase()}</b> setup status</span>
            <span><b>{forecast.confirmation.direction.toUpperCase()}</b> directional bias</span>
          </div>
          <div className="mi-confirmation-grid">
            {forecast.confirmation.components.map((item, i) => <div key={`${item.name}-${i}`} className={`mi-confirmation-item mi-check-${item.state}`}>
              <span>{item.name}</span><b>{item.points}/{item.maximum}</b><small>{item.state.toUpperCase()}</small>
            </div>)}
          </div>
          {forecast.confirmation.rationale.map((line, i) => <span key={i}>{line}</span>)}
          <p>{forecast.confirmation.rule}</p>
        </article>
        <div className="mi-detail-grid">
          <article className="mi-panel">
            <h3><Waves size={15}/> Market structure & liquidity</h3>
            <p><b>{forecast.structure.trend.toUpperCase()}</b> structure · <b>{forecast.structure.higherTimeframeTrend.toUpperCase()}</b> HTF ({forecast.structure.higherTimeframe || "not available"}) · {forecast.liquidity.sweep} sweep · <b>{forecast.structure.breakType.toUpperCase()}</b></p>
            {forecast.structure.explanation.map((line, i) => <span key={i}>{line}</span>)}
            <span>{forecast.liquidity.explanation}</span>
            {forecast.zones.slice(0, 3).map((z, i) => <span key={i}>{z.type.toUpperCase()} {fmt(z.low, digits)}–{fmt(z.high, digits)} · {z.distancePercent}% away</span>)}
          </article>
          <article className="mi-panel">
            <h3><Target size={15}/> Historical outcome analysis</h3>
            <div className="mi-stats"><span><b>{forecast.historical.wins}</b> wins</span><span><b>{forecast.historical.losses}</b> losses</span><span><b>{forecast.historical.unresolved}</b> unresolved</span><span><b>{forecast.historical.averageR ?? "—"}R</b> avg R</span></div>
            <p>{forecast.historical.methodology}</p>
            {forecast.historical.matches.length > 0 && <div className="mi-match-list">{forecast.historical.matches.map((m, i) => <div key={`${m.time}-${i}`}><time>{new Date(m.time).toLocaleString()}</time><span>{m.distance.toFixed(3)} distance</span><b className={`mi-outcome-${m.outcome}`}>{m.outcome} {m.returnR > 0 ? "+" : ""}{m.returnR}R</b></div>)}</div>}
          </article>
        </div>
        {liquidityMap && <article className="mi-panel mi-liquidity-map">
          <h3><Waves size={15}/> Spot liquidity & institutional-behaviour proxies · candle-derived</h3>
          <div className="mi-stats">
            <span><b>{liquidityMap.equalHighs.length}</b> equal-high pools</span>
            <span><b>{liquidityMap.equalLows.length}</b> equal-low pools</span>
            <span><b>{liquidityMap.fairValueGaps.length}</b> recent FVGs</span>
            <span><b>{liquidityMap.displacement.toUpperCase()}</b> displacement</span>
            <span><b>{liquidityMap.sweep.toUpperCase()}</b> recent sweep side</span>
            <span><b>{liquidityMap.orderBlocks.length}</b> order-block candidates</span>
          </div>
          {liquidityMap.pools.slice(0, 8).map((pool,i)=><span key={`pool${i}`}>{pool.side.toUpperCase()} pool {fmt(pool.level,digits)} · {pool.touches} touches · {pool.strength} · {pool.distancePercent}% away</span>)}
          {liquidityMap.sweepEvents.map((event,i)=><span key={`sweep${i}`}>{event.side.toUpperCase()} sweep {fmt(event.level,digits)} · {event.quality.toUpperCase()} · {event.confirmed ? "next-candle confirmed" : "awaiting next-candle confirmation"} · {new Date(event.time).toLocaleString()}</span>)}
          {liquidityMap.fairValueGaps.slice(0, 5).map((gap,i)=><span key={`fvg${i}`}>{gap.direction.toUpperCase()} FVG {fmt(gap.low,digits)}–{fmt(gap.high,digits)} · strength {gap.strength}/5 · {gap.status} · {gap.distancePercent}% away</span>)}
          {liquidityMap.orderBlocks.map((block,i)=><span key={`ob${i}`}>{block.direction.toUpperCase()} order-block candidate {fmt(block.low,digits)}–{fmt(block.high,digits)} · {block.status} · displacement {block.displacementRatio}×</span>)}
          <div className="mi-stats">
            <span><b>{liquidityMap.brokerVolume.available ? "AVAILABLE" : "UNAVAILABLE"}</b> broker tick volume</span>
            <span><b>{liquidityMap.brokerVolume.latest == null ? "—" : fmt(liquidityMap.brokerVolume.latest, 0)}</b> latest ticks</span>
            <span><b>{liquidityMap.brokerVolume.relative == null ? "—" : `${liquidityMap.brokerVolume.relative}×`}</b> vs median</span>
            <span><b>{liquidityMap.brokerVolume.directionalBias.toUpperCase()}</b> candle-direction volume proxy</span>
          </div>
          <p>{liquidityMap.note}</p>
        </article>}
        <article className="mi-panel mi-mtf-panel">
          <h3><Clock3 size={15}/> Multi-timeframe structure</h3>
          <div className="mi-stats">
            {forecast.multiTimeframe.map((frame) => <span key={frame.timeframe}><b>{frame.timeframe}</b> {frame.status === "available" ? frame.trend.toUpperCase() : "NO DATA"} · {frame.candles} candles</span>)}
          </div>
          <p>Each interval is classified independently from confirmed swing highs and lows. Missing intervals are shown explicitly; no synthetic candles are substituted.</p>
        </article>
        {flowEvidence && <article className="mi-panel mi-flow-panel">
          <h3><Activity size={15}/> Broker spot-volume analysis</h3>
          <p>Mode: <b>{flowEvidence.providerStatus.toUpperCase()}</b> · {flowEvidence.candidateCount} heuristic candidates from {flowEvidence.storedTradeCount} stored trade prints.</p>
          {flowEvidence.candidates.map((candidate, i) => <span key={i}>{candidate.type} · {fmt(candidate.price, digits)} · {candidate.strength} · {candidate.evidence}</span>)}
          <p>{flowEvidence.dataNote}</p>
        </article>}
        <div className="mi-evidence">
          <h3><ShieldCheck size={15}/> Evidence & uncertainty</h3>
          {forecast.evidence.length ? forecast.evidence.map((x, i) => <span key={i} className="mi-evidence-item">{x}</span>) : <span>No strong confluence evidence yet.</span>}
          {forecast.uncertainty.map((x, i) => <span key={i} className="mi-uncertainty"><AlertTriangle size={13}/>{x}</span>)}
        </div>
        <footer className="mi-disclaimer"><Clock3 size={13}/> {forecast.data.candles} candles · latest {forecast.data.latestCandle ? new Date(forecast.data.latestCandle).toLocaleString() : "unknown"} · {forecast.data.note} Forecasts are analytical estimates, not guarantees or instructions to trade.</footer>
      </> : null}
    </section>
  );
}
