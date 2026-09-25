/*!
 * william's vm — tests
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
// npm test         the proxy / WillieJet suites against a local test site
// npm run bench    timings instead (Scramjet v2 vs WillieJet)
//
// Starts test/site.mjs, a server that may reach it (test/preload.mjs), and a
// strict one that may not, each on a free port with a throwaway database,
// then runs each suite in its own process. Set CHROMIUM_PATH to use a
// Chromium other than Playwright's own.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bench = process.argv.includes("--bench");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SUITES = ["cache", "engines", "menu", "compat", "williejet", "fastnet", "sw-restart", "nextday", "ai"];
const children = [];
const temps = [];

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function startProcess(name, args, env, readyUrl) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  children.push(child);
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(readyUrl)).ok) return child; } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${name} didn't start:\n${log}`);
}

function server(port, extraEnv) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wvm-test-"));
  temps.push(dataDir);
  return startProcess(`server on ${port}`, ["--no-warnings", "--import", "./test/preload.mjs", "server.js"], {
    PORT: String(port), DATA_DIR: dataDir, AUTH_SECRET: crypto.randomBytes(24).toString("hex"), ...extraEnv,
  }, `http://localhost:${port}/api/health`);
}

function runSuite(file, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join("test", file)], { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; process.stdout.write(d); });
    child.stderr.on("data", (d) => { out += d; process.stderr.write(d); });
    child.on("exit", (code) => resolve({ code, out }));
  });
}

let failed = 0;
try {
  const [sitePort, port, strictPort] = [await freePort(), await freePort(), await freePort()];
  await startProcess("test site", ["test/site.mjs"], { SITE_PORT: String(sitePort) }, `http://127.0.0.1:${sitePort}/hits`);
  await server(port, { AI_API_KEY: "test-ai-key", AI_BASE_URL: `http://127.0.0.1:${sitePort}/v1` }); // the AI app talks to the test site's pretend API
  await server(strictPort, { WJ_STRICT: "1" });
  const env = { BASE: `http://localhost:${port}`, STRICT_BASE: `http://localhost:${strictPort}`, SITE: `http://127.0.0.1:${sitePort}` };

  const list = bench ? ["bench.mjs", "nextday.test.mjs"] : SUITES.filter((s) => !only.length || only.includes(s)).map((s) => `${s}.test.mjs`);
  const summary = [];
  for (const file of list) {
    console.log(`\n===== ${file} =====`);
    const t0 = Date.now();
    const { code, out } = await runSuite(file, bench ? { ...env, ROUNDS: "3" } : env);
    const counts = out.match(/(\d+) passed, (\d+) failed/g)?.pop() || (code ? "crashed" : "done");
    summary.push(`${code ? "FAIL" : "ok  "} ${file.padEnd(22)} ${counts} (${Math.round((Date.now() - t0) / 1000)}s)`);
    if (code && !bench) failed++;
  }
  console.log("\n===== summary =====\n" + summary.join("\n"));
} catch (e) {
  console.error(e.message);
  failed++;
} finally {
  for (const c of children) c.kill();
  for (const d of temps) fs.rmSync(d, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
