/*!
 * william's vm — WillieJet (service worker side)
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 *
 * Imported by public/sw.js. Hands /~/wj/<page>/... requests to that desktop
 * tab's engine worker over a MessagePort, and hands back its response.
 *
 * A service worker can be stopped and restarted at any time, losing these
 * ports. When a request arrives with no line for its page, this asks every
 * tab to reconnect and waits for one (up to 8 s), instead of letting the
 * request fall through to the server and 404.
 */
const WJ_PREFIX = "/~/wj/";
const wjLines = new Map(); // page -> { port, waiting: Map(id -> resolve) }
const wjWaiters = [];
let wjN = 0;

/* A newer line replaces an older one for new requests; the engine worker keeps
   answering on both, so requests already sent on the old one still finish. */
function wjAttach(page, port) {
  const line = { port, waiting: new Map() };
  port.onmessage = ({ data }) => {
    if (data?.t !== "fetch") return;
    const done = line.waiting.get(data.id);
    line.waiting.delete(data.id);
    done?.(data);
  };
  wjLines.set(page, line);
  while (wjWaiters.length) wjWaiters.shift()();
}

/* Our own error responses. They load inside a frame of an isolated page, so
   without this header Chrome would block them instead of showing them. */
function wjError(message, status = 502) {
  return new Response(`<!doctype html><meta charset=utf-8><p style='font:15px system-ui;padding:24px'>${String(message).replace(/</g, "&lt;")}</p>`, {
    status, headers: { "content-type": "text/html; charset=utf-8", "cross-origin-embedder-policy": "require-corp" },
  });
}

async function wjLine(page) {
  const own = () => wjLines.get(page) || wjLines.values().next().value;
  if (own()) return own();
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of clients) c.postMessage({ $wj$revive: true });
  await new Promise((resolve) => {
    wjWaiters.push(resolve);
    setTimeout(resolve, 8000);
  });
  return own();
}

self.addEventListener("message", (e) => {
  const d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.$wj$register && e.ports[0]) wjAttach(String(d.$wj$register.page), e.ports[0]);
  else if (d.$wj$transport && e.ports[0]) {
    // a proxied window that can't reach its desktop page directly
    wjLine(String(d.$wj$transport.page)).then((line) => line?.port.postMessage({ t: "transport" }, [e.ports[0]]));
  }
});

// a fresh start (or restart) of this worker: every tab should reconnect
self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ $wj$revive: true })));

function wjRoutes(event) {
  return new URL(event.request.url).pathname.startsWith(WJ_PREFIX) && event.request.url.startsWith(self.location.origin);
}

async function wjFetch(event) {
  try {
    return await wjForward(event);
  } catch (e) {
    return wjError("WillieJet: " + (e?.message || e));
  }
}

async function wjForward(event) {
  const req = event.request;
  const page = new URL(req.url).pathname.slice(WJ_PREFIX.length).split("/")[0];
  const line = await wjLine(page);
  if (!line) return wjError("WillieJet isn't running. Reload the browser.", 503);
  const client = event.clientId ? await self.clients.get(event.clientId) : null;
  const body = req.method === "GET" || req.method === "HEAD" ? null : await req.arrayBuffer();
  const id = ++wjN;
  const reply = await new Promise((resolve) => {
    line.waiting.set(id, resolve);
    line.port.postMessage({
      t: "fetch",
      id,
      req: {
        url: req.url, method: req.method, headers: [...req.headers], body,
        destination: req.destination, mode: req.mode, referrer: req.referrer, cache: req.cache,
        clientUrl: client?.url, clientId: event.clientId || event.resultingClientId,
      },
    }, body ? [body] : []);
  });
  if (reply.error) return wjError("WillieJet: " + reply.error);
  const { res } = reply;
  const status = res.status >= 200 && res.status <= 599 ? res.status : 502;
  return new Response(res.body ?? null, { status, statusText: res.statusText || "", headers: res.headers });
}
