/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* Transformers.js, in a worker of its own: on the CPU (WebAssembly) a model
   would otherwise freeze the desktop between words. js/local-ai.js sends
   {t:'load'|'chat'|'stop'} and gets back progress, words and the end. */
import { pipeline, TextStreamer, StoppingCriteria, StoppingCriteriaList, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";

env.allowLocalModels = false;
let gen = null;
let stopNow = false;
class Stop extends StoppingCriteria {
  _call(ids) { return new Array(ids.length).fill(stopNow); }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.t === "load") {
      // leave the page a core or two (js/local-ai.js works out how many)
      if (data.threads && env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = data.threads;
      gen = await pipeline("text-generation", data.model, {
        device: data.device,
        dtype: data.dtype,
        progress_callback: (p) => { if (p.status === "progress") self.postMessage({ t: "progress", file: p.file, loaded: p.loaded, total: p.total }); },
      });
      self.postMessage({ t: "ready" });
    } else if (data.t === "chat") {
      stopNow = false;
      const streamer = new TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (x) => self.postMessage({ t: "token", x }) });
      const stopping = new StoppingCriteriaList();
      stopping.push(new Stop());
      await gen(data.messages, { max_new_tokens: data.max || 512, do_sample: false, streamer, stopping_criteria: stopping });
      self.postMessage({ t: "done" });
    } else if (data.t === "stop") {
      stopNow = true;
    }
  } catch (e) {
    self.postMessage({ t: "error", error: String(e?.message || e) });
  }
};
