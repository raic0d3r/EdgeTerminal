import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { TradePrint } from "@/lib/orderflow/engine";
import type { OrderFlowInstrument } from "@/lib/orderflow/providers/types";

export type StoredTrade = TradePrint & { id: number; instrument: OrderFlowInstrument; source: string };

const directory = path.join(process.cwd(), "data");
fs.mkdirSync(directory, { recursive: true });
const db = new Database(path.join(directory, "edge-terminal.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS orderflow_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument TEXT NOT NULL CHECK(instrument IN ('GC','SI')),
    timestamp INTEGER NOT NULL,
    price REAL NOT NULL CHECK(price > 0),
    quantity REAL NOT NULL CHECK(quantity > 0),
    side TEXT NOT NULL CHECK(side IN ('buy','sell')),
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(instrument, timestamp, price, quantity, side, source)
  );
  CREATE INDEX IF NOT EXISTS idx_orderflow_instrument_time
    ON orderflow_trades(instrument, timestamp);
`);

const insert = db.prepare(`INSERT OR IGNORE INTO orderflow_trades
  (instrument, timestamp, price, quantity, side, source) VALUES (?, ?, ?, ?, ?, ?)`);
const saveBatch = db.transaction((instrument: OrderFlowInstrument, trades: readonly TradePrint[], source: string) => {
  let inserted = 0;
  for (const trade of trades) {
    if (!Number.isFinite(trade.timestamp) || !Number.isFinite(trade.price) || trade.price <= 0 ||
        !Number.isFinite(trade.quantity) || trade.quantity <= 0 || !["buy", "sell"].includes(trade.side)) continue;
    inserted += insert.run(instrument, trade.timestamp, trade.price, trade.quantity, trade.side, source).changes;
  }
  // Keep local development storage bounded. Historical retention can be configured later.
  db.prepare("DELETE FROM orderflow_trades WHERE timestamp < ?").run(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return inserted;
});

export function storeOrderFlowTrades(instrument: OrderFlowInstrument, trades: readonly TradePrint[], source: string) {
  return saveBatch(instrument, trades, source);
}

export function getStoredOrderFlowTrades(
  instrument: OrderFlowInstrument,
  from: number,
  to: number,
  limit = 20_000,
): StoredTrade[] {
  return db.prepare(`SELECT id, instrument, timestamp, price, quantity, side, source
    FROM orderflow_trades WHERE instrument = ? AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC, id ASC LIMIT ?`).all(instrument, from, to, limit) as StoredTrade[];
}

export function getOrderFlowHistoryStats(instrument: OrderFlowInstrument) {
  return db.prepare(`SELECT COUNT(*) AS tradeCount, MIN(timestamp) AS firstTimestamp,
    MAX(timestamp) AS lastTimestamp FROM orderflow_trades WHERE instrument = ?`)
    .get(instrument) as { tradeCount: number; firstTimestamp: number | null; lastTimestamp: number | null };
}
