/*!
 * william's vm — remote desktop agent
 * Copyright (c) 2026 William (github.com/treverisdagoat33333)
 * All rights reserved. Proprietary and confidential.
 *
 * Runs on the PC you want to control. It captures the primary screen and
 * injects mouse/keyboard input, talking to your willies-vm relay over one
 * WebSocket. Nothing here is a public service: it only connects out to the
 * relay you point it at, using the REMOTE_KEY secret only you hold.
 *
 *   node willies-agent.mjs --url wss://willies-vm.onrender.com --key YOURKEY --name "Gaming PC"
 *
 * or set WVM_URL / REMOTE_KEY / WVM_NAME in the environment. The name is how
 * this PC shows up in the Remote PC picker when you run agents on several.
 */
import { WebSocket } from "ws";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* -------- config -------- */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]);
    return a;
  }, [])
);
const URL_IN = args.url || process.env.WVM_URL || "wss://willies-vm.onrender.com";
const KEY = args.key || process.env.REMOTE_KEY || "";
if (!KEY) {
  console.error("No key. Pass --key YOURKEY or set REMOTE_KEY. It must match the server's REMOTE_KEY.");
  process.exit(1);
}
const NAME = String(args.name || process.env.WVM_NAME || os.hostname() || "PC")
  .replace(/[^A-Za-z0-9 ._-]/g, "")
  .trim()
  .slice(0, 32) || "PC";
// the key goes in a header, never the URL, so it stays out of proxy logs
const WS_URL =
  URL_IN.replace(/^http/i, "ws").replace(/\/+$/, "") +
  "/remote/?role=agent&name=" +
  encodeURIComponent(NAME);

/* -------- the screen capture + input host (PowerShell + C#) -------- */
const PS1 = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;

public class Cap {
  [DllImport("user32.dll")] static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint f, IntPtr e);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  delegate bool MonitorEnumProc(IntPtr hMon, IntPtr hdc, ref RECT r, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc cb, IntPtr data);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr hMon, ref MONITORINFO mi);

  static volatile int q = 45;
  static volatile int fps = 12;
  static volatile int scale = 100;
  static volatile int mon = 0;
  static volatile bool run = true;
  static Rectangle[] screens = new Rectangle[0];
  static bool[] primary = new bool[0];

  /* every monitor, primary first, re-read so plugging one in just works */
  static void ReadScreens() {
    var rects = new System.Collections.Generic.List<Rectangle>();
    var prim = new System.Collections.Generic.List<bool>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr h, IntPtr dc, ref RECT r, IntPtr d) => {
      var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      if (GetMonitorInfo(h, ref mi)) {
        var rc = mi.rcMonitor;
        bool p = (mi.dwFlags & 1) != 0;
        var box = new Rectangle(rc.L, rc.T, rc.R - rc.L, rc.B - rc.T);
        if (p) { rects.Insert(0, box); prim.Insert(0, true); } else { rects.Add(box); prim.Add(false); }
      }
      return true;
    }, IntPtr.Zero);
    if (rects.Count == 0) { rects.Add(new Rectangle(0, 0, GetSystemMetrics(0), GetSystemMetrics(1))); prim.Add(true); }
    screens = rects.ToArray(); primary = prim.ToArray();
  }

  static Rectangle Current() {
    var s = screens;
    int i = mon; if (i < 0 || i >= s.Length) i = 0;
    return s.Length > 0 ? s[i] : new Rectangle(0, 0, GetSystemMetrics(0), GetSystemMetrics(1));
  }

  static string Describe() {
    var sb = new System.Text.StringBuilder();
    for (int i = 0; i < screens.Length; i++) {
      if (i > 0) sb.Append('|');
      var r = screens[i];
      sb.Append(r.X).Append(',').Append(r.Y).Append(',').Append(r.Width).Append(',').Append(r.Height).Append(',').Append(primary[i] ? 1 : 0);
    }
    return sb.ToString();
  }

  [DllImport("user32.dll")] static extern int GetSystemMetrics(int n);

  public static void Main() {
    var t = new Thread(ReadCommands); t.IsBackground = true; t.Start();

    var outs = Console.OpenStandardOutput();
    ImageCodecInfo enc = null;
    foreach (var c in ImageCodecInfo.GetImageEncoders()) if (c.FormatID == ImageFormat.Jpeg.Guid) enc = c;
    var ep = new EncoderParameters(1);
    var magic = new byte[] { 0x57, 0x56, 0x4D, 0x31 };

    int lastW = 0, lastH = 0, lastMon = -1;
    string lastLayout = "";
    long lastHash = -1;
    var idle = System.Diagnostics.Stopwatch.StartNew();
    var rescan = System.Diagnostics.Stopwatch.StartNew();
    ReadScreens();

    while (run) {
      var sw = System.Diagnostics.Stopwatch.StartNew();
      if (rescan.ElapsedMilliseconds > 2000) { ReadScreens(); rescan.Restart(); }
      var box = Current();
      int W = box.Width, H = box.Height;
      if (W < 1 || H < 1) { Thread.Sleep(200); continue; }

      using (var bmp = new Bitmap(W, H, PixelFormat.Format24bppRgb))
      using (var g = Graphics.FromImage(bmp)) {
        try { g.CopyFromScreen(box.X, box.Y, 0, 0, new Size(W, H)); } catch { Thread.Sleep(200); continue; }

        string layout = Describe();
        if (W != lastW || H != lastH || mon != lastMon || layout != lastLayout) {
          lastW = W; lastH = H; lastMon = mon; lastLayout = layout; lastHash = -1;
          Console.Error.WriteLine("META " + W + " " + H + " " + mon + " " + layout);
        }

        long h = Hash(bmp);
        bool changed = h != lastHash;
        if (changed || idle.ElapsedMilliseconds > 1500) {
          lastHash = h; idle.Restart();

          Bitmap send = bmp; Bitmap scaled = null;
          if (scale < 100) {
            int nw = Math.Max(1, W * scale / 100), nh = Math.Max(1, H * scale / 100);
            scaled = new Bitmap(nw, nh);
            using (var g2 = Graphics.FromImage(scaled)) {
              g2.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
              g2.DrawImage(bmp, 0, 0, nw, nh);
            }
            send = scaled;
          }
          ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)q);
          using (var ms = new MemoryStream()) {
            send.Save(ms, enc, ep);
            var b = ms.ToArray();
            var len = BitConverter.GetBytes(b.Length);
            outs.Write(magic, 0, 4);
            outs.Write(len, 0, 4);
            outs.Write(b, 0, b.Length);
            outs.Flush();
          }
          if (scaled != null) scaled.Dispose();
        }
      }

      int budget = 1000 / Math.Max(1, fps);
      int spent = (int)sw.ElapsedMilliseconds;
      if (spent < budget) Thread.Sleep(budget - spent);
    }
  }

  static long Hash(Bitmap b) {
    var rect = new Rectangle(0, 0, b.Width, b.Height);
    var d = b.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
    long h = 1469598103934665603L;
    IntPtr p0 = d.Scan0; int stride = d.Stride;
    int stepY = Math.Max(1, b.Height / 48);
    int stepX = Math.Max(3, (b.Width / 48) * 3);
    for (int y = 0; y < b.Height; y += stepY) {
      IntPtr row = (IntPtr)(p0.ToInt64() + (long)y * stride);
      for (int x = 0; x < stride; x += stepX) {
        byte v = Marshal.ReadByte(row, x);
        h = (h ^ v) * 1099511628211L;
      }
    }
    b.UnlockBits(d);
    return h;
  }

  static int Clamp(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

  static void MouseBtn(int btn, bool down) {
    uint f = 0;
    if (btn == 0) f = down ? 0x0002u : 0x0004u;      // left
    else if (btn == 2) f = down ? 0x0008u : 0x0010u; // right
    else if (btn == 1) f = down ? 0x0020u : 0x0040u; // middle
    if (f != 0) mouse_event(f, 0, 0, 0, IntPtr.Zero);
  }

  static void Handle(string line) {
    if (line.Length == 0) return;
    var p = line.Split(' ');
    try {
      switch (p[0]) {
        case "q": q = Clamp(int.Parse(p[1]), 5, 95); break;
        case "f": fps = Clamp(int.Parse(p[1]), 1, 30); break;
        case "s": scale = Clamp(int.Parse(p[1]), 25, 100); break;
        case "mon": { int i = int.Parse(p[1]); if (i >= 0 && i < screens.Length) mon = i; break; }
        case "m": {
          var b = Current();
          long nx = long.Parse(p[1]), ny = long.Parse(p[2]);
          int x = b.X + (int)(nx * (long)(b.Width - 1) / 10000);
          int y = b.Y + (int)(ny * (long)(b.Height - 1) / 10000);
          SetCursorPos(x, y);
          break;
        }
        case "d": MouseBtn(int.Parse(p[1]), true); break;
        case "u": MouseBtn(int.Parse(p[1]), false); break;
        case "w": mouse_event(0x0800, 0, 0, unchecked((uint)int.Parse(p[1])), IntPtr.Zero); break;
        case "k": keybd_event((byte)int.Parse(p[2]), 0, p[1] == "1" ? 0u : 2u, IntPtr.Zero); break;
        case "stop": run = false; break;
      }
    } catch { }
  }

  static void ReadCommands() {
    var ins = Console.OpenStandardInput();
    var sb = new System.Text.StringBuilder();
    int b;
    while ((b = ins.ReadByte()) >= 0) {
      if (b == '\n') { Handle(sb.ToString().Trim()); sb.Length = 0; }
      else if (b != '\r') sb.Append((char)b);
    }
    run = false;
  }
}
'@
[Cap]::Main()
`;

const ps1Path = path.join(os.tmpdir(), "wvm-cap-" + process.pid + ".ps1");
fs.writeFileSync(ps1Path, PS1, "utf8");

let child = null;
function startChild() {
  child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1Path],
    { stdio: ["pipe", "pipe", "pipe"] }
  );

  /* reframe MAGIC(4) + len(4 LE) + jpeg from the child's stdout */
  let buf = Buffer.alloc(0);
  const MAGIC = Buffer.from([0x57, 0x56, 0x4d, 0x31]);
  child.stdout.on("data", (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 8) break;
      if (!buf.subarray(0, 4).equals(MAGIC)) {
        // resync: drop a byte
        buf = buf.subarray(1);
        continue;
      }
      const len = buf.readUInt32LE(4);
      if (buf.length < 8 + len) break;
      const frame = buf.subarray(8, 8 + len);
      buf = buf.subarray(8 + len);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(frame, { binary: true });
    }
  });

  let errline = "";
  child.stderr.on("data", (d) => {
    errline += d.toString();
    let i;
    while ((i = errline.indexOf("\n")) >= 0) {
      const line = errline.slice(0, i).trim();
      errline = errline.slice(i + 1);
      if (line.startsWith("META ")) {
        const [, w, h, mon, layout = ""] = line.split(" ");
        const monitors = layout
          .split("|")
          .filter(Boolean)
          .map((s) => {
            const [x, y, mw, mh, p] = s.split(",").map(Number);
            return { x, y, w: mw, h: mh, primary: p === 1 };
          });
        screenMeta = { t: "meta", w: +w, h: +h, monitor: +mon || 0, monitors, name: NAME };
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(screenMeta));
      } else if (line) {
        console.error("[capture]", line);
      }
    }
  });

  child.on("error", (e) => {
    console.error("Could not start PowerShell (" + e.message + "). This agent runs on Windows only.");
    process.exit(1);
  });

  child.on("exit", (code) => {
    console.error("Capture host exited (" + code + "). Restarting in 1s…");
    setTimeout(startChild, 1000);
  });
}

function toChild(line) {
  if (child && child.stdin.writable) child.stdin.write(line + "\n");
}

/* -------- clipboard (PowerShell's own cmdlets, UTF-8 both ways) -------- */
const CLIP_MAX = 256 * 1024;

function runPS(script, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d) => {
      if (out.length < CLIP_MAX * 2) out += d;
    });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error("powershell exited " + code))));
    p.stdin.end(input ?? "", "utf8");
  });
}

function setClipboard(text) {
  if (!text) return Promise.resolve();
  return runPS(
    "[Console]::InputEncoding=[Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
    String(text).slice(0, CLIP_MAX)
  );
}

async function getClipboard() {
  const out = await runPS("[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw");
  return out.replace(/\r?\n$/, "").slice(0, CLIP_MAX);
}

/* -------- the relay connection -------- */
let ws = null;
let screenMeta = null;
let retry = 0;

function connect() {
  console.log(`Connecting to relay as "${NAME}":`, WS_URL);
  ws = new WebSocket(WS_URL, { headers: { Authorization: "Bearer " + KEY } });

  // the relay refuses the upgrade itself on a bad key, before any socket exists
  // (handling this event means ws emits no "close", so it retries or quits here)
  ws.on("unexpected-response", (req, res) => {
    req.destroy();
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.error("Relay rejected the key. Check that REMOTE_KEY matches the server's.");
      return quit(1);
    }
    if (res.statusCode === 404) {
      console.error("Remote control is off on the server (REMOTE_KEY is not set there).");
      return quit(1);
    }
    if (res.statusCode === 429) {
      console.error("Too many wrong keys from this network. Waiting 5 minutes before retrying…");
      return setTimeout(connect, 5 * 60_000);
    }
    retry++;
    const wait = Math.min(1000 * Math.pow(1.5, retry), 15000);
    console.error("Relay answered HTTP " + res.statusCode + ". Retrying in " + Math.round(wait / 1000) + "s…");
    setTimeout(connect, wait);
  });

  ws.on("open", () => {
    retry = 0;
    console.log("Connected. Streaming your screen to the relay.");
    if (screenMeta) ws.send(JSON.stringify(screenMeta));
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let m;
    try {
      m = JSON.parse(data.toString());
    } catch (_) {
      return;
    }
    switch (m.t) {
      case "m": toChild("m " + (m.x | 0) + " " + (m.y | 0)); break;
      case "d": toChild("d " + (m.b | 0)); break;
      case "u": toChild("u " + (m.b | 0)); break;
      case "w": toChild("w " + (m.d | 0)); break;
      case "k": toChild("k " + (m.down ? 1 : 0) + " " + (m.vk | 0)); break;
      case "set":
        if (m.quality != null) toChild("q " + (m.quality | 0));
        if (m.fps != null) toChild("f " + (m.fps | 0));
        if (m.scale != null) toChild("s " + (m.scale | 0));
        if (m.monitor != null) toChild("mon " + (m.monitor | 0));
        break;
      case "clip.set":
        setClipboard(String(m.text ?? ""))
          .then(() => ws.send(JSON.stringify({ t: "clip.ok" })))
          .catch((e) => ws.send(JSON.stringify({ t: "clip.err", error: e.message })));
        break;
      case "clip.get":
        getClipboard()
          .then((text) => ws.send(JSON.stringify({ t: "clip", text })))
          .catch((e) => ws.send(JSON.stringify({ t: "clip.err", error: e.message })));
        break;
      case "ping":
        ws.send(JSON.stringify({ t: "pong", ts: m.ts }));
        break;
      case "viewers":
        console.log(m.n > 0 ? m.n + " viewer(s) connected." : "No viewers.");
        break;
    }
  });

  ws.on("close", (code) => {
    if (code === 4002) {
      console.error(`Another agent connected as "${NAME}" and replaced this one. Use --name to run both.`);
      return quit(1);
    }
    retry++;
    const wait = Math.min(1000 * Math.pow(1.5, retry), 15000);
    console.error("Disconnected. Reconnecting in " + Math.round(wait / 1000) + "s…");
    setTimeout(connect, wait);
  });

  ws.on("error", (e) => console.error("Relay error:", e.message));
}

function quit(code) {
  try { toChild("stop"); } catch (_) {}
  try { child && child.removeAllListeners("exit"); child && child.kill(); } catch (_) {}
  try { fs.unlinkSync(ps1Path); } catch (_) {}
  process.exit(code);
}

process.on("SIGINT", () => {
  console.log("\nStopping.");
  quit(0);
});

startChild();
connect();
