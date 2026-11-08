import type { OrderFlowProvider, OrderFlowInstrument, OrderFlowFeedResult } from "./types";

/** Deterministic synthetic prints for UI/engine testing only. Never use as market signals. */
export class MockOrderFlowProvider implements OrderFlowProvider {
  async getRecentTrades(instrument: OrderFlowInstrument): Promise<OrderFlowFeedResult> {
    const now = Date.now();
    const tickSize = instrument === "GC" ? 0.1 : 0.005;
    const basePrice = instrument === "GC" ? 2400 : 28;
    const trades = Array.from({ length: 240 }, (_, index) => {
      const step = Math.round(Math.sin(index / 8) * 5 + Math.cos(index / 19) * 3);
      const price = Number((basePrice + step * tickSize).toFixed(3));
      return {
        timestamp: now - (239 - index) * 1_000,
        price,
        quantity: 1 + (index % 9),
        side: (index % 5 === 0 || index % 5 === 1 ? "sell" : "buy") as "buy" | "sell",
      };
    });

    return {
      instrument,
      trades,
      source: "Synthetic development feed",
      mode: "demo",
      dataNote: "Synthetic trades generated for testing only. Not exchange data and not suitable for trading decisions.",
    };
  }
}
