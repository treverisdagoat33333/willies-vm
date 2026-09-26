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

  CREATE TABLE IF NOT EXISTS reactions (
    message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    username    TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (message_id, username, emoji)
  );

  -- mutes (can read, can't post) and bans (can't use chat at all).
  -- until is NULL for permanent. ip lets a guest ban stick past a new guest id.
  CREATE TABLE IF NOT EXISTS sanctions (
    username    TEXT NOT NULL,
    kind        TEXT NOT NULL,
    until       INTEGER,
    reason      TEXT NOT NULL DEFAULT '',
    by          TEXT NOT NULL,
    ip          TEXT,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (username, kind)
  );

  -- settings, bookmarks and music library, synced between a user's devices.
  -- data is the JSON the page sends; the page owns its shape.
  CREATE TABLE IF NOT EXISTS user_settings (
    username    TEXT PRIMARY KEY,
    data        TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
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
addColumn("messages", "reply_to", "INTEGER");
addColumn("messages", "edited_at", "INTEGER");
addColumn("messages", "file_id", "TEXT");

/* pictures and files posted in chat (files.js); the bytes live in DATA_DIR/files/<id> */
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id         TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    channel    TEXT NOT NULL,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    width      INTEGER,
    height     INTEGER,
    created_at INTEGER NOT NULL,
    message_id INTEGER
  )
`);
export const FILES_DIR = path.join(DATA_DIR, "files");
fs.mkdirSync(FILES_DIR, { recursive: true });
/* songs stitched together from HLS pieces (music.js), a cache */
export const MUSIC_DIR = path.join(DATA_DIR, "music");
fs.mkdirSync(MUSIC_DIR, { recursive: true });
// bumped to invalidate every token issued before (password change, sign out everywhere)
addColumn("users", "token_version", "INTEGER NOT NULL DEFAULT 0");

db.exec("CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel, id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_sanctions_ip ON sanctions(ip)");

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
  adminUsers: db.prepare(
    "SELECT username, role, display_name, created_at, last_seen FROM users ORDER BY last_seen DESC"
  ),
  setPassword: db.prepare(
    "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE username = ?"
  ),
  bumpTokens: db.prepare("UPDATE users SET token_version = token_version + 1 WHERE username = ?"),
  deleteUser: db.prepare("DELETE FROM users WHERE username = ?"),
  deleteUserMessages: db.prepare("DELETE FROM messages WHERE username = ?"),
  deleteUserReactions: db.prepare("DELETE FROM reactions WHERE username = ?"),
  deleteUserSanctions: db.prepare("DELETE FROM sanctions WHERE username = ?"),
  deleteUserSettings: db.prepare("DELETE FROM user_settings WHERE username = ?"),
  getSettings: db.prepare("SELECT data, updated_at FROM user_settings WHERE username = ?"),
  putSettings: db.prepare(
    "INSERT INTO user_settings (username, data, updated_at) VALUES (?, ?, ?)" +
      " ON CONFLICT(username) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ),
  allDMChannels: db.prepare("SELECT DISTINCT channel FROM messages WHERE channel LIKE 'dm:%'"),
  messageCount: db.prepare("SELECT COUNT(*) AS n FROM messages WHERE deleted = 0"),

  addMessage: db.prepare(
    "INSERT INTO messages (username, account, text, created_at, channel, reply_to, file_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  addFile: db.prepare(
    "INSERT INTO files (id, username, channel, name, type, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  getFile: db.prepare("SELECT * FROM files WHERE id = ?"),
  attachFile: db.prepare("UPDATE files SET message_id = ? WHERE id = ? AND message_id IS NULL"),
  deleteFile: db.prepare("DELETE FROM files WHERE id = ?"),
  // uploads never sent within the grace period, and files whose message is gone
  staleFiles: db.prepare(
    "SELECT f.id FROM files f LEFT JOIN messages m ON m.id = f.message_id" +
      " WHERE (f.message_id IS NULL AND f.created_at < ?) OR (f.message_id IS NOT NULL AND (m.id IS NULL OR m.deleted = 1))"
  ),
  oldestFiles: db.prepare("SELECT id, size FROM files ORDER BY created_at ASC LIMIT 50"),
  fileBytes: db.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM files"),
  editMessage: db.prepare("UPDATE messages SET text = ?, edited_at = ? WHERE id = ?"),
  getMessage: db.prepare("SELECT * FROM messages WHERE id = ?"),
  channelMessages: db.prepare(
    "SELECT id, username, account, text, created_at, channel, reply_to, edited_at, deleted, file_id FROM messages" +
      " WHERE channel = ? AND deleted = 0 ORDER BY id DESC LIMIT ?"
  ),
  olderMessages: db.prepare(
    "SELECT id, username, account, text, created_at, channel, reply_to, edited_at, deleted, file_id FROM messages" +
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

  reactionsFor: db.prepare(
    "SELECT emoji, username FROM reactions WHERE message_id = ? ORDER BY created_at"
  ),
  hasReaction: db.prepare(
    "SELECT 1 FROM reactions WHERE message_id = ? AND username = ? AND emoji = ?"
  ),
  addReaction: db.prepare(
    "INSERT OR IGNORE INTO reactions (message_id, username, emoji, created_at) VALUES (?, ?, ?, ?)"
  ),
  removeReaction: db.prepare(
    "DELETE FROM reactions WHERE message_id = ? AND username = ? AND emoji = ?"
  ),
  reactionKinds: db.prepare(
    "SELECT COUNT(DISTINCT emoji) AS n FROM reactions WHERE message_id = ?"
  ),

  upsertSanction: db.prepare(
    "INSERT INTO sanctions (username, kind, until, reason, by, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)" +
      " ON CONFLICT(username, kind) DO UPDATE SET until = excluded.until, reason = excluded.reason," +
      " by = excluded.by, ip = excluded.ip, created_at = excluded.created_at"
  ),
  getSanction: db.prepare("SELECT * FROM sanctions WHERE username = ? AND kind = ?"),
  ipSanction: db.prepare("SELECT * FROM sanctions WHERE ip = ? AND kind = ?"),
  liftSanction: db.prepare("DELETE FROM sanctions WHERE username = ? AND kind = ?"),
  expireSanctions: db.prepare("DELETE FROM sanctions WHERE until IS NOT NULL AND until <= ?"),
  allSanctions: db.prepare("SELECT * FROM sanctions ORDER BY created_at DESC"),
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

export function tokenVersion(username) {
  return q.getUser.get(username)?.token_version ?? null;
}

export function setPassword(username, passwordHash) {
  q.setPassword.run(passwordHash, username);
}

export function bumpTokenVersion(username) {
  q.bumpTokens.run(username);
}

/* Remove an account and everything that is only theirs. */
export function deleteUser(username) {
  if (username === OWNER) return false;
  db.exec("BEGIN");
  try {
    // matched in JS, not LIKE: "_" in a username is a LIKE wildcard
    for (const { channel } of q.allDMChannels.all()) {
      if ((dmMembers(channel) || []).includes(username)) q.purgeChannel.run(channel);
    }
    q.deleteUserMessages.run(username);
    q.deleteUserReactions.run(username);
    q.deleteUserSanctions.run(username);
    q.deleteUserSettings.run(username);
    q.deleteUser.run(username);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return true;
}

/* ---- synced settings ---- */

export function getSettings(username) {
  const row = q.getSettings.get(username);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.data), updatedAt: row.updated_at };
  } catch (_) {
    return null;
  }
}

/* `json` is already validated and stringified by the caller. Returns the new timestamp. */
export function saveSettings(username, json) {
  const now = Date.now();
  q.putSettings.run(username, json, now);
  return now;
}

export function adminUsers() {
  return q.adminUsers.all().map((u) => ({
    username: u.username,
    role: u.role || "member",
    displayName: u.display_name || u.username,
    createdAt: u.created_at,
    lastSeen: u.last_seen,
  }));
}

export function messageCount() {
  return q.messageCount.get().n;
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

export function saveMessage({ username, account, text, channel, replyTo = null, fileId = null }) {
  const createdAt = Date.now();
  const info = q.addMessage.run(username, account ? 1 : 0, text, createdAt, channel, replyTo, fileId);
  const id = Number(info.lastInsertRowid);
  if (fileId) q.attachFile.run(id, fileId);
  if (id % 50 === 0) q.trimChannel.run(channel, channel);
  return shape(q.getMessage.get(id));
}

/* A short preview of the message being replied to, or a stub if it is gone. */
function replyPreview(id) {
  if (!id) return null;
  const p = q.getMessage.get(id);
  if (!p || p.deleted) return { id, missing: true };
  const f = p.file_id && !p.text ? q.getFile.get(p.file_id) : null;
  return { id: p.id, username: p.username, text: f ? `📎 ${f.name}` : p.text.slice(0, 140) };
}

/* what a message's file looks like to the page ({missing} once it's been cleared away) */
function fileShape(id) {
  if (!id) return null;
  const f = q.getFile.get(id);
  if (!f) return { id, missing: true };
  return { id: f.id, name: f.name, size: f.size, image: f.type.startsWith("image/"), w: f.width || null, h: f.height || null };
}

/* ---- files (files.js) ---- */
export function addFile({ id, username, channel, name, type, size, width = null, height = null }) {
  q.addFile.run(id, username, channel, name, type, size, width, height, Date.now());
}
export function getFile(id) {
  return q.getFile.get(id) || null;
}
export function messageAlive(id) {
  const m = id ? q.getMessage.get(id) : null;
  return !!m && !m.deleted;
}
export function staleFiles(unsentBefore) {
  return q.staleFiles.all(unsentBefore).map((r) => r.id);
}
export function oldestFiles() {
  return q.oldestFiles.all();
}
export function fileBytes() {
  return q.fileBytes.get().n;
}
export function deleteFileRecord(id) {
  q.deleteFile.run(id);
}

export function reactionsOf(id) {
  const byEmoji = new Map();
  for (const r of q.reactionsFor.all(id)) {
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, []);
    byEmoji.get(r.emoji).push(r.username);
  }
  return [...byEmoji].map(([emoji, users]) => ({ emoji, users }));
}

const shape = (m) => ({
  id: m.id,
  username: m.username,
  account: Boolean(m.account),
  text: m.text,
  createdAt: m.created_at,
  channel: m.channel,
  editedAt: m.edited_at || null,
  replyTo: replyPreview(m.reply_to),
  reactions: reactionsOf(m.id),
  file: fileShape(m.file_id),
});

export function channelMessages(channel, limit = 60) {
  return q.channelMessages.all(channel, limit).reverse().map(shape);
}

export function olderMessages(channel, beforeId, limit = 40) {
  return q.olderMessages.all(channel, beforeId, limit).reverse().map(shape);
}

export function getMessage(id) {
  const m = q.getMessage.get(id);
  return m && !m.deleted ? shape(m) : null;
}

export function editMessage(id, text) {
  q.editMessage.run(text, Date.now(), id);
  return getMessage(id);
}

export function deleteMessage(id) {
  q.softDelete.run(id);
}

/* Toggle one user's emoji on a message. Returns the new reaction list. */
export const MAX_REACTION_KINDS = 20;
export function toggleReaction(id, username, emoji) {
  if (q.hasReaction.get(id, username, emoji)) {
    q.removeReaction.run(id, username, emoji);
  } else {
    const kinds = q.reactionKinds.get(id).n;
    const exists = reactionsOf(id).some((r) => r.emoji === emoji);
    if (!exists && kinds >= MAX_REACTION_KINDS) return null;
    q.addReaction.run(id, username, emoji, Date.now());
  }
  return reactionsOf(id);
}

/* ---- mutes and bans ---- */

const liveSanction = (row) => (row && (row.until == null || row.until > Date.now()) ? row : null);

export function sanction({ username, kind, until = null, reason = "", by, ip = null }) {
  q.upsertSanction.run(username, kind, until, String(reason).slice(0, 200), by, ip, Date.now());
}

export function liftSanction(username, kind) {
  return q.liftSanction.run(username, kind).changes > 0;
}

/* The active mute/ban for a name, or for the address a guest connects from. */
export function activeSanction(username, kind, ip = null) {
  const byName = liveSanction(q.getSanction.get(username, kind));
  if (byName) return byName;
  if (ip) return liveSanction(q.ipSanction.get(ip, kind));
  return null;
}

export function listSanctions() {
  q.expireSanctions.run(Date.now());
  return q.allSanctions.all().map((s) => ({
    username: s.username,
    kind: s.kind,
    until: s.until,
    reason: s.reason,
    by: s.by,
    createdAt: s.created_at,
  }));
}

export default db;
