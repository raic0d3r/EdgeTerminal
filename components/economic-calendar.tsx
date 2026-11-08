"use client";

import { useEffect, useRef } from "react";

export default function EconomicCalendar() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    async function initializeCalendar() {
      const scriptSrc =
        "https://widgets.tradingview-widget.com/w/en/tv-economic-calendar.js";

      try {
        // Load the external script through the browser, not Webpack.
        if (
          !document.querySelector(
            'script[data-tradingview-economic-calendar="true"]'
          )
        ) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");

            script.type = "module";
            script.src = scriptSrc;
            script.dataset.tradingviewEconomicCalendar = "true";

            script.onload = () => resolve();
            script.onerror = () =>
              reject(new Error("TradingView calendar script failed to load."));

            document.head.appendChild(script);
          });
        }

        if (cancelled || !container) return;

        // Wait for the browser to register the custom element.
        await customElements.whenDefined("tv-economic-calendar");

        if (cancelled || !container) return;

        container.replaceChildren();

        const calendar = document.createElement(
          "tv-economic-calendar"
        );

        calendar.setAttribute("theme", "dark");
        calendar.setAttribute("transparent", "");

        container.appendChild(calendar);
      } catch (error) {
        console.error("Economic Calendar initialization failed:", error);

        if (!cancelled && container) {
          const message = document.createElement("p");
          message.textContent =
            "Economic Calendar could not load. Please refresh and try again.";
          message.className = "economic-calendar-error";

          container.replaceChildren(message);
        }
      }
    }

    void initializeCalendar();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="economic-calendar-panel">
      <div className="economic-calendar-toolbar">
        <div className="economic-calendar-toolbar-title">
          <span className="economic-calendar-live-dot" />
          <span>GLOBAL ECONOMIC EVENTS</span>
        </div>

        <span className="economic-calendar-provider">
          POWERED BY TRADINGVIEW
        </span>
      </div>

      <div className="economic-calendar-widget">
        <div ref={containerRef} />
      </div>

      <p className="economic-calendar-disclaimer">
        Economic releases and event schedules are provided by TradingView.
        Times and forecasts may change.
      </p>
    </div>
  );
}
