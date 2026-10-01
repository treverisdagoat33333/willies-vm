/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// The AI app, against the test site's pretend OpenAI-compatible API (site.mjs):
// the key stays on the server, replies stream in, chats are kept, errors and
// Stop work, the limit applies, and a server without a key says so.
import { chromium } from "playwright";
const BASE = process.env.BASE, STRICT_BASE = process.env.STRICT_BASE, SITE = process.env.SITE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const last = async () => (await fetch(SITE + "/v1/_last")).json();

ok((await fetch(BASE + "/api/ai/status")).status === 401, "without a session, the AI is refused");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("/");
await page.click("#guest-button");
await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });

await page.click("#tb-ai");
await page.waitForSelector("#ai-window.show");
await page.waitForFunction(() => document.querySelector("#ai-log h2")?.textContent === "What can I help with?", null, { timeout: 10000 }).catch(() => {});
ok(await page.textContent("#ai-log h2") === "What can I help with?", "the AI button opens the chat window");
await page.waitForFunction(() => document.querySelectorAll("#ai-model option").length > 0, null, { timeout: 10000 }).catch(() => {});
ok(await page.$eval("#ai-model", (s) => s.value) === "gpt-4o-mini" && await page.$$eval('#ai-model optgroup[label="Online"] option', (o) => o.length) === 3, "…with the API's models, a sensible one picked", await page.$eval("#ai-model", (s) => s.value));
ok(!(await page.content()).includes("test-ai-key") && !(await page.evaluate(async () => JSON.stringify(await (await fetch("/api/ai/status")).json()))).includes("test-ai-key"), "the API key never reaches the browser");

// a message, answered as it streams
await page.fill("#ai-input", "hi there");
await page.press("#ai-input", "Enter");
await page.waitForFunction(() => /You said: hi there/.test(document.querySelector("#ai-log .ai-msg.bot:last-child")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
ok(await page.textContent("#ai-log .ai-msg.me") === "hi there", "your message shows");
const bot = await page.$("#ai-log .ai-msg.bot");
ok(/Hello there/.test(await bot.textContent()) && await bot.$eval("b", (b) => b.textContent) === "there", "the reply streams in, with Markdown", await bot.textContent());
ok(await bot.$eval(".ai-code code", (c) => c.textContent) === "console.log(1)" && !!(await bot.$(".ai-copy")), "code comes in a block with a Copy button");
let got = await last();
ok(got.auth === "Bearer test-ai-key" && got.stream === true && got.model === "gpt-4o-mini" && got.max_tokens === 2048, "our server sends the key, model and limits to the API", JSON.stringify({ ...got, messages: undefined }));
ok(got.messages[0].role === "system" && got.messages.at(-1).content === "hi there", "…with its own system message first");

// the conversation goes along with the next message
await page.fill("#ai-input", "and again");
await page.press("#ai-input", "Enter");
await page.waitForFunction(() => /You said: and again/.test(document.querySelector("#ai-log .ai-msg.bot:last-child")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
got = await last();
ok(got.messages.filter((m) => m.role !== "system").map((m) => m.role).join(",") === "user,assistant,user", "the next message carries the conversation", got.messages.map((m) => m.role).join(","));

// a page with "<script>" in the reply stays text
await page.fill("#ai-input", "<img src=x onerror=alert(1)>");
await page.press("#ai-input", "Enter");
await page.waitForFunction(() => /You said: <img/.test(document.querySelector("#ai-log .ai-msg.bot:last-child")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
ok(!(await page.$("#ai-log img")), "HTML in messages and replies is shown as text, never run");

// chats are kept, and survive a reload
ok(await page.textContent("#ai-chats .ai-chat.active") === "hi there", "the chat is listed under its first message", await page.textContent("#ai-chats"));
await page.reload();
await page.waitForFunction(() => typeof window.ai !== "undefined");
await page.evaluate(() => window.ai.open());
await page.click('#ai-chats .ai-chat .ai-open:has-text("hi there")');
ok(await page.$$eval("#ai-log .ai-msg", (m) => m.length) === 6, "after a reload, the chat is still there", await page.$$eval("#ai-log .ai-msg", (m) => m.length));

// an API error shows, and Try again sends it again
await page.click("#ai-new");
await page.fill("#ai-input", "please fail");
await page.press("#ai-input", "Enter");
await page.waitForSelector("#ai-log .ai-err", { timeout: 10000 }).catch(() => {});
ok(/mock failure/.test(await page.textContent("#ai-log .ai-err").catch(() => "")), "an error from the API is shown", await page.textContent("#ai-log").catch(() => ""));
ok(!!(await page.$("#ai-log .ai-retry")), "…with Try again");

// Stop cuts a reply short
await page.click("#ai-new");
await page.fill("#ai-input", "slow please");
await page.press("#ai-input", "Enter");
await page.waitForFunction(() => /word1 /.test(document.querySelector("#ai-log .ai-msg.bot")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
ok(await page.$eval("#ai-window", (w) => w.classList.contains("busy")), "while it answers, the send button is a stop button");
await page.click("#ai-send");
await page.waitForTimeout(700);
const cut = await page.textContent("#ai-log .ai-msg.bot");
ok(!(await page.$eval("#ai-window", (w) => w.classList.contains("busy"))) && !/word19/.test(cut), "Stop cuts the reply short", cut);

// picking a model is remembered and used
await page.selectOption("#ai-model", "gpt-4o");
await page.fill("#ai-input", "model check");
await page.press("#ai-input", "Enter");
await page.waitForFunction(() => /You said: model check/.test(document.querySelector("#ai-log .ai-msg.bot:last-child")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
ok((await last()).model === "gpt-4o" && await page.evaluate(() => JSON.parse(localStorage.getItem("ai.model"))) === "gpt-4o", "the model you pick is used and remembered");

// the AI does things on the site: its action lines are hidden, carried out, and shown as chips
const lastBot = () => page.evaluate(() => { const b = [...document.querySelectorAll("#ai-log .ai-msg.bot")].at(-1); return { text: b?.textContent || "", chips: [...(b?.querySelectorAll(".ai-act") || [])].map((c) => ({ ok: c.classList.contains("ok"), t: c.textContent })) }; });
const ask = async (q, done) => { await page.fill("#ai-input", q); await page.press("#ai-input", "Enter"); await page.waitForFunction(done, null, { timeout: 10000 }).catch(() => {}); };
await ask("please play the test song", () => document.querySelectorAll("#ai-log .ai-act").length > 0);
let lb = await lastBot(), got2 = await last();
ok(got2.messages[0].role === "system" && /\[\[action/.test(got2.messages[0].content) && /What's on the user's screen/.test(got2.messages[0].content), "the AI is told what it can do and what's on screen", got2.messages[0].content.slice(0, 120));
ok(!/\[\[action/.test(lb.text) && /On it/.test(lb.text), "action lines don't show in the reply", lb.text);
ok(lb.chips.length === 1 && lb.chips[0].ok && /Playing “Test Song”/.test(lb.chips[0].t), "…the song plays, and a chip says so", JSON.stringify(lb.chips));
ok(await page.waitForFunction(() => window.music.stats().id === 101 && window.music.stats().playing, null, { timeout: 10000 }).then(() => true, () => false), "…really playing, in Music");
ok(await page.evaluate(() => !document.querySelector("#music-window").classList.contains("show") && document.querySelector("#ai-window").classList.contains("show")), "…without the music window taking over");
await page.evaluate(() => window.music.playPause());
await ask("go synth", () => document.querySelectorAll("#ai-log .ai-msg.bot:last-child .ai-act").length >= 3);
lb = await lastBot();
ok(await page.evaluate(() => S.wallpaper === "live-synth" && S.accent === "#ff2e97"), "the AI can change the theme", JSON.stringify(lb.chips));
ok(await page.evaluate(() => window.desk.todos().some((t) => t.text === "water plants") && S.wTodo), "…and add a to-do (showing the widget)");
ok(lb.chips.length === 3 && lb.chips[2].ok === false && /Can't do/.test(lb.chips[2].t), "…and something it can't do shows as failed", JSON.stringify(lb.chips));
// catching up on chat: the messages go back to it, and its answer can't act
await page.evaluate(() => { dcMessages = [{ id: "m1", username: "alice", text: "movie night friday?", createdAt: Date.now() }, { id: "m2", username: "bob", text: "yes! 8pm", createdAt: Date.now() }]; });
await ask("catch me up on the chat", () => /Summary of 2 messages/.test(document.querySelector("#ai-log .ai-msg.bot:last-child")?.textContent || ""));
lb = await lastBot();
const sent = (await last()).messages.at(-1).content;
ok(/Summary of 2 messages/.test(lb.text) && /alice: movie night friday\?/.test(sent) && /bob: yes! 8pm/.test(sent), "catching up sends the chat back and answers from it", sent.slice(0, 200));
ok(await page.evaluate(() => S.wallpaper === "live-synth") && lb.chips.length === 0, "…and that answer can't act (someone's chat message can't steer your AI)", JSON.stringify(lb.chips));
ok(await page.$$eval("#ai-log .ai-msg.me", (m) => m.every((x) => !/From the site/.test(x.textContent))), "…and the chat log isn't shown as something you said");

// a reasoning model's thinking isn't shown, and an action inside it isn't carried out
await ask("think it over", () => /Thought about it/.test(document.querySelector("#ai-log .ai-msg.bot:last-child")?.textContent || ""));
lb = await lastBot();
ok(lb.text.trim() === "Thought about it." && !lb.chips.length && await page.evaluate(() => S.wallpaper) === "live-synth", "a model's <think> part is hidden, and nothing in it acts", JSON.stringify(lb));

// the per-person limit
const statuses = await page.evaluate(async () => {
  const out = [];
  for (let i = 0; i < 45; i++) {
    const r = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) });
    out.push(r.status);
    await r.text();
    if (r.status === 429) break;
  }
  return out;
});
ok(statuses.at(-1) === 429 && statuses.length <= 41, "one person gets 40 messages per 10 minutes", statuses.join(","));
ok(!errors.length, "no page errors", errors.join("\n"));
await ctx.close();

// a server without a key says so
const ctx2 = await browser.newContext({ baseURL: STRICT_BASE });
const p2 = await ctx2.newPage();
await p2.goto("/");
await p2.click("#guest-button");
await p2.waitForSelector("#auth-wrap.hidden", { state: "attached" });
await p2.evaluate(() => window.ai.open());
await p2.waitForFunction(() => /set up/.test(document.querySelector("#ai-log h2")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
ok(/isn't set up/.test(await p2.textContent("#ai-log h2").catch(() => "")), "without AI_API_KEY, the window says the AI isn't set up");
await ctx2.close();

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
