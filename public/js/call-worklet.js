/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/* The microphone for calls that go through our server (js/calls.js): resampled
   to 16 kHz and packed as G.711 μ-law, 20 ms (320 bytes) at a time. */
const RATE = 16000, FRAME = 320;
function mulaw(s) {
  let x = Math.round(Math.max(-1, Math.min(1, s)) * 32767);
  const sign = x < 0 ? 0x80 : 0;
  if (sign) x = -x;
  x = Math.min(32635, x) + 0x84;
  let exp = 7;
  for (let mask = 0x4000; (x & mask) === 0 && exp > 0; exp--, mask >>= 1);
  return ~(sign | (exp << 4) | ((x >> (exp + 3)) & 0x0f)) & 0xff;
}
class Mic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Uint8Array(FRAME);
    this.n = 0;
    this.step = sampleRate / RATE;
    this.pos = 0;
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (; this.pos < ch.length; this.pos += this.step) {
      const i = Math.floor(this.pos), f = this.pos - i;
      this.buf[this.n++] = mulaw(i + 1 < ch.length ? ch[i] * (1 - f) + ch[i + 1] * f : ch[i]);
      if (this.n === FRAME) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
        this.buf = new Uint8Array(FRAME);
        this.n = 0;
      }
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor("wvm-mic", Mic);
