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
| DATA_DIR lets Render point this at a mounted disk so accounts, channels
| and messages survive restarts and redeploys. Falls back to ./data.
|--------------------------------------------------------------------------
*/
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "willies-vm.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

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

  CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    topic       TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    locked      INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
`);

/* ---- migrations for databases created before channels existed ---- */
function columns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}
function addColumn(table, name, decl) {
  if (!columns(table).includes(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`);
  }
}

addColumn("users", "role", "TEXT NOT NULL DEFAULT 'member'");
addColumn("users", "display_name", "TEXT");
addColumn("users", "color", "TEXT");
addColumn("users", "bio", "TEXT NOT NULL DEFAULT ''");
addColumn("messages", "channel", "TEXT NOT NULL DEFAULT 'general'");
addColumn("messages", "deleted", "INTEGER NOT NULL DEFAULT 0");

db.exec("CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel, id)");

/* ---- default channels ---- */
const DEFAULT_CHANNELS = [
  { slug: "general", name: "general", topic: "Everything and anything." },
  { slug: "games", name: "games", topic: "What are you playing?" },
  { slug: "vms", name: "vms", topic: "Sandbox and GPU talk." },
  { slug: "off-topic", name: "off-topic", topic: "Wherever it goes." },
];

/*
|--------------------------------------------------------------------------
| Roles
|
| Rank decides who can act on whom: you can only moderate, or hand out a
| role to, someone strictly below you.
|--------------------------------------------------------------------------
*/
export const RANK = { owner: 4, admin: 3, mod: 2, member: 1, guest: 0 };
export const ROLES = ["owner", "admin", "mod", "member"];
export const rankOf = (role) => RANK[role] ?? 0;

const OWNER = String(process.env.OWNER_USERNAME || "william").trim().toLowerCase();
export const ownerName = () => OWNER;

const q = {
  getUser: db.prepare("SELECT * FROM users WHERE username = ?"),
  addUser: db.prepare(
    "INSERT INTO users (username, password_hash, created_at, last_seen, role) VALUES (?, ?, ?, ?, ?)"
  ),
  touchUser: db.prepare("UPDATE users SET last_seen = ? WHERE username = ?"),
  countUsers: db.prepare("SELECT COUNT(*) AS n FROM users"),
  setRole: db.prepare("UPDATE users SET role = ? WHERE username = ?"),
  setProfile: db.prepare(
    "UPDATE users SET display_name = ?, color = ?, bio = ? WHERE username = ?"
  ),
  allUsers: db.prepare(
    "SELECT username, role, display_name, color, bio, last_seen FROM users ORDER BY username"
  ),

  addMessage: db.prepare(
    "INSERT INTO messages (username, account, text, created_at, channel) VALUES (?, ?, ?, ?, ?)"
  ),
  getMessage: db.prepare("SELECT * FROM messages WHERE id = ?"),
  channelMessages: db.prepare(
    "SELECT id, username, account, text, created_at, channel FROM messages" +
      " WHERE channel = ? AND deleted = 0 ORDER BY id DESC LIMIT ?"
  ),
  olderMessages: db.prepare(
    "SELECT id, username, account, text, created_at, channel FROM messages" +
      " WHERE channel = ? AND deleted = 0 AND id < ? ORDER BY id DESC LIMIT ?"
  ),
  softDelete: db.prepare("UPDATE messages SET deleted = 1 WHERE id = ?"),
  trimChannel: db.prepare(
    "DELETE FROM messages WHERE channel = ? AND id NOT IN" +
      " (SELECT id FROM messages WHERE channel = ? ORDER BY id DESC LIMIT 400)"
  ),
  purgeChannel: db.prepare("DELETE FROM messages WHERE channel = ?"),
  dmPartners: db.prepare(
    "SELECT DISTINCT channel FROM messages WHERE channel LIKE 'dm:%' AND deleted = 0"
  ),

  allChannels: db.prepare("SELECT * FROM channels ORDER BY position, id"),
  channelBySlug: db.prepare("SELECT * FROM channels WHERE slug = ?"),
  addChannel: db.prepare(
    "INSERT INTO channels (slug, name, topic, position, created_at) VALUES (?, ?, ?, ?, ?)"
  ),
  updateChannel: db.prepare("UPDATE channels SET name = ?, topic = ?, locked = ? WHERE id = ?"),
  deleteChannel: db.prepare("DELETE FROM channels WHERE id = ?"),
  maxPosition: db.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM channels"),
};

for (const c of DEFAULT_CHANNELS) {
  if (!q.channelBySlug.get(c.slug)) {
    q.addChannel.run(c.slug, c.name, c.topic, DEFAULT_CHANNELS.indexOf(c), Date.now());
  }
}

/* ---- users ---- */

export function getUser(username) {
  return q.getUser.get(username) || null;
}

export function createUser(username, passwordHash) {
  const now = Date.now();
  const role = username === OWNER ? "owner" : "member";
  q.addUser.run(username, passwordHash, now, now, role);
  return { username, role, createdAt: now };
}

export function touchUser(username) {
  q.touchUser.run(Date.now(), username);
  // the configured owner always holds the role, even if the row predates it
  const u = q.getUser.get(username);
  if (u && username === OWNER && u.role !== "owner") q.setRole.run("owner", username);
}

export function userCount() {
  return q.countUsers.get().n;
}

export function setRole(username, role) {
  if (!ROLES.includes(role)) return false;
  if (username === OWNER) return false; // the owner cannot be demoted
  if (!q.getUser.get(username)) return false;
  q.setRole.run(role, username);
  return true;
}

export function setProfile(username, { displayName, color, bio }) {
  const u = q.getUser.get(username);
  if (!u) return null;
  q.setProfile.run(
    displayName ?? u.display_name ?? null,
    color ?? u.color ?? null,
    bio ?? u.bio ?? "",
    username
  );
  return profileOf(username);
}

export function profileOf(username) {
  const u = q.getUser.get(username);
  if (!u) return null;
  return {
    username: u.username,
    role: u.role || "member",
    displayName: u.display_name || u.username,
    color: u.color || null,
    bio: u.bio || "",
    createdAt: u.created_at,
    lastSeen: u.last_seen,
  };
}

export function allProfiles() {
  return q.allUsers.all().map((u) => ({
    username: u.username,
    role: u.role || "member",
    displayName: u.display_name || u.username,
    color: u.color || null,
    bio: u.bio || "",
    lastSeen: u.last_seen,
  }));
}

/* ---- channels ---- */

export function listChannels() {
  return q.allChannels.all().map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    topic: c.topic,
    locked: Boolean(c.locked),
  }));
}

export function channelExists(slug) {
  return Boolean(q.channelBySlug.get(slug));
}

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 24);
}

export function createChannel(name, topic = "") {
  const slug = slugify(name);
  if (!slug) return { error: "That name has no usable characters." };
  if (q.channelBySlug.get(slug)) return { error: "A channel with that name already exists." };
  const pos = q.maxPosition.get().p + 1;
  q.addChannel.run(slug, slug, String(topic).slice(0, 120), pos, Date.now());
  return { channel: listChannels().find((c) => c.slug === slug) };
}

export function updateChannel(slug, { name, topic, locked }) {
  const c = q.channelBySlug.get(slug);
  if (!c) return null;
  q.updateChannel.run(
    name != null ? String(name).slice(0, 24) : c.name,
    topic != null ? String(topic).slice(0, 120) : c.topic,
    locked == null ? c.locked : locked ? 1 : 0,
    c.id
  );
  return listChannels().find((x) => x.slug === slug);
}

export function deleteChannel(slug) {
  const c = q.channelBySlug.get(slug);
  if (!c) return false;
  if (listChannels().length <= 1) return false; // never leave zero channels
  q.deleteChannel.run(c.id);
  q.purgeChannel.run(slug);
  return true;
}

/* ---- direct messages ---- */

export function dmChannel(a, b) {
  return "dm:" + [a, b].sort().join("|");
}

export function dmMembers(channel) {
  if (!channel.startsWith("dm:")) return null;
  return channel.slice(3).split("|");
}

export function dmsFor(username) {
  return q.dmPartners
    .all()
    .map((r) => r.channel)
    .filter((ch) => (dmMembers(ch) || []).includes(username))
    .map((ch) => ({ channel: ch, with: dmMembers(ch).find((u) => u !== username) }))
    .filter((d) => d.with);
}

/* ---- messages ---- */

export function saveMessage({ username, account, text, channel }) {
  const createdAt = Date.now();
  const info = q.addMessage.run(username, account ? 1 : 0, text, createdAt, channel);
  const id = Number(info.lastInsertRowid);
  if (id % 50 === 0) q.trimChannel.run(channel, channel);
  return { id, username, account: Boolean(account), text, createdAt, channel };
}

const shape = (m) => ({
  id: m.id,
  username: m.username,
  account: Boolean(m.account),
  text: m.text,
  createdAt: m.created_at,
  channel: m.channel,
});

export function channelMessages(channel, limit = 60) {
  return q.channelMessages.all(channel, limit).reverse().map(shape);
}

export function olderMessages(channel, beforeId, limit = 40) {
  return q.olderMessages.all(channel, beforeId, limit).reverse().map(shape);
}

export function getMessage(id) {
  const m = q.getMessage.get(id);
  return m ? shape(m) : null;
}

export function deleteMessage(id) {
  q.softDelete.run(id);
}

export default db;
