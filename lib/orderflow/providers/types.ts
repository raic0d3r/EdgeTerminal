import type { TradePrint } from "@/lib/orderflow/engine";

export type OrderFlowInstrument = "GC" | "SI";

export type OrderFlowFeedResult = {
  instrument: OrderFlowInstrument;
  trades: TradePrint[];
  source: string;
  mode: "demo" | "live";
  dataNote: string;
};

/** All providers must return executed trades with a defensible aggressor side. */
export interface OrderFlowProvider {
  getRecentTrades(instrument: OrderFlowInstrument): Promise<OrderFlowFeedResult>;
}
