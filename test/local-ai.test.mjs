/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// The AI on this device (js/local-ai.js) through the AI app (js/ai.js). The real
// engines download hundreds of MB from Hugging Face, so here Chrome's built-in
// model is played by a stand-in LanguageModel: the picker, the fallback when the
// server has no AI, streaming, stopping, history and actions all run for real.
// The engines themselves were checked by hand (see CLAUDE.md).
import { chromium } from "playwright";
const STRICT_BASE = process.env.STRICT_BASE, BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/* a pretend Gemini Nano: echoes what it was asked, streams it in pieces, and acts when asked to */
const NANO = () => {
  window.__nano = { sessions: 0, prompts: [] };
  window.LanguageModel = {
    availability: async () => "available",
    create: async ({ initialPrompts }) => {
      window.__nano.sessions++;
      return {
        promptStreaming(text, { signal } = {}) {
          window.__nano.prompts.push({ system: initialPrompts[0].content, history: initialPrompts.length - 1, text });
          const reply = /synth/i.test(text) ? 'Going synthwave.\n[[action {"do":"theme.preset","id":"synth"}]]' : /slow/i.test(text) ? "one two three four five six seven eight nine ten" : `You said: ${text}`;
          const words = reply.split(/(?<= )/);
          return (async function* () { for (const w of words) { if (signal?.aborted) return; await new Promise((r) => setTimeout(r, /slow/i.test(text) ? 300 : 20)); yield w; } })();
        },
        destroy() {},
      };
    },
  };
};

const ctx = await browser.newContext({ baseURL: STRICT_BASE });
await ctx.addInitScript(NANO);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto("/");
await p.click("#guest-button");
await p.waitForSelector("#auth-wrap.hidden", { state: "attached" });

/* what this device can run */
const list = await p.evaluate(() => window.localAI.list());
const engines = [...new Set(list.map((m) => m.engine))].sort();
ok(engines.join() === "chrome,mediapipe,transformers,webllm,wllama", "five engines are offered", engines.join());
ok(list.find((m) => m.engine === "chrome" && !m.why) && list.filter((m) => m.engine === "wllama").every((m) => !m.why), "this browser can run Chrome's model and the CPU ones", JSON.stringify(list.map((m) => [m.key.slice(0, 40), m.why])));
ok(list.filter((m) => m.engine === "webllm").every((m) => m.why && /q4f32/.test(m.id)), "…while WebGPU models say why not, asking for the f32 build on a GPU without f16");
ok((await p.evaluate(() => window.localAI.pick()))?.engine === "chrome", "Auto picks Chrome's own model when there's no graphics chip to use");

/* the AI app: the server here has no AI, so it offers this device instead */
await p.click("#tb-ai");
await p.waitForSelector("#ai-window.show, #ai-window:not([hidden])", { timeout: 5000 }).catch(() => {});
await p.waitForSelector(".ai-golocal", { timeout: 8000 }).catch(() => {});
ok(await p.isVisible(".ai-golocal"), "with no online AI, the app offers the one on this device");
await p.click(".ai-golocal");
ok(await p.$eval("#ai-model", (s) => s.value) === "local:auto" && await p.$$eval("#ai-model optgroup", (g) => g.map((x) => x.label)).then((l) => l.some((x) => /On this device/.test(x))), "…and the picker switches to it");

const ask = async (text) => {
  const n = await p.$$eval(".ai-msg.bot", (b) => b.length);
  await p.fill("#ai-input", text);
  await p.press("#ai-input", "Enter");
  // done, and typed out (the tools bar shows once the whole answer is on screen)
  await p.waitForFunction((n) => document.querySelectorAll(".ai-msg.bot").length > n && !document.querySelector("#ai-window").classList.contains("busy") && (document.querySelector(".ai-msg.bot:last-child .ai-tools, .ai-msg.bot:last-child .ai-err") || document.querySelector(".ai-msg.bot:last-child .ai-acts")), n, { timeout: 15000 }).catch(() => {});
  return p.$$eval(".ai-msg.bot", (b) => [...b.at(-1).childNodes].filter((n) => !n.classList?.contains("ai-tools")).map((n) => n.textContent).join(""));
};
ok(/You said: hello there/.test(await ask("hello there")), "a reply streams in from the model on this device");
const first = await p.evaluate(() => window.__nano.prompts[0]);
ok(/assistant inside William's VM/.test(first.system) && /\[\[action/.test(first.system) && /on the user's screen/.test(first.system), "…given the same instructions, actions and screen note as the online AI", first.system.slice(0, 120));
await ask("and again");
ok((await p.evaluate(() => window.__nano.prompts.at(-1).history)) === 2, "…and the conversation so far", JSON.stringify(await p.evaluate(() => window.__nano.prompts.at(-1))));
// actions work the same way
await ask("go synth");
ok(await p.evaluate(() => S.wallpaper === "live-synth") && await p.$$eval(".ai-act.ok", (a) => a.length >= 1), "its actions run on the site (a theme change here)");
// Stop
await p.fill("#ai-input", "say it slow");
await p.press("#ai-input", "Enter");
await p.waitForTimeout(900);
await p.click("#ai-send");
await p.waitForTimeout(800);
const stopped = await p.$$eval(".ai-msg.bot", (b) => [...b.at(-1).querySelectorAll("p")].map((n) => n.textContent).join(""));
ok(!/ten/.test(stopped) && /one/.test(stopped), "Stop ends a reply part-way (clicked through the toast the theme change left on top of it)", stopped);

/* the server hands out the instructions, nothing secret */
const sys = await (await fetch(BASE + "/api/ai/system")).json();
ok(/William's VM/.test(sys.system) && /\[\[action/.test(sys.actions) && !/key/i.test(JSON.stringify(sys).replace(/keys?\b/gi, "")), "/api/ai/system gives the instructions to models on the device");

/* the engines load their libraries from pinned versions on jsDelivr */
const src = await (await fetch(BASE + "/js/local-ai.js")).text();
ok(/web-llm@0\.2\.\d+/.test(src) && /wllama@3\.\d+\.\d+/.test(src) && /tasks-genai@0\.10\.\d+/.test(src) && /transformers@4\.\d+\.\d+\/\+esm/.test(await (await fetch(BASE + "/js/local-ai-tf.js")).text()), "each engine's library is pinned to a version");

ok(!errors.length, "no page errors", errors.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
