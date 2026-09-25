/*
 * One service worker for every proxy engine (a scope only gets one), told
 * apart by prefix:
 *   /~/sj/   Scramjet v2, the default
 *   /~/wj/   WillieJet (ours, on the Scramjet v2 core; see wj/sw.js)
 *   /~/sj1/  Scramjet v1
 *   /~/uv/   Ultraviolet
 * The others load inside try/catch, so if one breaks, Scramjet v2 keeps
 * working.
 */
importScripts("/controller/controller.sw.js");

const SJ1_PREFIX = "/~/sj1/";
const SJ1_WASM = "/sj1/scramjet.wasm.wasm"; // proxied pages load it as a script; v1 wraps it
let sj1 = null;
let uv = null;

let wj = false;
try {
  importScripts("/wj/sw.js");
  wj = true;
} catch (e) {
  console.error("WillieJet didn't load:", e);
}

try {
  importScripts("/sj1/scramjet.all.js");
  // v1's worker opens its database the moment it's created. Here that is
  // before the page has set it up, which would leave it empty, so create
  // the tables first. IndexedDB handles opens in order, so this one wins.
  const open = indexedDB.open("$scramjet", 1);
  open.onupgradeneeded = () => {
    for (const store of ["config", "cookies", "redirectTrackers", "referrerPolicies", "publicSuffixList"]) {
      if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store);
    }
  };
  open.onsuccess = () => open.result.close();
  const { ScramjetServiceWorker } = $scramjetLoadWorker();
  sj1 = new ScramjetServiceWorker();
} catch (e) {
  console.error("Scramjet v1 didn't load:", e);
}

try {
  importScripts("/uv/uv.bundle.js", "/uv/uv.config.js", "/uv/uv.sw.js");
  uv = new UVServiceWorker();
} catch (e) {
  console.error("Ultraviolet didn't load:", e);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// v1 only applies its config when it reads it from the database itself. The
// "loadConfig" message the page sends stores it without applying it, which
// leaves every URL without a prefix, so read it from the database once here.
let sj1Ready = null;
function sj1Config() {
  return (sj1Ready ||= (async () => {
    sj1.config = null;
    await sj1.loadConfig(); // written by the page's ScramjetController.init()
    if (!sj1.config) throw new Error("Scramjet v1 isn't set up yet. Reload the page.");
  })().catch((e) => {
    sj1Ready = null;
    throw e;
  }));
}

async function sj1Fetch(event) {
  await sj1Config();
  return sj1.fetch(event);
}

self.addEventListener("fetch", (event) => {
  if (wj && wjRoutes(event)) {
    event.respondWith(wjFetch(event));
  } else if ($scramjetController.shouldRoute(event)) {
    event.respondWith($scramjetController.route(event));
  } else if (sj1 && (event.request.url.startsWith(location.origin + SJ1_PREFIX) || event.request.url.startsWith(location.origin + SJ1_WASM))) {
    event.respondWith(sj1Fetch(event));
  } else if (uv && uv.route(event)) {
    event.respondWith(uv.fetch(event));
  }
});
