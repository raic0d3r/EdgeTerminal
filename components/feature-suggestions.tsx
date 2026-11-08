"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, X, Lightbulb, LoaderCircle } from "lucide-react";
import { auth } from "@/lib/firebase";

type Suggestion = { id: number; author: string; title: string; description: string; createdAt: string };

export default function FeatureSuggestions({ onBack }: { onBack: () => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const request = useCallback(async (method: "GET" | "POST", body?: { title: string; description: string }) => {
    const user = auth?.currentUser;
    if (!user) throw new Error("Please sign in to use Feature Suggestions.");
    const token = await user.getIdToken();
    const response = await fetch("/api/feature-suggestions", {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }, []);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request("GET");
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load suggestions.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void loadSuggestions(); }, [loadSuggestions]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) { setError("Please enter a feature title."); return; }
    setSubmitting(true);
    setError("");
    try {
      const data = await request("POST", { title: title.trim(), description: description.trim() });
      setSuggestions((old) => [data.suggestion, ...old]);
      setTitle("");
      setDescription("");
      setModalOpen(false);
      setSuccess("Your feature suggestion has been submitted.");
      window.setTimeout(() => setSuccess(""), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit your suggestion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="feature-suggestions-page">
      <header className="feature-suggestions-header">
        <div className="feature-suggestions-heading">
          <button className="feature-back-button" onClick={onBack}><ArrowLeft size={17} /> Back</button>
          <h1>Feature Suggestions</h1>
        </div>
        <button className="feature-add-button" aria-label="Suggest a feature" title="Suggest a feature" onClick={() => { setError(""); setModalOpen(true); }}><Plus size={22} /></button>
      </header>

      <main className="feature-suggestions-content">
        {loading ? <div className="feature-suggestions-empty"><LoaderCircle className="feature-loading-icon" size={22} /> Loading suggestions…</div> : error && !suggestions.length ? <div className="feature-suggestions-empty feature-error-text">{error}<button onClick={() => void loadSuggestions()}>Try again</button></div> : suggestions.length === 0 ? <div className="feature-suggestions-empty">No suggestions yet. Be the first to suggest a feature!</div> : (
          <div className="feature-suggestion-list">
            {suggestions.map((suggestion) => <article className="feature-suggestion-card" key={suggestion.id}>
              <div className="feature-suggestion-card-icon"><Lightbulb size={18} /></div>
              <div className="feature-suggestion-card-main">
                <h2>{suggestion.title}</h2>
                {suggestion.description && <p>{suggestion.description}</p>}
                <div className="feature-suggestion-meta">Suggested by <b>{suggestion.author}</b><span>·</span><time>{new Date(suggestion.createdAt).toLocaleString()}</time></div>
              </div>
            </article>)}
          </div>
        )}
      </main>

      {success && <div className="feature-suggestion-toast">{success}</div>}

      {modalOpen && <div className="feature-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setModalOpen(false); }}>
        <section className="feature-suggestion-modal" role="dialog" aria-modal="true" aria-labelledby="feature-suggestion-modal-title">
          <header className="feature-modal-header"><h2 id="feature-suggestion-modal-title">Suggest a Feature</h2><button aria-label="Close" disabled={submitting} onClick={() => setModalOpen(false)}><X size={23} /></button></header>
          <form onSubmit={submit} className="feature-suggestion-form">
            <label>Feature Title<input autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="E.g., Dark Mode Theme" required /></label>
            <label>Description (Optional)<textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="How would this work?" rows={5} /></label>
            {error && <p className="feature-form-error" role="alert">{error}</p>}
            <button className="feature-submit-button" type="submit" disabled={submitting || !title.trim()}>{submitting ? "Submitting…" : "Submit Suggestion"}</button>
          </form>
        </section>
      </div>}
    </div>
  );
}
