/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/*
|--------------------------------------------------------------------------
| SQLite storage
|
| DATA_DIR lets Render point this at a mounted disk so accounts and chat
| survive restarts and redeploys. Falls back to ./data for local dev.
|--------------------------------------------------------------------------
*/
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "willies-vm.db"));
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username      TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_seen     INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL,
    account    INTEGER NOT NULL DEFAULT 0,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`);

const q = {
  getUser: db.prepare("SELECT * FROM users WHERE username = ?"),
  addUser: db.prepare(
    "INSERT INTO users (username, password_hash, created_at, last_seen) VALUES (?, ?, ?, ?)"
  ),
  touchUser: db.prepare("UPDATE users SET last_seen = ? WHERE username = ?"),
  countUsers: db.prepare("SELECT COUNT(*) AS n FROM users"),
  addMessage: db.prepare(
    "INSERT INTO messages (username, account, text, created_at) VALUES (?, ?, ?, ?)"
  ),
  recentMessages: db.prepare(
    "SELECT id, username, account, text, created_at FROM messages ORDER BY id DESC LIMIT ?"
  ),
  trimMessages: db.prepare(
    "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT 500)"
  ),
};

export function getUser(username) {
  return q.getUser.get(username) || null;
}

export function createUser(username, passwordHash) {
  const now = Date.now();
  q.addUser.run(username, passwordHash, now, now);
  return { username, passwordHash, createdAt: now };
}

export function touchUser(username) {
  q.touchUser.run(Date.now(), username);
}

export function userCount() {
  return q.countUsers.get().n;
}

export function saveMessage({ username, account, text }) {
  const createdAt = Date.now();
  const info = q.addMessage.run(username, account ? 1 : 0, text, createdAt);
  if (info.lastInsertRowid % 50 === 0) q.trimMessages.run();
  return {
    id: Number(info.lastInsertRowid),
    username,
    account: Boolean(account),
    text,
    createdAt,
  };
}

export function recentMessages(limit = 60) {
  return q.recentMessages
    .all(limit)
    .reverse()
    .map((m) => ({
      id: m.id,
      username: m.username,
      account: Boolean(m.account),
      text: m.text,
      createdAt: m.created_at,
    }));
}

export default db;
