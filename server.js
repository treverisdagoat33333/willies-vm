/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { Sandbox } from "@e2b/desktop";
import { getUser, createUser, touchUser, userCount } from "./db.js";
import { handleChatUpgrade, onlineCount } from "./chat.js";
import { handleRemoteUpgrade, authorizeRemote, remoteStatus } from "./remote.js";

const require = createRequire(import.meta.url);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const XENV_API_KEY = process.env.XENV_API_KEY;
const DEV_ID = process.env.XENV_DEV_ID || "willie-games-vm";
const E2B_API_KEY = process.env.E2B_API_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET;
const XENV = "https://loremgroup.org";
const GUEST_VM_TIMEOUT_MS = 30 * 60 * 1000;
const ACCOUNT_VM_TIMEOUT_MS = 60 * 60 * 1000;

if (!AUTH_SECRET) {
  throw new Error("AUTH_SECRET is not configured.");
}

/*
|--------------------------------------------------------------------------
| Wisp WebSocket upgrade handler at /wisp/
|--------------------------------------------------------------------------
*/
server.on("upgrade", (req, socket, head) => {
  const upgradePath = new URL(req.url ?? "/", "http://localhost").pathname;

  if (upgradePath === "/wisp/") {
    req.url = upgradePath;
    wisp.routeRequest(req, socket, head);
    return;
  }

  if (upgradePath === "/chat/") {
    const session = getSessionFromCookieHeader(req.headers.cookie);
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    handleChatUpgrade(req, socket, head, session);
    return;
  }

  if (upgradePath === "/remote/") {
    const q = new URL(req.url ?? "/", "http://localhost").searchParams;
    const role = authorizeRemote({
      role: q.get("role"),
      key: q.get("key") || "",
      session: getSessionFromCookieHeader(req.headers.cookie),
    });
    if (!role) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    handleRemoteUpgrade(req, socket, head, role);
    return;
  }

  socket.end();
});

/*
|--------------------------------------------------------------------------
| COEP/COOP headers â€” required for SharedArrayBuffer (wisp transport)
|--------------------------------------------------------------------------
*/
app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(express.json());
app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| Serve Scramjet v2 static assets
|
| /scram/      â†’ scramjetPath (from @mercuryworkshop/scramjet/path)
| /controller/ â†’ @mercuryworkshop/scramjet-controller  (exposes controller.api.js, controller.sw.js, controller.inject.js)
| /utils/      â†’ @mercuryworkshop/scramjet-utils
| /libcurl/    â†’ @mercuryworkshop/libcurl-transport
|--------------------------------------------------------------------------
*/
app.use("/scramjet/", express.static(scramjetPath));
app.use("/scram/", express.static(scramjetPath));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/libcurl/", express.static(dirOf("@mercuryworkshop/libcurl-transport")));

/*
|--------------------------------------------------------------------------
| Serve public static files (your frontend)
|--------------------------------------------------------------------------
*/
const publicDir = path.join(path.dirname(new URL(import.meta.url).pathname), "public");

/*
|--------------------------------------------------------------------------
| CloudMoon client, served from jsDelivr
|
| jsDelivr returns .html as text/plain on purpose, so the CDN URL cannot be
| framed directly - it would render as source. We fetch it and re-serve it
| as text/html from our own origin instead.
|
| No <base> tag: that would hijack every relative URL the app resolves,
| including its own API calls. Only the two relative assets are rewritten,
| and any relative page navigation falls through to this same route.
|
| Serving it from our own origin is what lets it run inside the desktop. A
| cross-origin frame can never load in an isolated document, but a
| same-origin one can as long as it carries COEP itself - which it does,
| from the middleware above.
|--------------------------------------------------------------------------
*/
const CM_CDN = "https://cdn.jsdelivr.net/gh/CloudMoonApp/web@main/";
const CM_ENTRY = process.env.CLOUDMOON_ENTRY || "index-260909.html";
const CM_NAME = /^[A-Za-z0-9._-]+\.html$/;
const CM_TTL = 10 * 60 * 1000;
const cmCache = new Map();

async function cloudMoonPage(file) {
  const hit = cmCache.get(file);
  if (hit && Date.now() - hit.at < CM_TTL) return hit.html;

  const r = await fetch(CM_CDN + file);
  if (!r.ok) throw new Error(`CDN returned ${r.status} for ${file}`);
  let html = await r.text();
  html = html.replaceAll('"./run-site/', `"${CM_CDN}run-site/`);
  html = html.replaceAll('"run-site/', `"${CM_CDN}run-site/`);

  cmCache.set(file, { html, at: Date.now() });
  return html;
}

/*
|--------------------------------------------------------------------------
| CloudMoon catalog
|
| The guest catalogue needs no account, so the desktop can render its own
| grid instead of framing CloudMoon's. Cached server-side so 200-odd games
| are not refetched per visitor. Playing still happens in their client:
| the play page wants a signed-in session (sid + token), which we do not
| have and will not ask people for.
|--------------------------------------------------------------------------
*/
const CM_API = process.env.CLOUDMOON_API || "https://api.prod.geometry.today";
const CM_CATALOG_TTL = 15 * 60 * 1000;
let cmCatalog = { at: 0, data: null };

async function cloudMoonCatalog() {
  if (cmCatalog.data && Date.now() - cmCatalog.at < CM_CATALOG_TTL) return cmCatalog.data;

  const device = crypto.randomUUID();
  const qs = (extra = {}) =>
    new URLSearchParams({
      device_type: "web",
      query_uuid: crypto.randomUUID(),
      site: "cm",
      device_id: device,
      ...extra,
    }).toString();

  const [gamesRes, catsRes] = await Promise.all([
    fetch(`${CM_API}/game/guest_list?${qs()}`),
    fetch(`${CM_API}/game/category?${qs()}`),
  ]);
  if (!gamesRes.ok) throw new Error(`catalog returned ${gamesRes.status}`);

  const games = (await gamesRes.json())?.data?.list || [];
  const cats = catsRes.ok ? (await catsRes.json())?.data?.list || [] : [];

  const data = {
    categories: cats
      .filter((c) => c.is_show && c.key !== "all")
      .map((c) => ({ key: c.key, name: c.name, count: c.count })),
    games: games
      .filter((g) => g.status === 1)
      .map((g) => ({
        name: g.title,
        pkg: g.package_name,
        icon: g.icon_url ? "/api/cloud/icon?u=" + encodeURIComponent(g.icon_url) : "",
        cats: g.categories || [],
        beta: Boolean(g.is_beta),
        vip: g.min_vip_level > 1,
        pc: Boolean(g.is_pc),
      })),
  };

  cmCatalog = { at: Date.now(), data };
  return data;
}

/*
 * Box art lives on a bucket that sends neither CORS nor CORP, so an
 * isolated page cannot load it directly. Re-serving it from our origin
 * sidesteps both. Host-locked so this cannot be used as an open proxy.
 */
const CM_ICON_HOST = /(^|\.)myqcloud\.com$/;

app.get("/api/cloud/icon", async (req, res) => {
  let url;
  try {
    url = new URL(String(req.query.u || ""));
  } catch (_) {
    return res.status(400).end();
  }
  if (url.protocol !== "https:" || !CM_ICON_HOST.test(url.hostname)) {
    return res.status(403).end();
  }
  try {
    const upstream = await fetch(url, { headers: { accept: "image/*" } });
    if (!upstream.ok) return res.status(upstream.status).end();
    const type = upstream.headers.get("content-type") || "image/webp";
    if (!type.startsWith("image/")) return res.status(415).end();
    res.set("Content-Type", type);
    res.set("Cache-Control", "public, max-age=86400, immutable");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.status(502).end();
  }
});

app.get("/api/cloud/games", async (_req, res) => {
  try {
    const data = await cloudMoonCatalog();
    res.set("Cache-Control", "public, max-age=600").json(data);
  } catch (err) {
    console.error("CloudMoon catalog failed:", err.message);
    res.status(502).json({ error: "Could not load the cloud games list." });
  }
});

/*
 * Their client navigates with relative URLs, so the frame is loaded at
 * /cloud/app/ (trailing slash) and "play-260909.html" resolves to
 * /cloud/app/play-260909.html. /cloud/:file is kept as a fallback for any
 * link that still resolves one level up, which otherwise 404s and dumps
 * the user back on the home screen.
 */
app.get("/cloud/:file([A-Za-z0-9._-]+\.html)", (req, res) =>
  res.redirect(302, "/cloud/app/" + req.params.file)
);

app.get("/cloud/app/:file?", async (req, res) => {
  const file = req.params.file || CM_ENTRY;
  if (!CM_NAME.test(file)) return res.status(400).send("Bad file name.");
  try {
    /*
     * credentialless, not require-corp. The frame has to carry COEP to be
     * allowed inside the isolated desktop at all, but require-corp would
     * then block every third party that does not send CORP - which is the
     * tailwind CDN, the image CDN and the API hosts, leaving the client
     * rendered but unstyled. credentialless satisfies the isolation rule
     * and still loads them, by dropping credentials on those requests.
     */
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.type("html").send(await cloudMoonPage(file));
  } catch (err) {
    console.error("CloudMoon fetch failed:", err.message);
    res
      .status(502)
      .type("html")
      .send(
        `<body style="font:15px system-ui;background:#0b0d12;color:#f3f5f9;padding:40px">` +
          `<h2>Cloud gaming is unavailable</h2><p>Could not load the client from jsDelivr.</p>` +
          `<p style="opacity:.6">${err.message}</p>` +
          `<p><a style="color:#a855f7" href="https://web.cloudmoonapp.com" target="_blank" rel="noopener">Open CloudMoon directly</a></p></body>`
      );
  }
});

app.use(express.static(publicDir));

const guestSessions = new Map();
const e2bSandboxes = new Map();

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function createToken(payload) {
  return jwt.sign(payload, AUTH_SECRET, { expiresIn: "7d" });
}

function getSession(req) {
  const token = req.cookies.vm_session;
  if (!token) return null;
  try {
    return jwt.verify(token, AUTH_SECRET);
  } catch (_) {
    return null;
  }
}

function getSessionFromCookieHeader(header) {
  if (!header) return null;
  const match = /(?:^|;\s*)vm_session=([^;]+)/.exec(header);
  if (!match) return null;
  try {
    return jwt.verify(decodeURIComponent(match[1]), AUTH_SECRET);
  } catch (_) {
    return null;
  }
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({
      error: "Please create an account, log in, or continue as a guest.",
    });
  }
  req.vmSession = session;
  next();
}

function getVmTimeout(req) {
  return req.vmSession.type === "account"
    ? ACCOUNT_VM_TIMEOUT_MS
    : GUEST_VM_TIMEOUT_MS;
}

function getVmSeconds(req) {
  return Math.floor(getVmTimeout(req) / 1000);
}

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

app.post("/api/auth/register", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (username.length < 3 || username.length > 24) {
    return res.status(400).json({ error: "Username must be 3 to 24 characters." });
  }
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: "Username can only use letters, numbers, underscores, and hyphens." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (getUser(username)) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  createUser(username, passwordHash);

  const token = createToken({ type: "account", username });
  res.cookie("vm_session", token, cookieOptions());
  return res.json({ ok: true, account: true, username, vmMinutes: 60 });
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = getUser(username);

  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  touchUser(username);

  const token = createToken({ type: "account", username });
  res.cookie("vm_session", token, cookieOptions());
  return res.json({ ok: true, account: true, username, vmMinutes: 60 });
});

app.post("/api/auth/guest", (req, res) => {
  const guestId = crypto.randomUUID();
  guestSessions.set(guestId, { createdAt: Date.now() });
  const token = createToken({ type: "guest", guestId });
  res.cookie("vm_session", token, { ...cookieOptions(), maxAge: GUEST_VM_TIMEOUT_MS });
  return res.json({ ok: true, account: false, username: "Guest", vmMinutes: 30 });
});

app.get("/api/auth/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ loggedIn: false });
  return res.json({
    loggedIn: true,
    account: session.type === "account",
    username: session.type === "account" ? session.username : "Guest",
    vmMinutes: session.type === "account" ? 60 : 30,
  });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("vm_session", cookieOptions());
  return res.json({ ok: true });
});

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get("/api/stats", (req, res) => {
  res.json({ online: onlineCount(), accounts: userCount() });
});

app.get("/api/remote/status", (_req, res) => res.json(remoteStatus()));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    e2bConfigured: Boolean(E2B_API_KEY),
    xenvConfigured: Boolean(XENV_API_KEY),
    wispEnabled: true,
    chatEnabled: true,
    accounts: userCount(),
    online: onlineCount(),
  });
});

/*
|--------------------------------------------------------------------------
| XENV GPU VM
|--------------------------------------------------------------------------
*/

app.get("/api/launch", requireSession, async (req, res) => {
  const gpu = req.query.gpu ?? "true";
  const siteLimit = 5;
  const deleteAfter = getVmSeconds(req);

  if (!XENV_API_KEY) {
    return res.status(500).json({ error: "XENV_API_KEY is not configured." });
  }

  try {
    const response = await fetch(
      `${XENV}/api/create?site_limit=${siteLimit}&delete_after=${deleteAfter}&gpu=${encodeURIComponent(gpu)}&developer_id=${encodeURIComponent(DEV_ID)}`,
      { headers: { "X-API-Key": XENV_API_KEY } }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    console.error("XENV launch error:", err);
    res.status(500).json({ error: err.message || "XENV launch failed." });
  }
});

/*
|--------------------------------------------------------------------------
| XENV queue
|--------------------------------------------------------------------------
*/

app.get("/api/queue", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing queue token." });
  if (!XENV_API_KEY) return res.status(500).json({ error: "XENV_API_KEY is not configured." });

  try {
    const response = await fetch(
      `${XENV}/api/queue_status?token=${encodeURIComponent(token)}&wait=true&timeout=25`,
      { headers: { "X-API-Key": XENV_API_KEY } }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    console.error("Queue error:", err);
    res.status(500).json({ error: err.message || "Queue request failed." });
  }
});

/*
|--------------------------------------------------------------------------
| E2B Desktop VM
|--------------------------------------------------------------------------
*/

app.post("/api/e2b/start", requireSession, async (req, res) => {
  if (!E2B_API_KEY) {
    console.error("E2B_API_KEY is missing.");
    return res.status(500).json({ error: "E2B_API_KEY is not configured on the server." });
  }

  let sandbox = null;
  try {
    console.log("Creating E2B Desktop sandbox...");
    const timeoutMs = getVmTimeout(req);
    sandbox = await Sandbox.create({ apiKey: E2B_API_KEY, timeoutMs });

    const sandboxId = sandbox.sandboxId;
    if (!sandboxId) throw new Error("E2B created a sandbox but did not return a sandbox ID.");
    console.log(`E2B sandbox created: ${sandboxId}`);

    await sandbox.stream.start({ requireAuth: true });
    const authKey = await sandbox.stream.getAuthKey();
    if (!authKey) throw new Error("E2B stream started but no authentication key was returned.");

    const streamUrl = sandbox.stream.getUrl({ authKey, autoConnect: true, resize: "scale", viewOnly: false });
    if (!streamUrl) throw new Error("E2B did not return a stream URL.");

    e2bSandboxes.set(sandboxId, sandbox);
    return res.json({
      status: "success",
      sandboxId,
      url: streamUrl,
      timeoutMinutes: Math.floor(timeoutMs / 60000),
    });
  } catch (err) {
    console.error("E2B START FAILED", err);
    if (sandbox) {
      try { await sandbox.stream.stop(); } catch (_) {}
      try { await sandbox.kill(); } catch (_) {}
    }
    return res.status(500).json({ status: "error", error: err?.message || "Failed to start E2B Desktop VM." });
  }
});

/*
|--------------------------------------------------------------------------
| Kill E2B Desktop VM
|--------------------------------------------------------------------------
*/

app.delete("/api/e2b/:id", async (req, res) => {
  const sandboxId = req.params.id;
  try {
    const sandbox = e2bSandboxes.get(sandboxId);
    if (!sandbox) return res.json({ ok: true });
    try { await sandbox.stream.stop(); } catch (_) {}
    try { await sandbox.kill(); } catch (_) {}
    e2bSandboxes.delete(sandboxId);
    console.log(`E2B sandbox killed: ${sandboxId}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("E2B delete error:", err);
    e2bSandboxes.delete(sandboxId);
    return res.status(500).json({ error: err.message || "Failed to delete E2B sandbox." });
  }
});

/*
|--------------------------------------------------------------------------
| Kill XENV GPU VM
|--------------------------------------------------------------------------
*/

app.delete("/api/vm/:id", async (req, res) => {
  if (!XENV_API_KEY) return res.status(500).json({ error: "XENV_API_KEY is not configured." });
  try {
    await fetch(`${XENV}/api/delete/${encodeURIComponent(req.params.id)}`, {
      headers: { "X-API-Key": XENV_API_KEY },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("XENV delete error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete VM." });
  }
});

/*
|--------------------------------------------------------------------------
| Cleanup E2B VMs on shutdown
|--------------------------------------------------------------------------
*/

async function cleanupE2BSandboxes() {
  console.log("Cleaning up E2B sandboxes...");
  for (const [sandboxId, sandbox] of e2bSandboxes) {
    try { await sandbox.stream.stop(); } catch (_) {}
    try { await sandbox.kill(); } catch (_) {}
    console.log(`Cleaned up E2B sandbox: ${sandboxId}`);
  }
  e2bSandboxes.clear();
}

process.on("SIGTERM", async () => { await cleanupE2BSandboxes(); process.exit(0); });
process.on("SIGINT", async () => { await cleanupE2BSandboxes(); process.exit(0); });

/*
|--------------------------------------------------------------------------
| Start
|--------------------------------------------------------------------------
*/
server.listen(PORT, () => {
  console.log(`Willie Games VM running on port ${PORT}`);
  console.log(`E2B configured: ${Boolean(E2B_API_KEY)}`);
  console.log(`XENV configured: ${Boolean(XENV_API_KEY)}`);
  console.log(`Scramjet v2 assets: /scram/ /controller/ /utils/ /libcurl/`);
  console.log(`Wisp endpoint: ws://localhost:${PORT}/wisp/`);
  console.log(`Chat endpoint: ws://localhost:${PORT}/chat/`);
  console.log(`Accounts stored: ${userCount()}`);
});
