"use client";

import { useEffect } from "react";
import { Scale, X } from "lucide-react";

type TermsSection = { title: string; body: string; bullets?: string[]; tail?: string };

const sections: TermsSection[] = [
  { title: "1. Acceptance of Terms", body: "By accessing, browsing, or using the Edge Terminal platform, web application, community channels, and associated analytical services, you agree to these Terms of Service. If you do not agree to these terms, you must discontinue use of the platform." },
  { title: "2. Educational & Data Services", body: "All charting tools, order flow footprint metrics, bid/ask delta ladders, volume profile clusters, multi-timeframe alignment scores, algorithmic alerts, macroeconomic feeds, and technical indicators provided by Edge Terminal are intended for educational, informational, and analytical research purposes only. Nothing provided by Edge Terminal or its contributors constitutes financial, legal, tax, or investment advice, or a solicitation or recommendation to buy or sell any financial instrument." },
  { title: "3. High-Risk Financial Markets Warning", body: "Trading financial instruments—including spot commodities such as Gold (XAU/USD) and Silver (XAG/USD), foreign exchange (Forex), futures, and options—carries substantial risk of financial loss. Market volatility and leverage can result in rapid and significant losses. Depending on the instrument and trading arrangement, losses may exceed the amount initially deposited. Past performance, backtests, hypothetical results, and historical market analysis do not guarantee future outcomes. Never trade with money you cannot afford to lose. You are responsible for evaluating your financial circumstances and managing your own trading risk." },
  { title: "4. Limitation of Liability", body: "To the fullest extent permitted by applicable law, Edge Terminal, its developers, operators, moderators, affiliates, and licensors disclaim liability for losses or damages arising from trading decisions, platform downtime, market-data inaccuracies, software latency, service interruptions, or reliance on indicators, analytics, or commentary provided through the platform. You remain solely responsible for your trading decisions, execution, and risk management. Nothing in these terms excludes or limits liability where such exclusion or limitation is prohibited by applicable law." },
  { title: "5. Community & Chat Rules", body: "Access to public and VIP discussion rooms is conditional upon constructive and professional conduct." , bullets: ["No spam, repetitive messaging, or flooding of community channels.", "No harassment, hate speech, abusive language, or defamatory conduct.", "No unauthorized commercial promotion, solicitation, affiliate-link farming, or signal selling.", "Respect other members and confidential analytical discussions."], tail: "Moderators may warn, mute, suspend, or terminate accounts that violate these rules, subject to applicable law and platform procedures." },
  { title: "6. AI Data Processing & API Key Security", body: "Edge Terminal incorporates AI-powered market analysis using Google Gemini AI. Depending on the features you use, relevant market context, chart information, structural metrics, and order flow data—including volume profiles, footprint information, Point of Control (POC), Value Area boundaries, and bid/ask delta—may be submitted to Google Gemini for processing. Your use of these features may therefore involve transmitting relevant information to the AI provider. Review the provider's applicable terms and privacy practices before using these services. API key handling depends on the actual implementation of each feature. Claims that keys are stored exclusively in your browser, are never transmitted to Edge Terminal servers, or are inaccessible to platform operators should only be relied upon when supported by the implementation. Do not enter passwords, API keys, or other confidential credentials into public chat messages or areas not specifically designed to handle them securely." },
  { title: "7. Privacy Policy & Data Protection", body: "Edge Terminal aims to collect only the information reasonably necessary to operate its services, authenticate accounts, maintain security, and preserve user preferences. Depending on the features you use, this may include account identifiers such as an email address and username, interface preferences, and technical information required to operate the platform. Edge Terminal does not intend to request identity documents, telephone numbers, or physical addresses unless a specific service or legal obligation requires them. Personal information will not be sold to third-party advertising networks. Information may be processed or shared where necessary to provide platform services, maintain security, comply with legal obligations, or protect legitimate rights, subject to applicable law. Contact the platform operator with questions or requests concerning your personal information and applicable privacy rights." },
];

export default function TermsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="terms-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="terms-modal" role="dialog" aria-modal="true" aria-label="Terms of Service and Privacy Policy">
        <header className="terms-top"><button className="terms-close-top" onClick={onClose} aria-label="Close terms"><X size={23}/></button><div className="terms-emblem"><Scale size={34}/></div><h2>Terms of Service &amp; Privacy Policy</h2><p>Effective Date: 2026 · Edge Terminal Platform</p></header>
        <div className="terms-scroll">
          {sections.map((section) => <section className="terms-section" key={section.title}><h3>{section.title}</h3><p>{section.body}</p>{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}{section.tail && <p>{section.tail}</p>}</section>)}
        </div>
        <footer className="terms-footer"><button onClick={onClose}>Close</button></footer>
      </section>
    </div>
  );
}
