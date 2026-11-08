 "use client";

import { useEffect } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  BarChart3,
  Clock3,
  Globe2,
  Layers3,
  Lightbulb,
  Link as LinkIcon,
  Linkedin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Waves,
  X,
  ChartNoAxesCombined,
} from "lucide-react";

type PlatformDocumentationProps = {
  onClose: () => void;
};

const overviewCards = [
  {
    icon: Clock3,
    title: "Global Market Sessions & Clocks",
    color: "blue",
    text: "Review the major Sydney, Tokyo, London, and New York trading sessions. Session times and market status help you understand which markets may be active.",
  },
  {
    icon: Globe2,
    title: "Market News Ticker",
    color: "violet",
    text: "The dashboard includes a news-ticker area for market headlines. Treat headlines as context and verify important developments with the original publisher.",
  },
  {
    icon: CalendarDays,
    title: "Economic Events Calendar",
    color: "green",
    text: "The Monetary Policy Watch & Macro Events module embeds TradingView's economic calendar to help review scheduled releases. Event availability and display are controlled by the provider.",
  },
];

const dashboardTools = [
  {
    icon: Activity,
    title: "Master Scorecard & Key Levels",
    text: "Summarizes available technical conditions and key levels. Interpret readings as analytical context, not guaranteed trade signals.",
  },
  {
    icon: Users,
    title: "COT Institutional Sentiment",
    text: "Displays Commitment of Traders positioning through the connected sentiment widgets, when available.",
  },
  {
    icon: Layers3,
    title: "Institutional Liquidity & Book Depth Map",
    text: "Designed for liquidity and order-book context. A genuine Level 2 feed is required before live depth can be shown.",
  },
  {
    icon: Waves,
    title: "Volumetric Delta & VWAP Bands",
    text: "Presents VWAP-based context and available candle-volume proxies. Candle tick volume is not the same as centralized traded volume or trade-side delta.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Intermarket Correlation Matrix",
    text: "Compares historical price movements across selected markets. Correlation is descriptive and does not establish causation.",
  },
  {
    icon: CalendarDays,
    title: "Monetary Policy Watch",
    text: "Use the economic calendar to track scheduled macro releases and central-bank events that may affect volatility.",
  },
  {
    icon: BrainCircuit,
    title: "Master Confluence & Probability Engine",
    text: "Combines available technical inputs into a transparent directional index. It is not a statistically validated probability of profit; disconnected feeds remain marked unavailable.",
  },
  {
    icon: Target,
    title: "Risk & Position Size",
    text: "Estimates position size from account balance, risk percentage, entry, and stop distance. Check your broker's contract specifications and fees before placing a trade.",
  },
];

export default function PlatformDocumentation({ onClose }: PlatformDocumentationProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard access can be unavailable in non-secure local contexts.
    }
  };

  return (
    <div className="platform-doc-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="platform-doc-modal" role="dialog" aria-modal="true" aria-labelledby="platform-doc-title">
        <header className="platform-doc-header">
          <div className="platform-doc-brand-icon"><BookOpen size={24} /></div>
          <div className="platform-doc-heading">
            <h2 id="platform-doc-title">Platform Documentation</h2>
            <p>Advanced Features &amp; Tools Overview</p>
          </div>
          <div className="platform-doc-actions">
            <a href="https://x.com" target="_blank" rel="noreferrer" aria-label="X"><ArrowUpRight size={19} /></a>
            <a href="https://www.linkedin.com" target="_blank" rel="noreferrer" aria-label="LinkedIn"><Linkedin size={19} /></a>
            <button type="button" onClick={copyPageLink} aria-label="Copy page link" title="Copy page link"><LinkIcon size={19} /></button>
            <span className="platform-doc-action-divider" />
            <button type="button" onClick={onClose} aria-label="Close documentation"><X size={23} /></button>
          </div>
        </header>

        <div className="platform-doc-scroll">
          <div className="platform-doc-intro">
            Welcome to the Edge Terminal documentation. This guide explains the platform's dashboard tools, market context modules, community features, and account controls. Available data and features depend on the connected providers and your account permissions.
          </div>

          <div className="platform-doc-overview-grid">
            {overviewCards.map(({ icon: Icon, title, text, color }) => (
              <article className="platform-doc-card" key={title}>
                <div className={`platform-doc-card-title ${color}`}>
                  <span><Icon size={21} /></span><h3>{title}</h3>
                </div>
                <p>{text}</p>
              </article>
            ))}
          </div>

          <section className="platform-doc-section">
            <div className="platform-doc-section-heading">
              <span className="platform-doc-section-icon target"><Target size={21} /></span>
              <h3>Institutional Trading Dashboard</h3>
            </div>
            <p className="platform-doc-section-copy">
              The dashboard brings multiple analysis tools into one workspace. Each module should be interpreted in the context of its source data, timeframe, and limitations.
            </p>
            <div className="platform-doc-tools-grid">
              {dashboardTools.map(({ icon: Icon, title, text }) => (
                <article className="platform-doc-tool-card" key={title}>
                  <h4><Icon size={15} /> {title}</h4>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="platform-doc-bottom-grid">
            <section className="platform-doc-section platform-doc-half">
              <div className="platform-doc-section-heading">
                <span className="platform-doc-section-icon purple"><Sparkles size={21} /></span>
                <h3>Trade Journal &amp; Learning</h3>
              </div>
              <p>The Integrated Trade Journal records trade ideas, side, entry, size, session, emotion, and notes. Use AI Trading Insights, where configured, to review your process. Journal storage and synchronization depend on the current implementation.</p>
              <ul>
                <li>Record trades consistently and add notes about the setup.</li>
                <li>Review outcomes and patterns rather than relying on a single trade.</li>
                <li>AI-generated text is an aid for reflection, not financial advice.</li>
              </ul>
            </section>
            <section className="platform-doc-section platform-doc-half">
              <div className="platform-doc-section-heading">
                <span className="platform-doc-section-icon pink"><MessageCircle size={21} /></span>
                <h3>Community, Chat &amp; Support</h3>
              </div>
              <p>Use the community rooms for shared discussion and the private support inbox for account or platform issues. Private Notes are intended for your own reminders.</p>
              <div className="platform-doc-mini-grid">
                <div><h4><MessageCircle size={14} /> Group discussions</h4><p>General Gold and General Silver are shared rooms.</p></div>
                <div><h4><ShieldCheck size={14} /> VIP rooms</h4><p>VIP Lounge and Important VIP require VIP or administrator access.</p></div>
                <div><h4><BookOpen size={14} /> Private Notes</h4><p>Personal notes are separate from shared discussions.</p></div>
                <div><h4><Users size={14} /> Support</h4><p>Support conversations should be visible only to the user and authorized administrators.</p></div>
              </div>
            </section>
          </div>

          <section className="platform-doc-section platform-doc-feature-suggestions">
            <div className="platform-doc-section-heading">
              <span className="platform-doc-section-icon orange"><Lightbulb size={21} /></span>
              <h3>Feature Suggestions</h3>
            </div>
            <p>Open Feature Suggestions from Quick Actions, select the plus button, add a required title and an optional description, then submit your idea for review.</p>
          </section>

          <div className="platform-doc-disclaimer">
            <ShieldCheck size={17} />
            <p><strong>Data &amp; risk notice:</strong> Market data may be delayed, provider-specific, incomplete, or unavailable. Technical indicators and confluence scores are analytical tools, not guarantees or individualized financial advice. Always verify prices, contracts, and risk before trading.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

