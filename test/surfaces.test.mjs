/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
import { chromium } from "playwright";
const BASE = process.env.BASE, SITE = process.env.SITE;
let pass = 0, fail = 0;
const ok = (condition, label) => { condition ? pass++ : fail++; console.log(`${condition ? "PASS" : "FAIL"} ${label}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
async function person(name) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(async name => {
    const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: "surface-test-pass" }) });
    if (!r.ok) throw new Error(await r.text());
  }, name);
  await page.reload();
  await page.waitForFunction(() => typeof chatReady !== "undefined" && chatReady);
  return page;
}
try {
  const stamp = Date.now().toString(36);
  const a = await person("surfacea" + stamp), b = await person("surfaceb" + stamp);
  await a.evaluate(() => openBrowser());
  ok(await a.isVisible("#browser-start"), "the default browser opens its own start page");
  await a.fill("#browser-start-query", SITE + "/page2");
  await a.locator('#browser-start-search button[type="submit"]').click();
  await a.waitForFunction(() => document.querySelector("iframe.browser-frame.active")?.contentDocument?.querySelector("#h")?.textContent === "Page two");
  ok(await a.isHidden("#browser-start"), "the start-page search navigates through the proxy");
  await a.click("#b-bm");
  await a.click("#tab-new");
  ok(await a.isVisible("#browser-start") && await a.locator("#browser-start-bookmarks button").count() === 1, "a new tab shows the saved bookmark");
  await a.locator("#tab-list .tab").first().click();
  ok(await a.isHidden("#browser-start"), "switching tabs restores the page instead of covering it");
  await a.click("#b-home");
  ok(await a.isVisible("#browser-start"), "Home returns to the browser start page");
  await a.locator("#browser-start-bookmarks button").click();
  await a.waitForFunction(() => document.querySelector("iframe.browser-frame.active")?.contentDocument?.querySelector("#h")?.textContent === "Page two");
  ok(await a.isHidden("#browser-start"), "saved bookmarks open through the proxy");
  await a.evaluate(url => { closeBrowser(); S.homepage = url; return openBrowser(); }, SITE + "/page2");
  await a.waitForFunction(() => document.querySelector("iframe.browser-frame.active")?.contentDocument?.querySelector("#h")?.textContent === "Page two");
  ok(await a.isHidden("#browser-start"), "a custom homepage is respected");
  await a.evaluate(() => { closeBrowser(); openChat(); });
  await b.evaluate(() => openChat());
  await a.setViewportSize({ width: 390, height: 844 });
  ok(await a.isVisible("#dc-menu"), "phone chat exposes the channel drawer");
  await a.click("#dc-menu");
  ok(await a.getAttribute("#dc-menu", "aria-expanded") === "true" && await a.isVisible("#dc-nav-backdrop"), "the channel button opens an accessible drawer");
  await a.locator('#dc-channels .dc-ch').first().click();
  ok(await a.isHidden("#dc-nav-backdrop"), "a phone user can select a visible channel in the drawer");
  await a.click("#dc-menu");
  await a.keyboard.press("Escape");
  ok(await a.isHidden("#dc-nav-backdrop") && await a.isVisible("#dc-input"), "Escape closes the drawer and keeps chat open");
  await a.fill("#dc-input", "A real message from the redesigned phone chat");
  await a.click("#dc-send");
  await b.waitForFunction(() => document.querySelector("#dc-msgs").textContent.includes("A real message from the redesigned phone chat"));
  ok(true, "a phone message reaches another signed-in browser");
  await b.fill("#dc-input", "Reply received on the desktop");
  await b.click("#dc-send");
  await a.waitForFunction(() => document.querySelector("#dc-msgs").textContent.includes("Reply received on the desktop"));
  ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "the reply reaches the phone without horizontal overflow");
  await a.emulateMedia({ reducedMotion: "reduce" });
  ok(await a.locator(".dc-side").evaluate(el => getComputedStyle(el).transitionDuration) === "0s", "the channel drawer respects reduced motion");
  ok(!errors.length, "the redesigned browser and chat have no page errors");
} finally { await browser.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
