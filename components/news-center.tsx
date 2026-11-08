"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Search, Newspaper, Clock3 } from "lucide-react";

type Item = { title: string; link: string; source: string; publishedAt: string; category: string; summary: string };
type FeedResponse = { items: Item[]; updatedAt: string; availableSources: number; sources: number };
const categories = ["ALL", "GOLD", "SILVER", "USD", "FED", "ECONOMICS", "MARKETS"];

function age(value: string) {
  const time = Date.parse(value);
  if (!time) return "Time unavailable";
  const mins = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
export function NewsTicker() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let live = true;
    const load = async () => { try { const r = await fetch("/api/news", { cache: "no-store" }); if (r.ok) { const d: FeedResponse = await r.json(); if (live) setItems(d.items || []); } } catch {} };
    void load(); const timer = setInterval(load, 60000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const headlines = items.slice(0, 12);
  return <div className="news-ticker"><span className="breaking"><Newspaper size={13}/> LIVE NEWS</span>{headlines.length ? <div className="news-ticker-track">{[...headlines, ...headlines].map((item, i) => <span className="news-ticker-item" key={`${item.link}-${i}`}><a href={item.link} target="_blank" rel="noopener noreferrer" title={`${item.source} · ${item.title}`}>{item.title}</a><i/></span>)}</div> : <span className="news-ticker-loading">Loading gold, silver and USD headlines…</span>}</div>;
}
export default function NewsCenter() {
  const [data, setData] = useState<FeedResponse>({ items: [], updatedAt: "", sources: 0, availableSources: 0 });
  const [category, setCategory] = useState("ALL");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (manual = false) => {
    if (manual) setBusy(true);
    try { const r = await fetch("/api/news", { cache: "no-store" }); if (r.ok) setData(await r.json()); } catch {}
    finally { if (manual) setBusy(false); }
  };
  useEffect(() => { void load(); const timer = setInterval(() => { void load(); }, 60000); return () => clearInterval(timer); }, []);
  const filtered = useMemo(() => data.items.filter((item) => (category === "ALL" || item.category === category) && `${item.title} ${item.source} ${item.summary} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [data.items, category, search]);
  return <div className="news-center">
    <div className="news-center-tools"><label className="news-search"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search gold, silver, dollar, Fed…"/></label><button className="news-refresh" onClick={() => void load(true)} disabled={busy}><RefreshCw size={15} className={busy ? "news-spinning" : ""}/>{busy ? "Updating" : "Refresh"}</button></div>
    <div className="news-categories">{categories.map((c) => <button key={c} className={category === c ? "selected" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <div className="news-status"><span><i className={data.items.length ? "news-status-dot" : "news-status-dot offline"}/>{data.items.length ? `${filtered.length} headlines · ${data.availableSources}/${data.sources} sources online` : "Connecting to free RSS news sources…"}</span><span>{data.updatedAt ? `Updated ${age(data.updatedAt)}` : "Waiting for feed"}</span></div>
    {filtered.length ? <div className="news-list">{filtered.map((item, i) => <article className="news-card" key={`${item.link}-${i}`}><div className="news-card-meta"><span className={`news-category-tag tag-${item.category.toLowerCase()}`}>{item.category}</span><span>{item.source}</span><span><Clock3 size={12}/>{age(item.publishedAt)}</span></div><a className="news-card-title" href={item.link} target="_blank" rel="noopener noreferrer">{item.title}<ExternalLink size={14}/></a>{item.summary && <p>{item.summary.replace(/https?:\/\/\S+/g, "").slice(0, 240)}</p>}</article>)}</div> : <div className="news-empty"><Newspaper size={26}/><b>{data.items.length ? "No matching headlines" : "News feed is temporarily unavailable"}</b><span>{data.items.length ? "Try another search or category." : "RSS feeds may be slow or temporarily blocked. Try refresh in a moment."}</span></div>}
    <footer className="news-center-footer">Headlines link to their original publishers. Free RSS sources; availability may vary. News is for information only, not investment advice.</footer>
  </div>;
}
