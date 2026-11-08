"use client";

type TradingViewChartProps = {
  symbol: string;
  interval: string;
  showTools?: boolean;
};

/**
 * Responsive TradingView Advanced Chart embed.
 * TradingView interval values are passed through as documented widget values.
 */
export default function TradingViewChart({
  symbol,
  interval,
  showTools = false,
}: TradingViewChartProps) {
  const params = new URLSearchParams({
    symbol,
    interval,
    theme: "dark",
    style: "1",
    locale: "en",
    timezone: "Etc/UTC",
    allow_symbol_change: "1",
    hide_side_toolbar: showTools ? "0" : "1",
    saveimage: "1",
    withdateranges: "1",
    hideideas: "1",
    calendar: "0",
    details: "0",
    hotlist: "0",
    news: "0",
    studies: "[]",
  });

  return (
    <iframe
      title={`TradingView chart for ${symbol}`}
      src={`https://s.tradingview.com/widgetembed/?${params.toString()}`}
      className="tradingview-chart-iframe"
      style={{ display: "block", width: "100%", height: "100%", border: 0 }}
      allowFullScreen
      loading="eager"
    />
  );
}
