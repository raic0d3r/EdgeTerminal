"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bold, Code2, ImagePlus, Italic, MoreHorizontal, Paperclip, Send, Smile } from "lucide-react";
import { auth } from "@/lib/firebase";

type ChatMessage = {
  id: number;
  groupKey: string;
  author: string;
  body: string;
  createdAt: string;
};

export default function GroupChat({ groupKey, title, subtitle, emoji }: {
  groupKey: string; title: string; subtitle: string; emoji: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (quiet = false) => {
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("Please sign in to view this conversation.");
      const idToken = await currentUser.getIdToken();
      const response = await fetch(`/api/chat?group=${encodeURIComponent(groupKey)}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error("Could not load messages.");
      const data = await response.json();
      setMessages(data.messages || []);
      setError("");
    } catch {
      setError("Chat storage is not available yet. Check the terminal server logs.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [groupKey]);

  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(true), 5000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("Please sign in again before sending a message.");
      const idToken = await currentUser.getIdToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ groupKey, body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Message could not be sent.");
      setDraft("");
      await loadMessages(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const dateLabel = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return <section className="group-chat-view">
    <header className="group-chat-header">
      <button className="chat-back-button" onClick={() => window.dispatchEvent(new CustomEvent("edge-terminal-close-chat"))} aria-label="Back to dashboard"><ArrowLeft size={18}/></button>
      <span className="chat-room-avatar">{emoji}</span>
      <div className="chat-room-title"><h1>{title}</h1><p>{subtitle} · Community discussion</p></div>
      <span className="chat-online-status"><i/> Group chat</span>
      <button className="chat-more-button" aria-label="More group options" title="Group options are not implemented yet"><MoreHorizontal size={20}/></button>
    </header>

    <div className="chat-message-area">
      <div className="chat-date-divider"><span>Conversation</span></div>
      <div className="chat-info-banner">Welcome to <b>{title}</b>. Messages show each member’s display name. Keep discussion respectful and avoid sharing private information.</div>
      {loading && <div className="chat-empty-state">Loading conversation…</div>}
      {!loading && messages.length === 0 && <div className="chat-empty-state"><div className="chat-empty-emoji">{emoji}</div><h2>Start the conversation</h2><p>There are no messages yet. Send the first message to this group.</p></div>}
      {messages.map(message => <article className={`chat-message ${message.author === "Edge User" ? "own-message" : ""}`} key={message.id}>
        <div className="message-avatar">{message.author.slice(0,1).toUpperCase()}</div>
        <div className="message-content">
          <div className="message-meta"><b>{message.author}</b><time>{dateLabel(message.createdAt)}</time></div>
          <div className="message-bubble">{message.body}</div>
        </div>
      </article>)}
      {error && <div className="chat-error" role="status">{error}</div>}
      <div ref={bottomRef}/>
    </div>

    <form className="chat-composer" onSubmit={sendMessage}>
      <div className="chat-format-toolbar">
        <button type="button" title="Formatting preview only" disabled><Bold size={16}/></button>
        <button type="button" title="Formatting preview only" disabled><Italic size={16}/></button>
        <button type="button" title="Formatting preview only" disabled><Code2 size={16}/></button>
        <span/>
        <small>Your signed-in display name appears on your messages</small>
      </div>
      <div className="chat-compose-row">
        <button type="button" className="chat-attach" title="File uploads are not implemented yet" disabled><ImagePlus size={19}/></button>
        <button type="button" className="chat-attach secondary-attach" title="File uploads are not implemented yet" disabled><Paperclip size={18}/></button>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${title}…`} rows={1} maxLength={2000} aria-label="Message text" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/>
        <button type="button" className="chat-emoji" title="Emoji picker is not implemented yet" disabled><Smile size={19}/></button>
        <button type="submit" className="chat-send" disabled={!draft.trim() || sending} aria-label="Send message"><Send size={19}/></button>
      </div>
      <div className="chat-compose-hint"><span>Enter to send · Shift + Enter for a new line</span><span>{draft.length}/2000</span></div>
    </form>
  </section>;
}
