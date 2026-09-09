// Wake-on-LAN relay agent.
//
// Run this on ANY always-on device that lives on the same local network
// as the PC you want to wake up (an old laptop, a mini PC, a Raspberry Pi,
// a NAS — anything that can run Node and stays powered on).
//
// It opens an OUTBOUND WebSocket connection to your deployed app, so you
// don't need to open any ports or touch your router config. When you hit
// "Wake PC" from the web app (from any city, any network), the server
// forwards the request down this socket and this script fires the real
// magic packet on the local network the sleeping PC is sitting on.
//
// Setup:
//   cd wol-relay
//   npm install
//   WOL_SERVER_URL="wss://your-app.onrender.com/ws/relay" \
//   WOL_RELAY_TOKEN="same value as WOL_RELAY_TOKEN on the server" \
//   npm start
//
// Keep it running (pm2, a systemd service, a scheduled task, Task
// Scheduler on Windows, whatever — it just needs to stay alive).

import WebSocket from "ws";
import dgram from "node:dgram";

const SERVER_URL = process.env.WOL_SERVER_URL;
const TOKEN = process.env.WOL_RELAY_TOKEN;

if (!SERVER_URL || !TOKEN) {
  console.error("Set WOL_SERVER_URL and WOL_RELAY_TOKEN env vars before starting.");
  console.error('Example: WOL_SERVER_URL="wss://your-app.onrender.com/ws/relay" WOL_RELAY_TOKEN="secret" npm start');
  process.exit(1);
}

function buildMagicPacket(mac) {
  const bytes = mac.trim().split(/[:-]/).map((h) => parseInt(h, 16));
  if (bytes.length !== 6 || bytes.some((b) => Number.isNaN(b))) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }
  const header = Buffer.alloc(6, 0xff);
  const macBuf = Buffer.from(bytes);
  return Buffer.concat([header, ...Array(16).fill(macBuf)]);
}

function sendMagicPacket(mac, broadcastIp = "255.255.255.255", port = 9) {
  let packet;
  try {
    packet = buildMagicPacket(mac);
  } catch (err) {
    console.error(err.message);
    return;
  }

  const socket = dgram.createSocket("udp4");
  socket.bind(() => {
    socket.setBroadcast(true);
    socket.send(packet, 0, packet.length, port, broadcastIp, (err) => {
      if (err) console.error("Failed to send magic packet:", err.message);
      else console.log(`Magic packet sent to ${mac} via ${broadcastIp}:${port}`);
      socket.close();
    });
  });
}

let reconnectDelay = 2000;

function connect() {
  const ws = new WebSocket(`${SERVER_URL}?token=${encodeURIComponent(TOKEN)}`);

  ws.on("open", () => {
    console.log("Connected to relay server. Waiting for wake commands...");
    reconnectDelay = 2000;
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      console.error("Got a message I couldn't parse, ignoring.");
      return;
    }
    if (msg.type === "wake" && msg.mac) {
      sendMagicPacket(msg.mac, msg.broadcastIp, msg.port);
    }
  });

  ws.on("close", () => {
    console.log(`Disconnected from server. Reconnecting in ${Math.round(reconnectDelay / 1000)}s...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
  });

  ws.on("error", (err) => {
    console.error("Relay socket error:", err.message);
  });
}

connect();
