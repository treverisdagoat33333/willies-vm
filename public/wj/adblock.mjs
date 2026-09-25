/*!
 * william's vm — WillieJet ad and tracker blocker (worker side)
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 *
 * Requests to known ad and tracker networks never leave the worker: the page
 * gets a harmless empty answer of the kind it asked for (an empty script, a
 * transparent pixel, a blank frame), so it carries on as if the ad just
 * didn't show. Fewer requests also means heavy sites load faster.
 *
 * Only whole domains that serve nothing but ads or tracking are listed, so
 * sites keep working. Ads a site serves from its own domain (YouTube's video
 * ads, for one) can't be told apart this way and still show. Pages you open
 * yourself are never blocked, and neither is anything on a site that is
 * itself on the list.
 */

/* a domain here blocks it and all its subdomains */
const DOMAINS = [
  // ad networks and exchanges
  "doubleclick.net", "googlesyndication.com", "googleadservices.com", "googletagservices.com",
  "adnxs.com", "adsrvr.org", "amazon-adsystem.com", "advertising.com", "criteo.com", "criteo.net",
  "taboola.com", "outbrain.com", "pubmatic.com", "rubiconproject.com", "openx.net", "casalemedia.com",
  "indexww.com", "smartadserver.com", "adform.net", "yieldmo.com", "sharethrough.com", "teads.tv",
  "33across.com", "media.net", "bidswitch.net", "contextweb.com", "lijit.com", "sovrn.com", "gumgum.com",
  "triplelift.com", "3lift.com", "spotxchange.com", "springserve.com", "adroll.com", "zedo.com",
  "serving-sys.com", "moatads.com", "adsafeprotected.com", "doubleverify.com", "revcontent.com",
  "mgid.com", "zergnet.com", "adskeeper.com", "bidvertiser.com", "infolinks.com", "carbonads.com",
  "carbonads.net", "buysellads.com", "disqusads.com", "mediavine.com", "adthrive.com", "ads-twitter.com",
  // pop-ups and pop-unders (common on game sites)
  "popads.net", "popcash.net", "propellerads.com", "adsterra.com", "exoclick.com", "exosrv.com",
  "onclickads.net", "adcash.com", "hilltopads.net", "a-ads.com", "clickadu.com", "ad-maven.com",
  "juicyads.com", "trafficjunky.net",
  // trackers and analytics
  "google-analytics.com", "googletagmanager.com", "scorecardresearch.com", "quantserve.com",
  "hotjar.com", "hotjar.io", "clarity.ms", "mouseflow.com", "fullstory.com", "crazyegg.com",
  "mixpanel.com", "mxpnl.com", "chartbeat.com", "chartbeat.net", "nr-data.net",
];
/* exact hosts, on domains that also serve real content */
const HOSTS = [
  "adservice.google.com", "ads.yahoo.com", "analytics.yahoo.com",
  "analytics.twitter.com", "ads.linkedin.com", "px.ads.linkedin.com", "snap.licdn.com", "bat.bing.com",
  "analytics.tiktok.com", "ct.pinterest.com", "mc.yandex.ru", "cdn.segment.com", "api.segment.io",
  "api.amplitude.com", "api2.amplitude.com", "js-agent.newrelic.com",
];

const listed = new Set([...DOMAINS, ...HOSTS]);
const REGIONAL = /^adservice\.google\.[a-z]{2,3}(\.[a-z]{2})?$/; // adservice.google.co.uk and friends

export function isAdHost(host) {
  host = String(host || "").toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (REGIONAL.test(host)) return true;
  for (let h = host; h.includes("."); h = h.slice(h.indexOf(".") + 1)) if (listed.has(h)) return true;
  return false;
}

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const COEP = ["cross-origin-embedder-policy", "require-corp"];

/* A blocked frame stays blank inside a page. If it's a whole tab (you followed a
   link to an ad or tracker site), it says so and offers to open it anyway. */
function blockedFrame(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch (_) {}
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>
try{if(parent!==self&&parent[Symbol.for("wj.engine")]){
document.body.innerHTML='<div style="font:15px system-ui,sans-serif;background:#0d1017;color:#e8ebf1;min-height:100vh;display:grid;place-items:center;text-align:center"><div style="padding:24px"><h2 style="margin:0 0 8px;font-size:20px">Ad or tracker site blocked</h2><p style="color:#9aa3b2;margin:0 0 14px"></p><button style="padding:9px 16px;border-radius:9px;border:0;background:#4f8cff;color:#fff;font-weight:600;cursor:pointer">Open anyway</button></div></div>';
document.querySelector("p").textContent=${JSON.stringify(host)}+" is on WillieJet's ad blocker list.";
document.querySelector("button").onclick=()=>parent.postMessage({wj:"open",url:${JSON.stringify(String(url))}},location.origin)}}catch(e){}
</script></body></html>`;
}

/* The empty answer a blocked request gets, shaped for what asked for it. */
export function blockedResponse(destination, url) {
  const res = (status, type, body) => ({ status, statusText: status === 200 ? "OK" : "No Content", body, headers: [...(type ? [["content-type", type]] : []), ["cache-control", "no-store"], COEP] });
  switch (destination) {
    case "script": case "worker": case "sharedworker": return res(200, "application/javascript", "/* blocked by WillieJet */");
    case "style": return res(200, "text/css", "/* blocked by WillieJet */");
    case "image": return res(200, "image/gif", GIF.slice().buffer);
    case "iframe": case "frame": case "embed": case "object": return res(200, "text/html; charset=utf-8", blockedFrame(url));
    default: return res(204, null, null); // fetch, XHR, beacons, media
  }
}

/* Leftover empty ad boxes, hidden on pages where blocking is on (wj/inject.js). */
export const HIDE_CSS = [
  "ins.adsbygoogle", "div[id^='google_ads_iframe']", "iframe[id^='google_ads_iframe']", "div[id^='div-gpt-ad']",
  "[data-google-query-id]", "iframe[src*='doubleclick.net']", "iframe[src*='googlesyndication.com']",
  "div[id^='taboola-']", ".trc_related_container", ".OUTBRAIN", "[id^='outbrain_widget']", ".adthrive-ad", ".mv-ad-box",
].join(",") + "{display:none!important}";
