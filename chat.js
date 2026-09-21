/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import { WebSocketServer } from "ws";
import {
  RANK,
  ROLES,
  rankOf,
  ownerName,
  saveMessage,
  channelMessages,
  olderMessages,
  getMessage,
  deleteMessage,
  listChannels,
  channelExists,
  createChannel,
  updateChannel,
  deleteChannel,
  dmChannel,
  dmMembers,
  dmsFor,
  profileOf,
  allProfiles,
  setRole,
  setProfile,
  getUser,
} from "./db.js";

/*
|--------------------------------------------------------------------------
| Community server: channels, DMs, roles and moderation over one socket
|
| Everything lives on /chat/. A connection is bound to one identity for its
| lifetime and may read any text channel plus the DMs it belongs to.
|--------------------------------------------------------------------------
*/

const MAX_LEN = 2000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 10;

const wss = new WebSocketServer({ noServer: true });
const clients = new Map(); // ws -> state
const timeouts = new Map(); // username -> expires at

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function fail(ws, text) {
  send(ws, { type: "error", text });
}

/* Broadcast to everyone, or only to the members of a DM. */
function broadcast(payload, channel) {
  const members = channel && channel.startsWith("dm:") ? dmMembers(channel) : null;
  const raw = JSON.stringify(payload);
  for (const [ws, st] of clients) {
    if (members && !members.includes(st.name)) continue;
    if (ws.readyState === ws.OPEN) ws.send(raw);
  }
}

function roleOf(state) {
  if (!state.account) return "guest";
  const u = getUser(state.name);
  return u?.role || "member";
}

function can(state, action, targetRole = "guest") {
  const r = rankOf(roleOf(state));
  switch (action) {
    case "manageChannels":
      return r >= RANK.admin;
    case "moderate":
      return r >= RANK.mod;
    case "assignRole":
      // you may only hand out a role strictly below your own
      return r >= RANK.admin && r > rankOf(targetRole);
    default:
      return false;
  }
}

/* Who is connected, richest-role first, de-duplicated by name. */
function roster() {
  const seen = new Map();
  for (const st of clients.values()) {
    if (seen.has(st.name)) continue;
    const role = roleOf(st);
    const p = st.account ? profileOf(st.name) : null;
    seen.set(st.name, {
      name: st.name,
      account: st.account,
      role,
      displayName: p?.displayName || st.name,
      color: p?.color || null,
      online: true,
    });
  }
  const list = [...seen.values()];
  list.sort((a, b) => rankOf(b.role) - rankOf(a.role) || a.name.localeCompare(b.name));
  return list;
}

function pushPresence() {
  broadcast({ type: "presence", online: clients.size, members: roster() });
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

function timedOut(name) {
  const until = timeouts.get(name);
  if (!until) return 0;
  if (until <= Date.now()) {
    timeouts.delete(name);
    return 0;
  }
  return until;
}

/* A connection may read a channel if it is a text channel, or a DM it is in. */
function mayRead(state, channel) {
  if (!channel) return false;
  if (channel.startsWith("dm:")) {
    return state.account && (dmMembers(channel) || []).includes(state.name);
  }
  return channelExists(channel);
}

function mayPost(state, channel) {
  if (!mayRead(state, channel)) return false;
  if (channel.startsWith("dm:")) return true;
  const ch = listChannels().find((c) => c.slug === channel);
  if (ch?.locked && rankOf(roleOf(state)) < RANK.mod) return false;
  return true;
}

wss.on("connection", (ws, _req, session) => {
  const account = session.type === "account";
  const name = account
    ? session.username
    : `guest-${String(session.guestId || "").slice(0, 4)}`;

  const state = { name, account, stamps: [], typing: null };
  clients.set(ws, state);
  ws.isAlive = true;

  const channels = listChannels();
  send(ws, {
    type: "ready",
    you: name,
    account,
    role: roleOf(state),
    owner: ownerName(),
    roles: ROLES,
    profile: account ? profileOf(name) : null,
    channels,
    dms: account ? dmsFor(name) : [],
    members: roster(),
    online: clients.size,
    messages: channelMessages(channels[0]?.slug || "general", 60),
    channel: channels[0]?.slug || "general",
    typing: [],
  });

  broadcast({ type: "join", name, at: Date.now() });
  pushPresence();

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    const st = clients.get(ws);
    if (!st) return;

    let d;
    try {
      d = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }

    switch (d.type) {
      /* ---- reading ---- */
      case "open": {
        const ch = String(d.channel || "");
        if (!mayRead(st, ch)) return fail(ws, "You can't open that channel.");
        send(ws, {
          type: "history",
          channel: ch,
          messages: channelMessages(ch, 60),
          reset: true,
        });
        return;
      }

      case "more": {
        const ch = String(d.channel || "");
        const before = Number(d.before) || 0;
        if (!mayRead(st, ch) || !before) return;
        send(ws, { type: "history", channel: ch, messages: olderMessages(ch, before, 40) });
        return;
      }

      /* ---- posting ---- */
      case "msg": {
        const ch = String(d.channel || "");
        const text = String(d.text || "").replace(/[ \t]+/g, " ").trim().slice(0, MAX_LEN);
        if (!text) return;
        if (!mayPost(st, ch)) return fail(ws, "You can't post in that channel.");

        const until = timedOut(st.name);
        if (until) {
          const secs = Math.ceil((until - Date.now()) / 1000);
          return fail(ws, `You're timed out for another ${secs}s.`);
        }
        if (rateLimited(st)) return fail(ws, "Slow down a little — too many messages.");

        if (st.typing) {
          broadcast({ type: "typing", name: st.name, channel: st.typing, on: false });
          st.typing = null;
        }
        const saved = saveMessage({ username: st.name, account: st.account, text, channel: ch });
        broadcast({ type: "msg", ...saved }, ch);
        return;
      }

      case "typing": {
        const ch = String(d.channel || "");
        const on = Boolean(d.on);
        if (!mayRead(st, ch)) return;
        if (on && st.typing === ch) return;
        if (!on && st.typing !== ch) return;
        st.typing = on ? ch : null;
        broadcast({ type: "typing", name: st.name, channel: ch, on }, ch);
        return;
      }

      /* ---- moderation ---- */
      case "delete": {
        const m = getMessage(Number(d.id));
        if (!m) return;
        const own = m.username === st.name;
        if (!own && !can(st, "moderate")) return fail(ws, "You can't delete that message.");
        deleteMessage(m.id);
        broadcast({ type: "deleted", id: m.id, channel: m.channel }, m.channel);
        return;
      }

      case "timeout": {
        if (!can(st, "moderate")) return fail(ws, "You can't time people out.");
        const target = String(d.name || "");
        const mins = Math.min(Math.max(Number(d.minutes) || 5, 1), 1440);
        const targetState = [...clients.values()].find((c) => c.name === target);
        const targetRole = targetState ? roleOf(targetState) : getUser(target)?.role || "guest";
        if (rankOf(targetRole) >= rankOf(roleOf(st))) {
          return fail(ws, "You can't moderate someone at or above your own role.");
        }
        timeouts.set(target, Date.now() + mins * 60_000);
        broadcast({ type: "system", channel: d.channel, text: `${target} was timed out for ${mins}m by ${st.name}.` });
        return;
      }

      case "untimeout": {
        if (!can(st, "moderate")) return;
        timeouts.delete(String(d.name || ""));
        send(ws, { type: "error", text: `Timeout lifted for ${d.name}.` });
        return;
      }

      /* ---- channels ---- */
      case "channel.create": {
        if (!can(st, "manageChannels")) return fail(ws, "Only admins can add channels.");
        const res = createChannel(String(d.name || ""), String(d.topic || ""));
        if (res.error) return fail(ws, res.error);
        broadcast({ type: "channels", channels: listChannels() });
        return;
      }

      case "channel.update": {
        if (!can(st, "manageChannels")) return fail(ws, "Only admins can edit channels.");
        const ch = updateChannel(String(d.channel || ""), {
          name: d.name,
          topic: d.topic,
          locked: d.locked,
        });
        if (!ch) return fail(ws, "No such channel.");
        broadcast({ type: "channels", channels: listChannels() });
        return;
      }

      case "channel.delete": {
        if (!can(st, "manageChannels")) return fail(ws, "Only admins can delete channels.");
        const slug = String(d.channel || "");
        if (!deleteChannel(slug)) return fail(ws, "You can't delete the last channel.");
        broadcast({ type: "channels", channels: listChannels(), removed: slug });
        return;
      }

      /* ---- roles ---- */
      case "role.set": {
        const target = String(d.name || "");
        const role = String(d.role || "");
        if (!ROLES.includes(role)) return fail(ws, "Unknown role.");
        if (target === ownerName()) return fail(ws, "The owner's role can't be changed.");

        const currentRole = getUser(target)?.role || "member";
        if (!can(st, "assignRole", role) || rankOf(currentRole) >= rankOf(roleOf(st))) {
          return fail(ws, "You can't assign that role.");
        }
        if (!setRole(target, role)) return fail(ws, "That account doesn't exist.");
        broadcast({ type: "members", members: roster(), profiles: allProfiles() });
        broadcast({ type: "system", text: `${target} is now ${role}.` });
        return;
      }

      /* ---- profile ---- */
      case "profile.set": {
        if (!st.account) return fail(ws, "Guests can't set a profile.");
        const p = setProfile(st.name, {
          displayName: d.displayName ? String(d.displayName).slice(0, 24) : undefined,
          color: d.color ? String(d.color).slice(0, 9) : undefined,
          bio: d.bio != null ? String(d.bio).slice(0, 160) : undefined,
        });
        send(ws, { type: "profile", profile: p });
        broadcast({ type: "members", members: roster(), profiles: allProfiles() });
        return;
      }

      case "profile.get": {
        const p = profileOf(String(d.name || ""));
        send(ws, { type: "profile.view", profile: p, name: d.name });
        return;
      }

      /* ---- direct messages ---- */
      case "dm.open": {
        if (!st.account) return fail(ws, "Make an account to use DMs.");
        const other = String(d.name || "").toLowerCase();
        if (other === st.name) return fail(ws, "You can't DM yourself.");
        if (!getUser(other)) return fail(ws, "That account doesn't exist.");
        const ch = dmChannel(st.name, other);
        send(ws, {
          type: "dm.opened",
          channel: ch,
          with: other,
          messages: channelMessages(ch, 60),
        });
        return;
      }

      case "dm.list": {
        if (!st.account) return;
        send(ws, { type: "dms", dms: dmsFor(st.name) });
        return;
      }

      case "directory": {
        send(ws, { type: "directory", profiles: allProfiles() });
        return;
      }

      default:
        return;
    }
  });

  ws.on("close", () => {
    const st = clients.get(ws);
    clients.delete(ws);
    if (st) {
      if (st.typing) broadcast({ type: "typing", name: st.name, channel: st.typing, on: false });
      broadcast({ type: "leave", name: st.name, at: Date.now() });
    }
    pushPresence();
  });

  ws.on("error", () => {
    clients.delete(ws);
    pushPresence();
  });
});

/* Drop connections that stopped answering, so presence stays honest. */
const heartbeat = setInterval(() => {
  for (const ws of clients.keys()) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (_) {}
  }
}, 30_000);
heartbeat.unref?.();

export function handleChatUpgrade(req, socket, head, session) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, session);
  });
}

export default wss;
