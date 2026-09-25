/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 * Unauthorized copying, modification, distribution or hosting of this file,
 * in whole or in part, is strictly prohibited. See LICENSE.
 */
import express from "express";

/*
|--------------------------------------------------------------------------
| AI chat
|
| The AI app in the desktop talks to an OpenAI-compatible API through this
| server, so the API key never reaches the browser. Set on the server:
|   AI_API_KEY    the key (required; without it the app says it's off)
|   AI_BASE_URL   the API's base, e.g. https://api.example.com/v1
|   AI_MODEL      optional default model; otherwise one is picked from the
|                 API's own /models list
|
|   GET  /api/ai/status  {ready, models, model}
|   POST /api/ai/chat    {messages: [{role, content}], model}
|        -> a stream of JSON lines: {t: "text", v} ... then {t: "done"},
|           or {t: "error", error} if it fails midway
|
| Chats themselves live in the user's browser; nothing here stores them.
|--------------------------------------------------------------------------
*/

const MAX_MESSAGES = 40; // of history sent per request
const MAX_CHARS = 32_000; // across those messages
const MAX_TOKENS = 2048; // per reply
const IDLE_MS = 60_000; // a reply that stalls this long is cut off
const SYSTEM = "You are a helpful, friendly assistant inside William's VM. Answer clearly and concisely. Use Markdown for code and lists.";

const config = () => ({
  key: process.env.AI_API_KEY || "",
  base: (process.env.AI_BASE_URL || "").replace(/\/+$/, ""),
  model: process.env.AI_MODEL || "",
});

/* the API's model list, cached for 10 minutes */
let modelCache = { at: 0, list: [] };
async function models() {
  const { key, base } = config();
  if (!key || !base) return [];
  if (Date.now() - modelCache.at < 10 * 60_000 && modelCache.list.length) return modelCache.list;
  try {
    const r = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const list = (Array.isArray(d?.data) ? d.data : []).map((m) => String(m?.id || "")).filter(Boolean).slice(0, 80);
    if (list.length) modelCache = { at: Date.now(), list };
    return list;
  } catch (_) {
    return modelCache.list;
  }
}
/* the default: AI_MODEL, else a sensible general chat model from the list, else the first */
function defaultModel(list) {
  const { model } = config();
  if (model) return model;
  const prefer = [/^gpt-4o-mini$/i, /^gpt-4\.1-mini$/i, /^gpt-4o$/i, /mini/i, /gpt|claude|gemini|llama|qwen|deepseek/i];
  for (const re of prefer) {
    const hit = list.find((m) => re.test(m) && !/embed|whisper|tts|dall|image|audio|moderation|realtime|transcribe/i.test(m));
    if (hit) return hit;
  }
  return list[0] || "";
}

function cleanMessages(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (const m of input.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim();
    if (content) out.push({ role: m.role, content });
  }
  // keep the newest messages within the size limit
  let total = 0, start = out.length;
  while (start > 0 && total + out[start - 1].content.length <= MAX_CHARS) total += out[--start].content.length;
  const kept = out.slice(start);
  return kept.length && kept[kept.length - 1].role === "user" ? kept : null;
}

/* Reads the API's server-sent events and calls onText for each piece of the reply. */
async function readStream(body, onText, signal) {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    let timer;
    const idle = new Promise((_, no) => { timer = setTimeout(() => no(new Error("The AI stopped answering.")), IDLE_MS); });
    const { value, done } = await Promise.race([reader.read(), idle]).finally(() => clearTimeout(timer));
    if (done || signal.aborted) return;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data);
        if (j.error) throw new Error(j.error.message || String(j.error));
        const text = j.choices?.[0]?.delta?.content;
        if (text) onText(text);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}

export function aiRouter({ requireSession, limiter, userLimiter }) {
  const router = express.Router();

  router.get("/status", requireSession, async (req, res) => {
    const { key, base } = config();
    if (!key || !base) return res.json({ ready: false, models: [], model: "" });
    const list = await models();
    res.json({ ready: true, models: list, model: defaultModel(list) });
  });

  router.post("/chat", requireSession, limiter, userLimiter, async (req, res) => {
    const { key, base } = config();
    if (!key || !base) return res.status(503).json({ error: "The AI isn't set up on this server yet." });
    const messages = cleanMessages(req.body?.messages);
    if (!messages) return res.status(400).json({ error: "Nothing to send." });
    const list = await models();
    const asked = typeof req.body?.model === "string" ? req.body.model : "";
    const model = asked && (!list.length || list.includes(asked)) ? asked : defaultModel(list);
    if (!model) return res.status(503).json({ error: "The AI has no models available right now." });

    const abort = new AbortController();
    res.on("close", () => abort.abort());
    let upstream;
    try {
      upstream = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ model, stream: true, max_tokens: MAX_TOKENS, messages: [{ role: "system", content: SYSTEM }, ...messages] }),
        signal: abort.signal,
      });
    } catch (e) {
      if (abort.signal.aborted) return;
      return res.status(502).json({ error: "Couldn't reach the AI. Try again in a moment." });
    }
    if (!upstream.ok || !upstream.body) {
      let why = "";
      try { const d = await upstream.json(); why = d?.error?.message || d?.error || ""; } catch (_) {}
      const status = upstream.status === 429 ? 429 : 502;
      return res.status(status).json({ error: status === 429 ? "The AI is busy. Wait a moment and try again." : `The AI answered with an error${why ? `: ${String(why).slice(0, 200)}` : ` (HTTP ${upstream.status})`}.` });
    }

    res.status(200).set({ "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
    res.flushHeaders?.();
    const send = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + "\n"); };
    send({ t: "model", v: model });
    try {
      await readStream(upstream.body, (v) => send({ t: "text", v }), abort.signal);
      send({ t: "done" });
    } catch (e) {
      if (!abort.signal.aborted) send({ t: "error", error: String(e?.message || "The reply was cut off.").slice(0, 200) });
    }
    res.end();
  });

  return router;
}
