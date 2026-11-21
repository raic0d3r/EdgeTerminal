"use client";

import { FormEvent, useEffect, useState } from "react";
import { auth, createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "@/lib/auth-client";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const logoutHandler = () => { void signOut(auth); };
    window.addEventListener("edge-terminal-sign-out", logoutHandler);
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return () => {
      window.removeEventListener("edge-terminal-sign-out", logoutHandler);
      unsubscribe();
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "register") await createUserWithEmailAndPassword(auth, email.trim(), password, name.trim());
      else await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="auth-screen"><div className="auth-card">Loading Edge Terminal…</div></div>;

  if (!user) return (
    <main className="auth-screen"><form className="auth-card" onSubmit={submit}>
      <div className="auth-brand">EDGE TERMINAL</div><h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p>Sign in to access your trading workspace.</p>
      {mode === "register" && <label>Display name<input value={name} onChange={e => setName(e.target.value)} required maxLength={60} /></label>}
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "register" ? 8 : undefined} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
      {mode === "register" && <small>Use at least 8 characters.</small>}
      {error && <div className="auth-error">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      <button type="button" className="auth-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
    </form></main>
  );

  return <>{children}</>;
}
