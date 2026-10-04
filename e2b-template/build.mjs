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
  // Without a UTF-8 locale and fonts with box-drawing and symbol glyphs, opencode and Claude
  // Code draw their screens as rows of question marks.
  .runCmd([
    "apt-get update",
    "DEBIAN_FRONTEND=noninteractive apt-get install -y locales fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji fonts-symbola",
    "sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen",
    "update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8",
    "printf 'LANG=en_US.UTF-8\\nLC_ALL=en_US.UTF-8\\n' >> /etc/environment",
    "rm -rf /var/lib/apt/lists/*",
  ])
  .setEnvs({ LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" })
  // Chrome and VS Code refuse to start inside a sandbox without these flags.
  .runCmd([
    // the base image may already carry its own copies under other names, so only touch what exists
    "for f in /usr/share/applications/google-chrome*.desktop; do [ -f \"$f\" ] && sed -i 's#^Exec=/usr/bin/google-chrome-stable#Exec=/usr/bin/google-chrome-stable --no-sandbox --no-first-run#' \"$f\"; done; true",
    "for f in /usr/share/applications/code*.desktop; do [ -f \"$f\" ] && sed -i 's#^Exec=/usr/share/code/code#Exec=/usr/share/code/code --no-sandbox#' \"$f\"; done; true",
  ])
  .setUser("user")
  // desktop shortcuts, so they're one double-click away
  .runCmd([
    "mkdir -p ~/Desktop",
    "for f in /usr/share/applications/google-chrome.desktop /usr/share/applications/code.desktop; do [ -f \"$f\" ] && cp \"$f\" ~/Desktop/; done; true",
    "printf '[Desktop Entry]\\nType=Application\\nName=Claude Code\\nExec=xfce4-terminal --hold -e claude\\nIcon=utilities-terminal\\n' > ~/Desktop/claude.desktop",
    "printf '[Desktop Entry]\\nType=Application\\nName=opencode\\nExec=xfce4-terminal --hold -e opencode\\nIcon=utilities-terminal\\n' > ~/Desktop/opencode.desktop",
    "chmod +x ~/Desktop/*.desktop",
    // Continue: AI chat inside VS Code; the site writes its settings when VM #4 starts
    "code --install-extension Continue.continue --force || true",
  ])
  // ---- more languages, Python extras, more AI coding tools and everyday apps ----
  .setUser("root")
  .runCmd([
    "apt-get update",
    // Java, .NET, GIMP, VLC and OBS
    "DEBIAN_FRONTEND=noninteractive apt-get install -y openjdk-17-jdk-headless dotnet-sdk-8.0 gimp vlc obs-studio",
    // Go, the current release (Ubuntu's own is years old)
    "curl -fsSL \"https://go.dev/dl/$(curl -fsSL 'https://go.dev/VERSION?m=text' | head -n1).linux-amd64.tar.gz\" | tar -C /usr/local -xz",
    "ln -sf /usr/local/go/bin/go /usr/local/bin/go && ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt",
    // uv (fast Python installs) for everyone, and the usual data tools
    "curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh",
    "pip3 install --no-cache-dir jupyter numpy pandas matplotlib",
    // Codex CLI and Gemini CLI next to Claude Code and opencode
    "npm install -g @openai/codex @google/gemini-cli",
    "rm -rf /var/lib/apt/lists/*",
  ])
  .setUser("user")
  .runCmd([
    // Rust, Bun and Deno, installed for the user (each adds itself to ~/.bashrc)
    "curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal",
    "curl -fsSL https://bun.sh/install | bash",
    "curl -fsSL https://deno.land/install.sh | sh -s -- -y",
    // Aider, on its own Python, so it never fights the system one
    "uv tool install --python 3.12 aider-chat",
    "grep -q '.local/bin' ~/.bashrc || echo 'export PATH=\"$HOME/.local/bin:$PATH\"' >> ~/.bashrc",
    // shortcuts for the new AI tools
    "printf '[Desktop Entry]\\nType=Application\\nName=Aider\\nExec=xfce4-terminal --hold -e \"bash -ic aider\"\\nIcon=utilities-terminal\\n' > ~/Desktop/aider.desktop",
    "printf '[Desktop Entry]\\nType=Application\\nName=Codex\\nExec=xfce4-terminal --hold -e codex\\nIcon=utilities-terminal\\n' > ~/Desktop/codex.desktop",
    "chmod +x ~/Desktop/*.desktop",
    // a head start: common packages already in the npm and pip caches, so installs are quick
    "npm cache add react react-dom vite @vitejs/plugin-react typescript express next tailwindcss",
    "python3 -m pip download -d /tmp/pipwarm requests flask fastapi uvicorn pygame && rm -rf /tmp/pipwarm",
  ]);

const info = await Template.build(template, NAME, {
  // a bigger computer: faster builds, and room for VS Code, Chrome and a dev server at once
  cpuCount: 4,
  memoryMB: 8192,
  onBuildLogs: defaultBuildLogger(),
});
console.log(`\nDone. Template "${NAME}" is ready (id ${info.templateId}).`);
console.log(`Now set E2B_CODE_TEMPLATE=${NAME} on Render.`);
