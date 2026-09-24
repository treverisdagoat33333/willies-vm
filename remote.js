/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import { WebSocketServer } from "ws";
import { getUser } from "./db.js";
import { safeEqual, createLimiter, formatWait } from "./security.js";

/*
|--------------------------------------------------------------------------
| Remote desktop relay
|
| Your PCs sit behind NAT, so they cannot be reached directly. A small agent
| running on each PC dials in as an "agent" under a name, the browser dials
| in as a "viewer" and picks which PC to drive, and this relay pipes between
| them:
|
|   agent  --(binary JPEG frames, sound, file downloads; JSON meta)--> its viewers
|   viewer --(JSON input / settings / clipboard / files; binary uploads)--> chosen agent
|
| The frame path is zero-copy: an incoming binary message is forwarded to
| every viewer of that PC without being parsed.
|
| Locked down hard, because this drives a real machine:
|   - REMOTE_KEY (a secret only you hold) is required by BOTH sides. It never
|     travels in a URL, where proxies and access logs would keep it: the
|     agent sends it in an Authorization header, the browser (which cannot
|     set headers on a WebSocket) sends it as its first message.
|   - the viewer must additionally be a logged-in OWNER account.
|   - wrong keys are rate limited per address.
|--------------------------------------------------------------------------
*/

const REMOTE_KEY = process.env.REMOTE_KEY || "";
const AUTH_TIMEOUT_MS = 10_000;
const NAME_RE = /^[A-Za-z0-9 ._-]{1,32}$/;

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
const failures = createLimiter({ windowMs: 15 * 60_000, max: 10 });

const agents = new Map(); // name -> { ws, meta, since }
const viewers = new Set(); // browser sockets; ws.rv = { authed, want }

const isFileChunk = (b) => b.length >= 8 && b[0] === 0x57 && b[1] === 0x56 && b[2] === 0x46 && b[3] === 0x31;

function sendJSON(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function agentList() {
  return [...agents].map(([name, a]) => ({
    name,
    since: a.since,
    meta: a.meta,
    viewers: viewersOf(name).length,
  }));
}

function viewersOf(name) {
  return [...viewers].filter((v) => v.rv.authed && v.rv.want === name);
}

function tellViewersOf(name, obj) {
  const raw = JSON.stringify(obj);
  for (const v of viewersOf(name)) if (v.readyState === v.OPEN) v.send(raw);
}

function pushAgentList() {
  const msg = { t: "agents", list: agentList() };
  for (const v of viewers) if (v.rv.authed) sendJSON(v, msg);
}

function pushViewerCount(name) {
  const a = agents.get(name);
  if (a) sendJSON(a.ws, { t: "viewers", n: viewersOf(name).length });
}

/* Public status: no PC names, those are for the owner only. */
export function remoteStatus() {
  return {
    configured: Boolean(REMOTE_KEY),
    agent: agents.size > 0,
    agents: agents.size,
    viewers: viewers.size,
  };
}

/* Full detail for the admin dashboard. */
export function remoteDetail() {
  return { configured: Boolean(REMOTE_KEY), agents: agentList(), viewers: viewers.size };
}

export function cleanAgentName(raw) {
  const name = String(raw || "").trim();
  return NAME_RE.test(name) ? name : "PC";
}

/*
 * Decide who is allowed to open a socket. Returns "agent", "viewer", or an
 * { error, status } to refuse the upgrade with.
 */
export function authorizeRemote({ role, session, authHeader, ip }) {
  if (!REMOTE_KEY) return { error: "remote control is off", status: 404 };

  const wait = failures.peek(ip);
  if (wait) return { error: `too many wrong keys, try again in ${formatWait(wait)}`, status: 429 };

  if (role === "agent") {
    const key = /^Bearer\s+(.+)$/i.exec(String(authHeader || ""))?.[1] || "";
    if (!key || !safeEqual(key, REMOTE_KEY)) {
      failures.hit(ip);
      return { error: "bad key", status: 401 };
    }
    return "agent";
  }

  if (role === "viewer") {
    if (!session || session.type !== "account") return { error: "sign in", status: 401 };
    const user = getUser(session.username);
    if (!user || (user.role || "member") !== "owner") return { error: "owner only", status: 403 };
    return "viewer"; // the key itself arrives as the first message
  }

  return { error: "unknown role", status: 400 };
}

wss.on("connection", (ws, _req, { role, name, ip }) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  if (role === "agent") return onAgent(ws, name);
  return onViewer(ws, ip);
});

function onAgent(ws, name) {
  // a fresh agent under the same name replaces a stale one
  const old = agents.get(name);
  if (old && old.ws !== ws) {
    try {
      old.ws.close(4002, "replaced");
    } catch (_) {}
  }
  agents.set(name, { ws, meta: null, since: Date.now() });
  tellViewersOf(name, { t: "up", name });
  pushAgentList();
  pushViewerCount(name);

  ws.on("message", (data, isBinary) => {
    if (agents.get(name)?.ws !== ws) return;
    if (isBinary) {
      // hot path: a screen frame. forward verbatim, no parse.
      for (const v of viewersOf(name)) if (v.readyState === v.OPEN) v.send(data, { binary: true });
      return;
    }
    // small JSON control from the agent (meta, pong, clipboard)
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (_) {
      return;
    }
    if (msg.t === "meta") {
      agents.get(name).meta = msg;
      pushAgentList();
    }
    tellViewersOf(name, msg);
  });

  const drop = () => {
    if (agents.get(name)?.ws !== ws) return;
    agents.delete(name);
    tellViewersOf(name, { t: "down", name });
    pushAgentList();
  };
  ws.on("close", drop);
  ws.on("error", drop);
}

function onViewer(ws, ip) {
  ws.rv = { authed: false, want: null };
  viewers.add(ws);

  const authTimer = setTimeout(() => {
    if (!ws.rv.authed) ws.close(4001, "no key");
  }, AUTH_TIMEOUT_MS);

  const select = (name) => {
    const prev = ws.rv.want;
    ws.rv.want = name;
    if (prev && prev !== name) pushViewerCount(prev);
    const a = name && agents.get(name);
    sendJSON(ws, { t: a ? "up" : "down", name });
    if (a?.meta) sendJSON(ws, a.meta);
    if (a) pushViewerCount(name);
    pushAgentList();
  };

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      // the only binary a viewer sends is a file upload chunk ("WVF1" + id + bytes)
      if (!ws.rv.authed || !isFileChunk(data)) return;
      const a = ws.rv.want && agents.get(ws.rv.want);
      if (a && a.ws.readyState === a.ws.OPEN) a.ws.send(data, { binary: true });
      return;
    }
    const text = data.toString();

    if (!ws.rv.authed) {
      let msg;
      try {
        msg = JSON.parse(text);
      } catch (_) {
        return ws.close(4001, "bad key");
      }
      if (msg.t !== "auth" || !safeEqual(String(msg.key || ""), REMOTE_KEY)) {
        failures.hit(ip);
        return ws.close(4001, "bad key");
      }
      failures.reset(ip);
      clearTimeout(authTimer);
      ws.rv.authed = true;
      sendJSON(ws, { t: "authed" });
      sendJSON(ws, { t: "agents", list: agentList() });
      // reconnect to the PC we were on, or the only one there is
      const want = msg.pc && agents.has(msg.pc) ? msg.pc : agents.size === 1 ? [...agents.keys()][0] : null;
      select(want);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(text);
    } catch (_) {
      return;
    }
    // relay-level control: which PC this viewer is driving
    if (msg.t === "select") return select(msg.name ? cleanAgentName(msg.name) : null);

    // everything else (input, quality, monitor, clipboard) goes to the chosen PC
    const a = ws.rv.want && agents.get(ws.rv.want);
    if (a && a.ws.readyState === a.ws.OPEN) a.ws.send(text);
  });

  const drop = () => {
    clearTimeout(authTimer);
    if (!viewers.delete(ws)) return;
    if (ws.rv.want) pushViewerCount(ws.rv.want);
    pushAgentList();
  };
  ws.on("close", drop);
  ws.on("error", drop);
}

/* drop dead sockets so the agent slots and viewer counts stay honest */
const heartbeat = setInterval(() => {
  const all = [...[...agents.values()].map((a) => a.ws), ...viewers];
  for (const ws of all) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (_) {}
  }
}, 15000);
heartbeat.unref?.();

export function handleRemoteUpgrade(req, socket, head, info) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, info);
  });
}

export default wss;
