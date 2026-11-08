import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type FeatureSuggestionRow = {
  id: number;
  uid: string;
  author: string;
  title: string;
  description: string;
  created_at: string;
};

const directory = path.join(process.cwd(), "data");
fs.mkdirSync(directory, { recursive: true });
const db = new Database(path.join(directory, "edge-terminal.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS feature_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT NOT NULL,
    author TEXT NOT NULL,
    title TEXT NOT NULL CHECK(length(title) <= 100),
    description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_feature_suggestions_created
    ON feature_suggestions(id DESC);
`);

export function listFeatureSuggestions(): FeatureSuggestionRow[] {
  return db.prepare(`SELECT id, uid, author, title, description, created_at
    FROM feature_suggestions ORDER BY id DESC LIMIT 200`).all() as FeatureSuggestionRow[];
}

export function createFeatureSuggestion(uid: string, author: string, title: string, description: string): FeatureSuggestionRow {
  const result = db.prepare(`INSERT INTO feature_suggestions (uid, author, title, description, created_at)
    VALUES (?, ?, ?, ?, ?)`).run(uid, author, title, description, new Date().toISOString());
  return db.prepare(`SELECT id, uid, author, title, description, created_at
    FROM feature_suggestions WHERE id = ?`).get(Number(result.lastInsertRowid)) as FeatureSuggestionRow;
}
