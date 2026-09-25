/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// Pictures and files in chat: sharing, who can see them, and that nothing
// uploaded can run as a page on our site.
import { chromium } from "playwright";
const BASE = process.env.BASE;
let pass = 0, fail = 0;
const ok = (c, l, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${l}${c ? "" : "  -> " + x}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const stamp = Date.now().toString(36).slice(-5);
async function person(name) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  if (name) {
    await page.evaluate(async (name) => {
      const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: name, password: "password123" }) });
      if (!r.ok) throw new Error(await r.text());
    }, name);
    await page.reload();
  } else await page.click("#guest-button");
  await page.waitForFunction(() => typeof chatMe !== "undefined" && !!chatMe && chatReady, null, { timeout: 15000 });
  await page.evaluate(() => openChat());
  return { ctx, page, errors, name };
}
/* status and headers of a file, as someone sees it */
const head = (p, url) => p.page.evaluate(async (url) => {
  const r = await fetch(url);
  return { status: r.status, type: r.headers.get("content-type"), disp: r.headers.get("content-disposition"), nosniff: r.headers.get("x-content-type-options"), csp: r.headers.get("content-security-policy") };
}, url);
const upload = (p, name, bytes, channel = "general") => p.page.evaluate(async ({ name, bytes, channel }) => {
  const r = await fetch(`/api/chat/files?channel=${encodeURIComponent(channel)}&name=${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(bytes) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}, { name, bytes: [...bytes], channel });
async function attachAndSend(p, file, text = "") {
  await p.page.setInputFiles("#dc-file", file);
  await p.page.waitForFunction(() => !!dcFile?.id, null, { timeout: 10000 }).catch(() => {});
  if (text) await p.page.fill("#dc-input", text);
  await p.page.click("#dc-send");
}
const lastMsg = (p) => p.page.evaluate(() => dcMessages[dcMessages.length - 1]);

const a = await person("fann" + stamp), b = await person("fbob" + stamp), c = await person("fcat" + stamp);

// ---- a picture, with a caption
ok(await a.page.isVisible("#dc-attach"), "accounts get an attach button");
await a.page.setInputFiles("#dc-file", { name: "dot.png", mimeType: "image/png", buffer: PNG });
await a.page.waitForSelector("#dc-att-stage:not([hidden])", { timeout: 5000 }).catch(() => {});
ok(await a.page.isVisible("#dc-att-stage img"), "picking a picture shows it above the message box");
await a.page.waitForFunction(() => !!dcFile?.id, null, { timeout: 10000 }).catch(() => {});
await a.page.fill("#dc-input", "look at this");
await a.page.press("#dc-input", "Enter");
await b.page.waitForFunction(() => { const i = document.querySelector("#dc-msgs .dc-img img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 }).catch(() => {});
ok(await b.page.$eval("#dc-msgs .dc-img img", (i) => i.naturalWidth).catch(() => 0) === 1, "the other person sees the picture", await b.page.$eval("#dc-msgs", (m) => m.innerHTML.slice(-400)));
ok((await lastMsg(b))?.text === "look at this", "…with its caption");
const img = await lastMsg(b), imgUrl = `/api/chat/files/${img.file.id}`;
let h = await head(b, imgUrl);
ok(h.status === 200 && h.type === "image/png" && h.nosniff === "nosniff" && /sandbox/.test(h.csp || ""), "pictures are served as pictures, sandboxed", JSON.stringify(h));
ok(img.file.w === 1 && img.file.h === 1, "its size is known before it loads", JSON.stringify(img.file));
await b.page.click("#dc-msgs .dc-img");
ok(await b.page.isVisible("#dc-viewer"), "tapping it opens it full size");
await b.page.keyboard.press("Escape");

// ---- any other file is a download
await attachAndSend(a, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello notes") });
await b.page.waitForFunction(() => document.querySelector("#dc-msgs .dc-m:last-child .dc-att .nm")?.textContent === "notes.txt", null, { timeout: 10000 }).catch(() => {});
ok(await b.page.$eval("#dc-msgs .dc-m:last-child .dc-att .nm", (e) => e.textContent).catch(() => "") === "notes.txt", "a file shows as a download");
h = await head(b, `/api/chat/files/${(await lastMsg(b)).file.id}`);
ok(h.type === "application/octet-stream" && /^attachment/.test(h.disp || ""), "…and is served only as a download", JSON.stringify(h));

// ---- a page dressed up as a picture stays a download
await attachAndSend(a, { name: "evil.png", mimeType: "image/png", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') });
await b.page.waitForFunction(() => dcMessages[dcMessages.length - 1]?.file?.name === "evil.png", null, { timeout: 10000 }).catch(() => {});
const evil = await lastMsg(b);
ok(evil?.file && !evil.file.image, "a file that only claims to be a picture isn't shown as one", JSON.stringify(evil?.file));
h = await head(b, `/api/chat/files/${evil.file.id}`);
ok(h.type === "application/octet-stream" && /^attachment/.test(h.disp || "") && h.nosniff === "nosniff", "…and can't run on our site", JSON.stringify(h));

// ---- programs, and files that are too big, aren't taken
ok((await upload(a, "game.exe", Buffer.from("MZ..."))).status === 415, "programs can't be shared");
const big = await a.page.evaluate(async () => {
  const r = await fetch("/api/chat/files?channel=general&name=big.bin", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(9 * 1024 * 1024) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
});
ok(big.status === 413 && /8 MB/.test(big.body.error || ""), "files over 8 MB are refused, and it says so", JSON.stringify(big));

// ---- guests can look, not upload
const g = await person(null);
ok((await head(g, imgUrl)).status === 200, "a guest can see a picture in a public channel");
ok((await upload(g, "x.png", PNG)).status === 401, "…but can't upload");
ok(await g.page.isHidden("#dc-attach"), "…and has no attach button");
await g.ctx.close();

// ---- not sent yet: only the uploader can fetch it
const unsent = await upload(a, "draft.png", PNG);
ok(unsent.status === 200 && (await head(a, `/api/chat/files/${unsent.body.id}`)).status === 200 && (await head(b, `/api/chat/files/${unsent.body.id}`)).status === 404, "an upload that wasn't sent is only yours", JSON.stringify(unsent));

// ---- a DM's files are only for the two of you
await a.page.evaluate((n) => dcSend({ type: "dm.open", name: n }), b.name);
await a.page.waitForFunction(() => dcActiveIsDM, null, { timeout: 10000 });
const dm = await a.page.evaluate(() => dcActive);
await attachAndSend(a, { name: "secret.png", mimeType: "image/png", buffer: PNG });
await a.page.waitForFunction(() => dcMessages[dcMessages.length - 1]?.file?.name === "secret.png", null, { timeout: 10000 }).catch(() => {});
const secretUrl = `/api/chat/files/${(await lastMsg(a)).file.id}`;
ok((await head(b, secretUrl)).status === 200, "the other person in a DM can see its picture");
ok((await head(c, secretUrl)).status === 404, "…nobody else can", dm);
ok((await upload(c, "x.png", PNG, dm)).status === 403, "…or post into it");

// ---- deleting the message takes the file with it
await a.page.evaluate(() => dcOpen("general"));
await a.page.waitForTimeout(500);
await a.page.evaluate((id) => dcSend({ type: "delete", id }), img.id);
await a.page.waitForTimeout(500);
ok((await head(b, imgUrl)).status === 404, "deleting a message deletes its picture");

// ---- pasting a picture into the message box
await a.page.evaluate(async (bytes) => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
  const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
  document.querySelector("#dc-input").dispatchEvent(ev);
}, [...PNG]);
await a.page.waitForFunction(() => !!dcFile?.id, null, { timeout: 10000 }).catch(() => {});
ok(await a.page.evaluate(() => dcFile?.file.name === "pasted.png" && !!dcFile.id), "pasting a picture attaches it");
await a.page.click("#dc-att-stage button");
ok(await a.page.isHidden("#dc-att-stage"), "…and ✕ takes it off again");

ok(![a, b, c].some((p) => p.errors.length), "no page errors", [a, b, c].flatMap((p) => p.errors).join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
