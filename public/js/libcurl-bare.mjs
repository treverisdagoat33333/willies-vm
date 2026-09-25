/*
 * bare-mux transport for Scramjet v1 and Ultraviolet: the same libcurl build
 * Scramjet v2 uses, so all three engines share one download.
 *
 * libcurl-transport 2.x takes headers as [name, value] pairs; bare-mux uses
 * { name: value | [values] }. This converts both ways, and shapes response
 * headers like the 1.x build did ({ name: [values] }, names as sent).
 */
import LibcurlClient from "/libcurl/index.mjs";

const pairs = (h) => Object.entries(h || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]));

export default class BareLibcurl extends LibcurlClient {
  async request(remote, method, body, headers, signal) {
    const res = await super.request(remote, method, body, pairs(headers), signal);
    const out = {};
    for (const [k, v] of res.headers) (out[k] ||= []).push(v);
    return { ...res, headers: out };
  }

  connect(url, protocols, headers, ...callbacks) {
    return super.connect(url, protocols, pairs(headers), ...callbacks);
  }
}
