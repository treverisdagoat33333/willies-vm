/*!
 * william's vm
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential. See LICENSE.
 */
/*
 * One-click Remote PC setup. The owner downloads a .cmd with the key and this
 * site's address already inside, double-clicks it once, and the PC shows up in
 * Remote PC from then on: it fetches Node (a portable copy, no admin rights),
 * the agent and its one package, then starts the agent hidden at every sign-in.
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { safeEqual } from "./security.js";

const AGENT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "agent");
const AGENT_FILES = new Set(["willies-agent.mjs", "files.mjs", "package.json"]);
const NODE_VERSION = "v22.12.0";

// Everything goes into a .cmd file, where % and quotes mean something, so the
// key must be plain before it is written into one.
const plainKey = (k) => /^[A-Za-z0-9._~-]{8,200}$/.test(k);

function installer(origin, key) {
  const wss = origin.replace(/^http/, "ws");
  // CRLF: cmd.exe misreads labels and goto in LF-only files
  return `@echo off
title william's vm - Remote PC setup
setlocal
set "WVM_HOME=%LOCALAPPDATA%\\WilliesAgent"
set "WVM_SITE=${origin}"
set "WVM_KEY=${key}"
echo Setting up Remote PC on this computer...
echo.
if not exist "%WVM_HOME%" mkdir "%WVM_HOME%"
cd /d "%WVM_HOME%"

rem Stop an older copy first so its files can be replaced
taskkill /f /fi "WINDOWTITLE eq WilliesAgent" >nul 2>&1
wmic process where "CommandLine like '%%willies-agent.mjs%%' and Name='node.exe'" call terminate >nul 2>&1

set "NODE=node"
where node >nul 2>&1 || set "NODE=%WVM_HOME%\\node\\node.exe"
if not "%NODE%"=="node" if not exist "%NODE%" (
  echo [1/3] Downloading Node.js ^(one time, about 30 MB^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest 'https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip' -OutFile node.zip; Expand-Archive node.zip -DestinationPath . -Force; Remove-Item node.zip; if (Test-Path node) { Remove-Item node -Recurse -Force }; Rename-Item 'node-${NODE_VERSION}-win-x64' node" || goto fail
)

echo [2/3] Downloading the agent...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $h=@{Authorization='Bearer %WVM_KEY%'}; foreach($f in 'willies-agent.mjs','files.mjs','package.json'){ Invoke-WebRequest \\"$env:WVM_SITE/api/remote/agent/$f\\" -Headers $h -OutFile $f }" || goto fail

echo [3/3] Installing...
if "%NODE%"=="node" (call npm install --no-audit --no-fund --silent) else (call "%WVM_HOME%\\node\\npm.cmd" install --no-audit --no-fund --silent)
if not exist node_modules\\ws goto fail

rem The agent reconnects by itself; this loop only restarts it if it exits.
> run.cmd (
  echo @echo off
  echo title WilliesAgent
  echo cd /d "%WVM_HOME%"
  echo :loop
  echo "%NODE%" willies-agent.mjs --url "${wss}" --key "%WVM_KEY%" --name "%COMPUTERNAME%"
  echo timeout /t 10 /nobreak ^>nul
  echo goto loop
)
rem A tiny script starts it with no window, and a copy in Startup runs it at every sign-in
> "%WVM_HOME%\\start.vbs" echo CreateObject("WScript.Shell").Run """%WVM_HOME%\\run.cmd""", 0, False
copy /y "%WVM_HOME%\\start.vbs" "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\WilliesAgent.vbs" >nul
wscript "%WVM_HOME%\\start.vbs"

echo.
echo Done! This PC now shows up in Remote PC as "%COMPUTERNAME%".
echo It starts by itself whenever you sign in to Windows.
echo To remove it, delete WilliesAgent.vbs from your Startup folder.
echo.
pause
exit /b 0

:fail
echo.
echo Setup failed. Check your internet connection and try again.
pause
exit /b 1
`.replace(/\r?\n/g, "\r\n");
}

export function remoteSetupRouter({ requireOwner, limiter }) {
  const r = express.Router();
  const key = () => process.env.REMOTE_KEY || "";

  // the owner's page fills the key in itself, so it never has to be typed
  r.get("/key", requireOwner, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ key: key() || null });
  });

  r.get("/setup.cmd", requireOwner, (req, res) => {
    if (!key()) return res.status(404).json({ error: "Set REMOTE_KEY on the server first." });
    if (!plainKey(key())) return res.status(400).json({ error: "REMOTE_KEY must be letters, numbers, dots, dashes or underscores." });
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="Remote PC setup.cmd"',
      "Cache-Control": "no-store",
    });
    res.send(installer(`${req.protocol}://${req.get("host")}`, key()));
  });

  // The installer fetches the agent with the key, like the agent itself connects.
  r.get("/agent/:file", limiter, (req, res) => {
    const auth = /^Bearer\s+(.+)$/i.exec(String(req.get("authorization") || ""))?.[1] || "";
    if (!key() || !auth || !safeEqual(auth, key())) return res.status(401).json({ error: "bad key" });
    if (!AGENT_FILES.has(req.params.file)) return res.status(404).end();
    res.set("Cache-Control", "no-store");
    res.type("text/plain").send(fs.readFileSync(path.join(AGENT_DIR, req.params.file)));
  });

  return r;
}
