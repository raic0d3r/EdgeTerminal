"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, getIdToken, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Crown, LockKeyhole, X, Zap, ExternalLink } from "lucide-react";
import type { FeatureRule, AccessTier } from "@/lib/feature-access";

type GateResponse = { rules?: FeatureRule[]; plan?: "member" | "pro" | "vip" | "admin" };

export default function FeatureGate({ title, children }: { title: string; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<GateResponse["plan"]>("member");
  const [rule, setRule] = useState<FeatureRule | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    const load = async (user: User | null) => {
      try {
        const headers: Record<string, string> = {};
        if (user) headers.Authorization = `Bearer ${await getIdToken(user)}`;
        const response = await fetch("/api/feature-access", { headers, cache: "no-store" });
        const data = (await response.json()) as GateResponse;
        if (!active) return;
        setRule((data.rules || []).find(item => item.title === title) || null);
        setPlan(data.plan || "member");
      } catch {
        if (!active) return;
        setRule(null);
        setPlan("member");
      } finally {
        if (active) setReady(true);
      }
    };
    if (auth) unsubscribe = onAuthStateChanged(auth, user => { setReady(false); void load(user); });
    else void load(null);
    return () => { active = false; unsubscribe(); };
  }, [title]);

  if (!ready) return <div className="feature-gate-loading">Checking membership access…</div>;
  const tier: AccessTier = rule?.tier || (title === "Order Flow Footprint" ? "VIP" : "PRO");
  const userPlan = plan || "member";
  const allowed = userPlan === "admin" || (rule?.enabled !== false && (tier === "FREE" || (tier === "PRO" && (userPlan === "pro" || userPlan === "vip")) || (tier === "VIP" && userPlan === "vip")));
  if (allowed) return <>{children}</>;

  const isVip = tier === "VIP";
  const checkoutUrl = (rule?.subscriptionUrl || "").trim();
  const planName = isVip ? "VIP" : "PRO";
  const featureDescription = isVip
    ? "Unlock the Order Flow Footprint cluster chart, bid/ask imbalance ladders, and absorption signals. VIP also includes Volume Profile and VIP community access."
    : "Unlock institutional horizontal volume profiles, Point of Control (POC), Value Areas (VAH/VAL), and liquidity zones.";

  return <>
    <div className={`feature-lock-card ${isVip ? "feature-lock-vip" : "feature-lock-pro"}`}>
      <div className="feature-lock-icon">{isVip ? <Crown size={31}/> : <LockKeyhole size={31}/>}</div>
      <span className="feature-lock-promo">50% Off Introductory Access</span>
      <h2>{title === "Order Flow Footprint" ? "Order Flow Footprint Cluster Chart is Locked" : `${title} is Locked`}</h2>
      <p>{featureDescription}</p>
      <button className="feature-lock-cta" onClick={() => setCheckoutOpen(true)}>
        {isVip ? <Crown size={16}/> : <Zap size={16}/>} Unlock {planName} Access {isVip ? "(From £15.99/mo)" : "(From £9.99/mo)"}
      </button>
      <small className="feature-lock-note">Cancel or change plans anytime with self-service access.</small>
    </div>
    {checkoutOpen && <div className="checkout-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}>
      <section className={`checkout-modal ${isVip ? "vip" : "pro"}`} role="dialog" aria-modal="true" aria-labelledby="checkout-modal-title">
        <button className="checkout-modal-close" aria-label="Close checkout dialog" onClick={() => setCheckoutOpen(false)}><X size={19}/></button>
        <div className="checkout-modal-icon">{isVip ? <Crown size={30}/> : <Zap size={30}/>}</div>
        <span className="feature-lock-promo">50% Off Introductory Access</span>
        <h2 id="checkout-modal-title">Unlock {planName} Access</h2>
        <p>{isVip ? "Get VIP access to this feature and all VIP-only tools and community areas." : "Get PRO access to this feature and all tools included in the PRO plan."}</p>
        {checkoutUrl ? <a className="feature-lock-cta checkout-link" href={checkoutUrl} target="_blank" rel="noopener noreferrer">Continue to secure checkout <ExternalLink size={15}/></a> : <div className="checkout-no-link">Subscription checkout is not configured yet. Please contact the administrator.</div>}
        <small className="feature-lock-note">You will return here after completing checkout. Access updates when your account plan is updated by the administrator.</small>
      </section>
    </div>}
  </>;
}
