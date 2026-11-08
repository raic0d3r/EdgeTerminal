import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type StoredChatMessage = {
  id: number;
  group_key: string;
  author: string;
  body: string;
  created_at: string;
};

const dataDirectory = path.join(process.cwd(), "data");
fs.mkdirSync(dataDirectory, { recursive: true });
const db = new Database(path.join(dataDirectory, "edge-terminal.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_key TEXT NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL CHECK(length(body) <= 2000),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chat_group_created
    ON chat_messages(group_key, id);
`);

const seed = db.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE group_key = ?");
const insert = db.prepare("INSERT INTO chat_messages (group_key, author, body, created_at) VALUES (?, ?, ?, ?)");
const seedTime = new Date().toISOString();
const seedMessages: Array<[string, string, string]> = [
  ["general-silver", "Edge Moderator", "Welcome to General Silver! Use this room to discuss silver market structure, levels, and learning resources."],
  ["general-silver", "Market Learner", "I’m watching the relationship between silver and gold today. What timeframes are others studying?"],
  ["general-silver", "Edge Moderator", "Please share your reasoning and remember that market discussion is educational, not a guaranteed signal."],
  ["general-gold", "Edge Moderator", "Welcome to General Gold! Keep gold-market discussion constructive and include context when sharing a chart or idea."],
  ["general-gold", "Market Learner", "I’m comparing the 15-minute and 1-hour structure before writing up my market plan."]
];
const seedTransaction = db.transaction(() => {
  for (const groupKey of ["general-silver", "general-gold"]) {
    if ((seed.get(groupKey) as {count:number}).count === 0) {
      for (const [group, author, body] of seedMessages.filter(([key]) => key === groupKey)) {
        insert.run(group, author, body, seedTime);
      }
    }
  }
});
seedTransaction();

export const validGroups = new Set(["general-silver", "general-gold", "vip-lounge", "important-vip"]);
export function listMessages(groupKey: string): StoredChatMessage[] {
  return db.prepare(
    "SELECT id, group_key, author, body, created_at FROM chat_messages WHERE group_key = ? ORDER BY id ASC LIMIT 300"
  ).all(groupKey) as StoredChatMessage[];
}
export function addMessage(groupKey: string, author: string, body: string): StoredChatMessage {
  const createdAt = new Date().toISOString();
  const result = db.prepare(
    "INSERT INTO chat_messages (group_key, author, body, created_at) VALUES (?, ?, ?, ?)"
  ).run(groupKey, author, body, createdAt);
  return db.prepare(
    "SELECT id, group_key, author, body, created_at FROM chat_messages WHERE id = ?"
  ).get(Number(result.lastInsertRowid)) as StoredChatMessage;
}
