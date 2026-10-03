/*
  william's vm
  Copyright (c) 2026 William (github.com/treverisdagoat33333)
  All rights reserved. Proprietary and confidential. See LICENSE.
*/
// Builds "willie-code": E2B's own desktop with coding tools already installed, so a VM
// started from it opens ready to type `claude` or `opencode`. E2B builds it on its own
// servers, so this needs no Docker, only Node and an E2B key:
//   cd e2b-template && npm install && E2B_API_KEY=e2b_... npm run build
// Then set E2B_CODE_TEMPLATE=willie-code on Render (and E2B_KEPT_TEMPLATE=willie-code for the kept VM).
import { Template, defaultBuildLogger } from "e2b";

if (!process.env.E2B_API_KEY) {
  console.error("Set E2B_API_KEY first (from e2b.dev > Dashboard > API keys).");
  process.exit(1);
}

const NAME = process.env.TEMPLATE_NAME || "willie-code";

// Starts from E2B's public desktop template, which our site already knows how to stream
// (Xvfb, XFCE, x11vnc and noVNC), and adds the tools on top.
const template = Template()
  .fromTemplate("desktop")
  .setUser("root")
  .runCmd([
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y curl wget git ca-certificates gnupg build-essential python3 python3-pip python3-venv unzip xfce4-terminal",
    // Node 22, which Claude Code and opencode need
    "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs",
    // Google Chrome
    "wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y /tmp/chrome.deb && rm /tmp/chrome.deb",
    // VS Code
    "wget -q -O /tmp/code.deb 'https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64'",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y /tmp/code.deb && rm /tmp/code.deb",
    // the two coding agents, installed for everyone
    "npm install -g @anthropic-ai/claude-code opencode-ai",
    "rm -rf /var/lib/apt/lists/*",
  ])
  // Chrome and VS Code refuse to start inside a sandbox without these flags.
  .runCmd([
    "sed -i 's#^Exec=/usr/bin/google-chrome-stable#Exec=/usr/bin/google-chrome-stable --no-sandbox --no-first-run#' /usr/share/applications/google-chrome.desktop",
    "sed -i 's#^Exec=/usr/share/code/code#Exec=/usr/share/code/code --no-sandbox#' /usr/share/applications/code.desktop",
  ])
  .setUser("user")
  // desktop shortcuts, so they're one double-click away
  .runCmd([
    "mkdir -p ~/Desktop",
    "cp /usr/share/applications/google-chrome.desktop /usr/share/applications/code.desktop ~/Desktop/ && chmod +x ~/Desktop/*.desktop",
    "printf '[Desktop Entry]\\nType=Application\\nName=Claude Code\\nExec=xfce4-terminal --hold -e claude\\nIcon=utilities-terminal\\n' > ~/Desktop/claude.desktop",
    "printf '[Desktop Entry]\\nType=Application\\nName=opencode\\nExec=xfce4-terminal --hold -e opencode\\nIcon=utilities-terminal\\n' > ~/Desktop/opencode.desktop",
    "chmod +x ~/Desktop/*.desktop",
  ]);

const info = await Template.build(template, NAME, {
  cpuCount: 2,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
});
console.log(`\nDone. Template "${NAME}" is ready (id ${info.templateId}).`);
console.log(`Now set E2B_CODE_TEMPLATE=${NAME} on Render.`);
