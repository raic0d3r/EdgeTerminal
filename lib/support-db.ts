import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type SupportMessage = {
  id: number;
  user_uid: string;
  sender_uid: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
};

const dataDirectory = path.join(process.cwd(), "data");
fs.mkdirSync(dataDirectory, { recursive: true });
const db = new Database(path.join(dataDirectory, "edge-terminal.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uid TEXT NOT NULL,
    sender_uid TEXT NOT NULL,
    sender_role TEXT NOT NULL CHECK(sender_role IN ('user','admin')),
    body TEXT NOT NULL CHECK(length(body) <= 2000),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_support_user_created ON support_messages(user_uid, id);
`);

export function listSupportMessages(userUid: string): SupportMessage[] {
  return db.prepare("SELECT id,user_uid,sender_uid,sender_role,body,created_at FROM support_messages WHERE user_uid = ? ORDER BY id ASC LIMIT 500").all(userUid) as SupportMessage[];
}

export function listAllSupportMessages(): SupportMessage[] {
  return db.prepare(`SELECT m.id,m.user_uid,m.sender_uid,m.sender_role,m.body,m.created_at
    FROM support_messages m
    INNER JOIN (SELECT user_uid, MAX(id) AS last_id FROM support_messages GROUP BY user_uid) latest
    ON latest.user_uid = m.user_uid AND latest.last_id = m.id
    ORDER BY m.id DESC LIMIT 300`).all() as SupportMessage[];
}

export function addSupportMessage(userUid: string, senderUid: string, senderRole: "user" | "admin", body: string): SupportMessage {
  const createdAt = new Date().toISOString();
  const result = db.prepare("INSERT INTO support_messages (user_uid,sender_uid,sender_role,body,created_at) VALUES (?,?,?,?,?)").run(userUid, senderUid, senderRole, body, createdAt);
  return db.prepare("SELECT id,user_uid,sender_uid,sender_role,body,created_at FROM support_messages WHERE id = ?").get(Number(result.lastInsertRowid)) as SupportMessage;
}
