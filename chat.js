import { WebSocketServer } from "ws";
import { saveMessage, recentMessages } from "./db.js";

/*
|--------------------------------------------------------------------------
| Global chat over WebSocket
|
| Everyone connected to /chat/ sees the same room. History lives in SQLite
| so the conversation survives a restart.
|--------------------------------------------------------------------------
*/

const MAX_LEN = 500;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 8;

const wss = new WebSocketServer({ noServer: true });
const clients = new Map(); // ws -> { name, account, typingUntil, stamps[] }

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload, except) {
  const raw = JSON.stringify(payload);
  for (const ws of clients.keys()) {
    if (ws !== except && ws.readyState === ws.OPEN) ws.send(raw);
  }
}

function roster() {
  const names = [];
  for (const c of clients.values()) names.push({ name: c.name, account: c.account });
  names.sort((a, b) => Number(b.account) - Number(a.account) || a.name.localeCompare(b.name));
  return names;
}

function pushPresence() {
  broadcast({ type: "presence", online: clients.size, users: roster().slice(0, 50) });
}

export function onlineCount() {
  return clients.size;
}

function rateLimited(state) {
  const now = Date.now();
  state.stamps = state.stamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (state.stamps.length >= RATE_MAX) return true;
  state.stamps.push(now);
  return false;
}

wss.on("connection", (ws, _req, session) => {
  const account = session.type === "account";
  const name = account ? session.username : `guest-${String(session.guestId || "").slice(0, 4)}`;

  clients.set(ws, { name, account, stamps: [], typing: false });
  ws.isAlive = true;

  send(ws, {
    type: "init",
    you: name,
    account,
    online: clients.size,
    users: roster().slice(0, 50),
    typing: [...clients.values()].filter((c) => c.typing).map((c) => c.name),
    messages: recentMessages(60),
  });

  broadcast({ type: "join", name, account, at: Date.now() }, ws);
  pushPresence();

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw) => {
    const state = clients.get(ws);
    if (!state) return;

    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }

    if (data.type === "typing") {
      const on = Boolean(data.on);
      if (on === state.typing) return;
      state.typing = on;
      broadcast({ type: "typing", name: state.name, on }, ws);
      return;
    }

    if (data.type !== "msg") return;

    const text = String(data.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
    if (!text) return;

    if (rateLimited(state)) {
      send(ws, { type: "system", text: "Slow down a little — too many messages." });
      return;
    }

    if (state.typing) {
      state.typing = false;
      broadcast({ type: "typing", name: state.name, on: false }, ws);
    }

    const saved = saveMessage({ username: state.name, account: state.account, text });
    broadcast({ type: "msg", ...saved });
  });

  ws.on("close", () => {
    const state = clients.get(ws);
    clients.delete(ws);
    if (state) {
      if (state.typing) broadcast({ type: "typing", name: state.name, on: false });
      broadcast({ type: "leave", name: state.name, at: Date.now() });
    }
    pushPresence();
  });

  ws.on("error", () => {
    clients.delete(ws);
    pushPresence();
  });
});

/* Drop connections that stopped answering, so the online count stays honest. */
const heartbeat = setInterval(() => {
  for (const ws of clients.keys()) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 30_000);
heartbeat.unref?.();

export function handleChatUpgrade(req, socket, head, session) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, session);
  });
}

export default wss;
