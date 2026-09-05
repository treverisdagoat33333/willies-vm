import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { Sandbox } from "@e2b/desktop";

const require = createRequire(import.meta.url);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const XENV_API_KEY = process.env.XENV_API_KEY;
const DEV_ID = process.env.XENV_DEV_ID || "willie-games-vm";
const E2B_API_KEY = process.env.E2B_API_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET;
const XENV = "https://loremgroup.org";
const GUEST_VM_TIMEOUT_MS = 30 * 60 * 1000;
const ACCOUNT_VM_TIMEOUT_MS = 60 * 60 * 1000;

if (!AUTH_SECRET) {
  throw new Error("AUTH_SECRET is not configured.");
}

/*
|--------------------------------------------------------------------------
| Wisp WebSocket upgrade handler at /wisp/
|--------------------------------------------------------------------------
*/
server.on("upgrade", (req, socket, head) => {
  const wispPath = new URL(req.url ?? "/", "http://localhost").pathname;
  if (wispPath === "/wisp/") {
    req.url = wispPath;
    wisp.routeRequest(req, socket, head);
    return;
  }
  socket.end();
});

/*
|--------------------------------------------------------------------------
| COEP/COOP headers â€” required for SharedArrayBuffer (wisp transport)
|--------------------------------------------------------------------------
*/
app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

app.use(express.json());
app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| Serve Scramjet v2 static assets
|
| /scram/      â†’ scramjetPath (from @mercuryworkshop/scramjet/path)
| /controller/ â†’ @mercuryworkshop/scramjet-controller  (exposes controller.api.js, controller.sw.js, controller.inject.js)
| /utils/      â†’ @mercuryworkshop/scramjet-utils
| /libcurl/    â†’ @mercuryworkshop/libcurl-transport
|--------------------------------------------------------------------------
*/
app.use("/scram/", express.static(scramjetPath));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/libcurl/", express.static(dirOf("@mercuryworkshop/libcurl-transport")));

/*
|--------------------------------------------------------------------------
| Serve public static files (your frontend)
|--------------------------------------------------------------------------
*/
app.use(express.static(path.join(path.dirname(new URL(import.meta.url).pathname), "public")));

const users = new Map();
const guestSessions = new Map();
const e2bSandboxes = new Map();

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function createToken(payload) {
  return jwt.sign(payload, AUTH_SECRET, { expiresIn: "7d" });
}

function getSession(req) {
  const token = req.cookies.vm_session;
  if (!token) return null;
  try {
    return jwt.verify(token, AUTH_SECRET);
  } catch (_) {
    return null;
  }
}

function requireSession(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({
      error: "Please create an account, log in, or continue as a guest.",
    });
  }
  req.vmSession = session;
  next();
}

function getVmTimeout(req) {
  return req.vmSession.type === "account"
    ? ACCOUNT_VM_TIMEOUT_MS
    : GUEST_VM_TIMEOUT_MS;
}

function getVmSeconds(req) {
  return Math.floor(getVmTimeout(req) / 1000);
}

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
*/

app.post("/api/auth/register", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (username.length < 3 || username.length > 24) {
    return res.status(400).json({ error: "Username must be 3 to 24 characters." });
  }
  if (!/^[a-z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: "Username can only use letters, numbers, underscores, and hyphens." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (users.has(username)) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  users.set(username, { username, passwordHash, createdAt: Date.now() });

  const token = createToken({ type: "account", username });
  res.cookie("vm_session", token, cookieOptions());
  return res.json({ ok: true, account: true, username, vmMinutes: 60 });
});

app.post("/api/auth/login", async (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = users.get(username);

  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = createToken({ type: "account", username });
  res.cookie("vm_session", token, cookieOptions());
  return res.json({ ok: true, account: true, username, vmMinutes: 60 });
});

app.post("/api/auth/guest", (req, res) => {
  const guestId = crypto.randomUUID();
  guestSessions.set(guestId, { createdAt: Date.now() });
  const token = createToken({ type: "guest", guestId });
  res.cookie("vm_session", token, { ...cookieOptions(), maxAge: GUEST_VM_TIMEOUT_MS });
  return res.json({ ok: true, account: false, username: "Guest", vmMinutes: 30 });
});

app.get("/api/auth/me", (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ loggedIn: false });
  return res.json({
    loggedIn: true,
    account: session.type === "account",
    username: session.type === "account" ? session.username : "Guest",
    vmMinutes: session.type === "account" ? 60 : 30,
  });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("vm_session", cookieOptions());
  return res.json({ ok: true });
});

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    e2bConfigured: Boolean(E2B_API_KEY),
    xenvConfigured: Boolean(XENV_API_KEY),
    wispEnabled: true,
  });
});

/*
|--------------------------------------------------------------------------
| XENV GPU VM
|--------------------------------------------------------------------------
*/

app.get("/api/launch", requireSession, async (req, res) => {
  const gpu = req.query.gpu ?? "true";
  const siteLimit = 5;
  const deleteAfter = getVmSeconds(req);

  if (!XENV_API_KEY) {
    return res.status(500).json({ error: "XENV_API_KEY is not configured." });
  }

  try {
    const response = await fetch(
      `${XENV}/api/create?site_limit=${siteLimit}&delete_after=${deleteAfter}&gpu=${encodeURIComponent(gpu)}&developer_id=${encodeURIComponent(DEV_ID)}`,
      { headers: { "X-API-Key": XENV_API_KEY } }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    console.error("XENV launch error:", err);
    res.status(500).json({ error: err.message || "XENV launch failed." });
  }
});

/*
|--------------------------------------------------------------------------
| XENV queue
|--------------------------------------------------------------------------
*/

app.get("/api/queue", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing queue token." });
  if (!XENV_API_KEY) return res.status(500).json({ error: "XENV_API_KEY is not configured." });

  try {
    const response = await fetch(
      `${XENV}/api/queue_status?token=${encodeURIComponent(token)}&wait=true&timeout=25`,
      { headers: { "X-API-Key": XENV_API_KEY } }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    console.error("Queue error:", err);
    res.status(500).json({ error: err.message || "Queue request failed." });
  }
});

/*
|--------------------------------------------------------------------------
| E2B Desktop VM
|--------------------------------------------------------------------------
*/

app.post("/api/e2b/start", requireSession, async (req, res) => {
  if (!E2B_API_KEY) {
    console.error("E2B_API_KEY is missing.");
    return res.status(500).json({ error: "E2B_API_KEY is not configured on the server." });
  }

  let sandbox = null;
  try {
    console.log("Creating E2B Desktop sandbox...");
    const timeoutMs = getVmTimeout(req);
    sandbox = await Sandbox.create({ apiKey: E2B_API_KEY, timeoutMs });

    const sandboxId = sandbox.sandboxId;
    if (!sandboxId) throw new Error("E2B created a sandbox but did not return a sandbox ID.");
    console.log(`E2B sandbox created: ${sandboxId}`);

    await sandbox.stream.start({ requireAuth: true });
    const authKey = await sandbox.stream.getAuthKey();
    if (!authKey) throw new Error("E2B stream started but no authentication key was returned.");

    const streamUrl = sandbox.stream.getUrl({ authKey, autoConnect: true, resize: "scale", viewOnly: false });
    if (!streamUrl) throw new Error("E2B did not return a stream URL.");

    e2bSandboxes.set(sandboxId, sandbox);
    return res.json({
      status: "success",
      sandboxId,
      url: streamUrl,
      timeoutMinutes: Math.floor(timeoutMs / 60000),
    });
  } catch (err) {
    console.error("E2B START FAILED", err);
    if (sandbox) {
      try { await sandbox.stream.stop(); } catch (_) {}
      try { await sandbox.kill(); } catch (_) {}
    }
    return res.status(500).json({ status: "error", error: err?.message || "Failed to start E2B Desktop VM." });
  }
});

/*
|--------------------------------------------------------------------------
| Kill E2B Desktop VM
|--------------------------------------------------------------------------
*/

app.delete("/api/e2b/:id", async (req, res) => {
  const sandboxId = req.params.id;
  try {
    const sandbox = e2bSandboxes.get(sandboxId);
    if (!sandbox) return res.json({ ok: true });
    try { await sandbox.stream.stop(); } catch (_) {}
    try { await sandbox.kill(); } catch (_) {}
    e2bSandboxes.delete(sandboxId);
    console.log(`E2B sandbox killed: ${sandboxId}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("E2B delete error:", err);
    e2bSandboxes.delete(sandboxId);
    return res.status(500).json({ error: err.message || "Failed to delete E2B sandbox." });
  }
});

/*
|--------------------------------------------------------------------------
| Kill XENV GPU VM
|--------------------------------------------------------------------------
*/

app.delete("/api/vm/:id", async (req, res) => {
  if (!XENV_API_KEY) return res.status(500).json({ error: "XENV_API_KEY is not configured." });
  try {
    await fetch(`${XENV}/api/delete/${encodeURIComponent(req.params.id)}`, {
      headers: { "X-API-Key": XENV_API_KEY },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("XENV delete error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete VM." });
  }
});

/*
|--------------------------------------------------------------------------
| Cleanup E2B VMs on shutdown
|--------------------------------------------------------------------------
*/

async function cleanupE2BSandboxes() {
  console.log("Cleaning up E2B sandboxes...");
  for (const [sandboxId, sandbox] of e2bSandboxes) {
    try { await sandbox.stream.stop(); } catch (_) {}
    try { await sandbox.kill(); } catch (_) {}
    console.log(`Cleaned up E2B sandbox: ${sandboxId}`);
  }
  e2bSandboxes.clear();
}

process.on("SIGTERM", async () => { await cleanupE2BSandboxes(); process.exit(0); });
process.on("SIGINT", async () => { await cleanupE2BSandboxes(); process.exit(0); });

/*
|--------------------------------------------------------------------------
| Start
|--------------------------------------------------------------------------
*/
server.listen(PORT, () => {
  console.log(`Willie Games VM running on port ${PORT}`);
  console.log(`E2B configured: ${Boolean(E2B_API_KEY)}`);
  console.log(`XENV configured: ${Boolean(XENV_API_KEY)}`);
  console.log(`Scramjet v2 assets: /scram/ /controller/ /utils/ /libcurl/`);
  console.log(`Wisp endpoint: ws://localhost:${PORT}/wisp/`);
});
