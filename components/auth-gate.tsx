"use client";

import { FormEvent, useEffect, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

type UserProfile = { displayName?: string; email?: string; role?: string; status?: string };

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth || !db) { setLoading(false); return; }
    const firestore = db;
    const logoutHandler = () => { if (auth) void signOut(auth); };
    window.addEventListener("edge-terminal-sign-out", logoutHandler);
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const ref = doc(firestore, "users", nextUser.uid);
        try {
          const snap = await getDoc(ref);
          setProfile(snap.exists() ? snap.data() as UserProfile : null);
        } catch (profileError) {
          console.error("Could not load user profile. Check Firestore rules.", profileError);
          setProfile(null);
        }
      } else setProfile(null);
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
      if (!auth || !db) throw new Error("Firebase is not configured. Check .env.local and restart the dev server.");
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
		await setDoc(doc(db, "users", cred.user.uid), {
		  displayName: name.trim() || email.split("@")[0],
		  email: email.trim().toLowerCase(),
		  role: "member",
		  status: "active",
		  access: {
			generalSilver: true,
			generalGold: true,
			vipLounge: false,
			importantVip: false
		  },
		  createdAt: serverTimestamp()
		});
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="auth-screen"><div className="auth-card">Loading Edge Terminal…</div></div>;

  if (!isFirebaseConfigured || !auth || !db) return <div className="auth-screen"><div className="auth-card"><h1>Firebase setup required</h1><p>Check the six NEXT_PUBLIC_FIREBASE_* values in <code>.env.local</code>, then stop and restart <code>npm.cmd run dev</code>.</p></div></div>;

  if (!user) return (
    <main className="auth-screen"><form className="auth-card" onSubmit={submit}>
      <div className="auth-brand">EDGE TERMINAL</div><h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p>Sign in to access your trading workspace.</p>
      {mode === "register" && <label>Display name<input value={name} onChange={e => setName(e.target.value)} required maxLength={60} /></label>}
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
      {error && <div className="auth-error">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      <button type="button" className="auth-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
    </form></main>
  );

  if (profile?.status === "disabled") return <div className="auth-screen"><div className="auth-card"><h1>Account disabled</h1><p>Please contact an administrator.</p><button className="auth-submit" onClick={() => signOut(auth!)}>Sign out</button></div></div>;

  return <>{children}</>;
}
