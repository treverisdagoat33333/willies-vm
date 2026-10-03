/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import zlib from "node:zlib";
import { compressedStatic } from "./static.js";
import { backupRouter } from "./backup.js";
import { gamesRouter } from "./games.js";
import { arcadeRouter, ARCADE_CATALOG } from "./arcade.js";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { scramjetPath as scramjetV1Path } from "scramjet-v1/path";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { Sandbox } from "@e2b/desktop";
import db, {
  getUser,
  createUser,
  touchUser,
  userCount,
  tokenVersion,
  setPassword,
  bumpTokenVersion,
  deleteUser,
  adminUsers,
  messageCount,
  setRole,
  ROLES,
  listSanctions,
  liftSanction,
  ownerName,
  getSettings,
  saveSettings,
} from "./db.js";
import {
  handleChatUpgrade,
  handleCallRelayUpgrade,
  handleVoiceUpgrade,
  chatMayPost,
  chatMayRead,
  onlineCount,
  onlineList,
  kickUser,
  muteUser,
  banUser,
  announce,
  refreshMembers,
  resetChat,
} from "./chat.js";
import {
  handleRemoteUpgrade,
  authorizeRemote,
  remoteStatus,
  remoteDetail,
  cleanAgentName,
} from "./remote.js";
import { clientIp, createLimiter, limitByIp, formatWait } from "./security.js";
import { musicRouter } from "./music.js";
import { aiRouter, shellSandbox as aiShellSandbox } from "./ai.js";
import { moviesRouter } from "./movies.js";
import { analyticsRouter, record, recentErrors, onError } from "./analytics.js";
import { filesRouter } from "./files.js";
import { emojiRouter } from "./emoji.js";
import { driveRouter, forgetDrive } from "./drive.js";
import { hasBadWords } from "./profanity.js";
import { banFor, addBan, removeBan, listBans, deviceOf, deviceFromCookieHeader, seenAt, lastSeenFrom, bannedPage, KINDS, SCOPES } from "./bans.js";
import { fastnetHandler } from "./fastnet.js";
import { ownerToolsRouter, viewOnly, untoldViews } from "./owner-tools.js";

const require = createRequire(import.meta.url);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));

const app = express();
const server = http.createServer(app);

// Render terminates TLS in front of us: trust its one proxy hop, so req.ip
// is the visitor and req.secure reflects the original https request.
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const XENV_API_KEY = process.env.XENV_API_KEY;
const DEV_ID = process.env.XENV_DEV_ID || "willie-games-vm";
const E2B_API_KEY = process.env.E2B_API_KEY;
// Our own E2B templates (built by e2b-template/build.mjs): the coding desktop, and which one the
// owner's kept VM uses. Unset means E2B's plain desktop.
const E2B_CODE_TEMPLATE = process.env.E2B_CODE_TEMPLATE || "";
const E2B_KEPT_TEMPLATE = process.env.E2B_KEPT_TEMPLATE || "";
// The owner's AI key for the coding VM: an OpenAI- and Anthropic-compatible API. It lives only in
// Render's settings and is written into VM #4, which only the owner can start.
const VM4_AI_KEY = process.env.VM4_AI_KEY || "";
const VM4_AI_URL = (process.env.VM4_AI_URL || "").replace(/\/+$/, "");
const VM4_CLAUDE_MODEL = process.env.VM4_CLAUDE_MODEL || "claude-fable-5-1";
const VM4_FAST_MODEL = process.env.VM4_FAST_MODEL || "claude-haiku-4-5";

let vm4Models = { at: 0, list: [] };
async function vm4ModelList() {
  if (Date.now() - vm4Models.at < 10 * 60_000 && vm4Models.list.length) return vm4Models.list;
  try {
    const r = await fetch(VM4_AI_URL + "/models", { headers: { Authorization: "Bearer " + VM4_AI_KEY }, signal: AbortSignal.timeout(10_000) });
    const ids = ((await r.json())?.data || []).map((m) => m?.id).filter((x) => typeof x === "string" && x.length < 100);
    if (ids.length) vm4Models = { at: Date.now(), list: ids };
  } catch (e) { console.warn("VM #4 model list:", e.message); }
  return vm4Models.list.length ? vm4Models.list : [VM4_CLAUDE_MODEL, VM4_FAST_MODEL];
}

/* The owner's Claude Code login for VM #4. Claude.ai's sign-in page doesn't work inside the
   VM's own browser, so "Log in to Claude Code" runs `claude setup-token` in the VM, sends its
   sign-in link to the owner's real browser, and types the code they paste back. The year-long
   token it prints is kept here, encrypted with a key from AUTH_SECRET, and handed to every
   later VM #4 as CLAUDE_CODE_OAUTH_TOKEN, so it starts signed in. */
db.exec("CREATE TABLE IF NOT EXISTS owner_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
const secretKey = () => crypto.createHash("sha256").update("owner-secrets:" + process.env.AUTH_SECRET).digest();
function saveSecret(name, plain) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  db.prepare("INSERT INTO owner_secrets (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(name, Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64"), Date.now());
}
function readSecret(name) {
  const row = db.prepare("SELECT value FROM owner_secrets WHERE name = ?").get(name);
  if (!row) return "";
  try {
    const b = Buffer.from(row.value, "base64"), d = crypto.createDecipheriv("aes-256-gcm", secretKey(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch (_) { return ""; } // AUTH_SECRET changed: the old token can't be read, so sign in again
}
const forgetSecret = (name) => db.prepare("DELETE FROM owner_secrets WHERE name = ?").run(name);
// what goes into a VM for Claude Code: the saved login, or nothing (it then asks to sign in)
function claudeLoginFiles() {
  const token = readSecret("claude_code");
  if (!token) return { envs: {}, files: [] };
  return {
    envs: { CLAUDE_CODE_OAUTH_TOKEN: token },
    files: [{ path: "/home/user/.claude.json", data: JSON.stringify({ hasCompletedOnboarding: true }) }],
  };
}

// What VM #4 gets: environment variables for every terminal, plus config files so opencode and
// VS Code's Continue start already pointed at the owner's API with its models. Claude Code never
// gets the API key: it's signed in to the owner's own Claude account, once "Log in to Claude
// Code" has saved that login (claudeLoginFiles), and otherwise asks to sign in like a new install.
const shq = (v) => "'" + String(v).replace(/'/g, "'\\''") + "'";
const profileOf = (envs) => Object.entries(envs).map(([k, v]) => `export ${k}=${shq(v)}`).join("\n") + "\n";
async function vm4Setup() {
  const login = claudeLoginFiles();
  // the terminal apps draw boxes and symbols, which come out as "?" without UTF-8
  const base = { LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8", ...login.envs };
  if (!VM4_AI_KEY || !VM4_AI_URL) return { envs: base, files: [{ path: "/home/user/.vm4-env", data: profileOf(base) }, ...login.files] };
  const models = await vm4ModelList();
  const envs = { OPENAI_BASE_URL: VM4_AI_URL, OPENAI_API_KEY: VM4_AI_KEY, ...base };
  const profile = profileOf(envs);
  const opencode = {
    $schema: "https://opencode.ai/config.json",
    model: "owner/" + VM4_CLAUDE_MODEL,
    small_model: "owner/" + VM4_FAST_MODEL,
    provider: {
      owner: {
        npm: "@ai-sdk/openai-compatible", name: "My API",
        options: { baseURL: VM4_AI_URL, apiKey: VM4_AI_KEY },
        models: Object.fromEntries(models.map((id) => [id, { name: id }])),
      },
    },
  };
  const continueCfg = "name: My API\nversion: 1.0.0\nschema: v1\nmodels:\n" + models.map((id) =>
    `  - name: ${JSON.stringify(id)}\n    provider: openai\n    model: ${JSON.stringify(id)}\n    apiBase: ${JSON.stringify(VM4_AI_URL)}\n    apiKey: ${JSON.stringify(VM4_AI_KEY)}\n    roles: [chat, edit, apply]`).join("\n") + "\n";
  return {
    envs,
    files: [
      { path: "/home/user/.vm4-env", data: profile },
      { path: "/home/user/.config/opencode/opencode.json", data: JSON.stringify(opencode, null, 2) },
      { path: "/home/user/.continue/config.yaml", data: continueCfg },
      ...login.files,
    ],
  };
}
const AUTH_SECRET = process.env.AUTH_SECRET;
const XENV = "https://loremgroup.org";
const GUEST_VM_TIMEOUT_MS = 30 * 60 * 1000;
const ACCOUNT_VM_TIMEOUT_MS = 60 * 60 * 1000;
// Render sets RENDER=true on every service, so cookies are Secure there even
// if NODE_ENV was never configured.
const IS_PROD = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);
const STARTED_AT = Date.now();

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
  // the same site bans as for pages: chat, voice, the proxy's wisp and the rest
  {
    const s = getSessionFromCookieHeader(req.headers.cookie);
    const owner = s?.viewedBy || (s?.type === "account" && getUser(s.username)?.role === "owner");
    // viewing as someone is read-only: chat (read-only there) and the proxy, nothing that talks
    if (s?.viewedBy && /^\/(voice|call-relay|remote)\//.test(upgradePath)) return refuseUpgrade(socket, 403, "Read-only");
    if (!owner && banFor({ ip: clientIp(req), user: s?.type === "account" ? s.username : null, device: deviceFromCookieHeader(req.headers.cookie) })) return refuseUpgrade(socket, 403, "Banned");
  }

  if (upgradePath === "/wisp/") {
    req.url = upgradePath;
    wisp.routeRequest(req, socket, head);
    return;
  }

  if (upgradePath === "/chat/") {
    const session = getSessionFromCookieHeader(req.headers.cookie);
    if (!session) return refuseUpgrade(socket, 401, "Unauthorized");
    handleChatUpgrade(req, socket, head, session, clientIp(req));
    return;
  }

  if (upgradePath === "/voice/") {
    const session = getSessionFromCookieHeader(req.headers.cookie);
    if (!session) return refuseUpgrade(socket, 401, "Unauthorized");
    handleVoiceUpgrade(req, socket, head, session, clientIp(req));
    return;
  }

  if (upgradePath === "/call-relay/") {
    const session = getSessionFromCookieHeader(req.headers.cookie);
    if (!session) return refuseUpgrade(socket, 401, "Unauthorized");
    handleCallRelayUpgrade(req, socket, head, session);
    return;
  }

  if (upgradePath === "/remote/") {
    const q = new URL(req.url ?? "/", "http://localhost").searchParams;
    const ip = clientIp(req);
    const role = authorizeRemote({
      role: q.get("role"),
      session: getSessionFromCookieHeader(req.headers.cookie),
      authHeader: req.headers.authorization,
      ip,
    });
    if (typeof role !== "string") return refuseUpgrade(socket, role.status, role.error);
    const name = role === "agent" ? cleanAgentName(q.get("name")) : null;
    if (role === "agent") logEvent("remote", `PC "${name}" connected`);
    handleRemoteUpgrade(req, socket, head, { role, name, ip });
    return;
  }

  socket.end();
});

function refuseUpgrade(socket, status, reason) {
  socket.write(`HTTP/1.1 ${status} ${String(reason).replace(/[\r\n]/g, " ")}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/*
|--------------------------------------------------------------------------
| Activity log
|
| A short in-memory feed for the owner's dashboard: sign-ups, logins, VM
| launches, moderation. Nothing sensitive (no passwords, no keys).
|--------------------------------------------------------------------------
*/
const activity = [];
function logEvent(kind, text) {
  activity.push({ at: Date.now(), kind, text });
  if (activity.length > 300) activity.splice(0, activity.length - 300);
}

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

// the AI may be sent pictures (shrunk by the page, a few hundred KB each); everything else stays at 100 KB
app.use("/api/ai/chat", express.json({ limit: "10mb" }));
app.use("/api/ai/chats", express.json({ limit: "4mb" })); // an account's whole chat list
app.use(express.json());
app.use(cookieParser());

/* Site bans (bans.js): every request carries a device id, and a banned IP,
   account or device gets the "You're banned" page (or a 403 for the API).
   The owner is never shut out. */
app.use((req, res, next) => {
  req.deviceId = deviceOf(req, res);
  const session = getSession(req);
  // the owner viewing as someone (owner-tools.js) may look, never change anything
  if (viewOnly(session, req)) return res.status(403).json({ error: `Read-only: you're viewing the site as ${session.username}.` });
  if (session?.viewedBy || (session?.type === "account" && getUser(session.username)?.role === "owner")) return next();
  const b = banFor({ ip: req.ip, user: session?.type === "account" ? session.username : null, device: req.deviceId });
  if (!b) return next();
  if (req.path.startsWith("/api/") || req.method !== "GET") return res.status(403).json({ error: "You're banned from Willie OS.", banned: true });
  res.status(403).type("html").send(bannedPage(b));
});

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
/* Package files only change when a deploy installs new versions: an hour of
   caching, then an ETag check. They're compressed once (static.js). */
const pkgStatic = (...dirs) => [compressedStatic(dirs, { maxAge: 3600 }), ...dirs.map((d) => express.static(d, { maxAge: "1h" }))];
app.use("/scramjet/", pkgStatic(scramjetPath));
app.use("/scram/", pkgStatic(scramjetPath));
app.use("/controller/", pkgStatic(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/utils/", pkgStatic(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/libcurl/", pkgStatic(dirOf("@mercuryworkshop/libcurl-transport")));

/*
|--------------------------------------------------------------------------
| The other two proxy engines: Scramjet v1 and Ultraviolet
|
| Settings > Browser > Proxy engine picks the one the browser uses; Scramjet
| v2 above stays the default. These two reach the web through bare-mux, a
| shared worker running the same libcurl transport over /wisp/, adapted by
| public/js/libcurl-bare.mjs. public/sw.js routes all three engines by
| prefix: /~/sj/ (v2), /~/sj1/ (v1), /~/uv/ (Ultraviolet).
|
| /uv/uv.config.js is ours (public/uv/), not the stock one in the package.
|--------------------------------------------------------------------------
*/
app.use("/sj1/", pkgStatic(scramjetV1Path));
app.use("/uv/", compressedStatic([path.join(path.dirname(new URL(import.meta.url).pathname), "public", "uv"), uvPath]), express.static(path.join(path.dirname(new URL(import.meta.url).pathname), "public", "uv")), express.static(uvPath));
app.use("/baremux/", pkgStatic(baremuxPath));
// The Linux VM that runs in the visitor's own tab (public/linux.html): the emulator and its wasm.
app.use("/v86/", pkgStatic(dirOf("v86")));

/*
| WillieJet (public/wj/): our own engine on the Scramjet v2 core above.
| Workers that proxied sites start need the rewriter as a script; this serves
| it once, cacheable, instead of through the proxy on every start.
*/
let wjWasmJs = null;
let wjWasmBr = null;
app.get("/wj/wasm.js", (req, res) => {
  wjWasmJs ||= `self.WASM=${JSON.stringify(fs.readFileSync(path.join(scramjetPath, "scramjet.wasm")).toString("base64"))};`;
  res.type("application/javascript").set({ "Cache-Control": "public, max-age=3600", Vary: "Accept-Encoding" });
  if (!/\bbr\b/.test(req.headers["accept-encoding"] || "")) return res.send(wjWasmJs);
  // base64 of the rewriter is 800 KB; compressed it's a third of that
  wjWasmBr ||= zlib.brotliCompressSync(Buffer.from(wjWasmJs), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } });
  res.set("Content-Encoding", "br").send(wjWasmBr);
});

/*
| WillieJet fast mode (fastnet.js, off unless the user turns it on): the
| engine asks this server to fetch pages for it. Signed-in or guest visitors
| only. The limit is generous because one page is often 100+ requests and a
| whole school can share one IP; over it, WillieJet falls back to /wisp/.
*/
const fastnetLimiter = createLimiter({ windowMs: 60_000, max: 6000 });
app.post("/wj-net", requireSession, limitByIp(fastnetLimiter, "Too many fast-mode requests from your network."), fastnetHandler);

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

/*
 * CloudMoon publishes each version as .html pages plus tiny .svg launchers
 * (260521.svg, play-260521.svg). A launcher is what CloudMoon itself links
 * to: an SVG whose script fetches the real page from jsDelivr and writes it
 * into a frame. Games start through the play launcher, re-served from our
 * origin so the page it writes shares our localStorage (the sign-in token
 * and the session handed over in cm_launch_data). CLOUDMOON_VERSION picks
 * the version; the default is the one known to work.
 */
const CM_VERSION = process.env.CLOUDMOON_VERSION || "260521";
const CM_SVG = /^[A-Za-z0-9._-]+\.svg$/;

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
| are not refetched per visitor. Signing in and playing happen in the
| browser, straight against CloudMoon's API (see CLOUD GAMING in app.js):
| passwords never pass through this server.
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
        minVip: g.min_vip_level || 0,
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
    res.set("Cache-Control", "public, max-age=600").json({
      ...data,
      client: { version: CM_VERSION, play: `/cloud/app/play-${CM_VERSION}.svg`, portal: `${CM_CDN}${CM_VERSION}.svg` },
    });
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

/* the play page's own images sit next to it on the CDN */
app.get("/cloud/app/run-site/:dir/:file", (req, res) => {
  const { dir, file } = req.params;
  if (!/^[A-Za-z0-9._-]+$/.test(dir + file)) return res.status(400).end();
  res.redirect(302, `${CM_CDN}run-site/${dir}/${file}`);
});

/*
 * When a game ends, CloudMoon's play page goes to "./main.svg", which
 * doesn't exist. Answer with a page that tells the desktop, which then
 * returns to the game list.
 */
app.get("/cloud/app/main.svg", (_req, res) => {
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res
    .type("html")
    .send(
      `<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0d12;color:#f3f5f9;font:15px system-ui">Game ended.` +
        `<script>try{top.postMessage({cm:"ended"},location.origin)}catch(e){}</script></body>`
    );
});

app.get("/cloud/app/:file([A-Za-z0-9._-]+\\.svg)", async (req, res) => {
  const file = req.params.file;
  if (!CM_SVG.test(file)) return res.status(400).end();
  try {
    const hit = cmCache.get(file);
    let svg = hit && Date.now() - hit.at < CM_TTL ? hit.html : null;
    if (!svg) {
      const r = await fetch(CM_CDN + file, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return res.status(r.status === 404 ? 404 : 502).end();
      svg = await r.text();
      cmCache.set(file, { html: svg, at: Date.now() });
    }
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.type("image/svg+xml").send(svg);
  } catch (err) {
    console.error("CloudMoon launcher fetch failed:", err.message);
    res.status(502).end();
  }
});

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

// the Arcade: ~1,800 HTML games, served sandboxed with a storage shim (arcade.js)
const arcadeLimiter = createLimiter({ windowMs: 60_000, max: 120 });
app.use(arcadeRouter({ catalog: ARCADE_CATALOG(publicDir), limiter: limitByIp(arcadeLimiter, "Too many games opened. Wait a minute.") }));
// your own HTML games in public/games/ (games.js)
app.use(gamesRouter(path.join(publicDir, "games")));
/* Willie AI: the AI on its own, installable as an app (its own manifest, name and icon, so it
   installs apart from Willie OS). Same page, marked data-solo="ai", which hides the rest. */
app.get(["/ai", "/ai/"], (_req, res) => {
  const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8")
    .replace('<html lang="en">', '<html lang="en" data-solo="ai">')
    .replace("<title>Willie OS</title>", "<title>Willie AI</title>")
    .replace("maximum-scale=1\">", "maximum-scale=1,viewport-fit=cover\">")
    .replace('href="/manifest.webmanifest"', 'href="/ai.webmanifest"')
    .replace('href="/icons/apple-touch-icon.png"', 'href="/icons/ai-apple-180.png"')
    .replace('content="Willie OS">', 'content="Willie AI">')
    .replace('<meta name="theme-color" content="#0b0d12">', '<meta name="theme-color" content="#000000">');
  res.set({ "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" }).send(html);
});
app.use(compressedStatic(publicDir), express.static(publicDir));
app.use(ownerToolsRouter({ requireOwner, getUser, getSession, verifyToken, createToken, tokenVersion, cookieOptions, logEvent }));

const e2bSandboxes = new Map(); // sandboxId -> { sandbox, owner, who, startedAt, expiresAt }
const xenvVMs = new Map(); // container id -> { owner, who, startedAt, expiresAt }

function cookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function createToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, AUTH_SECRET, { expiresIn });
}

/* Account tokens carry the user's token version: bumping it signs out everywhere. */
function accountToken(username) {
  return createToken({ type: "account", username, tv: tokenVersion(username) ?? 0 });
}

function verifyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, AUTH_SECRET);
  } catch (_) {
    return null;
  }
  if (payload.type === "account") {
    const tv = tokenVersion(payload.username);
    if (tv == null || (payload.tv ?? 0) !== tv) return null; // deleted, or signed out
  }
  return payload;
}

function getSession(req) {
  const token = req.cookies.vm_session;
  return token ? verifyToken(token) : null;
}

function getSessionFromCookieHeader(header) {
  if (!header) return null;
  const match = /(?:^|;\s*)vm_session=([^;]+)/.exec(header);
  if (!match) return null;
  try {
    return verifyToken(decodeURIComponent(match[1]));
  } catch (_) {
    return null;
  }
}

function sessionLabel(session) {
  if (!session) return "unknown";
  return session.type === "account" ? session.username : `guest-${String(session.guestId || "").slice(0, 6)}`;
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

function requireAccount(req, res, next) {
  const session = getSession(req);
  if (!session || session.type !== "account") {
    return res.status(401).json({ error: "Sign in to an account first." });
  }
  req.vmSession = session;
  next();
}

function isOwnerSession(session) {
  return session?.type === "account" && getUser(session.username)?.role === "owner";
}

function requireOwner(req, res, next) {
  const session = getSession(req);
  if (!isOwnerSession(session)) return res.status(403).json({ error: "Owner only." });
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

/*
 * Brute-force protection. Per address for everything, plus per username for
 * failed passwords, so spreading guesses across addresses does not help.
 * The per-address limits are generous on purpose: a whole school or house
 * shares one address, and the per-username limit does the real work.
 */
const registerLimiter = createLimiter({ windowMs: 60 * 60_000, max: Number(process.env.REGISTER_PER_HOUR) || 20 }); // the test suite raises it: it signs up dozens
const loginIpLimiter = createLimiter({ windowMs: 15 * 60_000, max: 60 });
const passwordFailLimiter = createLimiter({ windowMs: 15 * 60_000, max: 8 });
const guestLimiter = createLimiter({ windowMs: 60 * 60_000, max: 120 });

function passwordLocked(username, res) {
  const wait = passwordFailLimiter.peek(username);
  if (!wait) return false;
  res.set("Retry-After", String(wait));
  res.status(429).json({ error: `Too many wrong passwords for this account. Try again in ${formatWait(wait)}.` });
  return true;
}

/*
 * Owner lock. On Render's free plan the database starts empty after every
 * deploy and every spin-down, and whoever registered OWNER_USERNAME first
 * would become owner. With OWNER_PASSWORD set, the server creates that
 * account itself on boot, so the name is never up for grabs. An account that
 * already exists is left alone, so a password changed on the site sticks
 * until the next wipe.
 */
async function ensureOwnerAccount() {
  const name = ownerName();
  const password = process.env.OWNER_PASSWORD || "";
  if (!password) {
    if (!getUser(name)) console.warn(`OWNER_PASSWORD is not set: whoever registers "${name}" first becomes owner.`);
    return;
  }
  if (password.length < 8) throw new Error("OWNER_PASSWORD must be at least 8 characters.");
  if (getUser(name)) return;
  createUser(name, await bcrypt.hash(password, 12));
  console.log(`Owner account "${name}" created from OWNER_PASSWORD.`);
}

app.post("/api/auth/register", limitByIp(registerLimiter, "Too many new accounts from your network."), async (req, res) => {
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
  // only the owner swears here, and a username shows up everywhere
  if (username !== ownerName() && hasBadWords(username)) {
    return res.status(400).json({ error: "Pick a different username. That one has a bad word in it." });
  }

  // the owner can stop a device or network making accounts (Admin panel)
  if (banFor({ ip: req.ip, device: req.deviceId }, "signup")) {
    return res.status(403).json({ error: "New accounts can't be made from this device." });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  if (getUser(username)) {
    return res.status(409).json({ error: "That username is already taken." });
  }
  const created = createUser(username, passwordHash);
  seenAt(username, req.ip, req.deviceId);
  logEvent("account", `${username} signed up`);
  record("signup");

  res.cookie("vm_session", accountToken(username), cookieOptions());
  return res.json({ ok: true, account: true, username, role: created.role, vmMinutes: 60 });
});

app.post("/api/auth/login", limitByIp(loginIpLimiter, "Too many sign-in attempts from your network."), async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (passwordLocked(username, res)) return;
  const user = getUser(username);

  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    passwordFailLimiter.hit(username);
    return res.status(401).json({ error: "Invalid username or password." });
  }

  passwordFailLimiter.reset(username);
  if (user.role !== "owner" && banFor({ user: username })) return res.status(403).json({ error: "That account is banned from Willie OS.", banned: true });
  touchUser(username);
  seenAt(username, req.ip, req.deviceId);
  logEvent("login", `${username} signed in`);

  res.cookie("vm_session", accountToken(username), cookieOptions());
  return res.json({ ok: true, account: true, username, role: getUser(username).role, vmMinutes: 60 });
});

app.post("/api/auth/guest", limitByIp(guestLimiter, "Too many guest sessions from your network."), (req, res) => {
  const guestId = crypto.randomUUID();
  const token = createToken({ type: "guest", guestId });
  res.cookie("vm_session", token, { ...cookieOptions(), maxAge: GUEST_VM_TIMEOUT_MS });
  return res.json({ ok: true, account: false, username: "Guest", role: "guest", vmMinutes: 30 });
});

app.get("/api/auth/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ loggedIn: false });
  const account = session.type === "account";
  if (account) seenAt(session.username, req.ip, req.deviceId);
  return res.json({
    loggedIn: true,
    account,
    username: account ? session.username : "Guest",
    role: account ? getUser(session.username)?.role || "member" : "guest",
    vmMinutes: account ? 60 : 30,
    since: account ? getUser(session.username)?.created_at || null : null,
    viewedBy: session.viewedBy || null,
    // the owner looked at this account as them; say so once
    ownerViews: account && !session.viewedBy ? untoldViews(session.username) : [],
  });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("vm_session", cookieOptions());
  return res.json({ ok: true });
});

/*
|--------------------------------------------------------------------------
| Account management
|--------------------------------------------------------------------------
*/

async function checkPassword(req, res) {
  const username = req.vmSession.username;
  if (passwordLocked(username, res)) return false;
  const user = getUser(username);
  const ok = user && (await bcrypt.compare(String(req.body?.password || ""), user.password_hash));
  if (!ok) {
    passwordFailLimiter.hit(username);
    res.status(401).json({ error: "That password isn't right." });
    return false;
  }
  passwordFailLimiter.reset(username);
  return true;
}

app.post("/api/account/password", requireAccount, async (req, res) => {
  const next = String(req.body?.newPassword || "");
  if (next.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters." });
  if (next.length > 200) return res.status(400).json({ error: "That password is too long." });
  if (!(await checkPassword(req, res))) return;

  const username = req.vmSession.username;
  setPassword(username, await bcrypt.hash(next, 12)); // also signs out every other session
  kickUser(username, 4005, "signed out");
  logEvent("account", `${username} changed their password`);
  res.cookie("vm_session", accountToken(username), cookieOptions());
  res.json({ ok: true });
});

app.post("/api/account/signout-others", requireAccount, (req, res) => {
  const username = req.vmSession.username;
  bumpTokenVersion(username);
  kickUser(username, 4005, "signed out"); // this tab reconnects with its fresh cookie
  logEvent("account", `${username} signed out other devices`);
  res.cookie("vm_session", accountToken(username), cookieOptions());
  res.json({ ok: true });
});

app.post("/api/account/delete", requireAccount, async (req, res) => {
  const username = req.vmSession.username;
  if (getUser(username)?.role === "owner") {
    return res.status(400).json({ error: "The owner account can't be deleted." });
  }
  if (String(req.body?.confirm || "") !== username) {
    return res.status(400).json({ error: "Type your username to confirm." });
  }
  if (!(await checkPassword(req, res))) return;

  kickUser(username, 4005, "deleted");
  deleteUser(username);
  forgetDrive(username);
  logEvent("account", `${username} deleted their account`);
  res.clearCookie("vm_session", cookieOptions());
  res.json({ ok: true });
});

/*
 * Settings sync. The page owns the shape of the data; the server only checks
 * that it's a small JSON object, so one account can't fill the disk. The
 * global JSON parser already refuses bodies over 100 KB.
 */
const SETTINGS_MAX_BYTES = 96 * 1024;
const settingsLimiter = createLimiter({ windowMs: 10 * 60_000, max: 120 });

app.get("/api/account/settings", requireAccount, (req, res) => {
  res.json(getSettings(req.vmSession.username) || { data: null, updatedAt: 0 });
});

app.put("/api/account/settings", requireAccount, (req, res) => {
  const username = req.vmSession.username;
  const wait = settingsLimiter.hit(username);
  if (wait) {
    res.set("Retry-After", String(wait));
    return res.status(429).json({ error: `Saving too often. Try again in ${formatWait(wait)}.` });
  }
  const data = req.body?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "Settings must be an object." });
  }
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) > SETTINGS_MAX_BYTES) {
    return res.status(413).json({ error: "Your settings are too big to sync." });
  }
  res.json({ ok: true, updatedAt: saveSettings(username, json) });
});

/*
 * ICE servers for voice calls. STUN finds a direct path, which works on most
 * networks. Strict networks (many schools) block that, and only a TURN relay
 * gets through: set TURN_URL (comma-separated), TURN_USERNAME, TURN_CREDENTIAL.
 */
app.get("/api/calls/ice", requireAccount, (_req, res) => {
  const iceServers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(",").map((u) => u.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || "",
      credential: process.env.TURN_CREDENTIAL || "",
    });
  }
  res.json({ iceServers });
});

/*
|--------------------------------------------------------------------------
| Music (see music.js)
|--------------------------------------------------------------------------
*/
const musicLimiter = createLimiter({ windowMs: 60_000, max: 90 });
// the audio has its own budget: each song is a request or a few (seeking asks again), and a school shares one IP
const musicStreamLimiter = createLimiter({ windowMs: 60_000, max: 400 });
app.use(
  "/api/music",
  musicRouter({
    requireSession,
    limiter: limitByIp(musicLimiter, "Too many music requests from your network."),
    streamLimiter: limitByIp(musicStreamLimiter, "Too many songs from your network at once. Try again in a minute."),
  })
);

/*
|--------------------------------------------------------------------------
| Movies & TV (see movies.js)
|--------------------------------------------------------------------------
*/
const moviesLimiter = createLimiter({ windowMs: 60_000, max: 120 });
app.use(
  "/api/movies",
  moviesRouter({
    requireSession,
    limiter: limitByIp(moviesLimiter, "Too many movie requests from your network."),
  })
);

/*
|--------------------------------------------------------------------------
| Analytics for the owner dashboard (see analytics.js): counts only
|--------------------------------------------------------------------------
*/
const statsLimiter = createLimiter({ windowMs: 10 * 60_000, max: 300 }); // a busy page reports an app or song now and then
app.use(
  "/api/stats",
  analyticsRouter({
    requireSession,
    requireOwner,
    sessionLabel,
    limiter: limitByIp(statsLimiter, "Too many reports.", (req) => sessionLabel(req.vmSession)),
  })
);

/* Owner backups: download everything, load it back after a wipe (backup.js) */
app.use("/api/admin/backup", backupRouter({ requireOwner, onRestored: () => { resetChat(); logEvent("backup", "Backup restored"); } }));

/*
|--------------------------------------------------------------------------
| Pictures and files in chat (see files.js)
|--------------------------------------------------------------------------
*/
const filesLimiter = createLimiter({ windowMs: 10 * 60_000, max: 40 }); // uploads per person (and network)
app.use(
  "/api/chat/files",
  filesRouter({
    requireSession,
    requireAccount,
    limiter: limitByIp(filesLimiter, "You're uploading a lot. Wait a few minutes.", (req) => req.vmSession?.username || ""),
    mayPost: chatMayPost,
    mayRead: chatMayRead,
  })
);

app.use("/api/emoji", emojiRouter({ requireSession, requireAccount }));
const driveLimiter = createLimiter({ windowMs: 10 * 60_000, max: 120 }); // uploads to Files per person (and network)
app.use("/api/drive", driveRouter({ requireAccount, limiter: limitByIp(driveLimiter, "You're uploading a lot. Wait a few minutes.", (req) => req.vmSession?.username || "") }));

/*
|--------------------------------------------------------------------------
| AI chat (see ai.js). The key stays here: AI_API_KEY, AI_BASE_URL, AI_MODEL.
|--------------------------------------------------------------------------
*/
const aiIpLimiter = createLimiter({ windowMs: 10 * 60_000, max: 240 }); // per network (a school shares one)
const aiUserLimiter = createLimiter({ windowMs: 10 * 60_000, max: 40 }); // per person
app.use(
  "/api/ai",
  aiRouter({
    requireSession,
    limiter: limitByIp(aiIpLimiter, "Too many AI messages from your network."),
    isOwner: isOwnerSession,
    // the AI's cloud computer gets the owner's saved Claude Code login too
    shellEnv: () => { const t = readSecret("claude_code"); return t ? { CLAUDE_CODE_OAUTH_TOKEN: t } : {}; },
    userLimiter: (req, res, next) => {
      const wait = aiUserLimiter.hit(sessionLabel(req.vmSession));
      if (!wait) return next();
      res.set("Retry-After", String(wait));
      res.status(429).json({ error: `You've sent a lot of AI messages. Try again in ${formatWait(wait)}.` });
    },
  })
);

/*
|--------------------------------------------------------------------------
| Owner dashboard
|--------------------------------------------------------------------------
*/

function vmList() {
  const now = Date.now();
  const e2b = [...e2bSandboxes].map(([id, v]) => ({
    id, kind: "e2b", owner: v.owner, startedAt: v.startedAt, expiresAt: v.expiresAt,
  }));
  const gpu = [...xenvVMs].map(([id, v]) => ({
    id, kind: "gpu", owner: v.owner, startedAt: v.startedAt, expiresAt: v.expiresAt,
  }));
  return [...e2b, ...gpu].filter((v) => !v.expiresAt || v.expiresAt > now);
}

app.get("/api/admin/overview", requireOwner, (_req, res) => {
  const mem = process.memoryUsage();
  const vms = vmList();
  res.json({
    server: {
      startedAt: STARTED_AT,
      uptime: Math.floor(process.uptime()),
      node: process.version,
      rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576),
      e2bConfigured: Boolean(E2B_API_KEY),
      xenvConfigured: Boolean(XENV_API_KEY),
    },
    counts: {
      accounts: userCount(),
      online: onlineCount(),
      messages: messageCount(),
      vms: vms.length,
    },
    vms,
    online: onlineList(),
    users: adminUsers(),
    sanctions: listSanctions(),
    remote: remoteDetail(),
    activity: activity.slice(-120).reverse(),
  });
});

/*
|--------------------------------------------------------------------------
| Live: every open page says what it's doing every 20 s (POST /api/live/beat),
| and the owner's dashboard gets a stream (GET /api/admin/live, server-sent
| events) of who's here right now and each problem the moment it happens.
| In memory only; a visitor is "here" for 50 s after their last beat.
|--------------------------------------------------------------------------
*/
const LIVE_MS = 50_000;
const liveVisitors = new Map(); // label -> {name, account, app, since, at, ip, device}
const kicked = new Set(); // labels whose next beat sends them back to the sign-in screen
const LIVE_APPS = new Set(["desktop", "browser", "vm", "cloud", "remote", "movies", "music", "ai", "chat", "arcade", "apps", "settings", "files"]);
// which deploy this is, so open pages notice they're out of date (Render sets the commit)
const BUILD = (process.env.RENDER_GIT_COMMIT || Date.now().toString(36)).slice(0, 7);
app.get("/api/version", (req, res) => res.set("cache-control", "no-store").json({ build: BUILD }));
app.post("/api/live/beat", requireSession, (req, res) => {
  const label = sessionLabel(req.vmSession);
  const appName = LIVE_APPS.has(req.body?.app) ? req.body.app : "desktop";
  const prev = liveVisitors.get(label);
  liveVisitors.set(label, { name: label, account: req.vmSession.type === "account", app: appName, hidden: !!req.body?.hidden, since: prev?.since || Date.now(), at: Date.now(), ip: req.ip, device: req.deviceId });
  // kicked by the owner: a guest loses their session; the page goes back to the sign-in screen
  if (kicked.has(label)) {
    kicked.delete(label);
    if (req.vmSession.type !== "account") res.clearCookie("vm_session", cookieOptions());
    liveVisitors.delete(label);
    return res.json({ kick: true });
  }
  res.json({ build: BUILD });
});
function liveSnapshot() {
  const now = Date.now();
  for (const [k, v] of liveVisitors) if (now - v.at > LIVE_MS) liveVisitors.delete(k);
  const visitors = [...liveVisitors.values()].sort((a, b) => a.since - b.since);
  const byApp = {};
  for (const v of visitors) byApp[v.app] = (byApp[v.app] || 0) + 1;
  return { at: now, visitors, byApp, counts: { visitors: visitors.length, accounts: visitors.filter((v) => v.account).length, chat: onlineCount(), vms: vmList().length }, errors: recentErrors(), rssMb: Math.round(process.memoryUsage().rss / 1048576) };
}
app.get("/api/admin/live", requireOwner, (req, res) => {
  res.status(200).set({ "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no", connection: "keep-alive" });
  res.flushHeaders?.();
  const push = (type, data) => { if (!res.writableEnded) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
  push("live", liveSnapshot());
  const tick = setInterval(() => push("live", liveSnapshot()), 2000);
  const stop = onError((e) => push("problem", e));
  req.on("close", () => { clearInterval(tick); stop(); });
});

/* ---- site bans and kicks (bans.js) ---- */
app.get("/api/admin/bans", requireOwner, (_req, res) => res.json({ bans: listBans() }));
app.post("/api/admin/bans", requireOwner, (req, res) => {
  const kind = String(req.body?.kind || ""), scope = SCOPES.includes(req.body?.scope) ? req.body.scope : "site";
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "Ban an ip, user or device." });
  // the value can be given, or worked out from an account or someone on the site right now
  let value = String(req.body?.value || "").trim(), label = String(req.body?.label || "").slice(0, 80);
  const user = req.body?.user ? String(req.body.user).toLowerCase() : "";
  const visitor = req.body?.visitor ? liveVisitors.get(String(req.body.visitor)) : null;
  if (!value && kind === "user") value = user || (visitor?.account ? visitor.name : "");
  if (!value && user) value = (lastSeenFrom(user) || {})[kind === "ip" ? "ip" : "device"] || "";
  if (!value && visitor) value = kind === "ip" ? visitor.ip : visitor.device;
  if (!value) return res.status(400).json({ error: kind === "user" ? "Pick an account." : `No ${kind === "ip" ? "IP address" : "device"} known for them yet.` });
  label ||= user || visitor?.name || "";
  // never lock out the owner, by name, network or device
  const me = req.vmSession.username;
  if ((kind === "user" && value === me) || (kind === "ip" && value === req.ip) || (kind === "device" && value === req.deviceId)) return res.status(400).json({ error: "That would ban you too." });
  if (kind === "user" && getUser(value)?.role === "owner") return res.status(400).json({ error: "The owner can't be banned." });
  const hours = req.body?.hours ? Math.min(Math.max(Number(req.body.hours) || 24, 1), 24 * 365 * 5) : null;
  const id = addBan({ kind, value, scope, hours, reason: req.body?.reason || "", label, by: me });
  if (scope === "site") {
    // whoever it matches leaves now: their pages, chat and voice
    for (const [l, v] of liveVisitors) if ((kind === "ip" && v.ip === value) || (kind === "device" && v.device === value) || (kind === "user" && l === value)) { kicked.add(l); if (v.account) kickUser(l, 4005, "banned"); }
    if (kind === "user") { bumpTokenVersion(value); kickUser(value, 4005, "banned"); }
  }
  logEvent("admin", `${scope === "signup" ? "blocked sign-ups from" : "banned"} ${kind} ${kind === "user" ? value : label || value.slice(0, 12)}${hours ? ` for ${hours}h` : ""}`);
  res.json({ ok: true, id });
});
app.delete("/api/admin/bans/:id", requireOwner, (req, res) => {
  if (!removeBan(req.params.id)) return res.status(404).json({ error: "No such ban." });
  logEvent("admin", `lifted ban ${req.params.id}`);
  res.json({ ok: true });
});
/* Kick someone off the site: an account is signed out everywhere, a guest loses their session. */
app.post("/api/admin/visitors/:label/kick", requireOwner, (req, res) => {
  const label = String(req.params.label || "");
  if (label === req.vmSession.username) return res.status(400).json({ error: "That's you." });
  const v = liveVisitors.get(label);
  if (getUser(label)) { if (getUser(label).role === "owner") return res.status(400).json({ error: "The owner can't be kicked." }); bumpTokenVersion(label); kickUser(label, 4005, "kicked"); }
  else if (!v) return res.status(404).json({ error: "They aren't on the site right now." });
  else kickUser(label, 4005, "kicked"); // a guest's chat socket goes now; the page follows on its next beat
  kicked.add(label);
  logEvent("admin", `${label} was kicked off the site`);
  res.json({ ok: true });
});

/*
| Pranks: the owner sends something to one person's open page. Pages wait on
| GET /api/live/wait (held up to 25 s) so a prank lands within a second, not on
| the next 20 s beat. Every prank ends by itself within a minute, so nobody is
| ever stuck on the site's screen.
*/
const PRANKS = new Set(["message", "alarm", "shake", "flip", "virus", "emoji"]);
const prankQueue = new Map(); // label -> [{kind, text, secs}]
const prankWaiters = new Map(); // label -> Set(res)
function prankFlush(label) {
  const q = prankQueue.get(label), ws = prankWaiters.get(label);
  if (!q?.length || !ws?.size) return;
  prankQueue.delete(label);
  for (const res of ws) res.json({ pranks: q });
  ws.clear();
}
app.get("/api/live/wait", requireSession, (req, res) => {
  const label = sessionLabel(req.vmSession);
  res.set("cache-control", "no-store");
  if (!prankWaiters.has(label)) prankWaiters.set(label, new Set());
  const ws = prankWaiters.get(label);
  ws.add(res);
  const done = () => { clearTimeout(t); ws.delete(res); };
  const t = setTimeout(() => { ws.delete(res); if (!res.headersSent) res.json({ pranks: [] }); }, 25_000);
  res.on("close", done);
  prankFlush(label);
});
app.post("/api/admin/visitors/:label/prank", requireOwner, (req, res) => {
  const label = String(req.params.label || ""), kind = String(req.body?.kind || "");
  if (!PRANKS.has(kind)) return res.status(400).json({ error: "Unknown prank." });
  if (label === req.vmSession.username || getUser(label)?.role === "owner") return res.status(400).json({ error: "That's you." });
  if (!liveVisitors.has(label)) return res.status(404).json({ error: "They aren't on the site right now." });
  const secs = Math.min(Math.max(Number(req.body?.secs) || 10, 3), 60);
  const item = { kind, secs, text: String(req.body?.text || "").slice(0, 300) };
  if (!prankQueue.has(label)) prankQueue.set(label, []);
  prankQueue.get(label).push(item);
  prankFlush(label);
  logEvent("admin", `pranked ${label} (${kind})`);
  res.json({ ok: true });
});

app.post("/api/admin/vms/:id/kill", requireOwner, async (req, res) => {
  const id = req.params.id;
  if (e2bSandboxes.has(id)) {
    await killE2B(id);
  } else if (xenvVMs.has(id)) {
    await killXenv(id).catch(() => xenvVMs.delete(id));
  } else {
    return res.status(404).json({ error: "No such VM." });
  }
  logEvent("admin", `${req.vmSession.username} stopped VM ${id.slice(0, 10)}`);
  res.json({ ok: true });
});

function targetName(req) {
  return String(req.params.name || "").trim().toLowerCase();
}

app.post("/api/admin/users/:name/role", requireOwner, (req, res) => {
  const name = targetName(req);
  const role = String(req.body?.role || "");
  if (!ROLES.includes(role) || role === "owner") return res.status(400).json({ error: "Pick admin, mod or member." });
  if (!setRole(name, role)) return res.status(400).json({ error: "Can't change that account's role." });
  refreshMembers();
  logEvent("admin", `${name} is now ${role}`);
  res.json({ ok: true });
});

app.post("/api/admin/users/:name/signout", requireOwner, (req, res) => {
  const name = targetName(req);
  if (!getUser(name)) return res.status(404).json({ error: "No such account." });
  if (name === req.vmSession.username) return res.status(400).json({ error: "Use Account settings for yourself." });
  bumpTokenVersion(name);
  kickUser(name, 4005, "signed out");
  logEvent("admin", `${name} was signed out everywhere`);
  res.json({ ok: true });
});

app.post("/api/admin/users/:name/kick", requireOwner, (req, res) => {
  const name = String(req.params.name || "");
  const n = kickUser(name);
  if (n) logEvent("admin", `${name} was kicked from chat`);
  res.json({ ok: true, closed: n });
});

app.post("/api/admin/users/:name/mute", requireOwner, (req, res) => {
  const name = String(req.params.name || "");
  if (name === req.vmSession.username) return res.status(400).json({ error: "You can't mute yourself." });
  const minutes = Math.min(Math.max(Number(req.body?.minutes) || 10, 1), 7 * 24 * 60);
  muteUser(name, { minutes, reason: req.body?.reason, by: req.vmSession.username });
  logEvent("admin", `${name} was muted for ${minutes}m`);
  res.json({ ok: true });
});

app.post("/api/admin/users/:name/ban", requireOwner, (req, res) => {
  const name = String(req.params.name || "");
  if (name === req.vmSession.username) return res.status(400).json({ error: "You can't ban yourself." });
  const hours = req.body?.hours == null ? null : Math.min(Math.max(Number(req.body.hours) || 24, 1), 24 * 365);
  banUser(name, { hours, reason: req.body?.reason, by: req.vmSession.username });
  logEvent("admin", `${name} was banned ${hours ? `for ${hours}h` : "permanently"}`);
  res.json({ ok: true });
});

app.delete("/api/admin/sanctions/:name/:kind", requireOwner, (req, res) => {
  const kind = req.params.kind === "ban" ? "ban" : "mute";
  liftSanction(String(req.params.name || ""), kind);
  logEvent("admin", `${req.params.name}'s ${kind} was lifted`);
  res.json({ ok: true });
});

app.delete("/api/admin/users/:name", requireOwner, (req, res) => {
  const name = targetName(req);
  const user = getUser(name);
  if (!user) return res.status(404).json({ error: "No such account." });
  if (user.role === "owner") return res.status(400).json({ error: "The owner account can't be deleted." });
  kickUser(name, 4005, "deleted");
  deleteUser(name);
  forgetDrive(name);
  refreshMembers();
  logEvent("admin", `${name}'s account was deleted`);
  res.json({ ok: true });
});

app.post("/api/admin/announce", requireOwner, (req, res) => {
  if (!announce(req.body?.text, req.vmSession.username)) return res.status(400).json({ error: "Write something first." });
  logEvent("admin", `announcement: ${String(req.body.text).slice(0, 60)}`);
  res.json({ ok: true });
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
| VM limits
|
| Every VM spends real E2B credits or XENV capacity, so starting one is
| capped three ways: how many one person can run at once, how often a person
| and a network can start them, and how many the whole site runs at once.
| Guests cost nothing to mint, which is why the per-network limit exists.
| The owner is exempt from all of it.
|--------------------------------------------------------------------------
*/

const VM_LIVE_LIMIT = { guest: 1, account: 2 };
const MAX_LIVE_VMS = Math.max(1, Number(process.env.MAX_LIVE_VMS) || 20);
const vmStartLimiter = createLimiter({ windowMs: 60 * 60_000, max: 6 }); // per person
const vmStartIpLimiter = createLimiter({ windowMs: 60 * 60_000, max: 20 }); // per network
const PENDING_STALE_MS = 2 * 60_000;

// VMs that are still starting, or waiting in the XENV queue, count as running,
// so a double click or a second tab can't slip past the limit.
const vmPending = new Map(); // key -> { who, seenAt }

/* Stable per-person key: the full guest id, not the 6-character label. */
function vmWho(session) {
  return session.type === "account" ? `u:${session.username}` : `g:${session.guestId}`;
}

function liveVMs() {
  const now = Date.now();
  for (const [k, p] of vmPending) if (now - p.seenAt > PENDING_STALE_MS) vmPending.delete(k);
  return [...e2bSandboxes.values(), ...xenvVMs.values(), ...vmPending.values()];
}

function vmStartRefusal(req) {
  const session = req.vmSession;
  if (isOwnerSession(session)) return null;

  const who = vmWho(session);
  const live = liveVMs();
  const account = session.type === "account";
  if (live.filter((v) => v.who === who).length >= VM_LIVE_LIMIT[account ? "account" : "guest"]) {
    return {
      status: 409,
      error: account
        ? `You already have ${VM_LIVE_LIMIT.account} VMs running. Close one first.`
        : "Guests can run one VM at a time. Close yours first, or make an account to run two.",
    };
  }
  if (live.length >= MAX_LIVE_VMS) {
    return { status: 503, error: "Every VM slot is in use right now. Try again in a few minutes." };
  }

  const ip = clientIp(req);
  let wait = vmStartLimiter.peek(who);
  if (wait) return { status: 429, wait, error: `You're starting VMs too fast. Try again in ${formatWait(wait)}.` };
  wait = vmStartIpLimiter.peek(ip);
  if (wait) return { status: 429, wait, error: `Too many VMs started from your network. Try again in ${formatWait(wait)}.` };
  vmStartLimiter.hit(who);
  vmStartIpLimiter.hit(ip);
  return null;
}

function vmStartGate(req, res, next) {
  const refusal = vmStartRefusal(req);
  if (!refusal) {
    // a guest pass lasts 30 minutes from sign-in; stretch it over this VM, or
    // stopping the VM near its end would find the guest signed out
    if (req.vmSession.type === "guest") {
      res.cookie("vm_session", req.cookies.vm_session, { ...cookieOptions(), maxAge: GUEST_VM_TIMEOUT_MS });
    }
    return next();
  }
  if (refusal.wait) res.set("Retry-After", String(refusal.wait));
  res.status(refusal.status).json({ error: refusal.error });
}

function reserveVM(req, key = crypto.randomUUID()) {
  vmPending.set(key, { who: vmWho(req.vmSession), seenAt: Date.now() });
  return key;
}

/* Only whoever started a VM, or the owner, may stop it. */
function ownVM(req, map) {
  const entry = map.get(req.params.id);
  if (!entry) return null;
  return entry.who === vmWho(req.vmSession) || isOwnerSession(req.vmSession) ? entry : null;
}

/*
|--------------------------------------------------------------------------
| XENV GPU VM
|--------------------------------------------------------------------------
*/

app.get("/api/launch", requireSession, vmStartGate, async (req, res) => {
  const gpu = req.query.gpu ?? "true";
  const siteLimit = 5;
  const deleteAfter = getVmSeconds(req);

  if (!XENV_API_KEY) {
    return res.status(500).json({ error: "XENV_API_KEY is not configured." });
  }

  const reservation = reserveVM(req);
  try {
    const response = await fetch(
      `${XENV}/api/create?site_limit=${siteLimit}&delete_after=${deleteAfter}&gpu=${encodeURIComponent(gpu)}&developer_id=${encodeURIComponent(DEV_ID)}`,
      // XENV sometimes never answers; without a limit the page said "Requesting GPU instance…" forever
      { headers: { "X-API-Key": XENV_API_KEY }, signal: AbortSignal.timeout(45_000) }
    );
    const data = await response.json().catch(() => ({ error: `The GPU provider sent a bad reply (HTTP ${response.status}).` }));
    if (!response.ok) return res.status(response.status).json(data);
    if (data.status === "success" && data.container_id) trackXenv(data.container_id, req.vmSession, deleteAfter);
    // a queued launch keeps its slot for as long as the page keeps polling
    if (data.status === "queued" && data.token) reserveVM(req, `q:${data.token}`);
    res.json(data);
  } catch (err) {
    console.error("XENV launch error:", err);
    const slow = err?.name === "TimeoutError" || err?.name === "AbortError";
    res.status(slow ? 504 : 502).json({ error: slow ? "The GPU provider didn't answer. It may be down or out of GPUs; try again in a few minutes." : `Couldn't reach the GPU provider (${err.message || "network error"}).` });
  } finally {
    vmPending.delete(reservation);
  }
});

function trackXenv(id, session, seconds) {
  const owner = sessionLabel(session);
  xenvVMs.set(id, { owner, who: vmWho(session), startedAt: Date.now(), expiresAt: Date.now() + seconds * 1000 });
  setTimeout(() => xenvVMs.delete(id), seconds * 1000).unref?.();
  logEvent("vm", `${owner} started a GPU VM`);
  record("vm", "gpu");
}

async function killXenv(id) {
  if (XENV_API_KEY) {
    await fetch(`${XENV}/api/delete/${encodeURIComponent(id)}`, {
      headers: { "X-API-Key": XENV_API_KEY },
    });
  }
  xenvVMs.delete(id);
}

/*
|--------------------------------------------------------------------------
| XENV queue
|--------------------------------------------------------------------------
*/

app.get("/api/queue", requireSession, async (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).json({ error: "Missing queue token." });
  if (!XENV_API_KEY) return res.status(500).json({ error: "XENV_API_KEY is not configured." });
  const pendingKey = `q:${token}`;
  if (vmPending.get(pendingKey)?.who === vmWho(req.vmSession)) vmPending.get(pendingKey).seenAt = Date.now();

  try {
    const response = await fetch(
      `${XENV}/api/queue_status?token=${encodeURIComponent(token)}&wait=true&timeout=25`,
      { headers: { "X-API-Key": XENV_API_KEY }, signal: AbortSignal.timeout(40_000) }
    );
    const data = await response.json().catch(() => ({ error: `The GPU provider sent a bad reply (HTTP ${response.status}).` }));
    if (!response.ok) return res.status(response.status).json(data);
    if (data.status === "allocated" || data.status === "failed") vmPending.delete(pendingKey);
    if (data.status === "allocated" && data.container_id && !xenvVMs.has(data.container_id)) {
      trackXenv(data.container_id, req.vmSession, getVmSeconds(req));
    }
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

app.post("/api/e2b/start", requireSession, vmStartGate, async (req, res) => {
  if (!E2B_API_KEY) {
    console.error("E2B_API_KEY is missing.");
    return res.status(500).json({ error: "E2B_API_KEY is not configured on the server." });
  }

  let sandbox = null;
  const reservation = reserveVM(req);
  try {
    console.log("Creating E2B Desktop sandbox...");
    const timeoutMs = getVmTimeout(req);
    const code = req.body?.kind === "code";
    if (code && !isOwnerSession(req.vmSession)) throw Object.assign(new Error("VM #4 is only for the owner."), { status: 403 });
    if (code && !E2B_CODE_TEMPLATE) throw Object.assign(new Error("The coding VM isn't set up yet. The owner needs to build its template (see e2b-template/)."), { status: 503 });
    const setup = code ? await vm4Setup() : null;
    sandbox = code
      ? await Sandbox.create(E2B_CODE_TEMPLATE, { apiKey: E2B_API_KEY, timeoutMs, envs: setup.envs })
      : await Sandbox.create({ apiKey: E2B_API_KEY, timeoutMs });
    if (setup?.files.length) {
      await sandbox.files.write(setup.files);
      // terminals opened from the desktop read .bashrc, not the sandbox's own variables
      await sandbox.commands.run("grep -q vm4-env ~/.bashrc || echo '[ -f ~/.vm4-env ] && . ~/.vm4-env' >> ~/.bashrc; chmod 600 ~/.vm4-env ~/.claude.json ~/.config/opencode/opencode.json ~/.continue/config.yaml 2>/dev/null; true", { timeoutMs: 15_000 });
    }

    const sandboxId = sandbox.sandboxId;
    if (!sandboxId) throw new Error("E2B created a sandbox but did not return a sandbox ID.");
    console.log(`E2B sandbox created: ${sandboxId}`);

    await sandbox.stream.start({ requireAuth: true });
    const authKey = await sandbox.stream.getAuthKey();
    if (!authKey) throw new Error("E2B stream started but no authentication key was returned.");

    const streamUrl = sandbox.stream.getUrl({ authKey, autoConnect: true, resize: "scale", viewOnly: false });
    if (!streamUrl) throw new Error("E2B did not return a stream URL.");

    const owner = sessionLabel(req.vmSession);
    e2bSandboxes.set(sandboxId, {
      sandbox, owner, who: vmWho(req.vmSession), startedAt: Date.now(), expiresAt: Date.now() + timeoutMs, code,
    });
    // E2B kills it on its own at the timeout; forget it then too
    setTimeout(() => e2bSandboxes.delete(sandboxId), timeoutMs).unref?.();
    logEvent("vm", `${owner} started a desktop VM`);
    record("vm", "desktop");
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
    return res.status(err?.status || 500).json({ status: "error", error: err?.message || "Failed to start E2B Desktop VM." });
  } finally {
    vmPending.delete(reservation);
  }
});

/*
|--------------------------------------------------------------------------
| The owner's kept VM
|
| One E2B desktop that isn't thrown away: E2B pauses it (memory, open apps
| and files) instead of killing it, when the owner closes it or its hour runs
| out (autoPause, so even a server restart doesn't lose it), and resumes it
| next time. Owner only, because a kept VM costs E2B storage for as long as
| it exists, and running time like any other. Delete it to stop paying.
|--------------------------------------------------------------------------
*/
db.exec("CREATE TABLE IF NOT EXISTS kept_vms (username TEXT PRIMARY KEY, sandbox_id TEXT NOT NULL, created_at INTEGER NOT NULL, used_at INTEGER NOT NULL)");
const KEPT_RUN_MS = 60 * 60_000; // running time per start, then it pauses itself
const E2B_API = process.env.E2B_API_URL || "https://api.e2b.dev";
async function e2bApi(method, p, body) {
  const r = await fetch(E2B_API + p, { method, headers: { "X-API-Key": E2B_API_KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404) return null;
  const text = await r.text();
  if (!r.ok) throw new Error(`E2B: ${(() => { try { return JSON.parse(text).message; } catch (_) { return text.slice(0, 200); } })() || r.status}`);
  return text ? JSON.parse(text) : {};
}
// the SDK always creates with autoPause off, so a kept desktop is created through the API itself
class KeptDesktop extends Sandbox {
  static async createSandbox(template, timeoutMs, opts) {
    const d = await e2bApi("POST", "/sandboxes", { templateID: template, timeout: Math.ceil(timeoutMs / 1000), autoPause: true, envVars: opts?.envs, metadata: { kept: "owner" } });
    return { sandboxId: d.sandboxID, sandboxDomain: d.domain || undefined, envdVersion: d.envdVersion, envdAccessToken: d.envdAccessToken };
  }
}
const keptRow = (u) => db.prepare("SELECT * FROM kept_vms WHERE username = ?").get(u);

/*
|--------------------------------------------------------------------------
| Log in to Claude Code (VM #4 and the kept VM, owner only); see saveSecret
|
|   GET    /api/vm/claude-login            -> {saved}
|   POST   /api/vm/claude-login/start      {sandboxId} -> {url}
|   POST   /api/vm/claude-login/finish     {code} -> {ok}
|   DELETE /api/vm/claude-login            forget the saved login
|--------------------------------------------------------------------------
*/
const stripAnsi = (s) => s.replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b[()][A-Z0-9]/g, "");
let claudeLogin = null; // {sandbox, pid, out, at} while a sign-in waits for its code
async function endClaudeLogin() {
  const l = claudeLogin; claudeLogin = null;
  if (l) await l.sandbox.pty.kill(l.pid).catch(() => {});
}
app.get("/api/vm/claude-login", requireOwner, (_req, res) => res.json({ saved: !!readSecret("claude_code") }));
app.delete("/api/vm/claude-login", requireOwner, (_req, res) => { forgetSecret("claude_code"); res.json({ ok: true }); });
app.post("/api/vm/claude-login/start", requireOwner, async (req, res) => {
  await endClaudeLogin();
  try {
    // the AI app's cloud computer, when the AI asks (claude.login), else the open VM
    const entry = req.body?.target === "ai"
      ? { sandbox: await aiShellSandbox() }
      : e2bSandboxes.get(String(req.body?.sandboxId || ""));
    if (!entry) return res.status(404).json({ error: "Start VM #4 first." });
    const l = { sandbox: entry.sandbox, out: "", at: Date.now() };
    // a wide terminal, so the long sign-in link comes out on one line
    const h = await entry.sandbox.pty.create({ cols: 1000, rows: 40, timeoutMs: 10 * 60_000, envs: { LANG: "en_US.UTF-8", TERM: "xterm-256color" },
      onData: (d) => { l.out = (l.out + new TextDecoder().decode(d)).slice(-200_000); } });
    l.pid = h.pid; claudeLogin = l;
    await entry.sandbox.pty.sendInput(h.pid, new TextEncoder().encode("claude setup-token\n"));
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const url = stripAnsi(l.out).match(/https:\/\/\S*oauth\/authorize\?\S+/)?.[0];
      if (url) return res.json({ url });
    }
    await endClaudeLogin();
    res.status(504).json({ error: "Claude Code didn't show a sign-in link. Try again." });
  } catch (e) {
    await endClaudeLogin();
    res.status(502).json({ error: String(e?.message || e).slice(0, 200) });
  }
});
app.post("/api/vm/claude-login/finish", requireOwner, async (req, res) => {
  const code = String(req.body?.code || "").trim();
  const l = claudeLogin;
  if (!l) return res.status(409).json({ error: "The sign-in ran out. Press Log in to Claude Code again." });
  if (!code || code.length > 500 || /[\r\n]/.test(code)) return res.status(400).json({ error: "Paste the code from the Claude page." });
  try {
    const before = l.out.length;
    await l.sandbox.pty.sendInput(l.pid, new TextEncoder().encode(code));
    await new Promise((r) => setTimeout(r, 300));
    await l.sandbox.pty.sendInput(l.pid, new TextEncoder().encode("\r"));
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const after = stripAnsi(l.out.slice(before));
      const token = after.match(/sk-ant-oat[\w-]+/)?.[0];
      if (token) {
        saveSecret("claude_code", token);
        // this VM gets it now too, so `claude` works without starting a new VM
        const login = claudeLoginFiles();
        await l.sandbox.files.write(login.files).catch(() => {});
        await l.sandbox.commands.run(`touch ~/.vm4-env; grep -v CLAUDE_CODE_OAUTH_TOKEN ~/.vm4-env > ~/.vm4-env.n; echo ${shq("export CLAUDE_CODE_OAUTH_TOKEN=" + token)} >> ~/.vm4-env.n; mv ~/.vm4-env.n ~/.vm4-env; chmod 600 ~/.vm4-env; grep -q vm4-env ~/.bashrc || echo '[ -f ~/.vm4-env ] && . ~/.vm4-env' >> ~/.bashrc`, { timeoutMs: 15_000 }).catch(() => {});
        await endClaudeLogin();
        logEvent("vm", "owner logged Claude Code in to VM #4");
        return res.json({ ok: true });
      }
      if (/invalid|expired|error|failed/i.test(after)) {
        const why = after.split("\n").map((s) => s.trim()).find((s) => /invalid|expired|error|failed/i.test(s)) || "";
        await endClaudeLogin();
        return res.status(400).json({ error: `Claude didn't accept that code${why ? ` (${why.slice(0, 120)})` : ""}. Press Log in to Claude Code to try again.` });
      }
    }
    await endClaudeLogin();
    res.status(504).json({ error: "Claude Code didn't finish signing in. Try again." });
  } catch (e) {
    await endClaudeLogin();
    res.status(502).json({ error: String(e?.message || e).slice(0, 200) });
  }
});

app.get("/api/vm/kept", requireOwner, async (req, res) => {
  const row = keptRow(req.vmSession.username);
  if (!row || !E2B_API_KEY) return res.json({ exists: false, configured: Boolean(E2B_API_KEY) });
  const info = await e2bApi("GET", `/sandboxes/${row.sandbox_id}`).catch(() => undefined);
  if (info === null) { db.prepare("DELETE FROM kept_vms WHERE username = ?").run(row.username); return res.json({ exists: false, configured: true, lost: true }); }
  res.json({ exists: true, configured: true, state: info?.state || "unknown", createdAt: row.created_at, usedAt: row.used_at });
});

app.post("/api/vm/kept/start", requireOwner, async (req, res) => {
  if (!E2B_API_KEY) return res.status(500).json({ error: "E2B_API_KEY is not configured on the server." });
  const me = req.vmSession.username;
  let row = keptRow(me), sbx = null, fresh = false;
  try {
    if (row) {
      const info = await e2bApi("GET", `/sandboxes/${row.sandbox_id}`);
      if (!info) { db.prepare("DELETE FROM kept_vms WHERE username = ?").run(me); row = null; } // E2B dropped it
      else {
        if (info.state === "paused") await e2bApi("POST", `/sandboxes/${row.sandbox_id}/resume`, { timeout: KEPT_RUN_MS / 1000, autoPause: true });
        else await e2bApi("POST", `/sandboxes/${row.sandbox_id}/timeout`, { timeout: KEPT_RUN_MS / 1000 }).catch(() => {});
        sbx = await KeptDesktop.connect(row.sandbox_id, { apiKey: E2B_API_KEY });
        // the old screen server came back with the memory, but its password didn't: start a new one
        await sbx.commands.run("pkill -f x11vnc; pkill -f novnc; pkill -f websockify; true", { timeoutMs: 10_000 }).catch(() => {});
      }
    }
    if (!row) {
      sbx = E2B_KEPT_TEMPLATE
        ? await KeptDesktop.create(E2B_KEPT_TEMPLATE, { apiKey: E2B_API_KEY, timeoutMs: KEPT_RUN_MS })
        : await KeptDesktop.create({ apiKey: E2B_API_KEY, timeoutMs: KEPT_RUN_MS });
      fresh = true;
      db.prepare("INSERT INTO kept_vms (username, sandbox_id, created_at, used_at) VALUES (?, ?, ?, ?)").run(me, sbx.sandboxId, Date.now(), Date.now());
    }
    await sbx.stream.start({ requireAuth: true });
    const authKey = await sbx.stream.getAuthKey();
    const url = sbx.stream.getUrl({ authKey, autoConnect: true, resize: "scale", viewOnly: false });
    db.prepare("UPDATE kept_vms SET used_at = ? WHERE username = ?").run(Date.now(), me);
    e2bSandboxes.set(sbx.sandboxId, { sandbox: sbx, owner: me, who: vmWho(req.vmSession), startedAt: Date.now(), expiresAt: Date.now() + KEPT_RUN_MS, kept: true });
    setTimeout(() => { if (e2bSandboxes.get(sbx.sandboxId)?.kept) e2bSandboxes.delete(sbx.sandboxId); }, KEPT_RUN_MS).unref?.();
    logEvent("vm", `${me} ${fresh ? "made" : "resumed"} their kept VM`);
    record("vm", "kept");
    res.json({ status: "success", sandboxId: sbx.sandboxId, url, fresh, timeoutMinutes: KEPT_RUN_MS / 60000 });
  } catch (err) {
    console.error("KEPT VM START FAILED", err);
    res.status(500).json({ error: err?.message || "The kept VM didn't start." });
  }
});

app.post("/api/vm/kept/pause", requireOwner, async (req, res) => {
  const row = keptRow(req.vmSession.username);
  if (!row) return res.status(404).json({ error: "You have no kept VM." });
  const entry = e2bSandboxes.get(row.sandbox_id);
  e2bSandboxes.delete(row.sandbox_id);
  try { await entry?.sandbox.stream.stop(); } catch (_) {}
  try { await e2bApi("POST", `/sandboxes/${row.sandbox_id}/pause`); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/vm/kept", requireOwner, async (req, res) => {
  const row = keptRow(req.vmSession.username);
  if (!row) return res.status(404).json({ error: "You have no kept VM." });
  e2bSandboxes.delete(row.sandbox_id);
  try { await e2bApi("DELETE", `/sandboxes/${row.sandbox_id}`); } catch (err) { return res.status(500).json({ error: err.message }); }
  db.prepare("DELETE FROM kept_vms WHERE username = ?").run(row.username);
  logEvent("vm", `${row.username} deleted their kept VM`);
  res.json({ ok: true });
});

/*
|--------------------------------------------------------------------------
| Kill E2B Desktop VM
|--------------------------------------------------------------------------
*/

async function killE2B(sandboxId) {
  const entry = e2bSandboxes.get(sandboxId);
  if (!entry) return;
  e2bSandboxes.delete(sandboxId);
  try { await entry.sandbox.stream.stop(); } catch (_) {}
  try { await entry.sandbox.kill(); } catch (_) {}
  console.log(`E2B sandbox killed: ${sandboxId}`);
}

app.delete("/api/e2b/:id", requireSession, async (req, res) => {
  if (!ownVM(req, e2bSandboxes)) return res.status(404).json({ error: "You have no VM with that id." });
  try {
    await killE2B(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("E2B delete error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete E2B sandbox." });
  }
});

/*
|--------------------------------------------------------------------------
| Kill XENV GPU VM
|--------------------------------------------------------------------------
*/

app.delete("/api/vm/:id", requireSession, async (req, res) => {
  if (!ownVM(req, xenvVMs)) return res.status(404).json({ error: "You have no VM with that id." });
  try {
    await killXenv(req.params.id);
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
  for (const [sandboxId, v] of [...e2bSandboxes]) {
    if (v.kept) continue; // pauses itself when its hour is up
    await killE2B(sandboxId);
  }
}

process.on("SIGTERM", async () => { await cleanupE2BSandboxes(); process.exit(0); });
process.on("SIGINT", async () => { await cleanupE2BSandboxes(); process.exit(0); });

/*
|--------------------------------------------------------------------------
| Start
|--------------------------------------------------------------------------
*/
await ensureOwnerAccount(); // before listening, so nobody can register the name first

server.listen(PORT, () => {
  console.log(`Willie Games VM running on port ${PORT}`);
  console.log(`E2B configured: ${Boolean(E2B_API_KEY)}`);
  console.log(`XENV configured: ${Boolean(XENV_API_KEY)}`);
  console.log(`Proxy engines: Scramjet v2 (/~/sj/), WillieJet (/~/wj/), Scramjet v1 (/~/sj1/), Ultraviolet (/~/uv/)`);
  console.log(`Wisp endpoint: ws://localhost:${PORT}/wisp/`);
  console.log(`Chat endpoint: ws://localhost:${PORT}/chat/`);
  console.log(`Accounts stored: ${userCount()}`);
});
