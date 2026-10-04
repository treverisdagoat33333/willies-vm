<!--
  william's vm
  Copyright (c) 2026 William (github.com/treverisdagoat33333)
  All rights reserved. Proprietary and confidential. See LICENSE.
-->
# The coding VM (VM #4)

`build.mjs` makes an E2B template called **willie-code**: E2B's normal desktop plus
Google Chrome, VS Code, Git, Python, Node 22, Java, .NET, Go, Rust, Bun, Deno, uv,
Jupyter, **Claude Code**, **opencode**, **Aider**, **Codex** and **Gemini CLI**, GIMP,
VLC and OBS, with desktop shortcuts. `CLAUDE.md` here becomes Claude Code's
instructions in every VM #4. E2B builds it on their servers, so you only need Node.

## Build it (once, about 5–10 minutes)

1. Get your E2B key: https://e2b.dev → Dashboard → **API Keys** (it starts with `e2b_`).
2. On any computer with Node 20 or newer (a Chromebook's Linux terminal works too):

   ```bash
   git clone https://github.com/treverisdagoat33333/willies-vm
   cd willies-vm/e2b-template
   npm install
   E2B_API_KEY=e2b_yourkey npm run build
   ```

   On Windows PowerShell, use `$env:E2B_API_KEY="e2b_yourkey"; npm run build`.

3. When it prints **Done**, go to Render → `willies-vm` → **Environment** and add:
   - `E2B_CODE_TEMPLATE` = `willie-code` (turns on the VM #4 button)
   - `E2B_KEPT_TEMPLATE` = `willie-code` (optional: your kept VM in Admin uses it too,
     and keeps your Claude login between uses). Your current kept VM stays the old kind
     until you delete it in Admin, and the next start makes a new one.

4. Save. Render restarts, and **VM #4 · Coding** works.

## Using it

- Double-click **Claude Code** on the VM's desktop (or type `claude` in a terminal). It asks
  you to sign in to your Claude account, or you can use an Anthropic API key.
- Double-click **opencode** (or type `opencode`), then `/connect` to pick an AI provider.
- Normal VMs are wiped when they stop, so you sign in each time. The kept VM remembers.
- Don't paste the site's own `AI_API_KEY` into a VM other people can use.

## Changing it

Add tools to the `runCmd([...])` lists in `build.mjs` and run the build again. Same name
means the button picks up the new version on the next start; nothing to change on Render.
