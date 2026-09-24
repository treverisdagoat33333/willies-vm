# willies-vm remote agent

Lets you control **this PC** from the willies-vm desktop (the **Remote PC** app).

## One time

1. On the server (Render), set an env var `REMOTE_KEY` to a long random secret.
   Redeploy. This is the shared secret; only you should know it.
2. Install [Node.js](https://nodejs.org) on this PC if you don't have it.

## Each time you want to control this PC

Double-click **`run.cmd`**, paste your `REMOTE_KEY` when asked, leave it running.

Or from a terminal:

```
node willies-agent.mjs --url wss://willies-vm.onrender.com --key YOUR_REMOTE_KEY --name "Gaming PC"
```

`--name` is how this PC shows up in the Remote PC picker. It defaults to the
computer's name, so running the agent on several PCs just works; each one
appears in the **PC** dropdown in the Remote PC toolbar.

Then open willies-vm in a browser, sign in as the **owner** account, open
**Remote PC**, enter the same key, and you're driving this machine.

Press **Ctrl+C** in the agent window to stop sharing.

## Toolbar

- **PC**: which of your connected PCs to drive.
- **Screen**: which monitor to show, on a PC with more than one.
- **Paste to PC**: sends your browser clipboard to the PC's clipboard.
- **Copy from PC**: copies the PC's clipboard into your browser's.
- **Files**: browse the PC's drives. Click a file to download it, or use
  **Upload** (or drop files onto the screen) to put files in the open folder.
  Files with the same name are never overwritten; the new one gets " (1)".
- **Sound**: hear what the PC is playing (22-24 kHz stereo). Sound runs in its
  own helper process, so if it can't start, the screen still works.

## Notes

- Windows only (uses the built-in screen capture + input APIs; no extra install
  beyond Node and the one `ws` package).
- Frames are adaptive JPEG. Lower the **quality** or **scale** in the Remote PC
  toolbar if your connection is slow; raise them for a sharper picture.
- The agent only ever connects **out** to the relay you point it at. It is not a
  server and opens no ports. Without the matching `REMOTE_KEY` it is refused,
  and viewers must additionally be logged in as the owner account.
- Keep `files.mjs` next to `willies-agent.mjs`; the agent loads it for file
  transfer.
- The key is sent in a request header, never in the URL, so it does not end up
  in proxy or access logs. Update any older copy of this agent: the server no
  longer accepts a key in the URL.
