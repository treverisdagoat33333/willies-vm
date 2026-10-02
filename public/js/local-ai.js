/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * AI that runs in the visitor's own browser: no server, no API key, nothing
 * sent anywhere. Five engines, each with its own models:
 *
 *   webllm        WebLLM (MLC): the graphics chip, through WebGPU. Fastest.
 *   transformers  Transformers.js (ONNX Runtime): WebGPU, or the CPU anywhere.
 *   wllama        llama.cpp built for the browser: the CPU, any browser.
 *   mediapipe     Google's MediaPipe LLM Inference: WebGPU.
 *   chrome        Chrome's built-in Gemini Nano (the Prompt API), when Chrome has it.
 *
 * The libraries come from jsDelivr and the models from Hugging Face, both sent
 * with CORS, so COEP lets them in. The first use downloads the model (the
 * engines keep it in the browser's storage); after that it loads offline. Only
 * one model is loaded at a time, since each takes hundreds of MB of memory.
 *
 * window.localAI: list() the models and whether this device can run them,
 * pick() the best one for it, chat({id, messages, onToken, onStatus, signal}).
 * js/ai.js offers them in its model picker as "local:<engine>:<model>".
 */
(() => {
  const CDN = {
    webllm: "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/lib/index.js",
    wllama: "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/index.min.js",
    wllamaWasm: "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/wasm/wllama.wasm",
    mediapipe: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29",
  };
  const HF = "https://huggingface.co";
  const MAX_TOKENS = 768;

  /* ---- the models (sizes are the download) ---- */
  const MODELS = [
    // WebLLM: the newest first. "think" models reason before they answer (shown in the app).
    { engine: "webllm", id: "Qwen3.5-0.8B-q4f16_1-MLC", name: "Qwen 3.5 0.8B", mb: 600, tier: 1, think: true, best: true },
    { engine: "webllm", id: "Qwen3.5-2B-q4f16_1-MLC", name: "Qwen 3.5 2B", mb: 1400, tier: 3, think: true, best: true },
    { engine: "webllm", id: "Qwen3.5-4B-q4f16_1-MLC", name: "Qwen 3.5 4B", mb: 2600, tier: 4, think: true, best: true },
    { engine: "webllm", id: "Qwen3.5-9B-q4f16_1-MLC", name: "Qwen 3.5 9B", mb: 5500, tier: 5, think: true, best: true },
    { engine: "webllm", id: "Qwen3-1.7B-q4f16_1-MLC", name: "Qwen 3 1.7B", mb: 1100, tier: 2, think: true },
    { engine: "webllm", id: "Qwen3-4B-q4f16_1-MLC", name: "Qwen 3 4B", mb: 2400, tier: 4, think: true },
    { engine: "webllm", id: "Qwen3-8B-q4f16_1-MLC", name: "Qwen 3 8B", mb: 5000, tier: 5, think: true },
    { engine: "webllm", id: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC", name: "DeepSeek R1 7B", mb: 5100, tier: 5, think: true },
    { engine: "webllm", id: "Llama-3.1-8B-Instruct-q4f16_1-MLC", name: "Llama 3.1 8B", mb: 5000, tier: 5 },
    { engine: "webllm", id: "Phi-4-mini-instruct-q4f16_1-MLC", name: "Phi-4 mini", mb: 2600, tier: 4 },
    { engine: "webllm", id: "Ministral-3-3B-Instruct-2512-BF16-q4f16_1-MLC", name: "Ministral 3 3B", mb: 2100, tier: 4 },
    { engine: "webllm", id: "SmolLM2-360M-Instruct-q4f16_1-MLC", name: "SmolLM2 360M", mb: 380, tier: 0 },
    { engine: "webllm", id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 0.5B", mb: 950, tier: 1 },
    { engine: "webllm", id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", name: "Llama 3.2 1B", mb: 880, tier: 2 },
    { engine: "webllm", id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 1.5B", mb: 1600, tier: 3 },
    { engine: "webllm", id: "gemma-2-2b-it-q4f16_1-MLC", name: "Gemma 2 2B", mb: 1900, tier: 3 },
    { engine: "webllm", id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", name: "Llama 3.2 3B", mb: 2300, tier: 4 },
    { engine: "webllm", id: "Phi-3.5-mini-instruct-q4f16_1-MLC", name: "Phi-3.5 mini", mb: 3700, tier: 4 },
    // Transformers.js (dtype per device: q4f16 on WebGPU, q4 on the CPU)
    { engine: "transformers", id: "onnx-community/Qwen3-0.6B-ONNX", name: "Qwen 3 0.6B", mb: 570, tier: 1, think: true, best: true },
    { engine: "transformers", id: "onnx-community/Qwen3-1.7B-ONNX", name: "Qwen 3 1.7B", mb: 1300, tier: 3, think: true, gpuOnly: true, best: true },
    { engine: "transformers", id: "onnx-community/gemma-3-1b-it-ONNX", name: "Gemma 3 1B", mb: 1000, tier: 2 },
    { engine: "transformers", id: "HuggingFaceTB/SmolLM2-135M-Instruct", name: "SmolLM2 135M", mb: 120, tier: 0 },
    { engine: "transformers", id: "HuggingFaceTB/SmolLM2-360M-Instruct", name: "SmolLM2 360M", mb: 270, tier: 1 },
    { engine: "transformers", id: "onnx-community/Qwen2.5-0.5B-Instruct", name: "Qwen 2.5 0.5B", mb: 480, tier: 1 },
    { engine: "transformers", id: "onnx-community/Llama-3.2-1B-Instruct-q4f16", name: "Llama 3.2 1B", mb: 1100, tier: 2, gpuOnly: true },
    // wllama (GGUF from Hugging Face)
    { engine: "wllama", id: "unsloth/Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf", name: "Qwen 3 1.7B", mb: 1100, tier: 2, think: true, best: true },
    { engine: "wllama", id: "unsloth/Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf", name: "Qwen 3 4B", mb: 2500, tier: 4, think: true, best: true },
    { engine: "wllama", id: "unsloth/gemma-3-1b-it-GGUF/gemma-3-1b-it-Q4_K_M.gguf", name: "Gemma 3 1B", mb: 810, tier: 2 },
    { engine: "wllama", id: "unsloth/Phi-4-mini-instruct-GGUF/Phi-4-mini-instruct-Q4_K_M.gguf", name: "Phi-4 mini", mb: 2500, tier: 4 },
    { engine: "wllama", id: "Qwen/Qwen2.5-0.5B-Instruct-GGUF/qwen2.5-0.5b-instruct-q4_k_m.gguf", name: "Qwen 2.5 0.5B", mb: 490, tier: 1 },
    { engine: "wllama", id: "bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q4_K_M.gguf", name: "Llama 3.2 1B", mb: 810, tier: 2 },
    // MediaPipe: only its web builds (-web.task) run in a browser; Gemma 4's need no login.
    // Older Gemma web builds do, so they're "your own file".
    { engine: "mediapipe", id: "litert-community/gemma-4-E2B-it-litert-lm/gemma-4-E2B-it-web.task", name: "Gemma 4 E2B", mb: 2000, tier: 3, template: "gemma" },
    { engine: "mediapipe", id: "litert-community/gemma-4-E4B-it-litert-lm/gemma-4-E4B-it-web.task", name: "Gemma 4 E4B", mb: 3000, tier: 4, template: "gemma" },
    { engine: "mediapipe", id: "file", name: "Your own -web.task file", mb: 0, tier: -1, template: "gemma" },
    // Chrome's own
    { engine: "chrome", id: "gemini-nano", name: "Gemini Nano (built into Chrome)", mb: 0, tier: 2 },
  ];
  const ENGINE_NAME = { webllm: "WebLLM", transformers: "Transformers.js", wllama: "wllama (llama.cpp)", mediapipe: "MediaPipe", chrome: "Chrome built-in" };
  const keyOf = (m) => `local:${m.engine}:${m.id}`;

  /* ---- what this device can do ---- */
  let caps = null;
  async function capabilities() {
    if (caps) return caps;
    let gpu = false, f16 = false, gpuMb = 0;
    try {
      const a = navigator.gpu && (await navigator.gpu.requestAdapter());
      gpu = !!a;
      f16 = !!a?.features?.has("shader-f16");
      // the biggest single buffer the chip will hand out: a rough guide to how big a model fits
      gpuMb = a ? Math.round(Number(a.limits?.maxBufferSize || 0) / 1048576) : 0;
    } catch (_) {}
    let nano = "unavailable";
    try {
      const LM = self.LanguageModel || self.ai?.languageModel;
      if (LM?.availability) nano = await LM.availability();
      else if (LM?.capabilities) { const c = await LM.capabilities(); nano = c.available === "readily" ? "available" : c.available === "after-download" ? "downloadable" : "unavailable"; }
    } catch (_) {}
    const mem = navigator.deviceMemory || 4;
    return (caps = { gpu, f16, gpuMb, nano, mem, cores: navigator.hardwareConcurrency || 2, wasm: typeof WebAssembly === "object" });
  }
  /* A model that took the tab down while loading or answering, remembered so it isn't
     picked again: the key is written before it loads and cleared once it has answered,
     so one still there on the next visit is one the tab died on. */
  const CRASH_KEY = "wvm.localai.loading", CRASHED_KEY = "wvm.localai.crashed";
  const getJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const setJSON = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  (() => {
    const was = getJSON(CRASH_KEY, null);
    if (was && Date.now() - was.at < 30 * 60_000) { const c = getJSON(CRASHED_KEY, {}); c[was.key] = Date.now(); setJSON(CRASHED_KEY, c); }
    setJSON(CRASH_KEY, null);
  })();
  const crashed = (key) => { const t = getJSON(CRASHED_KEY, {})[key]; return t && Date.now() - t < 14 * 86_400_000; }; // forgiven after two weeks
  function why(m, c) {
    if (crashed(keyOf(m))) return "Crashed on this device last time (too big for it)";
    // Chrome closes a tab that uses too much memory ("Aw, Snap!", error 9). A CPU model needs
    // about twice its file while loading; a graphics-chip one shares a Chromebook's memory too.
    // Browsers say at most 8 GB, so these budgets stay on the safe side.
    const gb = c.mem * 1024;
    if ((m.engine === "wllama" || (m.engine === "transformers" && !c.gpu)) && m.mb * 2 > gb * 0.3) return "Needs more memory than this device has";
    if ((m.engine === "webllm" || m.engine === "mediapipe" || m.engine === "transformers") && c.gpu && m.mb > Math.min(gb * 0.45, c.gpuMb || gb)) return "Too big for this device's memory";
    if (m.engine === "webllm" || m.engine === "mediapipe") return c.gpu ? "" : "Needs WebGPU, which this browser doesn't have";
    if (m.engine === "transformers") return m.gpuOnly && !c.gpu ? "Needs WebGPU, which this browser doesn't have" : "";
    if (m.engine === "wllama") return c.wasm ? "" : "This browser can't run WebAssembly";
    if (m.engine === "chrome") return c.nano === "unavailable" ? "Only in Chrome with its built-in AI turned on" : "";
    return "";
  }
  async function list() {
    const c = await capabilities();
    return MODELS.map((m) => {
      // WebLLM's f16 models need the GPU's shader-f16; the f32 build is the same model
      const id = m.engine === "webllm" && !c.f16 ? m.id.replace("q4f16_1", "q4f32_1") : m.id;
      const mm = { ...m, id };
      return { ...mm, key: keyOf(mm), engineName: ENGINE_NAME[m.engine], why: why(mm, c), size: m.mb ? (m.mb >= 1000 ? `${(m.mb / 1000).toFixed(1)} GB` : `${m.mb} MB`) : "" };
    });
  }
  /* the best this device can run: a graphics chip gets a 1B model, Chrome's own needs no
     download, and anything else a small one on the CPU */
  async function pick() {
    const all = (await list()).filter((m) => !m.why && m.tier >= 0);
    const c = await capabilities();
    // the strongest the device can hold: memory decides the size
    // Browsers say at most 8 GB of memory, so a Chromebook looks like a gaming PC; the
    // graphics chip's own limit and the core count tell them apart. Auto stays modest:
    // the big ones are there to pick by hand.
    const strong = c.mem >= 8 && c.cores >= 8 && c.gpuMb >= 2048;
    const order = [
      c.gpu && strong && all.find((m) => m.engine === "webllm" && /Qwen3\.5-2B/.test(m.id)),
      c.gpu && c.mem >= 4 && c.gpuMb >= 1024 && all.find((m) => m.engine === "webllm" && /Qwen3\.5-0\.8B/.test(m.id)),
      c.nano === "available" && all.find((m) => m.engine === "chrome"),
      c.gpu && all.find((m) => m.engine === "webllm" && /Qwen3\.5-0\.8B/.test(m.id)),
      c.mem >= 8 && all.find((m) => m.engine === "wllama" && /Qwen3-1\.7B/.test(m.id)),
      all.find((m) => m.engine === "wllama" && /0\.5b/i.test(m.id)),
      all.find((m) => m.engine === "transformers" && /360M/.test(m.id)),
    ];
    return order.find(Boolean) || all[0] || null;
  }

  /* ---- the engines ---- */
  let loaded = null; // { key, engine, chat(), unload() }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const counter = (total, report) => { let got = 0; return new TransformStream({ transform(chunk, ctl) { got += chunk.length; report(got); ctl.enqueue(chunk); } }); };

  /* Gentle mode: a model writing flat out takes the whole graphics chip (WebLLM) or every
     core (wllama), and on a Chromebook the screen shares both, so the device lags or
     freezes. These engines only work out the next word when asked, so a short pause
     after each one hands the screen its turn: a little slower to write, smooth to use. */
  const cores = navigator.hardwareConcurrency || 2;
  const weak = (navigator.deviceMemory || 4) <= 4 || cores <= 4;
  const PACE = weak ? 35 : 12; // ms after each word
  const pause = () => new Promise((r) => setTimeout(r, document.hidden ? 0 : PACE));
  const THREADS = Math.max(1, Math.min(4, cores - (weak ? 2 : 1))); // CPU engines leave the page a core or two

  const ENGINES = {
    async webllm(m, onStatus) {
      const W = await import(CDN.webllm);
      const worker = new Worker("/js/local-ai-webllm.js", { type: "module" });
      const eng = await W.CreateWebWorkerMLCEngine(worker, m.id, { initProgressCallback: (r) => onStatus(r.text?.replace(/\[.*?\]\s*/, "") || "Loading…", r.progress) });
      return {
        async chat(messages, onToken, signal) {
          const stop = () => eng.interruptGenerate();
          signal?.addEventListener("abort", stop);
          try {
            const chunks = await eng.chat.completions.create({ messages, stream: true, max_tokens: MAX_TOKENS, temperature: 0.6 });
            for await (const c of chunks) { const t = c.choices?.[0]?.delta?.content; if (t) onToken(t); await pause(); }
          } finally { signal?.removeEventListener("abort", stop); }
        },
        async unload() { try { await eng.unload(); } catch (_) {} worker.terminate(); },
      };
    },

    async transformers(m, onStatus) {
      const c = await capabilities();
      const worker = new Worker("/js/local-ai-tf.js", { type: "module" });
      const files = new Map();
      let waiting = null;
      worker.onmessage = ({ data }) => {
        if (data.t === "progress") { files.set(data.file, [data.loaded, data.total]); let a = 0, b = 0; for (const [x, y] of files.values()) { a += x; b += y; } onStatus(`Downloading the model… ${pct(a, b)}%`, b ? a / b : 0); }
        else waiting?.(data);
      };
      // a worker that can't start (its library blocked, say) says so here, not in a message
      worker.onerror = (e) => { e.preventDefault?.(); waiting?.({ t: "error", error: e.message || "The AI engine couldn't start in this browser." }); };
      await new Promise((res, rej) => {
        waiting = (d) => (d.t === "ready" ? res() : d.t === "error" ? rej(new Error(d.error)) : null);
        worker.postMessage({ t: "load", model: m.id, device: c.gpu ? "webgpu" : "wasm", dtype: c.gpu ? "q4f16" : "q4", threads: THREADS });
      });
      return {
        chat(messages, onToken, signal) {
          return new Promise((res, rej) => {
            const stop = () => worker.postMessage({ t: "stop" });
            signal?.addEventListener("abort", stop);
            waiting = (d) => {
              if (d.t === "token") onToken(d.x);
              else if (d.t === "done") { signal?.removeEventListener("abort", stop); res(); }
              else if (d.t === "error") { signal?.removeEventListener("abort", stop); rej(new Error(d.error)); }
            };
            worker.postMessage({ t: "chat", messages, max: MAX_TOKENS });
          });
        },
        async unload() { worker.terminate(); },
      };
    },

    async wllama(m, onStatus) {
      const { Wllama } = await import(CDN.wllama);
      const w = new Wllama({ default: CDN.wllamaWasm }, { suppressNativeLog: true });
      const parts = m.id.split("/"), repo = parts.slice(0, 2).join("/"), file = parts.slice(2).join("/");
      onStatus("Downloading the model… 0%", 0);
      await w.loadModelFromHF({ repo, file }, { n_ctx: 4096, n_threads: THREADS, progressCallback: ({ loaded, total }) => onStatus(`Downloading the model… ${pct(loaded, total)}%`, total ? loaded / total : 0) });
      return {
        async chat(messages, onToken, signal) {
          const it = await w.createChatCompletion({ messages, stream: true, max_tokens: MAX_TOKENS, temperature: 0.6, abortSignal: signal });
          try { for await (const c of it) { const t = c.choices?.[0]?.delta?.content; if (t) onToken(t); await pause(); } }
          catch (e) { if (!signal?.aborted) throw e; }
        },
        async unload() { try { await w.exit(); } catch (_) {} },
      };
    },

    async mediapipe(m, onStatus, file) {
      const { FilesetResolver, LlmInference } = await import(`${CDN.mediapipe}/genai_bundle.mjs`);
      const fileset = await FilesetResolver.forGenAiTasks(`${CDN.mediapipe}/wasm`);
      let reader;
      if (m.id === "file") {
        if (!file) throw new Error("Choose a .task model file first.");
        reader = file.stream().pipeThrough(counter(file.size, (got) => onStatus(`Reading ${file.name}… ${pct(got, file.size)}%`, got / file.size))).getReader();
      } else {
        // kept in Cache Storage after the first time: these files are too big for the browser's normal cache
        const url = `${HF}/${m.id.split("/").slice(0, 2).join("/")}/resolve/main/${m.id.split("/").slice(2).join("/")}`;
        const cache = await caches.open("wvm-local-ai").catch(() => null);
        let res = await cache?.match(url);
        if (!res) {
          res = await fetch(url);
          if (!res.ok) throw new Error(`Couldn't download the model (HTTP ${res.status}).`);
          if (cache) { const [a, b] = res.body.tee(); cache.put(url, new Response(b, { headers: res.headers })).catch(() => {}); res = new Response(a, { headers: res.headers }); }
        }
        const total = +res.headers.get("content-length") || m.mb * 1e6;
        // MediaPipe takes only a real stream reader, so progress is counted by a stage in the stream
        reader = res.body.pipeThrough(counter(total, (got) => onStatus(`Downloading the model… ${pct(got, total)}%`, got / total))).getReader();
      }
      // each .task file is built for a fixed context ("ekv1280" in its name): asking for more fails
      const ctx = +(m.id.match(/ekv(\d+)/)?.[1] || 1280);
      const llm = await LlmInference.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: reader }, maxTokens: ctx, topK: 40, temperature: 0.6 });
      return {
        chat(messages, onToken, signal) {
          let sent = "";
          const out = cleaner(onToken);
          const stop = () => { try { llm.cancelProcessing(); } catch (_) {} };
          signal?.addEventListener("abort", stop);
          return llm.generateResponse(template(m.template, messages), (part, done) => {
            // some versions hand back the whole text so far, others just the new piece
            const t = part.startsWith(sent) && sent ? part.slice(sent.length) : part;
            sent = part.startsWith(sent) ? part : sent + part;
            if (t) out.push(t);
            if (done) out.end();
          }).catch((e) => { if (!signal?.aborted) throw e; }).finally(() => signal?.removeEventListener("abort", stop));
        },
        async unload() { try { llm.close(); } catch (_) {} },
      };
    },

    async chrome(m, onStatus) {
      const LM = self.LanguageModel || self.ai?.languageModel;
      if (!LM) throw new Error("This Chrome doesn't have its built-in AI turned on.");
      const monitor = (mon) => mon.addEventListener("downloadprogress", (e) => onStatus(`Chrome is downloading Gemini Nano… ${Math.round((e.loaded || 0) * 100)}%`, e.loaded || 0));
      // a session per reply: Chrome's own history format, rebuilt from ours
      return {
        async chat(messages, onToken, signal) {
          const sys = messages.find((x) => x.role === "system")?.content || "";
          const rest = messages.filter((x) => x.role !== "system");
          const last = rest.pop();
          const session = await LM.create({ initialPrompts: [{ role: "system", content: sys }, ...rest.map((x) => ({ role: x.role, content: x.content }))], monitor, signal });
          try {
            let sent = "";
            for await (const part of session.promptStreaming(last.content, { signal })) {
              const t = part.startsWith(sent) && sent ? part.slice(sent.length) : part; // older Chrome streams the whole text so far
              sent = part.startsWith(sent) ? part : sent + part;
              if (t) onToken(t);
            }
          } catch (e) { if (!signal?.aborted) throw e; }
          finally { try { session.destroy(); } catch (_) {} }
        },
        async unload() {},
      };
    },
  };

  /* MediaPipe hands back the model's raw text, end-of-turn markers and all. This passes
     words on, cuts at the first marker, and holds back a "<" that might start one. */
  const MARKS = ["<end_of_turn>", "</end_of_turn>", "<start_of_turn>", "<|im_end|>", "<|im_start|>", "<eos>", "</s>", "<|end|>", "<|turn>", "<turn|>"];
  function cleaner(onToken) {
    let raw = "", shown = 0, done = false;
    const flush = (final) => {
      if (done) return;
      let cut = raw.length;
      for (const mk of MARKS) { const i = raw.indexOf(mk); if (i >= 0 && i < cut) { cut = i; done = true; } }
      if (!done && !final) { const lt = raw.lastIndexOf("<"); if (lt >= shown && MARKS.some((mk) => mk.startsWith(raw.slice(lt)))) cut = lt; }
      if (cut > shown) { onToken(raw.slice(shown, cut)); shown = cut; }
    };
    return { push(t) { raw += t; flush(false); }, end() { flush(true); } };
  }

  /* chat templates for MediaPipe, which takes one prompt string */
  function template(kind, messages) {
    const sys = messages.find((m) => m.role === "system")?.content || "";
    const turns = messages.filter((m) => m.role !== "system");
    if (kind === "gemma") return `<start_of_turn>user\n${sys}\n\n${turns.map((m) => (m.role === "user" ? `${m.content}<end_of_turn>\n<start_of_turn>model\n` : `${m.content}<end_of_turn>\n<start_of_turn>user\n`)).join("").replace(/<start_of_turn>user\n$/, "")}`;
    if (kind === "zephyr") return `<|system|>\n${sys}</s>\n${turns.map((m) => `<|${m.role}|>\n${m.content}</s>\n`).join("")}<|assistant|>\n`;
    return `<|im_start|>system\n${sys}<|im_end|>\n${turns.map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join("")}<|im_start|>assistant\n`;
  }

  /* ---- the one thing js/ai.js calls ---- */
  let loading = null;
  async function load(key, onStatus, file) {
    if (loaded?.key === key) return loaded;
    if (loading?.key === key) return loading.p;
    const m = (await list()).find((x) => x.key === key);
    if (!m) throw new Error("That model isn't available.");
    if (m.why) throw new Error(m.why);
    const p = (async () => {
      if (loaded) { const old = loaded; loaded = null; await old.unload().catch(() => {}); } // one model in memory at a time
      onStatus(m.mb ? `Getting ${m.name} ready (${m.size}, only the first time)…` : `Starting ${m.name}…`, 0);
      const eng = await ENGINES[m.engine](m, onStatus, file);
      return (loaded = { key, ...eng });
    })().finally(() => { if (loading?.key === key) loading = null; });
    loading = { key, p };
    return p;
  }
  async function chat({ key, messages, onToken, onStatus = () => {}, signal, file }) {
    setJSON(CRASH_KEY, { key, at: Date.now() });
    // WillieJet's spare workers give their memory back while a model is in it
    try { if (typeof proxies !== "undefined") proxies.wj?.then((e) => e.shrink?.()).catch(() => {}); } catch (_) {}
    let answered = false;
    try {
      const eng = await load(key, onStatus, file);
      if (signal?.aborted) return;
      onStatus("", 1);
      await eng.chat(messages, (t) => { if (!answered) { answered = true; setJSON(CRASH_KEY, null); } onToken(t); }, signal);
    } catch (e) {
      // the graphics chip ran out of memory or gave up: the model is too big for this device
      const msg = String(e?.message || e);
      if (/device (was )?lost|out of memory|OOM|allocat|exceed|GPUBuffer|maxBufferSize|createBuffer|Aborted\(\)/i.test(msg)) {
        const c = getJSON(CRASHED_KEY, {}); c[key] = Date.now(); setJSON(CRASHED_KEY, c);
        caps = null; // ask the chip again next time
        if (loaded?.key === key) { await loaded.unload?.().catch?.(() => {}); loaded = null; }
        throw new Error("This model is too big for this device's graphics chip. Pick a smaller one, or Auto.");
      }
      throw e;
    } finally {
      setJSON(CRASH_KEY, null); // finished or failed normally: only a dead tab leaves it behind
    }
  }
  async function forget() {
    setJSON(CRASHED_KEY, null); // a fresh start: everything may be tried again
    if (loaded) { await loaded.unload().catch(() => {}); loaded = null; }
    try { await caches.delete("wvm-local-ai"); } catch (_) {}
    // WebLLM, Transformers.js and wllama keep their downloads under these names
    try { for (const k of await caches.keys()) if (/webllm|transformers|wllama|mlc/i.test(k)) await caches.delete(k); } catch (_) {}
    try { const root = await navigator.storage?.getDirectory?.(); if (root) for await (const [name] of root.entries()) if (/wllama/i.test(name)) await root.removeEntry(name, { recursive: true }).catch(() => {}); } catch (_) {}
  }

  window.localAI = { list, pick, chat, load, capabilities, forget, template, get loaded() { return loaded?.key || null; } };
})();
