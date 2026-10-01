/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import crypto from "node:crypto";
import express from "express";
import db from "./db.js";

/*
|--------------------------------------------------------------------------
| Analytics for the owner dashboard
|
| Only counts, never who did what: each event adds 1 to a row keyed by the
| UTC day, the UTC hour, a kind and a name (which app, which song). Visitors
| are counted per day through a salted hash of their session label, so a
| day's unique visitors can be counted without keeping anyone's name; the
| salt lives only in memory, so hashes from different runs can't be matched.
|
| Kinds: visit, app, song, movie, vm, ai, chat, call, voice, signup. The page
| reports visit, app, song and movie (POST /api/stats/event); the server
| records the rest itself through record().
|
| On Render's free plan DATA_DIR is wiped on each deploy, and these tables
| with it: the dashboard shows the day counting started.
|--------------------------------------------------------------------------
*/

db.exec(`
  CREATE TABLE IF NOT EXISTS stats (
    day   TEXT NOT NULL,      -- YYYY-MM-DD, UTC
    hour  INTEGER NOT NULL,   -- 0..23, UTC
    kind  TEXT NOT NULL,
    name  TEXT NOT NULL DEFAULT '',
    n     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, hour, kind, name)
  );
  CREATE TABLE IF NOT EXISTS stats_seen (
    day   TEXT NOT NULL,
    who   TEXT NOT NULL,      -- salted hash; 'a:' account or 'g:' guest
    PRIMARY KEY (day, who)
  );
`);

/* What broke for visitors (a script error, a song or movie that wouldn't play,
   a site the proxy couldn't open), counted by kind and message so the owner
   sees what's actually failing. No names or addresses are kept. */
db.exec(`
  CREATE TABLE IF NOT EXISTS errors (
    kind   TEXT NOT NULL,
    msg    TEXT NOT NULL,
    place  TEXT NOT NULL DEFAULT '',
    n      INTEGER NOT NULL DEFAULT 0,
    people INTEGER NOT NULL DEFAULT 0,
    first  INTEGER NOT NULL,
    last   INTEGER NOT NULL,
    PRIMARY KEY (kind, msg)
  );
  CREATE TABLE IF NOT EXISTS errors_seen (
    kind TEXT NOT NULL, msg TEXT NOT NULL, who TEXT NOT NULL,
    PRIMARY KEY (kind, msg, who)
  );
`);
export const ERROR_KINDS = ["js", "proxy", "song", "movie", "vm", "ai", "call"];
const MAX_ERRORS = 500;
const qe = {
  bump: db.prepare("INSERT INTO errors (kind, msg, place, n, people, first, last) VALUES (?, ?, ?, 1, 0, ?, ?) ON CONFLICT(kind, msg) DO UPDATE SET n = n + 1, last = excluded.last, place = excluded.place"),
  seen: db.prepare("INSERT OR IGNORE INTO errors_seen (kind, msg, who) VALUES (?, ?, ?)"),
  person: db.prepare("UPDATE errors SET people = people + 1 WHERE kind = ? AND msg = ?"),
  list: db.prepare("SELECT kind, msg, place, n, people, first, last FROM errors ORDER BY last DESC LIMIT 200"),
  count: db.prepare("SELECT COUNT(*) AS n FROM errors"),
  trim: db.prepare("DELETE FROM errors WHERE rowid IN (SELECT rowid FROM errors ORDER BY last ASC LIMIT ?)"),
  orphans: db.prepare("DELETE FROM errors_seen WHERE NOT EXISTS (SELECT 1 FROM errors e WHERE e.kind = errors_seen.kind AND e.msg = errors_seen.msg)"),
  clear: db.prepare("DELETE FROM errors"),
  clearSeen: db.prepare("DELETE FROM errors_seen"),
};
const cleanText = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function recordError(kind, msg, place = "", who = "") {
  kind = String(kind);
  msg = cleanText(msg, 240);
  if (!ERROR_KINDS.includes(kind) || !msg) return false;
  const now = Date.now();
  qe.bump.run(kind, msg, cleanText(place, 160), now, now);
  if (who && qe.seen.run(kind, msg, crypto.createHmac("sha256", SALT).update(who).digest("hex").slice(0, 16)).changes) qe.person.run(kind, msg);
  const { n } = qe.count.get();
  if (n > MAX_ERRORS) {
    qe.trim.run(n - MAX_ERRORS);
    qe.orphans.run();
  }
  return true;
}
export const errorList = () => qe.list.all();
export function clearErrors() {
  qe.clear.run();
  qe.clearSeen.run();
}

export const KINDS = ["visit", "app", "song", "movie", "vm", "ai", "chat", "call", "voice", "signup"];
// what the page may report about itself; the rest only the server records
const PAGE_KINDS = ["visit", "app", "song", "movie"];
export const APP_NAMES = ["browser", "games", "vm", "vm1", "vm2", "links", "remote", "cloud", "movies", "music", "ai", "chat", "settings", "admin", "apps"];
const KEEP_DAYS = 120;
const SALT = crypto.randomBytes(16);

const q = {
  bump: db.prepare("INSERT INTO stats (day, hour, kind, name, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT(day, hour, kind, name) DO UPDATE SET n = n + 1"),
  seen: db.prepare("INSERT OR IGNORE INTO stats_seen (day, who) VALUES (?, ?)"),
  first: db.prepare("SELECT MIN(day) AS day FROM stats"),
  byDay: db.prepare("SELECT day, kind, SUM(n) AS n FROM stats WHERE day >= ? GROUP BY day, kind"),
  visitors: db.prepare("SELECT day, COUNT(*) AS n, SUM(who LIKE 'a:%') AS accounts FROM stats_seen WHERE day >= ? GROUP BY day"),
  visitorsTotal: db.prepare("SELECT COUNT(DISTINCT who) AS n FROM stats_seen WHERE day >= ?"),
  hours: db.prepare("SELECT day, hour, SUM(n) AS n FROM stats WHERE day >= ? AND kind IN ('visit','app','song','movie','chat','ai','vm','call') GROUP BY day, hour"),
  top: db.prepare("SELECT name, SUM(n) AS n FROM stats WHERE day >= ? AND kind = ? AND name != '' GROUP BY name ORDER BY n DESC LIMIT ?"),
  prune: db.prepare("DELETE FROM stats WHERE day < ?"),
  pruneSeen: db.prepare("DELETE FROM stats_seen WHERE day < ?"),
};

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

/* one more of something, now */
export function record(kind, name = "") {
  if (!KINDS.includes(kind)) return;
  const now = Date.now();
  try {
    q.bump.run(dayOf(now), new Date(now).getUTCHours(), kind, cleanName(name));
  } catch (err) {
    console.error("analytics:", err.message);
  }
}

/* this visitor was here today (counted once a day) */
export function seen(label, isAccount) {
  const who = (isAccount ? "a:" : "g:") + crypto.createHmac("sha256", SALT).update(String(label)).digest("base64url").slice(0, 16);
  try {
    q.seen.run(dayOf(Date.now()), who);
  } catch (_) {}
}

function prune() {
  const cut = dayOf(Date.now() - KEEP_DAYS * 86400e3);
  try {
    q.prune.run(cut);
    q.pruneSeen.run(cut);
  } catch (_) {}
}
prune();
setInterval(prune, 6 * 3600e3).unref?.();

/* the dashboard's numbers for the last `days` days (today included) */
export function report(days) {
  const from = dayOf(Date.now() - (days - 1) * 86400e3);
  const list = [];
  for (let i = days - 1; i >= 0; i--) list.push(dayOf(Date.now() - i * 86400e3));
  const perDay = Object.fromEntries(list.map((d) => [d, { day: d, visitors: 0, accounts: 0 }]));
  for (const r of q.visitors.all(from)) if (perDay[r.day]) Object.assign(perDay[r.day], { visitors: r.n, accounts: r.accounts || 0 });
  const totals = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const r of q.byDay.all(from)) {
    if (perDay[r.day]) perDay[r.day][r.kind] = r.n;
    totals[r.kind] = (totals[r.kind] || 0) + r.n;
  }
  return {
    days: list.map((d) => perDay[d]),
    // UTC day + hour; the page turns them into its own weekday and hour
    hours: q.hours.all(from).map((r) => ({ day: r.day, hour: r.hour, n: r.n })),
    totals: { ...totals, visitors: q.visitorsTotal.get(from).n },
    top: {
      app: q.top.all(from, "app", 14),
      song: q.top.all(from, "song", 10),
      movie: q.top.all(from, "movie", 10),
    },
    since: q.first.get().day || dayOf(Date.now()),
  };
}

/* ---- routes ---- */

export function analyticsRouter({ requireSession, requireOwner, limiter, sessionLabel }) {
  const r = express.Router();

  // the page's own reports: what it opened and played
  r.post("/event", requireSession, limiter, (req, res) => {
    const kind = String(req.body?.kind || "");
    let name = cleanName(req.body?.name);
    if (!PAGE_KINDS.includes(kind)) return res.status(400).json({ error: "Unknown event." });
    if (kind === "app" && !APP_NAMES.includes(name)) return res.status(400).json({ error: "Unknown app." });
    if (kind === "visit") {
      name = "";
      seen(sessionLabel(req.vmSession), req.vmSession?.type === "account");
    }
    if ((kind === "song" || kind === "movie") && !name) return res.status(400).json({ error: "Missing name." });
    record(kind, name);
    res.status(204).end();
  });

  // something broke on a visitor's page
  r.post("/error", requireSession, limiter, (req, res) => {
    if (!recordError(req.body?.kind, req.body?.msg, req.body?.place, sessionLabel(req.vmSession))) return res.status(400).json({ error: "Unknown error report." });
    res.status(204).end();
  });
  r.get("/errors", requireOwner, (_req, res) => res.set("Cache-Control", "no-store").json({ errors: errorList() }));
  r.delete("/errors", requireOwner, (_req, res) => { clearErrors(); res.status(204).end(); });

  r.get("/report", requireOwner, (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    res.set("Cache-Control", "no-store").json(report(days));
  });

  return r;
}
