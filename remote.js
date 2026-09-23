/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import { WebSocketServer } from "ws";
import { getUser } from "./db.js";

/*
|--------------------------------------------------------------------------
| Remote desktop relay
|
| Your PC sits behind NAT, so it cannot be reached directly. A small agent
| running on the PC dials in as the "agent", the browser dials in as a
| "viewer", and this relay pipes between them:
|
|   agent  --(binary JPEG frames, JSON meta)-->  viewers
|   viewer --(JSON input: mouse / keyboard / quality)--> agent
|
| The frame path is zero-copy: an incoming binary message is forwarded to
| every viewer without being parsed. Control messages are small JSON.
|
| Locked down hard, because this drives a real machine:
|   - REMOTE_KEY (a secret only you hold) is required by BOTH sides.
|   - the viewer must additionally be a logged-in OWNER account.
| Miss either and the upgrade is refused.
|--------------------------------------------------------------------------
*/

const REMOTE_KEY = process.env.REMOTE_KEY || "";
const OWNER = String(process.env.OWNER_USERNAME || "william").trim().toLowerCase();

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

let agent = null; // the single connected PC agent
let agentMeta = null; // last {t:'meta',w,h,...} the agent announced
const viewers = new Set(); // connected browser viewers

function sendJSON(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function tellViewers(obj) {
  const raw = JSON.stringify(obj);
  for (const v of viewers) if (v.readyState === v.OPEN) v.send(raw);
}

export function remoteStatus() {
  return { agent: Boolean(agent), viewers: viewers.size, configured: Boolean(REMOTE_KEY) };
}

/*
 * Decide who is allowed in. Returns "agent", "viewer" or null.
 * The caller has already parsed the query and cookie session.
 */
export function authorizeRemote({ role, key, session }) {
  if (!REMOTE_KEY) return null; // feature off until a key is set
  if (key !== REMOTE_KEY) return null;

  if (role === "agent") return "agent";

  if (role === "viewer") {
    if (!session || session.type !== "account") return null;
    const user = getUser(session.username);
    if (!user || (user.role || "member") !== "owner") return null;
    return "viewer";
  }
  return null;
}

wss.on("connection", (ws, _req, role) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  if (role === "agent") {
    // a fresh agent replaces any stale one
    if (agent && agent !== ws) {
      try {
        agent.close(4002, "replaced");
      } catch (_) {}
    }
    agent = ws;
    agentMeta = null;
    tellViewers({ t: "up" });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        // hot path: a screen frame. forward verbatim, no parse.
        for (const v of viewers) if (v.readyState === v.OPEN) v.send(data, { binary: true });
        return;
      }
      // small JSON control from the agent (meta, pong)
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (_) {
        return;
      }
      if (msg.t === "meta") agentMeta = msg;
      tellViewers(msg);
    });

    ws.on("close", () => {
      if (agent === ws) {
        agent = null;
        agentMeta = null;
        tellViewers({ t: "down" });
      }
    });
    ws.on("error", () => {
      if (agent === ws) {
        agent = null;
        agentMeta = null;
        tellViewers({ t: "down" });
      }
    });
    return;
  }

  // viewer
  viewers.add(ws);
  sendJSON(ws, { t: agent ? "up" : "down" });
  if (agentMeta) sendJSON(ws, agentMeta);
  if (agent) sendJSON(agent, { t: "viewers", n: viewers.size });

  ws.on("message", (data, isBinary) => {
    if (isBinary) return; // viewers never send frames
    // forward input / quality controls straight to the agent
    if (agent && agent.readyState === agent.OPEN) agent.send(data.toString());
  });

  const drop = () => {
    viewers.delete(ws);
    if (agent) sendJSON(agent, { t: "viewers", n: viewers.size });
  };
  ws.on("close", drop);
  ws.on("error", drop);
});

/* drop dead sockets so the agent slot and viewer count stay honest */
const heartbeat = setInterval(() => {
  const all = agent ? [agent, ...viewers] : [...viewers];
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

export function handleRemoteUpgrade(req, socket, head, role) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, role);
  });
}

export default wss;
