"use client";

import { useEffect, useState } from "react";

type Props = { asset: string; theme?: "dark" | "light" };

export default function CotSentimentWidgets({ asset, theme = "dark" }: Props) {
  const [showGuide, setShowGuide] = useState(true);
  const symbol = asset === "XAU/USD" ? "GOLD" : "SILVER";
  const pair = asset === "XAU/USD" ? "XAUUSD" : "XAGUSD";

  useEffect(() => {
    const handleResize = (event: MessageEvent) => {
      // Only accept resize messages from the official TraderSentiments origin.
      if (event.origin !== "https://tradersentiments.com") return;
      if (event.data?.type !== "tradersentiments-widget-resize") return;
      const id = event.data.widgetId;
      const frames: HTMLIFrameElement[] = [
        document.getElementById("ts-cot-widget"),
        document.getElementById("ts-sentiment-widget"),
      ].filter((frame): frame is HTMLIFrameElement => frame instanceof HTMLIFrameElement);
      const target = frames.find((frame) => frame?.contentWindow === event.source);
      if (target && Number.isFinite(Number(event.data.height))) {
		if (target.id === "ts-sentiment-widget") {
		  target.style.height = "113px";
		} else {
		  target.style.height = `${Math.max(320, Number(event.data.height))}px`;
		}
      }
    };
    window.addEventListener("message", handleResize);
	return () => window.removeEventListener("message", handleResize);
	}, []);
    return (
    <div className="cot-widgets-stack">
      <div className="cot-guide">
        <button className="cot-guide-toggle" type="button" aria-expanded={showGuide} onClick={() => setShowGuide((open) => !open)}>
          <span aria-hidden="true">ⓘ</span> COT SENTIMENT GUIDE <span className="cot-guide-chevron">{showGuide ? "⌃" : "⌄"}</span>
        </button>
        {showGuide && (
          <div className="cot-guide-copy">
            The Commitments of Traders (COT) report shows how major trader groups are positioned in futures markets. Use the institutional report to review speculative and commercial positioning, then compare it with retail sentiment for {pair}. Large differences can highlight a potential positioning divergence, but neither group is always right and sentiment alone does not predict price direction. COT data is reported weekly, while retail sentiment may update more frequently.
          </div>
        )}
      </div>
      <section className="cot-widget-card">
        <h3>Retail Market Sentiment · {pair}</h3>
        <iframe
		  id="ts-sentiment-widget"
		  src={`https://tradersentiments.com/widget/sentiment/forex?theme=${theme}&layout=cards&pairs=${pair}&header=false&attribution=false&autoHeight=true`}
		  title={`TraderSentiments ${pair} Retail Sentiment`}
		  loading="lazy"
		  style={{
			width: "100%",
			height: "113px",
			minHeight: "113px",
			border: "none",
			borderRadius: "12px",
			display: "block",
			background: theme === "dark" ? "#0b1018" : "#ffffff",
		  }}
		/>
      </section>
      <section className="cot-widget-card">
        <h3>Institutional COT Report · {symbol}</h3>
        <iframe id="ts-cot-widget" src={`https://tradersentiments.com/widget/cot-report/embed?symbol=${symbol}&layout=detail&theme=${theme}&header=false&switchMarket=false&attribution=false&autoHeight=true`} title="TraderSentiments COT Institutional Report" loading="lazy" />
      </section>
    </div>
  );
}
