"use client";

import { useEffect, useState } from "react";
import { Activity, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";

type Metric = { value: number; date: string; change3m?: number | null; change5d?: number | null; priorValue?: number | null };
type FedPayload = {
  status?: string;
  updatedAt?: string;
  nextMeeting?: { label: string } | null;
  policyRate?: Metric | null;
  inflation?: { cpiYoY?: Metric | null; pceYoY?: Metric | null };
  employment?: { unemployment?: Metric | null };
  yields?: { twoYear?: Metric | null; tenYear?: Metric | null };
  pressure?: { score: number | null; label: string; inputsAvailable: number; inputsTotal: number };
  marketImplied?: { status: string; provider: string; message: string; url: string };
  errors?: Record<string, string>;
  error?: string;
  disclaimer?: string;
};

function number(value: number | null | undefined, suffix = "") {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}${suffix}`;
}
function change(value: number | null | undefined, suffix = " pp") {
  if (value == null || !Number.isFinite(value)) return "Change unavailable";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

export default function FedMonetaryPolicyIntelligence() {
  const [data, setData] = useState<FedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fed-intelligence", { cache: "no-store" });
      const body = await response.json() as FedPayload;
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Federal Reserve data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const pressure = data?.pressure;
  const pressureTone = pressure?.label === "Hawkish pressure" ? "hawkish"
    : pressure?.label === "Dovish pressure" ? "dovish" : "mixed";

  return (
    <section className="fed-intel">
      <div className="fed-intel-head">
        <div>
          <div className="fed-intel-eyebrow">EDGE TERMINAL · MACRO INTELLIGENCE</div>
          <h2>FED Monetary Policy Intelligence</h2>
          <p>Rate expectations, inflation, employment and Treasury-yield context</p>
        </div>
        <button className="fed-intel-refresh" onClick={() => void load()} disabled={loading} aria-label="Refresh Federal Reserve data">
          <RefreshCw size={16} className={loading ? "fed-spin" : ""} /> Refresh
        </button>
      </div>

      {error ? <div className="fed-intel-error"><ShieldAlert size={17}/><span>{error}</span></div> : null}

      <div className="fed-intel-grid">
        <article className="fed-intel-card fed-intel-outlook">
          <span className="fed-intel-label">ECONOMIC POLICY PRESSURE</span>
          <strong className={`fed-intel-pressure ${pressureTone}`}>{loading ? "Loading…" : pressure?.label || "Unavailable"}</strong>
          <div className="fed-intel-scoreline">
            <span>Directional context score</span>
            <b>{pressure?.score == null ? "—" : `${pressure.score > 0 ? "+" : ""}${pressure.score}/100`}</b>
          </div>
          <div className="fed-intel-meter"><span style={{ width: `${pressure?.score == null ? 0 : Math.abs(pressure.score)}%` }} /></div>
          <small>{pressure?.inputsAvailable ?? 0}/{pressure?.inputsTotal ?? 4} indicators available. This is a transparent heuristic, not a rate-hike probability.</small>
        </article>

        <article className="fed-intel-card">
          <span className="fed-intel-label">CURRENT POLICY RATE</span>
          <strong className="fed-intel-value">{number(data?.policyRate?.value, "%")}</strong>
          <small>Effective Federal Funds Rate · {data?.policyRate?.date || "Latest date unavailable"}</small>
        </article>

        <article className="fed-intel-card">
          <span className="fed-intel-label">NEXT FOMC MEETING</span>
          <strong className="fed-intel-value">{data?.nextMeeting?.label || "Check official calendar"}</strong>
          <small>Meeting date, not a predicted decision</small>
        </article>
      </div>

      <div className="fed-intel-section-title">ECONOMIC EVIDENCE</div>
      <div className="fed-intel-metrics">
        <div className="fed-intel-metric"><span>CPI inflation · YoY</span><b>{number(data?.inflation?.cpiYoY?.value, "%")}</b><small>{data?.inflation?.cpiYoY?.date || "No observation"} · prior comparison {number(data?.inflation?.cpiYoY?.priorValue, "%")}</small></div>
        <div className="fed-intel-metric"><span>PCE inflation · YoY</span><b>{number(data?.inflation?.pceYoY?.value, "%")}</b><small>{data?.inflation?.pceYoY?.date || "No observation"} · prior comparison {number(data?.inflation?.pceYoY?.priorValue, "%")}</small></div>
        <div className="fed-intel-metric"><span>Unemployment</span><b>{number(data?.employment?.unemployment?.value, "%")}</b><small>{data?.employment?.unemployment?.date || "No observation"} · 3-month change {change(data?.employment?.unemployment?.change3m)}</small></div>
        <div className="fed-intel-metric"><span>2-year Treasury yield</span><b>{number(data?.yields?.twoYear?.value, "%")}</b><small>{data?.yields?.twoYear?.date || "No observation"} · 5-day change {change(data?.yields?.twoYear?.change5d)}</small></div>
        <div className="fed-intel-metric"><span>10-year Treasury yield</span><b>{number(data?.yields?.tenYear?.value, "%")}</b><small>{data?.yields?.tenYear?.date || "No observation"} · 5-day change {change(data?.yields?.tenYear?.change5d)}</small></div>
      </div>

      <div className="fed-intel-market">
        <div>
          <span className="fed-intel-label">MARKET-IMPLIED FOMC PROBABILITIES</span>
          <b>CME FedWatch</b>
          <p>{data?.marketImplied?.message || "Market-implied probabilities are not connected."}</p>
        </div>
        <a href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html" target="_blank" rel="noreferrer">
          Open FedWatch <ExternalLink size={14}/>
        </a>
      </div>

      {data?.errors && Object.keys(data.errors).length > 0 ? (
        <details className="fed-intel-diagnostics">
          <summary>Data diagnostics ({Object.keys(data.errors).length})</summary>
          {Object.entries(data.errors).map(([key, value]) => <p key={key}><b>{key}:</b> {value}</p>)}
        </details>
      ) : null}

      <div className="fed-intel-foot">
        <span><Activity size={13}/> {loading ? "Updating data…" : `Updated ${data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "—"}`}</span>
        <span>{data?.disclaimer || "Economic indicators are context, not confirmation of an FOMC decision."}</span>
      </div>
    </section>
  );
}
