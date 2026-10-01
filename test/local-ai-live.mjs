/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Not part of npm test: runs one real model on this device end to end, downloading it from
// Hugging Face (needs the internet; in this sandbox, through HTTPS_PROXY).
//   AUTH_SECRET=dev PORT=3995 node server.js &
//   node test/local-ai-live.mjs "local:wllama:Qwen/Qwen2.5-0.5B-Instruct-GGUF/qwen2.5-0.5b-instruct-q4_k_m.gguf"
//   node test/local-ai-live.mjs "local:mediapipe:litert-community/gemma-4-E2B-it-litert-lm/gemma-4-E2B-it-web.task" gpu
// "gpu" turns on WebGPU through SwiftShader (slow, but MediaPipe runs on it).
import { chromium } from "playwright";
const px = new URL(process.env.HTTPS_PROXY || process.env.https_proxy);
const [key, gpu] = [process.argv[2], process.argv[3] === "gpu"];
const flags = gpu ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader"] : [];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: [`--proxy-server=${px.protocol}//${px.host}`, "--proxy-bypass-list=localhost;127.0.0.1", "--ignore-certificate-errors", ...flags] });
const p = await (await b.newContext({ baseURL: "http://localhost:3995", ignoreHTTPSErrors: true })).newPage();
p.on("worker", (w) => { console.log("worker", w.url()); w.on("console", (m) => console.log("  [worker]", m.text().slice(0, 300))); });
p.on("pageerror", (e) => console.log("pageerror", e.message));
p.on("console", (m) => m.type() === "error" && console.log("console", m.text().slice(0, 300)));
await p.goto("/"); await p.click("#guest-button"); await p.waitForTimeout(1000);
const t0 = Date.now();
const iv = setInterval(() => { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's'); Promise.race([p.evaluate(() => window.__st), new Promise((r) => setTimeout(() => r('page busy'), 3000))]).then((x) => console.log('  status:', x)).catch(() => {}); }, 8000);
const r = await p.evaluate(async (key) => {
  let out = "", last = "", t1 = 0;
  try {
    await localAI.chat({ key, messages: [{ role: "system", content: "You are a helpful assistant. Answer in one short sentence." }, { role: "user", content: "What is the capital of France?" }], onToken: (t) => { if (!t1) t1 = Date.now(); out += t; window.__st = "OUT: " + out; }, onStatus: (s, pr) => { last = s; window.__st = s + ' ' + pr; } });
  } catch (e) { return { error: String(e.message || e), last }; }
  return { out, last, firstToken: t1 };
}, key);
clearInterval(iv);
console.log(key.slice(0, 60), JSON.stringify(r).slice(0, 400), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
await b.close();
