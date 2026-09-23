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
node willies-agent.mjs --url wss://willies-vm.onrender.com --key YOUR_REMOTE_KEY
```

Then open willies-vm in a browser, sign in as the **owner** account, open
**Remote PC**, enter the same key, and you're driving this machine.

Press **Ctrl+C** in the agent window to stop sharing.

## Notes

- Windows only (uses the built-in screen capture + input APIs; no extra install
  beyond Node and the one `ws` package).
- Frames are adaptive JPEG. Lower the **quality** or **scale** in the Remote PC
  toolbar if your connection is slow; raise them for a sharper picture.
- The agent only ever connects **out** to the relay you point it at. It is not a
  server and opens no ports. Without the matching `REMOTE_KEY` it is refused,
  and viewers must additionally be logged in as the owner account.
