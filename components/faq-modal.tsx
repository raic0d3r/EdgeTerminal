"use client";

import { useEffect } from "react";
import { BookOpen, ChevronDown, X } from "lucide-react";

const faqs = [
  {
    q: "What is Edge Terminal?",
    a: "Edge Terminal is a trading-focused workspace for market context, technical tools, community discussions, and trade review. It brings price charts, market-analysis modules, sentiment widgets, an economic calendar, and a trade journal together in one interface. The availability and freshness of each feature depend on its connected data provider."
  },
  {
    q: "Who is Edge Terminal designed for?",
    a: "It is designed for traders who want to study markets, document decisions, and discuss ideas with a trading community. The platform can support analysis and education, but it does not replace your own research, risk controls, or professional financial advice."
  },
  {
    q: "Is the information here considered financial advice?",
    a: "No. Edge Terminal provides market information, visualisations, and educational tools—not personalised investment advice or a guarantee of results. Markets can move rapidly and you can lose money. Verify important data independently and decide whether a trade fits your own plan and risk tolerance."
  },
  {
    q: "How do I use the Trading Dashboard and Scorecard?",
    a: "Choose an asset and timeframe, then review the available chart and analytical modules. Treat a scorecard or confluence reading as a summary of the inputs that are actually connected. Check the module's data-status notes and guide before interpreting a signal; unavailable inputs should not be treated as neutral or as confirmed market evidence."
  },
  {
    q: "What do the different market regimes mean?",
    a: "A bullish regime means the available indicators lean upward; bearish means they lean downward; neutral or mixed means the evidence is not clearly aligned. A regime is a description of the supplied data, not a prediction that price must move in that direction."
  },
  {
    q: "How frequently does the live market feed update?",
    a: "Update timing depends on the provider, instrument, endpoint, and market session. Some values may refresh on a polling interval, while embedded widgets update according to their own service. A 'provider live' label means a request returned data; it does not guarantee exchange-level real-time data. Check timestamps and provider notices where available."
  },
  {
    q: "Can I change the theme or sidebar appearance?",
    a: "Use the appearance or theme control in the sidebar to switch between the available dark and light themes. Some panels or third-party embedded widgets may keep their own styling and may not follow every theme setting."
  },
  {
    q: "What is the Macro Environment score?",
    a: "The macro environment is intended to summarise relevant economic and policy context. It should only be interpreted as a calculated score when the required macro inputs are connected and shown as available. If the panel displays N/A or says a feed is not connected, Edge Terminal does not have enough data to calculate that metric."
  },
  {
    q: "How does Technical Edge work?",
    a: "Technical Edge summarises the technical inputs implemented in the current module, such as price relative to a recent moving average, short-term momentum, and approximate RSI when enough candle history is available. It is a technical index—not a tested probability of profit. Read the score breakdown and neutral-zone rules rather than relying on the headline number alone."
  },
  {
    q: "Are alerts and notifications real-time?",
    a: "Do not assume every panel provides real-time alerts. Notifications and update timing depend on the specific feature and its integration. If a feature does not show an active alert state or documented update status, use it as an on-screen reference rather than relying on it for time-critical execution."
  },
  {
    q: "Who can create new discussion groups?",
    a: "Group creation and management are controlled by the platform's configured permissions. If you do not see a group-creation option, contact an administrator through Support & Feedback. Do not assume that being able to read a group also grants permission to create or manage one."
  },
  {
    q: "How can I gain access to VIP channels?",
    a: "VIP Lounge and Important VIP are intended for accounts that have been granted VIP access, plus authorised administrators. Access is checked by the application; an ordinary account should not be able to read or send messages in restricted rooms. Contact the administrator if your membership status appears incorrect."
  },
  {
    q: "What should I do if the market feed says DATA OFFLINE?",
    a: "Refresh once and check whether the provider status changes. Confirm that the configured market-data mode and provider are correct, then check the browser's API response and server terminal for errors. If the issue continues, send Support & Feedback the instrument, timeframe, approximate time, and error message. Do not assume stale prices are current."
  },
  {
    q: "What does the Conviction Level indicate on the scorecard?",
    a: "It expresses the direction and strength of the technical inputs available to the scorecard. It is not the statistical probability that a trade will win. A strong-looking score can still fail, particularly when data is incomplete, correlated inputs overlap, or market conditions change. Use the displayed breakdown and risk controls."
  },
  {
    q: "Can I export my chat history or trading data?",
    a: "A self-service export is not currently guaranteed across all modules. Trade Journal entries in the browser-based version may be stored locally in that browser, while chat and support data may be stored server-side. Avoid clearing browser storage if you rely on local entries, and contact the administrator about data requests."
  },
  {
    q: "What is the difference between Public, VIP, and Direct channels?",
    a: "Public discussion rooms are intended for eligible community members. VIP rooms are restricted to accounts with VIP permission and authorised administrators. Direct messages are private conversations between the participants and, where applicable, authorised support administrators. Never post passwords, API keys, or sensitive personal information in a chat."
  },
  {
    q: "How do I report inappropriate behaviour or a message?",
    a: "Use Support & Feedback to describe the issue, identify the channel or message, and include the approximate time. Share only the details needed to investigate. An administrator can review the report and take action according to the platform's moderation rules."
  },
  {
    q: "What happens if Edge Terminal enters maintenance mode?",
    a: "Some features may be temporarily unavailable during maintenance or a provider outage. Wait for the service to recover, refresh the page, and check any notice shown by the platform. Do not rely on a module for a time-sensitive decision while it reports an error or unavailable data."
  },
  {
    q: "Can I customise my profile and display name?",
    a: "Open account settings to edit the profile fields available in your current build, such as display name, username, avatar URL, bio, and presence. Save your changes and check a new message to confirm how your identity is displayed. Server-verified chat identity may override a name supplied only by the browser."
  },
  {
    q: "How does the Order Book Delta or Volumetric Delta work?",
    a: "These tools need suitable volume or order-flow data. Some spot/CFD candle providers report tick volume rather than centralised traded volume, and candle OHLC data alone cannot establish aggressor-side buy/sell delta. If the relevant feed is unavailable, the module should show that limitation instead of inventing a value."
  },
  {
    q: "Where can I find economic events and central-bank announcements?",
    a: "Open Monetary Policy Watch & Macro Events to view the integrated economic calendar when it is available to your account. The embedded TradingView calendar supplies its own event data and display. Event times, forecasts, and values can change; confirm high-impact releases with an authoritative source before trading."
  },
  {
    q: "What is the Intermarket Correlation Matrix?",
    a: "It compares the historical movements of selected instruments, such as gold, silver, the US dollar index proxy, yields, or equities, over a chosen lookback. Correlation describes how series moved together in that sample; it does not prove causation and can change. Check the symbols, source, and data window used."
  },
  {
    q: "How do I use the Integrated Trade Journal?",
    a: "Record the asset, side, entry price, size, emotion, session, and setup notes when you take or review a trade. Use the journal to identify process patterns and review outcomes, not to guarantee future performance. In browser-local versions, entries may remain on that device and may not sync to other devices."
  },
  {
    q: "How does Support & Feedback work?",
    a: "Open Support & Feedback from Quick Actions, enter your name, email, and query, then submit it. Requests are intended for the support team rather than public discussion. Do not include passwords, private keys, or payment-card details. If submission fails, note the error and try again later."
  },
  {
    q: "How do I suggest a new feature?",
    a: "Open Feature Suggestions from Quick Actions, select the plus button, enter a concise feature title, and optionally describe the behaviour you would like. Submit the suggestion so it can be reviewed. A submission is a request, not a promise that the feature will be implemented."
  },
  {
    q: "How do I install Edge Terminal on my phone?",
    a: "On iPhone or iPad, open the deployed site in Safari, tap Share, and choose Add to Home Screen. On Android, open it in Chrome, open the three-dot menu, and choose Install App or Add to Home screen if offered. Installation availability depends on the deployed site's HTTPS and PWA configuration; a local development address may not install like the production site."
  },
  {
    q: "Can I connect a brokerage account and execute trades directly?",
    a: "Brokerage connectivity and order execution are not assumed to be available in the current build. Charts and analysis modules are for viewing and research unless a specific, verified trading integration is explicitly provided. Never assume a button or signal has placed an order with your broker."
  },
  {
    q: "Why does a module show N/A or say a feed is not connected?",
    a: "N/A means the required input is not available to that module, has not been configured, or could not be verified. It is not a zero reading. The platform is designed to distinguish unavailable data from a real calculated value; check the module's status message and contact support if a feed that should be configured is missing."
  },
  {
    q: "How do I protect my account and data?",
    a: "Use a strong unique password, sign out on shared devices, and never share login credentials or API keys. Keep Firebase or other server credentials out of screenshots, chat messages, and ZIP uploads. Use only official support channels and report unexpected account access promptly."
  },
];

export default function FaqModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="faq-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="faq-modal" role="dialog" aria-modal="true" aria-label="Frequently Asked Questions">
        <header className="faq-header"><h2><BookOpen size={24}/> Frequently Asked Questions</h2><button onClick={onClose} aria-label="Close FAQs"><X size={23}/></button></header>
        <div className="faq-scroll">
          <div className="faq-intro">Answers to common questions about Edge Terminal's market tools, community, account access, and data limitations.</div>
          <div className="faq-list">
            {faqs.map((item, index) => <details className="faq-item" key={item.q}>
              <summary><span>{item.q}</span><ChevronDown size={20}/></summary>
              <div className="faq-answer">{item.a}</div>
            </details>)}
          </div>
          <div className="faq-footer-note">Still need help? Close this window and open <strong>Quick Actions → Support &amp; Feedback</strong>.</div>
        </div>
      </section>
    </div>
  );
}
