/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import { record } from "./analytics.js";
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
  setPinned,
  messagesSince,
  pinnedMessages,
  searchMessages,
  profileOf,
  allProfiles,
  setRole,
  setProfile,
  getUser,
  editMessage,
  toggleReaction,
  sanction,
  liftSanction,
  activeSanction,
  getFile,
} from "./db.js";
import { censor } from "./profanity.js";

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

/* one emoji (with skin tones, ZWJ sequences, flags), nothing else */
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u200d|\ufe0f|\u20e3|[0-9#*])+$/u;
const isEmoji = (s) => s.length > 0 && s.length <= 16 && EMOJI_RE.test(s) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const clients = new Map(); // ws -> state

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function fail(ws, text) {
  send(ws, { type: "error", text });
}

/*
 * House rule: only the owner swears. Everyone else's words go through the
 * filter, and the first time it stars something out they get told why.
 */
function tidy(ws, st, text) {
  if (text == null || roleOf(st) === "owner") return text;
  const r = censor(text);
  if (r.hit && !st.langWarned) {
    st.langWarned = true;
    send(ws, { type: "system", text: `Only ${ownerName()} can swear in here 😅 Bad words get starred out.` });
  }
  return r.text;
}

/*
 * Voice calls, 1:1 between accounts. The server only relays the WebRTC
 * handshake; audio and screen share go peer to peer. A call rings every
 * tab the callee has open and binds to the one that answers.
 */
const calls = new Map(); // callId -> { from, to, fromWs, toWs, state, timer }
const CALL_RING_MS = 35_000;
const CALL_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function socketsOf(name) {
  return [...clients].filter(([, st]) => st.name === name && st.account).map(([ws]) => ws);
}
function inCall(name) {
  for (const c of calls.values()) if (c.from === name || c.to === name) return true;
  return false;
}
function endCall(id, reason, except) {
  const c = calls.get(id);
  if (!c) return;
  calls.delete(id);
  clearTimeout(c.timer);
  for (const r of Object.values(c.relay || {})) try { r.close(1000, "call ended"); } catch (_) {}
  const targets = new Set([c.fromWs, ...(c.toWs ? [c.toWs] : socketsOf(c.to))]);
  for (const ws of targets) if (ws !== except) send(ws, { type: "call.ended", callId: id, reason });
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
    case "ban":
      return r >= RANK.admin;
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

/* Mutes and bans live in the database, so a restart does not lift them. */
function muteOf(state) {
  return activeSanction(state.name, "mute", state.account ? null : state.ip);
}
function banOf(name, account, ip) {
  return activeSanction(name, "ban", account ? null : ip);
}
function untilText(until) {
  if (until == null) return "permanently";
  const secs = Math.ceil((until - Date.now()) / 1000);
  if (secs < 90) return `for another ${secs}s`;
  const mins = Math.ceil(secs / 60);
  if (mins < 90) return `for another ${mins}m`;
  return `for another ${Math.ceil(mins / 60)}h`;
}

/* Target's role, checked against the actor's so nobody acts upward. */
function outranks(st, target) {
  const targetState = [...clients.values()].find((c) => c.name === target);
  const targetRole = targetState ? roleOf(targetState) : getUser(target)?.role || "guest";
  return rankOf(roleOf(st)) > rankOf(targetRole);
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

wss.on("connection", (ws, _req, session, ip) => {
  const account = session.type === "account";
  const name = account
    ? session.username
    : `guest-${String(session.guestId || "").slice(0, 6)}`;

  const ban = banOf(name, account, ip);
  if (ban) {
    send(ws, { type: "banned", until: ban.until, reason: ban.reason });
    ws.close(4003, "banned");
    return;
  }

  const state = { name, account, ip, stamps: [], typing: null, since: Date.now() };
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
    voice: voiceSnapshot(),
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
        // opened from a search result or a pin: load back far enough to show it
        const around = Number(d.around) || 0;
        const limit = around ? Math.min(500, Math.max(60, messagesSince(ch, around) + 20)) : 60;
        send(ws, {
          type: "history",
          channel: ch,
          messages: channelMessages(ch, limit),
          reset: true,
          around: around || undefined,
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

      /* ---- search and pins ---- */
      case "search": {
        const text = String(d.q || "").slice(0, 100);
        const from = String(d.from || "").slice(0, 40);
        // everything you can read: the open channels, and your own DMs
        let chans = d.channel ? [String(d.channel)] : [...listChannels().map((c) => c.slug), ...(st.account ? dmsFor(st.name).map((x) => x.channel) : [])];
        chans = chans.filter((c) => mayRead(st, c));
        send(ws, { type: "search", q: text, from, channel: d.channel || null, results: searchMessages(chans, text, { from }) });
        return;
      }

      case "pins": {
        const ch = String(d.channel || "");
        if (!mayRead(st, ch)) return;
        send(ws, { type: "pins", channel: ch, messages: pinnedMessages(ch) });
        return;
      }

      case "pin": {
        const m = getMessage(Number(d.id));
        if (!m) return;
        // mods pin in channels; in a DM either of you can
        const dm = m.channel.startsWith("dm:");
        if (dm ? !mayRead(st, m.channel) : !can(st, "moderate")) return fail(ws, "You can't pin messages here.");
        const on = Boolean(d.on);
        if (on && pinnedMessages(m.channel).length >= 50) return fail(ws, "This channel already has 50 pins. Unpin one first.");
        const msg = setPinned(m.id, on, st.name);
        broadcast({ type: "pinned", id: m.id, channel: m.channel, on, by: st.name, message: msg }, m.channel);
        return;
      }

      /* ---- posting ---- */
      case "msg": {
        const ch = String(d.channel || "");
        // a picture or file comes up first (files.js), then rides a message in the same channel
        let fileId = null;
        if (d.file) {
          const f = getFile(String(d.file));
          if (!f || f.username !== st.name || f.channel !== ch || f.message_id != null) return fail(ws, "That file isn't available any more. Attach it again.");
          fileId = f.id;
        }
        const text = d.text ? tidy(ws, st, clean(d.text)) : "";
        if (!text && !fileId) return;
        if (!mayPost(st, ch)) return fail(ws, "You can't post in that channel.");

        const mute = muteOf(st);
        if (mute) return fail(ws, `You're timed out ${untilText(mute.until)}.`);
        if (rateLimited(st)) return fail(ws, "Slow down a little — too many messages.");

        // a reply must point at a live message in the same channel
        let replyTo = null;
        if (d.replyTo) {
          const parent = getMessage(Number(d.replyTo));
          if (parent && parent.channel === ch) replyTo = parent.id;
        }

        if (st.typing) {
          broadcast({ type: "typing", name: st.name, channel: st.typing, on: false });
          st.typing = null;
        }
        const saved = saveMessage({ username: st.name, account: st.account, text, channel: ch, replyTo, fileId });
        record("chat", ch.startsWith("dm:") ? "dm" : ch);
        broadcast({ type: "msg", ...saved }, ch);
        return;
      }

      case "edit": {
        const m = getMessage(Number(d.id));
        if (!m) return;
        if (m.username !== st.name) return fail(ws, "You can only edit your own messages.");
        if (!mayRead(st, m.channel)) return;
        const text = tidy(ws, st, clean(d.text));
        if (!text) return fail(ws, "A message can't be empty. Delete it instead.");
        if (text === m.text) return;
        if (muteOf(st)) return fail(ws, "You can't edit while timed out.");
        if (rateLimited(st)) return fail(ws, "Slow down a little — too many messages.");
        broadcast({ type: "edited", message: editMessage(m.id, text) }, m.channel);
        return;
      }

      case "react": {
        const m = getMessage(Number(d.id));
        const emoji = String(d.emoji || "");
        if (!m || !isEmoji(emoji)) return;
        if (!mayRead(st, m.channel)) return;
        if (muteOf(st)) return fail(ws, "You can't react while timed out.");
        if (rateLimited(st)) return fail(ws, "Slow down a little.");
        const reactions = toggleReaction(m.id, st.name, emoji);
        if (!reactions) return fail(ws, "That message has too many different reactions.");
        broadcast({ type: "reactions", id: m.id, channel: m.channel, reactions, by: st.name, emoji }, m.channel);
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
        if (!target || !outranks(st, target)) {
          return fail(ws, "You can't moderate someone at or above your own role.");
        }
        muteUser(target, { minutes: mins, reason: d.reason, by: st.name });
        broadcast({ type: "system", channel: d.channel, text: `${target} was timed out for ${mins}m by ${st.name}.` });
        return;
      }

      case "untimeout": {
        if (!can(st, "moderate")) return;
        const target = String(d.name || "");
        liftSanction(target, "mute");
        send(ws, { type: "system", text: `Timeout lifted for ${target}.` });
        return;
      }

      case "ban": {
        if (!can(st, "ban")) return fail(ws, "Only admins can ban.");
        const target = String(d.name || "");
        if (!target || target === st.name || !outranks(st, target)) {
          return fail(ws, "You can't ban someone at or above your own role.");
        }
        const hours = d.hours == null ? null : Math.min(Math.max(Number(d.hours) || 24, 1), 24 * 365);
        banUser(target, { hours, reason: d.reason, by: st.name });
        broadcast({ type: "system", text: `${target} was banned ${hours ? `for ${hours}h` : "permanently"} by ${st.name}.` });
        return;
      }

      case "unban": {
        if (!can(st, "ban")) return;
        const target = String(d.name || "");
        liftSanction(target, "ban");
        send(ws, { type: "system", text: `${target} was unbanned.` });
        return;
      }

      /* ---- channels ---- */
      case "channel.create": {
        if (!can(st, "manageChannels")) return fail(ws, "Only admins can add channels.");
        const res = createChannel(tidy(ws, st, String(d.name || "")), tidy(ws, st, String(d.topic || "")));
        if (res.error) return fail(ws, res.error);
        broadcast({ type: "channels", channels: listChannels() });
        return;
      }

      case "channel.update": {
        if (!can(st, "manageChannels")) return fail(ws, "Only admins can edit channels.");
        const ch = updateChannel(String(d.channel || ""), {
          name: d.name == null ? d.name : tidy(ws, st, String(d.name)),
          topic: d.topic == null ? d.topic : tidy(ws, st, String(d.topic)),
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
        dropFromVoice((_, room) => room === slug, 4000, "channel deleted");
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
          displayName: d.displayName ? tidy(ws, st, String(d.displayName).slice(0, 24)) : undefined,
          color: d.color ? String(d.color).slice(0, 9) : undefined,
          bio: d.bio != null ? tidy(ws, st, String(d.bio).slice(0, 160)) : undefined,
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

      /* ---- voice calls ---- */
      case "call.invite": {
        const callId = String(d.callId || "");
        const to = String(d.to || "").toLowerCase();
        if (!st.account) return fail(ws, "Make an account to make calls.");
        if (!CALL_ID_RE.test(callId) || calls.has(callId)) return;
        if (to === st.name) return fail(ws, "You can't call yourself.");
        if (muteOf(st)) return fail(ws, "You're muted, so you can't call anyone right now.");
        const now = Date.now();
        st.callStamps = (st.callStamps || []).filter((t) => now - t < 60_000);
        if (st.callStamps.length >= 5) return fail(ws, "Slow down: that's a lot of calls in a minute.");
        st.callStamps.push(now);
        const targets = socketsOf(to);
        if (!targets.length) return send(ws, { type: "call.ended", callId, reason: "offline" });
        if (inCall(to) || inCall(st.name)) return send(ws, { type: "call.ended", callId, reason: "busy" });
        const c = { from: st.name, to, fromWs: ws, toWs: null, state: "ringing" };
        c.timer = setTimeout(() => endCall(callId, "no answer"), CALL_RING_MS);
        calls.set(callId, c);
        for (const t of targets) send(t, { type: "call.invite", callId, from: st.name });
        return;
      }

      case "call.accept": {
        const callId = String(d.callId || "");
        const c = calls.get(callId);
        if (!c || c.to !== st.name || c.state !== "ringing") return send(ws, { type: "call.ended", callId, reason: "gone" });
        c.state = "active";
        c.toWs = ws;
        clearTimeout(c.timer);
        send(c.fromWs, { type: "call.accepted", callId });
        record("call");
        for (const t of socketsOf(c.to)) if (t !== ws) send(t, { type: "call.ended", callId, reason: "answered elsewhere" });
        return;
      }

      case "call.decline": {
        const callId = String(d.callId || "");
        const c = calls.get(callId);
        if (c && c.to === st.name && c.state === "ringing") endCall(callId, "declined");
        return;
      }

      case "call.end": {
        const callId = String(d.callId || "");
        const c = calls.get(callId);
        if (c && (c.fromWs === ws || c.toWs === ws)) endCall(callId, "hangup", ws);
        return;
      }

      case "call.signal": {
        const callId = String(d.callId || "");
        const c = calls.get(callId);
        if (!c || c.state !== "active" || !d.data || typeof d.data !== "object") return;
        const other = ws === c.fromWs ? c.toWs : ws === c.toWs ? c.fromWs : null;
        if (other) send(other, { type: "call.signal", callId, data: d.data });
        return;
      }

      default:
        return;
    }
  });

  ws.on("close", () => {
    const st = clients.get(ws);
    clients.delete(ws);
    for (const [id, c] of calls) {
      if (c.fromWs === ws || c.toWs === ws) endCall(id, "disconnected", ws);
      else if (c.state === "ringing" && st && c.to === st.name && !socketsOf(c.to).length) endCall(id, "offline");
    }
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

function clean(text) {
  return String(text || "").replace(/[ \t]+/g, " ").trim().slice(0, MAX_LEN);
}

/* ---- used by the admin dashboard and account routes ---- */

/* Close every socket a name holds. */
export function kickUser(username, code = 4004, reason = "kicked") {
  dropFromVoice((name) => name === username, code, reason);
  let n = 0;
  for (const [ws, st] of clients) {
    if (st.name !== username) continue;
    try {
      ws.close(code, reason);
    } catch (_) {}
    n++;
  }
  return n;
}

function ipOf(username) {
  return [...clients.values()].find((c) => c.name === username && !c.account)?.ip || null;
}

export function muteUser(username, { minutes = 5, reason = "", by }) {
  dropFromVoice((name) => name === username, 4003, "timed out");
  sanction({
    username,
    kind: "mute",
    until: Date.now() + minutes * 60_000,
    reason,
    by,
    ip: ipOf(username),
  });
}

export function banUser(username, { hours = null, reason = "", by }) {
  // a guest's ban also follows their address, or a fresh guest id walks around it
  const ip = ipOf(username);
  dropFromVoice((name) => name === username, 4003, "banned");
  sanction({ username, kind: "ban", until: hours ? Date.now() + hours * 3_600_000 : null, reason, by, ip });
  for (const [ws, st] of clients) {
    if (st.name === username || (ip && !st.account && st.ip === ip)) {
      send(ws, { type: "banned", until: hours ? Date.now() + hours * 3_600_000 : null, reason });
      try {
        ws.close(4003, "banned");
      } catch (_) {}
    }
  }
}

/* A pinned-style notice shown to everyone connected. */
export function announce(text, by) {
  const t = clean(text).slice(0, 500);
  if (!t) return false;
  broadcast({ type: "announce", text: t, by, at: Date.now() });
  return true;
}

/* After a backup is restored every account, channel and message may be
   different: everyone reconnects (4005 makes the page reload). */
export function resetChat() {
  for (const ws of clients.keys()) {
    try { ws.close(4005, "restored"); } catch (_) {}
  }
}

/* Roles or profiles changed outside the socket (admin dashboard). */
export function refreshMembers() {
  broadcast({ type: "members", members: roster(), profiles: allProfiles() });
}

export function onlineList() {
  return [...clients.values()].map((st) => ({
    name: st.name,
    account: st.account,
    role: roleOf(st),
    since: st.since,
    ip: st.account ? null : st.ip,
  }));
}

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

/*
 * The call relay, for when two browsers can't reach each other directly (strict
 * school or phone networks block WebRTC, and there's no TURN server): each side
 * of an active call opens /call-relay/?id=<callId>, and whatever one sends
 * (voice and screen frames, binary) goes to the other. Only the call's two
 * people can join, and each socket gets a byte budget.
 */
const relayWss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
const RELAY_RATE = 1024 * 1024; // bytes a second each side may send, on average (voice, screen and camera)
const RELAY_BURST = 2 * 1024 * 1024;

relayWss.on("connection", (ws, _req, name, callId) => {
  const c = calls.get(callId);
  if (!c || c.state !== "active" || (name !== c.from && name !== c.to)) return ws.close(4003, "not in this call");
  c.relay ||= {};
  try { c.relay[name]?.close(4000, "replaced"); } catch (_) {}
  c.relay[name] = ws;
  const peerName = name === c.from ? c.to : c.from;
  const ready = () => {
    const other = c.relay?.[peerName];
    if (other?.readyState === 1 && ws.readyState === 1) for (const s of [ws, other]) s.send("ready");
  };
  ready();
  let tokens = RELAY_BURST, at = Date.now();
  ws.on("message", (data, isBinary) => {
    if (!isBinary) return;
    const now = Date.now();
    tokens = Math.min(RELAY_BURST, tokens + ((now - at) / 1000) * RELAY_RATE);
    at = now;
    if (data.length > tokens) return; // over budget: drop it (voice just skips a beat)
    tokens -= data.length;
    const other = calls.get(callId)?.relay?.[peerName];
    if (other?.readyState === 1 && other.bufferedAmount < 2 * 1024 * 1024) other.send(data, { binary: true });
  });
  ws.on("close", () => {
    if (c.relay?.[name] === ws) delete c.relay[name];
    const other = c.relay?.[peerName];
    if (other?.readyState === 1) other.send("gone");
  });
});

/*
 * Voice channels: talk in a text channel with up to VOICE_MAX people, like
 * Discord. Everyone's voice goes through here (/voice/?channel=<slug>), so it
 * works on networks that block WebRTC:
 *   client -> server  binary: 20 ms of 16 kHz μ-law voice, or "WVS1" + a JPEG
 *                             of your stream (for watchers the direct path fails)
 *                     text:   {"t":"mute","on":bool}, {"t":"deaf","on":bool},
 *                             {"t":"live","on":bool} (Go Live, a shared screen),
 *                             {"t":"watch","who":i,"on":bool,"relay":bool},
 *                             {"t":"rtc","to":i,"data":{...}} (the stream's WebRTC
 *                             handshake, passed to one other member)
 *   server -> client  binary: [speaker index, ...voice], or "WVS1" + [streamer
 *                             index] + a JPEG
 *                     text:   {"t":"roster","you":i,"members":[{i,name,muted,deaf,live}]},
 *                             {"t":"rtc","from":i,"data":{...}},
 *                             {"t":"watchers","watchers":[{i,relay}]} (to a streamer)
 * Everyone connected to chat hears who's in which channel's voice ({type:"voice"}).
 */
const voiceWss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
const voiceRooms = new Map(); // slug -> Map(name -> { ws, i, muted, state })
const VOICE_MAX = 6;
const VOICE_RATE = 48 * 1024; // voice is 16 KB/s; this leaves room for jitter
// a stream through here is JPEG pictures a few times a second, sent on to each
// watcher who couldn't get it directly: a budget per streamer, bursts allowed
const STREAM_RATE = 900 * 1024, STREAM_BURST = 2 * 1024 * 1024;
const STREAM_TAG = Buffer.from("WVS1");
const RTC_RATE = 60; // handshake messages a second, per member

function voiceMembers(slug) {
  return [...(voiceRooms.get(slug)?.entries() || [])].map(([name, m]) => ({ i: m.i, name, muted: m.muted, deaf: m.deaf, live: m.live }));
}
function voiceSnapshot() {
  const out = {};
  for (const slug of voiceRooms.keys()) out[slug] = voiceMembers(slug).map(({ name, muted, live }) => ({ name, muted, live }));
  return out;
}
function voiceChanged(slug) {
  const members = voiceMembers(slug);
  for (const m of voiceRooms.get(slug)?.values() || []) {
    if (m.ws.readyState === 1) m.ws.send(JSON.stringify({ t: "roster", you: m.i, members }));
  }
  if (!members.length) voiceRooms.delete(slug);
  broadcast({ type: "voice", channel: slug, members: members.map(({ name, muted, live }) => ({ name, muted, live })) });
}
/* someone kicked, banned or timed out (or a channel gone): out of voice too */
function dropFromVoice(pred, code = 4003, reason = "removed") {
  for (const [slug, room] of voiceRooms) {
    for (const [name, m] of room) if (pred(name, slug, m)) try { m.ws.close(code, reason); } catch (_) {}
  }
}
const voiceSweep = setInterval(() => {
  dropFromVoice((name, slug, m) => !channelExists(slug) || !!banOf(name, true, null) || !!muteOf(m.state));
}, 10_000);
voiceSweep.unref?.();

voiceWss.on("connection", (ws, _req, name, slug, ip) => {
  let room = voiceRooms.get(slug);
  if (!room) voiceRooms.set(slug, (room = new Map()));
  const old = room.get(name);
  if (old) try { old.ws.close(4000, "joined from somewhere else"); } catch (_) {}
  const used = new Set([...room.values()].map((m) => m.i));
  let i = 0;
  while (used.has(i)) i++;
  const me = { ws, i, muted: false, deaf: false, live: false, watching: new Map(), state: { name, account: true, ip } };
  room.set(name, me);
  voiceChanged(slug);
  let tokens = VOICE_RATE, at = Date.now();
  let sTokens = STREAM_BURST, sAt = Date.now();
  let rtcCount = 0, rtcAt = Date.now();
  const byIndex = (i) => [...room.values()].find((m) => m.i === i);
  // a streamer hears who's watching, and which of them need pictures through here
  const tellWatchers = (streamer) => {
    if (streamer?.ws.readyState !== 1) return;
    const watchers = [...room.values()].filter((m) => m.watching.has(streamer.i)).map((m) => ({ i: m.i, relay: m.watching.get(streamer.i) }));
    streamer.ws.send(JSON.stringify({ t: "watchers", watchers }));
  };
  me.tellWatchers = tellWatchers;
  ws.on("message", (data, isBinary) => {
    if (room.get(name) !== me) return;
    if (!isBinary) {
      let d;
      try { d = JSON.parse(String(data)); } catch (_) { return; }
      if (d?.t === "mute" && typeof d.on === "boolean" && d.on !== me.muted) { me.muted = d.on; voiceChanged(slug); }
      else if (d?.t === "deaf" && typeof d.on === "boolean" && d.on !== me.deaf) { me.deaf = d.on; voiceChanged(slug); }
      else if (d?.t === "live" && typeof d.on === "boolean" && d.on !== me.live) {
        me.live = d.on;
        if (!d.on) for (const m of room.values()) m.watching.delete(me.i); // the stream ended: nobody's watching it now
        voiceChanged(slug);
      } else if (d?.t === "watch" && Number.isInteger(d.who) && d.who !== me.i) {
        const streamer = byIndex(d.who);
        if (d.on && streamer?.live) me.watching.set(d.who, !!d.relay);
        else me.watching.delete(d.who);
        tellWatchers(streamer);
      } else if (d?.t === "rtc" && Number.isInteger(d.to) && d.data && typeof d.data === "object") {
        const now = Date.now();
        if (now - rtcAt > 1000) { rtcAt = now; rtcCount = 0; }
        if (++rtcCount > RTC_RATE) return;
        const other = byIndex(d.to);
        if (other && other !== me && other.ws.readyState === 1) other.ws.send(JSON.stringify({ t: "rtc", from: me.i, data: d.data }));
      }
      return;
    }
    const now = Date.now();
    // a picture of your stream: on to the watchers who asked for pictures
    if (data.length > STREAM_TAG.length + 16 && data.subarray(0, 4).equals(STREAM_TAG)) {
      sTokens = Math.min(STREAM_BURST, sTokens + ((now - sAt) / 1000) * STREAM_RATE);
      sAt = now;
      if (!me.live || data.length > sTokens) return;
      sTokens -= data.length;
      const out = Buffer.allocUnsafe(data.length + 1);
      STREAM_TAG.copy(out, 0);
      out[4] = me.i;
      data.copy(out, 5, 4);
      for (const m of room.values()) if (m.watching.get(me.i) === true && m.ws.readyState === 1 && m.ws.bufferedAmount < 1024 * 1024) m.ws.send(out, { binary: true });
      return;
    }
    tokens = Math.min(VOICE_RATE, tokens + ((now - at) / 1000) * VOICE_RATE);
    at = now;
    if (me.muted || data.length > tokens || data.length > 2048) return;
    tokens -= data.length;
    const out = Buffer.allocUnsafe(data.length + 1);
    out[0] = me.i;
    data.copy(out, 1);
    // deafened people hear nothing, so nothing is sent to them
    for (const [other, m] of room) if (other !== name && !m.deaf && m.ws.readyState === 1 && m.ws.bufferedAmount < 256 * 1024) m.ws.send(out, { binary: true });
  });
  ws.on("close", () => {
    if (room.get(name) === me) {
      room.delete(name);
      // whoever they were watching loses a watcher
      for (const who of me.watching.keys()) tellWatchers(byIndex(who));
      if (me.live) for (const m of room.values()) m.watching.delete(me.i);
      voiceChanged(slug);
    }
  });
});

export function handleVoiceUpgrade(req, socket, head, session, ip) {
  const slug = new URL(req.url ?? "/", "http://localhost").searchParams.get("channel") || "";
  const name = session.type === "account" ? session.username : null;
  const state = { name, account: true, ip };
  const why = !name ? "Make an account to use voice."
    : slug.startsWith("dm:") || !channelExists(slug) ? "No such channel."
    : banOf(name, true, null) ? "You're banned from chat."
    : muteOf(state) ? "You're timed out right now."
    : (voiceRooms.get(slug)?.size || 0) >= VOICE_MAX && !voiceRooms.get(slug)?.has(name) ? `Voice is full (${VOICE_MAX} people).`
    : null;
  if (why) {
    socket.write(`HTTP/1.1 403 ${why.replace(/[^\x20-\x7e]/g, "")}\r\nConnection: close\r\n\r\n`);
    return socket.destroy();
  }
  voiceWss.handleUpgrade(req, socket, head, (ws) => voiceWss.emit("connection", ws, req, name, slug, ip));
  record("voice", slug);
}

export function handleCallRelayUpgrade(req, socket, head, session) {
  const callId = new URL(req.url ?? "/", "http://localhost").searchParams.get("id") || "";
  const c = calls.get(callId);
  const name = session.type === "account" ? session.username : null;
  if (!c || !name || c.state !== "active" || (name !== c.from && name !== c.to)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  relayWss.handleUpgrade(req, socket, head, (ws) => relayWss.emit("connection", ws, req, name, callId));
}

/* For files.js: may this account post a file in the channel, and may this session see one? */
export function chatMayPost(username, channel) {
  const st = { name: username, account: true, ip: null };
  return mayPost(st, channel) && !muteOf(st) && !banOf(username, true, null);
}
export function chatMayRead(session, channel) {
  const account = session.type === "account";
  return mayRead({ name: account ? session.username : `guest-${String(session.guestId || "").slice(0, 6)}`, account }, channel);
}

export function handleChatUpgrade(req, socket, head, session, ip) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, session, ip);
  });
}

export default wss;
