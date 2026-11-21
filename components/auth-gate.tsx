"use client";
import { FormEvent, useEffect, useState } from "react";
type User = { id:string; email:string; displayName:string; role:"user"|"admin" };
export default function AuthGate({children}:{children:React.ReactNode}) {
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[mode,setMode]=useState<"login"|"register">("login");
 const [name,setName]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){try{const r=await fetch("/api/auth/me",{cache:"no-store",credentials:"same-origin"});const d=await r.json();setUser(d.user||null);}catch{setUser(null);}finally{setLoading(false);}}
 useEffect(()=>{void refresh();const logout=()=>{void fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"}).finally(()=>{setUser(null);setMode("login");});};window.addEventListener("edge-terminal-sign-out",logout);return()=>window.removeEventListener("edge-terminal-sign-out",logout);},[]);
 async function submit(e:FormEvent){e.preventDefault();setError("");setBusy(true);try{const r=await fetch(mode==="register"?"/api/auth/register":"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({email,password,displayName:name})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Authentication failed.");setUser(d.user);setPassword("");}catch(e){setError(e instanceof Error?e.message:"Authentication failed.");}finally{setBusy(false);}}
 if(loading)return <div className="auth-screen"><div className="auth-card">Loading Edge Terminal…</div></div>;
 if(!user)return <main className="auth-screen"><form className="auth-card" onSubmit={submit}><div className="auth-brand">EDGE TERMINAL</div><h1>{mode==="login"?"Welcome back":"Create your account"}</h1><p>Sign in to access your trading workspace.</p>
 {mode==="register"&&<label>Display name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={60}/></label>}
 <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>
 <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==="register"?10:1} maxLength={128} autoComplete={mode==="login"?"current-password":"new-password"}/></label>
 {mode==="register"&&<small>Use at least 10 characters.</small>}{error&&<div className="auth-error" role="alert">{error}</div>}
 <button className="auth-submit" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}</button>
 <button type="button" className="auth-switch" onClick={()=>{setMode(mode==="login"?"register":"login");setError("");}}>{mode==="login"?"New here? Create an account":"Already have an account? Sign in"}</button></form></main>;
 return <>{children}</>;
}
