/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// "Leave site?" when the tab is closed or refreshed: on by default, off with the
// setting, and never in the way of the panic key.
import { chromium } from "playwright";
const BASE = process.env.BASE, SITE = process.env.SITE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function open() {
  // a fresh browser session each time: after "stay on this page", Chromium won't open another tab in the old one
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
  await page.goto("/");
  if (await page.isVisible("#guest-button")) {
    await page.click("#guest-button");
    await page.waitForSelector("#auth-wrap.hidden", { state: "attached" });
  }
  await page.waitForFunction(() => typeof S !== "undefined");
  await page.mouse.click(640, 400); // browsers only ask once you've interacted with the page
  return { page, dialogs };
}

let { page, dialogs } = await open();
ok(await page.evaluate(() => S.confirmLeave === true), "asking before leaving is on by default");
await page.evaluate(() => openSettings());
await page.click('#snav [data-page="cloak"]');
ok(await page.$eval('.switch[data-setting="confirmLeave"]', (b) => b.getAttribute("aria-checked") === "true" || b.classList.contains("on")), "…and Settings shows it on");
await page.evaluate(() => closePanel("settings-panel"));
await page.close({ runBeforeUnload: true });
await new Promise((r) => setTimeout(r, 800));
ok(dialogs.includes("beforeunload") && !page.isClosed(), "closing the tab asks first (and staying keeps it open)", JSON.stringify(dialogs));

// the panic key goes straight through
dialogs.length = 0;
await page.evaluate((u) => { S.panicUrl = u; S.panicAction = "redirect"; panicNow(); }, SITE + "/page2");
await page.waitForURL((u) => u.href.startsWith(SITE), { timeout: 10000 }).catch(() => {});
ok(page.url().startsWith(SITE) && !dialogs.length, "the panic key never asks", `${page.url()} ${JSON.stringify(dialogs)}`);
await page.context().close(); // (closing just the tab, after a "stay on this page", takes Chromium down with it)

// switched off: no question
({ page, dialogs } = await open());
await page.evaluate(() => set("confirmLeave", false));
await page.mouse.click(640, 400);
await page.close({ runBeforeUnload: true });
await new Promise((r) => setTimeout(r, 800));
ok(!dialogs.length && page.isClosed(), "switched off, the tab just closes", JSON.stringify(dialogs));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
