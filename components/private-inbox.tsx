"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole, MessageCircle, NotebookPen, Send, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/firebase";

type Mode = "notes" | "support" | "admin";
type Message = { id:number; userUid:string; senderUid:string; senderRole:"user"|"admin"; body:string; createdAt:string };
type Note = { id: string; body: string; createdAt: string };

export default function PrivateInbox({ mode, title }: { mode: Mode; title: string }) {
  const [uid, setUid] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [tickets, setTickets] = useState<Message[]>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [draft, setDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const currentUid = auth?.currentUser?.uid || "";
    setUid(currentUid);
    if (mode === "notes" && currentUid) {
      try { setNotes(JSON.parse(localStorage.getItem(`edge-private-notes:${currentUid}`) || "[]")); }
      catch { setNotes([]); }
      setLoading(false);
    }
    if (mode === "notes" && !currentUid) setLoading(false);
  }, [mode]);

  const getToken = useCallback(async () => {
    if (!auth?.currentUser) throw new Error("Please sign in again to continue.");
    return auth.currentUser.getIdToken();
  }, []);

  const loadThread = useCallback(async (targetUid?: string, quiet = false) => {
    if (mode === "notes") return;
    try {
      const token = await getToken();
      const url = mode === "admin"
        ? `/api/support?ticketUid=${encodeURIComponent(targetUid || selectedUid)}`
        : "/api/support";
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load messages.");
      setMessages(data.messages || []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load messages."); }
    finally { if (!quiet) setLoading(false); }
  }, [getToken, mode, selectedUid]);

  const loadTickets = useCallback(async (quiet = false) => {
    if (mode !== "admin") return;
    try {
      const token = await getToken();
      const response = await fetch("/api/support?inbox=1", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load support inbox.");
      const rows: Message[] = data.messages || [];
      setTickets(rows);
      if (!selectedUid && rows.length) setSelectedUid(rows[0].userUid);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load support inbox."); }
    finally { if (!quiet) setLoading(false); }
  }, [getToken, mode, selectedUid]);

  useEffect(() => {
    if (mode === "notes") return;
    if (mode === "admin") void loadTickets();
    else void loadThread();
    const timer = window.setInterval(() => {
      if (mode === "admin") { void loadTickets(true); if (selectedUid) void loadThread(selectedUid, true); }
      else void loadThread(undefined, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [mode, selectedUid, loadThread, loadTickets]);

  useEffect(() => {
    if (mode === "admin" && selectedUid) void loadThread(selectedUid);
  }, [mode, selectedUid, loadThread]);

  function saveNotes(next: Note[]) {
    setNotes(next);
    if (uid) localStorage.setItem(`edge-private-notes:${uid}`, JSON.stringify(next));
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body, ...(mode === "admin" ? { ticketUid: selectedUid } : {}) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Message could not be sent.");
      setDraft("");
      if (mode === "admin") { await loadThread(selectedUid, true); await loadTickets(true); }
      else await loadThread(undefined, true);
    } catch (e) { setError(e instanceof Error ? e.message : "Message could not be sent."); }
    finally { setSending(false); }
  }

  function addNote(event: FormEvent) {
    event.preventDefault();
    const body = noteDraft.trim();
    if (!body) return;
    saveNotes([{ id: `${Date.now()}`, body, createdAt: new Date().toISOString() }, ...notes]);
    setNoteDraft("");
  }

  const fmt = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (mode === "notes") return <section className="private-inbox-view">
    <header className="private-inbox-header"><span className="private-inbox-icon notes"><NotebookPen size={20}/></span><div><h1>Private Notes</h1><p>Only stored in this signed-in user's browser. Other members and admins cannot see these notes.</p></div><span className="private-badge"><LockKeyhole size={13}/> PRIVATE</span></header>
    <form className="private-note-form" onSubmit={addNote}><textarea value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Write a thought, reminder, or trading plan…" maxLength={5000}/><button type="submit" disabled={!noteDraft.trim()}><NotebookPen size={16}/> Save note</button></form>
    <div className="private-note-list">{notes.length === 0 ? <div className="private-empty"><NotebookPen size={25}/><b>No notes yet</b><span>Write a note above. It stays private to this browser and account.</span></div> : notes.map((note, index) => <article className="private-note-card" key={note.id || index}><p>{note.body}</p><small>{note.createdAt ? fmt(note.createdAt) : "Saved note"}</small><button onClick={()=>saveNotes(notes.filter((_,i)=>i!==index))}>Delete</button></article>)}</div>
  </section>;

  if (mode === "admin" && !selectedUid && !loading) return <section className="private-inbox-view"><header className="private-inbox-header"><span className="private-inbox-icon support"><ShieldCheck size={20}/></span><div><h1>Support Inbox</h1><p>Private conversations visible only to allowlisted administrators and the relevant user.</p></div></header><div className="private-empty"><MessageCircle size={25}/><b>No support conversations yet</b><span>Messages sent to Support will appear here.</span></div>{error && <p className="private-error">{error}</p>}</section>;

  return <section className={`private-inbox-view ${mode === "admin" ? "private-admin-inbox" : ""}`}>
    {mode === "admin" && <aside className="support-ticket-list"><h2><ShieldCheck size={17}/> Support Inbox</h2><p>Admin-only · private tickets</p>{tickets.map(ticket=><button key={ticket.userUid} className={selectedUid===ticket.userUid?"active":""} onClick={()=>setSelectedUid(ticket.userUid)}><b>{ticket.userUid === selectedUid ? "Selected user" : `User ${ticket.userUid.slice(0,8)}`}</b><span>{ticket.body}</span><small>{fmt(ticket.createdAt)}</small></button>)}</aside>}
    <div className="private-conversation">
      <header className="private-inbox-header"><span className={`private-inbox-icon ${mode === "admin" ? "support" : "support"}`}>{mode === "admin" ? <ShieldCheck size={20}/> : <MessageCircle size={20}/>}</span><div><h1>{title}</h1><p>{mode === "admin" ? `Replying to private support conversation · ${selectedUid.slice(0,10)}` : "Send a private message to Edge Terminal support. Only you and allowlisted admins can view this conversation."}</p></div><span className="private-badge"><LockKeyhole size={13}/> PRIVATE</span></header>
      <div className="private-message-list">{loading ? <div className="private-empty">Loading conversation…</div> : messages.length === 0 ? <div className="private-empty"><MessageCircle size={25}/><b>{mode === "admin" ? "No messages in this conversation" : "How can we help?"}</b><span>{mode === "admin" ? "Reply below to start the conversation." : "Describe your issue here. Other members cannot see this ticket."}</span></div> : messages.map(message=><article key={message.id} className={`private-message ${message.senderRole === "admin" ? "from-admin" : "from-user"}`}><div className="private-message-meta"><b>{message.senderRole === "admin" ? "Edge Terminal Support" : mode === "admin" ? `User ${message.userUid.slice(0,8)}` : "You"}</b><time>{fmt(message.createdAt)}</time></div><p>{message.body}</p></article>)}<div /></div>
      <form className="private-message-form" onSubmit={sendMessage}><textarea value={draft} onChange={e=>setDraft(e.target.value)} placeholder={mode === "admin" ? "Write a private reply…" : "Write your support message…"} maxLength={2000}/><button type="submit" disabled={!draft.trim() || sending || (mode === "admin" && !selectedUid)}><Send size={16}/>{sending ? "Sending…" : "Send privately"}</button></form>
      {error && <p className="private-error">{error}</p>}
    </div>
  </section>;
}
