"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Search, RefreshCw, ShieldCheck, Users, LockKeyhole, CheckCircle2, XCircle, SlidersHorizontal, Save, Crown, Zap } from "lucide-react";
import { type FeatureRule, defaultFeatureRules } from "@/lib/feature-access";

type Member = {
  uid: string; email: string; displayName: string; role: string; status: string;
  disabled: boolean; createdAt: string;
  access: { generalSilver: boolean; generalGold: boolean; vipLounge: boolean; importantVip: boolean };
};

export default function AdminUserManagement({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<Member[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState("");
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<"users" | "features">("users");
  const [rules, setRules] = useState<FeatureRule[]>(defaultFeatureRules());
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);

  const request = useCallback(async (method: "GET" | "PATCH", body?: unknown) => {
    const current = auth?.currentUser;
    if (!current) throw new Error("Please sign in again.");
    const token = await getIdToken(current, true);
    const response = await fetch("/api/admin/users", {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const responseText = await response.text();
    let result: any = {};
    if (responseText.trim()) {
      try { result = JSON.parse(responseText); }
      catch { throw new Error(`Admin API returned invalid JSON (HTTP ${response.status}). Check Vercel Function Logs for /api/admin/users.`); }
    } else {
      throw new Error(`Admin API returned an empty response (HTTP ${response.status}). Check Vercel Function Logs for /api/admin/users.`);
    }
    if (!response.ok) {
      if (response.status === 403) setDenied(true);
      throw new Error(result.error || `Request failed (HTTP ${response.status}).`);
    }
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setMessage(""); setDenied(false);
    try { const result = await request("GET"); setUsers(result.users || []); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load users."); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  async function update(uid: string, patch: Record<string, unknown>) {
    setBusyUid(uid); setMessage("");
    try { await request("PATCH", { uid, ...patch }); await load(); setMessage("User updated successfully."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update user."); }
    finally { setBusyUid(""); }
  }

  const loadRules = useCallback(async () => {
    setRulesLoading(true); setMessage("");
    try {
      // Load settings through the protected feature-access endpoint.
      const current = auth?.currentUser;
      if (!current) throw new Error("Please sign in again.");
      const token = await getIdToken(current, true);
      const response = await fetch("/api/admin/feature-access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const text = await response.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { throw new Error(`Feature settings API returned invalid or empty JSON (HTTP ${response.status}).`); }
      if (!response.ok) throw new Error(data.error || `Could not load feature settings (HTTP ${response.status}).`);
      setRules(data.rules || defaultFeatureRules());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load feature settings."); }
    finally { setRulesLoading(false); }
  }, []);

  async function saveRules() {
    setRulesSaving(true); setMessage("");
    try {
      const current = auth?.currentUser;
      if (!current) throw new Error("Please sign in again.");
      const token = await getIdToken(current, true);
      const response = await fetch("/api/admin/feature-access", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
      const text = await response.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { throw new Error(`Feature settings API returned invalid or empty JSON (HTTP ${response.status}).`); }
      if (!response.ok) throw new Error(data.error || `Could not save feature settings (HTTP ${response.status}).`);
      setRules(data.rules || rules); window.dispatchEvent(new Event("edge-terminal-feature-access-updated")); setMessage("Feature access settings saved successfully.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save feature settings."); }
    finally { setRulesSaving(false); }
  }

  function changeRule(title: string, patch: Partial<FeatureRule>) {
    setRules(current => current.map(rule => rule.title === title ? { ...rule, ...patch } : rule));
  }

  const filtered = useMemo(() => users.filter(user =>
    `${user.displayName} ${user.email} ${user.role} ${user.status}`.toLowerCase().includes(query.toLowerCase())
  ), [users, query]);

  return <div className="admin-overlay">
    <section className="admin-panel">
      <header className="admin-panel-header">
        <div><span className="admin-kicker"><ShieldCheck size={15}/> ADMINISTRATION</span><h2>User Management</h2><p>Manage member roles, account status, and community access.</p></div>
        <button className="admin-close" onClick={onClose}>Close</button>
      </header>
      <div className="admin-tabs"><button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}><Users size={15}/> User Management</button><button className={tab === "features" ? "active" : ""} onClick={() => { setTab("features"); if (!rulesLoading) void loadRules(); }}><SlidersHorizontal size={15}/> Feature Access & Pricing</button></div>
      {denied && <div className="admin-callout"><LockKeyhole size={19}/><div><b>Admin access is not enabled for this account.</b><p>Add your sign-in email to <code>ADMIN_EMAILS</code> in <code>.env.local</code>, configure Firebase Admin credentials, and restart the server.</p></div></div>}
      {tab === "users" && <><div className="admin-toolbar">
        <div className="admin-count"><Users size={18}/><b>{users.length}</b><span>registered users</span></div>
        <label className="admin-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email, role…"/></label>
        <button className="admin-refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Refresh</button>
      </div>
      {message && <div className="admin-message">{message}</div>}
      {loading ? <div className="admin-empty">Loading registered users…</div> : denied ? null : filtered.length === 0 ? <div className="admin-empty">No matching users found.</div> :
      <div className="admin-user-list">{filtered.map(user => <article className="admin-user-card" key={user.uid}>
        <div className="admin-user-main"><span className="admin-user-avatar">{(user.displayName[0] || "U").toUpperCase()}</span><div className="admin-user-ident"><b>{user.displayName}</b><span>{user.email}</span><small>Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"} · {user.uid.slice(0, 9)}…</small></div><span className={`admin-status ${user.status === "disabled" || user.disabled ? "is-disabled" : "is-active"}`}>{user.status === "disabled" || user.disabled ? <XCircle size={13}/> : <CheckCircle2 size={13}/>} {user.status === "disabled" || user.disabled ? "Disabled" : "Active"}</span></div>
        <div className="admin-user-controls">
          <label>Role<select value={user.role === "vip" ? "vip" : user.role === "pro" ? "pro" : user.role === "admin" ? "admin" : "member"} disabled={busyUid===user.uid || user.role==="admin"} onChange={e=>void update(user.uid,{role:e.target.value})}><option value="member">Free Member</option><option value="pro">PRO Member</option><option value="vip">VIP Member</option><option value="admin">Admin (read-only)</option></select></label>
          <button className={`admin-status-button ${user.disabled || user.status==="disabled" ? "enable" : "disable"}`} disabled={busyUid===user.uid} onClick={()=>void update(user.uid,{status:user.disabled || user.status==="disabled" ? "active" : "disabled"})}>{user.disabled || user.status==="disabled" ? "Enable account" : "Disable account"}</button>
        </div>
        <div className="admin-access-grid"><span className="admin-access-label">COMMUNITY ACCESS</span>
          {([
            ["generalSilver","General Silver"],
            ["generalGold","General Gold"],
            ["vipLounge","VIP Lounge"],
            ["importantVip","Important VIP"]
          ] as const).map(([key,label])=><label className="admin-access-toggle" key={key}><input type="checkbox" checked={user.access[key]} disabled={busyUid===user.uid || user.disabled || user.status==="disabled"} onChange={e=>void update(user.uid,{access:{...user.access,[key]:e.target.checked}})}/><span>{label}</span></label>)}
        </div>
      </article>)}</div>}
      <p className="admin-footnote">Admin role promotion is intentionally disabled in this panel. Feature visibility is controlled separately under Feature Access &amp; Pricing.</p></>}
      {tab === "features" && <section className="feature-access-admin">
        <div className="feature-access-intro"><div><h3><Crown size={18}/> Feature Access &amp; Pricing</h3><p>Control platform-wide feature visibility. Turn a feature off to hide it from every user, regardless of account type. The Position Trading Panel has a simple global on/off switch and is not tied to PRO, VIP, or subscription plans.</p></div><button className="admin-refresh" onClick={() => void loadRules()} disabled={rulesLoading}><RefreshCw size={14}/> Reload</button></div>
        {rulesLoading ? <div className="admin-empty">Loading feature settings…</div> : <>
          <div className="feature-access-list">{rules.map(rule => rule.title === "Position Trading Panel" ? <article className="feature-access-row position-panel-global-control" key={rule.title}>
            <div className="feature-access-title"><span className="feature-plan-icon"><Zap size={16}/></span><div><b>Position Trading Panel</b><small>Global setting · applies to every user, regardless of role or subscription</small></div></div>
            <label className="feature-enabled-toggle"><input type="checkbox" checked={rule.enabled} onChange={e => changeRule(rule.title, { enabled: e.target.checked })}/> {rule.enabled ? "Visible to all users" : "Hidden from all users"}</label>
          </article> : <article className="feature-access-row" key={rule.title}>
            <div className="feature-access-title"><span className={`feature-plan-icon ${rule.tier.toLowerCase()}`}>{rule.tier === "VIP" ? <Crown size={16}/> : <Zap size={16}/>}</span><div><b>{rule.title}</b><small>{rule.tier === "FREE" ? "Available to every member" : rule.tier === "PRO" ? "PRO and VIP plans" : "VIP plan only"}</small></div></div>
            <label className="feature-tier-field">Required plan<select value={rule.tier} onChange={e => changeRule(rule.title, { tier: e.target.value as FeatureRule["tier"] })}><option value="FREE">FREE — everyone</option><option value="PRO">PRO + VIP</option><option value="VIP">VIP only</option></select></label>
            <label className="feature-link-field">Upgrade / checkout URL<input type="url" value={rule.subscriptionUrl || ""} placeholder={rule.tier === "VIP" ? "https://… VIP checkout link" : "https://… PRO checkout link"} onChange={e => changeRule(rule.title, { subscriptionUrl: e.target.value })}/><small>Leave blank to use the global link from .env.local.</small></label>
            <label className="feature-enabled-toggle"><input type="checkbox" checked={rule.enabled} onChange={e => changeRule(rule.title, { enabled: e.target.checked })}/> Enabled</label>
          </article>)}</div>
          <div className="feature-access-footer"><span>Settings are saved to Firestore and apply to all users after refresh. Use HTTPS checkout links only.</span><button className="feature-save-button" onClick={() => void saveRules()} disabled={rulesSaving || rulesLoading}><Save size={16}/> {rulesSaving ? "Saving…" : "Save Feature Settings"}</button></div>
        </>}
      </section>}
    </section>
  </div>;
}
