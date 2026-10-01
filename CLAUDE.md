# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
AUTH_SECRET=dev npm start          # http://localhost:3000 (server throws at boot without AUTH_SECRET)
AUTH_SECRET=dev npm run dev        # same, with node --watch
node --check server.js             # quick syntax check for any file
```

- Node >= 22.5 is required (`node:sqlite`); `.node-version` pins 24. On Node 22 you'll see an "SQLite is experimental" warning, which is harmless.
- There is no build step, bundler or linter. The front end is served as-is from `public/`.
- **Tests:** `npm test` runs the proxy and WillieJet suites in `test/` with Playwright. It starts `test/site.mjs` (a local test site), a server that may reach it, and a strict one that may not (for the fast-mode guard). In this sandbox, set `CHROMIUM_PATH=/opt/pw-browsers/chromium`. `npm test -- williejet` runs one suite, and `npm run bench` prints timings instead. `.github/workflows/test.yml` runs `npm test` on every push. Playwright is a devDependency, which Render skips because `NODE_ENV=production`.
- To verify a change, run the server against a throwaway database (`DATA_DIR=/tmp/wvm-test`) and drive the HTTP and WebSocket endpoints from a script (`ws` is in `node_modules`), or load the page in Chromium.
- Useful env vars: `DATA_DIR` (SQLite location, default `./data`, gitignored), `OWNER_USERNAME` (default `william`), `OWNER_PASSWORD` (see below), `REMOTE_KEY` (enables Remote PC; unset means it's off), `MAX_LIVE_VMS` (site-wide VM cap, default 20), `E2B_API_KEY`, `XENV_API_KEY`, `SOUNDCLOUD_CLIENT_ID` (optional; music finds the public one itself), `TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL` (optional relay for voice calls), `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` (the AI app's OpenAI-compatible API; without a key the app says it isn't set up). `render.yaml` is the deploy config. On Render's free plan `DATA_DIR` is ephemeral, so the database is wiped on every redeploy.
- No lockfile is committed; Render runs `npm install`. The Scramjet v2 packages are pinned to GitHub release tarballs in `package.json`; Scramjet v1 is installed under the alias `scramjet-v1`.

- The sandbox usually can't reach SoundCloud, Deezer, E2B or XENV (in recent sessions SoundCloud, Deezer, Audius and YouTube search did work with `NODE_USE_ENV_PROXY=1`). To test those paths, patch `globalThis.fetch` in a file loaded with `node --import` before `server.js`.

The remote-control agent is a separate package and runs on **Windows only**:
```bash
cd agent && npm install
node willies-agent.mjs --url ws://localhost:3000 --key $REMOTE_KEY --name "My PC"
```

## Architecture

### One HTTP server, three WebSocket endpoints
Other server modules: `static.js` (compressed static files), `arcade.js` (the Arcade's games, `/play/arcade/`), `games.js` (your HTML games in `public/games/`), `backup.js` (owner backups, `/api/admin/backup`), `music.js` (the `/api/music` router), `movies.js` (the `/api/movies` router), `ai.js` (the `/api/ai` router), `files.js` (the `/api/chat/files` router), `security.js` (rate limiters, `clientIp`, `safeEqual`).

`server.js` owns the Express app and a single `http.Server`. Its `upgrade` handler dispatches by path:
- `/wisp/`: the Wisp transport every proxy engine uses.
- `/chat/`: `chat.js`.
- `/remote/`: `remote.js`.

Each WS module creates `WebSocketServer({ noServer: true })` and exports a `handle*Upgrade` function. Authentication happens in `server.js` before the upgrade.

**Proxy browser engines:** Settings > Browser > Proxy engine (`S.proxy`, device-local, not synced) picks one of four.
- `wj`, **WillieJet**, our own engine (`public/wj/`) and the default, with fast mode, the ad blocker and saved logins on. It's built on the unmodified Scramjet v2 core (`/scramjet/scramjet.mjs` and `scramjet.js`) and replaces Scramjet's controller with ours; see below.
  - Anyone whose saved settings still had the old defaults (`sj2`, fast mode off) is moved over once, flagged by `localStorage` `wvm.defaults.v2`. A pick made after that sticks.
- `sj2`, Scramjet v2 alpha: its own controller, with libcurl-transport 2.x (`/libcurl/`).
- `sj1`, Scramjet v1 (`/sj1/`), and `uv`, Ultraviolet (`/uv/`): both go through bare-mux (`/baremux/`). bare-mux runs the same libcurl 2.x through `public/js/libcurl-bare.mjs`, which converts headers between the two formats. The 1.x libcurl build has a startup race, and epoxy sends WebSocket handshakes in absolute form (`GET ws://host/path`), which the `ws` library rejects.
- `public/sw.js` is the one service worker for all three, routed by prefix: `/~/sj/`, `/~/sj1/`, `/~/uv/`. A scope only gets one worker.
- **v1 quirks the worker handles:**
  - It creates v1's IndexedDB tables before v1 starts. Otherwise v1 opens `$scramjet` empty before the page sets it up.
  - It loads v1's config from the database itself. The page's `loadConfig` message stores the config without applying it.
  - It sends `/sj1/scramjet.wasm.wasm` to v1, which serves it as a script.
- Our Ultraviolet config is `public/uv/uv.config.js`, served in place of the package's stock one.
- A tab keeps its engine until its next navigation. Changing the setting reloads open tabs on the new engine.
- **Per-site engines:** the badge inside the address bar (WJ, v2, v1 or UV) sets an engine for one site. The picks live in `localStorage` `wvm.siteEngines` (this device only), and `engineFor(url)` applies them before the default.

**WillieJet (`public/wj/`):**
- **License:** Scramjet's core and controller are AGPL-3.0. WillieJet only calls the core's public exports and never modifies it. Never copy code from `@mercuryworkshop/scramjet-controller` into `public/wj/`, or that code becomes AGPL too.
- **The files:**
  - `engine.mjs`: the page side. It starts the worker and exposes the rewriter bytes on `window[Symbol.for('wj.wasm')]` and itself on `window[Symbol.for('wj.engine')]`. Its prefix is `/~/wj/<page>/`, where `<page>` is fixed per desktop tab through sessionStorage.
  - `worker.mjs`: a module worker that does all the heavy work. It runs libcurl over `/wisp/`, the smart cache and `ScramjetFetchHandler`, which fetches and rewrites. It also holds the cookie jar, saved to IndexedDB `williejet` and shared live on the BroadcastChannel `wj-cookies`, and serves WillieJet's own error page.
  - `sw.js`: imported by `public/sw.js`. It hands `/~/wj/` requests to the page's worker over a MessagePort. After the browser stops and restarts the service worker, it asks the tabs to reconnect and waits for them, instead of 404ing like v2. Its own error responses carry COEP, or Chrome blocks them inside the frame.
  - `inject.js`: runs in every proxied page. It hooks the page with the core's `ScramjetClient`, borrows the rewriter bytes from the desktop page (sync XHR of the static wasm as a fallback), and opens a line to the worker for WebSockets and cookie writes.
  - `cache.mjs`: the HTTP cache around the transport. It follows Cache-Control, Expires, ETag, Last-Modified and Vary, and never stores no-store, Set-Cookie, Range, Authorization, over 25 MB, or non-200/203/301/308 responses. HTML is only cached when the site says so.
    - It also holds `RewriteCache`: the core's rewritten scripts and styles (`wj-rewrite-v1`), tied to the download version they came from (`meta.version`).
    - The rewrite cache is keyed with the tab id replaced by `/~/wj/_/`, so it still matches in the next session. Within one session, Chrome's own memory cache usually answers first. The rewrite cache pays off after a browser restart.
    - Incognito turns both caches off.
  - **Lazy libcurl (`LazyCurl` in `worker.mjs`):** with fast mode on, libcurl (2 MB) is imported in the background instead of before the first page, since GETs go to `/wj-net`; a form, a WebSocket (`connect` queues until it loads) or a fallback waits for it. With fast mode off it's awaited at start. The rewriter, cookies and preload lists load in parallel.
  - `fast.mjs`: fast mode, on by default (`S.wjFast`, this device only). GET and HEAD requests go to `/wj-net` (`fastnet.js`) instead of libcurl. Anything with a body (sign-ins, forms, uploads) and WebSockets always stay on the end-to-end encrypted `/wisp/` path, so passwords never reach our server readable. It falls back to libcurl on 401, 404 or 429.
    - Some sites (Cloudflare bot protection especially) answer our server's own connections with a challenge (403, 429 or 503 plus `cf-mitigated`). That reply is retried on libcurl, and the origin skips fast mode for the rest of the session (`fastBlocked`, which triggers a toast).
    - The engine badge menu can switch fast mode off for one site. Those sites are stored in `wvm.siteNoFast` and passed to the worker as `fastSkip`.
  - `adblock.mjs`: the ad and tracker blocker (`S.wjAds`, on by default). The worker's `adBlock()` answers requests to listed domains before any network: an empty script or stylesheet, a transparent GIF, a blank frame, or a 204. Only whole ad/tracker domains are listed (plus a few exact hosts), so sites keep working.
    - Never blocked: documents (popups you opened), a frame with no page behind it (your own tab, when you type an address), anything on a site that is itself on the list, and sites switched off in the badge menu (`wvm.siteAdsOff`, sent as `adsSkip`).
    - A tab sent to a listed site by a link gets a notice with "Open anyway" (`{wj:'open'}` to the desktop, which reloads it without a referrer, so it isn't blocked).
    - `HIDE_CSS` hides leftover ad boxes: `engine.mjs` hands it out through `window[Symbol.for('wj.ads')](host)`, and `inject.js` adds it as a constructed stylesheet.
    - Counts per site are in the worker's `stats` (`ads.byHost`), shown in the badge menu.
- **Preloading (`worker.mjs`, on unless `setPreload(false)`):** the worker remembers which scripts and styles each page asked for in the 15 s after it loaded (`learn`). Lists are kept under the page's address and under its site plus the first part of its path (`/channels/*`), and saved in IndexedDB `williejet` (`preload`, 200 pages; not in incognito).
  - Next visit, it fetches and rewrites all of them as soon as the page's response headers arrive, in the order the page used them. The browser's requests take the results (`takePreload`, matched on URL, destination and mode). It also starts the scripts and styles named in a page's HTML, and a module's static imports, as they stream past.
  - At most 4 run at once when fast mode is on over HTTP/1.1 (the browser gives our server 6 connections); 16 over HTTP/2 or libcurl. A request the page makes for a still-queued preload moves it to the front. An unclaimed preload is dropped after 10 s.
  - Pages are linked to their requests by client id and by address, because Chrome doesn't always give a page's requests the client id its navigation had.
  - Errors in preloading are caught, never failing the page. Beware: WillieJet's own failures fall back to Ultraviolet on their own, which can hide a bug in tests; check `getTab().engine`.
  - Measured on the test site (150 ms per file, fast mode off): a script-loads-script page 520 → 200 ms, a module chain 510 → 185 ms on the second visit.
- **Saved logins (`app.js`, WillieJet tabs, `S.saveLogins`):** `inject.js` watches submit, button clicks and Enter in each page, and reports sign-ins (or the name on a two-step sign-in's first page) to `window[Symbol.for('wj.logins')]` on the desktop.
  - The desktop waits until the password is gone from the page (the sign-in went through), then asks Save / Not now / Never for this site (`wvm.loginsNever`). Nothing is offered in incognito.
  - Logins are stored only on this device, in IndexedDB `wvm-logins`: one AES-GCM-encrypted vault, with a non-extractable key in the same database. They're never synced or sent to our server.
  - The key button (`#b-key`) shows on sign-in pages of sites with saved logins. It fills only frames whose real host matches the saved one, and only when clicked, typing the value through the page's own input setter so React-style sites see it.
  - Settings > Browser > Saved logins lists and deletes them. The panic wipe (`wjWipe`) and "Clear everything" delete them too.
- `/wj/wasm.js` (server.js) serves the rewriter as `self.WASM=...` for workers that proxied sites start.
- **Failures:** WillieJet's error page offers the other engines through `{wj:'switch'}` messages. A failure that isn't a network error falls back to Ultraviolet on its own (`{wj:'failed', network:false}`). The desktop only accepts these messages from its own tab frames.
- **Fast mode's server side (`fastnet.js`):**
  - Framing: the request body is a uint32 length, JSON `{url, method, headers}`, then the body. The reply carries `x-wj-status`, `x-wj-status-text` and `x-wj-headers`, and keeps the upstream compression.
  - Replies with over 24 KB of headers, or an unusual encoding, come back framed and decompressed (`x-wj-framed`). Upstream headers can be up to 256 KB.
  - Private, loopback and link-local addresses are refused, both as literal IPs and after DNS. `fastnetOptions.allowPrivate` exists only for the tests.
  - It needs a session and is limited to 6000 requests a minute per IP.
- **All engines, in `app.js`:**
  - **Following the page:** `realUrl()` reads the real address from the frame's Scramjet client (`Symbol.for('scramjet client global')`, which v2, WillieJet and v1 share) or decodes Ultraviolet's path. `syncTab()` updates the address bar, tab title, history and bookmarks on each load, and every 1.5 s for sites that change the address without reloading. `navigate()` marks the document it's leaving (`t.leaving`), and `syncTab()` skips a tab while that document is still showing (up to 30 s), or it would read the old page's address back.
  - **Blank pages:** `checkHealth()` runs 6 s after a page loads, on the visible tab only. If the page is blank, or nearly empty and throwing errors, it retries once on the next engine in `FALLBACK_ORDER` and remembers that choice for the site.
- **"Copy debug info" (engine badge, WillieJet tabs):** for sites that misbehave where you can't reproduce them.
  - `inject.js` taps the core's `client.hooks.lifecycle.navigate` hook (with a stack trace) and the page's errors, and sends them to `window[Symbol.for('wj.debug')]` on the desktop.
  - The report lists the site's own stack frames, decoded to real addresses, and the code at the top frame. The stack positions refer to the rewritten script, so the worker re-runs `rewriteJs` on the original file for that snippet (`source(url, {rewrite: true})`).
- **History without a URL (core bug we work around):** the core's `pushState`/`replaceState` hook does `String(args[2])`, so `replaceState(state, "")` (claude.ai's router does it on startup) sends the page to `/undefined`, and a `null` URL sends it to `/null`. `keepUrlOnHistory` passes the current URL instead. It runs after `client.hook()`: in `wj/inject.js` for WillieJet, and through each v2 frame's `hooks.init.post` (a `ManagedPlugin` tap in `PROXY_START.sj2`) for Scramjet v2. The compat test `/t/history` checks it on both.
- **Crash recovery (`engine.mjs`):** the worker is pinged every 4 s. After 20 s without an answer it's replaced, at most 3 times in 5 minutes, and WillieJet tabs reload.
- **Settings > Browser > WillieJet:**
  - Fast mode, the ad blocker, cache stats (the worker's `stats` message) and "Clear WillieJet cache", which also forgets the preload lists.
  - The speed test: real sites on every engine, in off-screen frames, from the user's own browser.
  - The panic wipe (`wjWipe`) and "Clear everything" delete WillieJet's caches, its cookie database and saved logins.
- **Instant start:** when WillieJet is the default engine, it starts while the desktop loads. Typing an address sends a cookie-less HEAD to that site, at most once a minute, so the connection is ready (`warm`).
- **Measured against v2 on the local bench** (`npm run bench`, 60 ms per file):
  - Repeat visits are 2.5 to 6 times faster.
  - After a full browser restart, the page loads in about 360 ms vs about 1000 ms. The rewrite cache alone saves about 27% of that.
  - The desktop's main thread is never blocked.
  - document.cookie writes reach the next request, which v2 misses, and it survives service-worker restarts.
- **Deploys that change `sw.js`:** the engines are tied to the worker they started with. When the browser starts, it calls `reg.update()` and waits for any new worker to take over. If one takes over mid-session, the engines restart and open tabs are marked `stale`; Reload or the next navigation moves them to the new worker.
- **Testing against a local site:** wisp refuses loopback addresses by default, so set `options.allow_loopback_ips` from a `--import` preload. libcurl sends `Upgrade: h2c` on plain `http://`, so a test server's `upgrade` handler must let non-WebSocket upgrades through as normal requests. The test site and server are plain HTTP/1.1, so both libcurl and the browser (for fast mode's `/wj-net`) get 6 connections per host; timing tests have to fit inside that (the chunk page uses 5 files), while Render serves HTTP/2.

**Cloud gaming (CloudMoon):**
- CloudMoon publishes each version on jsDelivr (`gh/CloudMoonApp/web`) as `.html` pages plus tiny `.svg` launchers. A launcher's script fetches the real page from the CDN and writes it into a frame.
- The version is pinned by `CLOUDMOON_VERSION` (default `260521`).
- **Our side:**
  - The desktop signs in with its own form: `POST /login/pwd`, sent straight from the browser to CloudMoon's API, so passwords never reach our server.
  - It saves the token under their key `cm_auth_token`.
  - Clicking a game claims a phone (`/phone/list`, then `/phone/connect`, polling while queued).
- **The hand-off:**
  - The session goes into `localStorage.cm_launch_data` (`{sid, quality, timestamp}`). Their page ignores it after 20 seconds, so the desktop keeps refreshing it until the page has read it.
  - Then the frame loads `/cloud/app/play-<version>.svg`: their play launcher, re-served from our origin so the page it writes shares our localStorage.
- **Ending:** their play page goes to `./main.svg` when a game ends. `/cloud/app/main.svg` posts `{cm:'ended'}` to the desktop. Going back to the list or closing Cloud calls `/phone/disconnect`.
- **Fallback:** if their API won't answer our origin, or the CloudMoon site button is clicked, the frame loads their CDN portal (`<version>.svg`) as-is. It uses a `credentialless` frame because of COEP, so sign-ins there don't outlive the tab.
- **Reading their code:** it's obfuscated. Clone the repo and replace the string-table lookups with their decoded strings.

**Static files (`static.js`):** `compressedStatic(dirs, {maxAge})` sits in front of each `express.static` mount. Text, JSON, SVG and wasm files over 1 KB are compressed once (Brotli, gzip as a fallback), kept in memory (64 MB, keyed by size and modified time) and sent with a weak ETag, so a repeat visit is a 304. Package files (`/scramjet/`, `/libcurl/`, `/sj1/`, …) get an hour of `max-age`; the site's own files are `no-cache`. Range requests and anything else fall through to `express.static`. `/wj/wasm.js` keeps its own Brotli copy. The first load went from about 3.9 MB to 1.3 MB (libcurl 2.1 MB → 800 KB).

Every response carries COOP `same-origin` and COEP `require-corp`, because the proxy engines need `SharedArrayBuffer`. Their service-worker responses set COEP on proxied documents themselves. Anything third-party embedded in the page must send CORP or be re-served from our origin. A cross-origin frame whose site sends no COEP/CORP (E2B's noVNC stream, XENV, vidsrc, the CloudMoon portal) is blocked, and Chrome words that as "<host> refused to connect"; such frames get the `credentialless` attribute (`openVM` sets it on `#vm-frame` for any address off our origin), and browsers without it get a new tab instead (`openTab`, which cuts `opener` by hand because `noopener` makes `window.open` return null). That is why `/api/cloud/icon` proxies box art (host-locked to `myqcloud.com`), and why `/cloud/app/` re-serves the CloudMoon client from jsDelivr with COEP overridden to `credentialless`.

### Sessions and roles
- Sessions are a JWT in the httpOnly `vm_session` cookie. Guests get `{type:'guest', guestId}` with no DB row, and appear in chat as `guest-` plus the first 6 characters of the id.
- Account tokens carry `tv`, the user's `token_version`. `verifyToken` compares it with the database on **every** request and socket upgrade. Bumping the version (password change, "sign out other devices", admin sign-out) kills every existing session. Also call `kickUser()` from `chat.js` to drop live sockets.
- Role ranks live in `db.js` (`owner > admin > mod > member > guest`). You can only act on someone ranked strictly below you (`can()` and `outranks()` in `chat.js`).
- The account named `OWNER_USERNAME` gets the owner role on register and login.
- **Owner lock:** with `OWNER_PASSWORD` set, `ensureOwnerAccount()` creates the owner account on boot (before `listen`) whenever it's missing, so after a free-plan wipe nobody can register the name first. An existing account is left alone. Without it the server logs a warning, and whoever registers the name first becomes owner.
- Owner-only HTTP routes use `requireOwner`. The front end hides owner-only UI with `html[data-owner]`, but the server is the real gate.
- Rate limiters in `security.js` are in-memory and reset on restart. `app.set('trust proxy', 1)` makes `req.ip` the visitor's address behind Render; `clientIp()` does the same for raw upgrade requests.

### Database (`db.js`)
- Uses synchronous `DatabaseSync` with prepared statements in the `q` object.
- The schema is `CREATE TABLE IF NOT EXISTS` plus additive migrations through `addColumn()`. Add new columns with `addColumn`, not by editing the `CREATE TABLE`, or existing databases won't get them.
- Messages are soft-deleted (`deleted = 1`), and each channel is trimmed to its newest 400 on every 50th insert.
- DMs are ordinary messages whose channel is `dm:<a>|<b>`, with the two names sorted.
- `reactions` cascades on message delete.
- `sanctions` stores mutes and bans:
  - `until` is NULL for permanent.
  - `ip` is recorded for guests so a ban survives a new guest id.

### Chat protocol (`/chat/`)
JSON frames of the form `{type: ...}`.

Client to server:

| Type | Purpose |
|---|---|
| `open`, `more` | load a channel, page older history |
| `msg` | post; optional `replyTo` |
| `edit`, `react`, `delete`, `typing` | message actions |
| `timeout`/`untimeout`, `ban`/`unban` | moderation |
| `channel.create`, `channel.update`, `channel.delete` | channel management |
| `role.set` | change a role |
| `profile.set`, `profile.get` | profiles |
| `dm.open`, `dm.list` | direct messages |
| `directory` | all profiles |

Also `search {q, from?, channel?}` (every public channel plus your own DMs, at most 40, newest first; `from:name` in the search box), `pins {channel}`, `pin {id, on}` (mods and up in channels, either person in a DM, 50 per channel; pinned messages survive trimming), and `open {channel, around}`, which loads back far enough to show that message.

Server to client: `ready`, `history`, `search`, `pins`, `pinned`, `msg`, `edited`, `reactions`, `deleted`, `presence`, `members`, `channels`, `typing`, `announce`, `banned`, `system`, `error`, plus `dm.opened`, `dms`, `profile`, `profile.view`, `directory`.

Voice calls ride the same socket (`chat.js` relays; audio and screen go peer to peer over WebRTC, `public/js/calls.js`):
- client: `call.invite {callId,to}`, `call.accept`, `call.decline`, `call.end`, `call.signal {callId,data}`
- server: `call.invite {callId,from}`, `call.accepted`, `call.signal`, `call.ended {reason}`
- Accounts only. A call rings every tab of the callee and binds to the one that answers. The server tracks calls in memory for busy, 35-second ring timeout, and disconnect handling.
- The client uses perfect negotiation (the callee is polite), so screen share can start or stop mid-call. `/api/calls/ice` hands out STUN, plus TURN when it's configured.
- **The relay (`/call-relay/`, `chat.js`):** strict networks (schools, phone carriers) block the direct path, and without TURN the call never connects. So if WebRTC isn't connected after 9 s, or fails, the side that noticed signals `{relay:true, why}` and both sides move the call to a WebSocket through our server.
  - Voice is 16 kHz G.711 μ-law in 20 ms frames (`js/call-worklet.js`, an AudioWorklet), played with 80 ms of slack; a shared screen is JPEG frames, 3 a second, up to 1280×720, skipped while the socket is backed up. Messages are `[kind, ...bytes]` (1 voice, 2 frame, 3 frame end). No screen sound on the relay.
  - Only the call's two accounts can join a call's relay (checked at upgrade and on connection), each side has a byte budget (600 KB/s, 1.5 MB burst), and ending the call closes it.
  - Both devices remember a failed direct path for a day (`wvm.callRelayUntil`) and go straight to the relay. `wvm.callRelay=always` does that permanently; `blocked` fakes a network that blocks direct calls (tests).
  - `window.calls.stats()` reports the mode, which videos are showing, and what's been sent and received. `test/calls.test.mjs` covers direct calls, the camera, the relay, the fallback and an outsider trying to join.
- **The call's look (Discord style, `css/calls.css`):** `#call` has `data-mode`: `card` while ringing, `dock` while the chat is open (placed over `#dc-callslot` at the top of `.dc-main`, which pushes the messages down; bigger while a screen is live, the whole column with `#cl-size`), or `pip` otherwise (a small window dragged by its header, position in `wvm.callPip`; clicking it opens the DM). `layout()` picks it on every state change and when `#chat-window` changes class.
  - Tiles: `#cl-t-them`, `#cl-t-me`, `#cl-t-screen` (their screen, "Live") and `#cl-t-myscreen`. A shared screen takes the focus (`.cl-tiles.focused`: big on top, the rest in a strip); clicking a tile focuses it, double-click is fullscreen. Classes on `#call`: `has-cam`/`has-screen` (theirs), `self-cam`/`self-screen` (yours), `relay`, `big`.
  - Speaking: `.speaking` (a green ring) from an `AnalyserNode` on each voice (direct), or the relay's voice frames (`relay.loudAt`).
  - Mute and deafen: each side signals `{state:{muted,deaf}}` (on connect and on every change) and shows the other's on their tile. Deafening mutes you and silences them (`<audio>.muted`, or the relay's output gain); Ctrl+Shift+M / Ctrl+Shift+D. "Call connected" (`#dc-callbar`) sits above your name in the chat sidebar.
  - **Screen share quality** (the arrow by the share button, `wvm.shareQuality`, `wvm.shareSound`): `SHARE_Q` presets Smooth (1080p60, `contentHint` motion, 6 Mb/s, maintain-framerate), Balanced (1080p30, detail, 4 Mb/s) and Sharp (up to 1440p, text, 8 Mb/s, maintain-resolution), applied with `getDisplayMedia` constraints and `sender.setParameters` (`tuneSender`, which retries until the encodings exist; a newer pick cancels an older loop), switchable mid-stream. Through the relay they set the frame size, JPEG quality and rate instead. The shared tab's sound goes without voice processing.
  - `window.calls.rtc()` (for tests) returns WebRTC's own stats and each video sender's parameters.
  - **Renegotiation bug to remember:** the caller's mic is already added, so when the callee's camera or screen sends a new offer, the caller must not add its mic again (it throws and the offer is never answered). `onSignal` only adds tracks that have no sender yet.
- **Camera (`#cl-cam`):** a second video next to screen share. Directly, each video's stream id is signalled first (`{media:{<streamId>:'cam'|'screen'}}`) so the other side knows which is which. On the relay it's frames of kind 4 (camera, 480×360, about 6 a second) and 5 (camera end). Cameras capture at 720p. Each camera gets its own tile; your own shows mirrored in `#cl-self`. The relay's budget is 1 MB/s per side.

**Voice channels (`public/js/voice.js`, `/voice/` in `chat.js`):** "Join voice" (`#dc-voice`) in a text channel's header, accounts only, up to 6 people (`VOICE_MAX`).
- Always through our server: the client sends 20 ms μ-law frames (the same worklet as the call relay), and the server sends each to the rest of the room as `[speaker index, ...bytes]`, with a byte budget per socket. Text messages: `{t:'mute'}` from the client, `{t:'roster', you, members}` from the server.
- Each speaker gets their own playback timeline, and their avatar lights up while they talk (`.talking`). The voice bar (`#vc`) floats bottom-left, or sits in the channel list while chat is open.
- Everyone connected to chat gets `{type:'voice', channel, members}` on each change (and `voice` in `ready`), shown as a count next to the channel.
- Guests can't join. Kicks, bans, timeouts and deleted channels close the voice socket (`dropFromVoice`, plus a 10 s sweep). Starting or answering a call leaves voice; you can't join voice mid-call.
- **The stage (`#vstage`):** a Discord-style tile per member (speaking ring, muted/deafened icons). It docks over `#dc-callslot` while chat is open (`html.voice-docked`) and shrinks to a draggable pip otherwise. Deafen (`{t:'deaf'}`) mutes you and stops the server sending you voice.
- **Go Live:** `{t:'live',on}` announces a stream (`live` in the roster and the `voice` broadcast). A viewer sends `{t:'watch',who,on,relay}`; the streamer gets `{t:'watchers'}` and opens one RTCPeerConnection per direct viewer, signalled through the server as `{t:'rtc',to,data}` → `{t:'rtc',from,data}`. It reuses the call's quality presets (`window.calls.share`). If a viewer isn't connected in 9 s (or `wvm.callRelayUntil` says the network blocks it), they watch through the server instead: the streamer sends `WVS1`+JPEG, the server forwards `WVS1`+[streamer index]+JPEG only to relay watchers, within `STREAM_RATE`/`STREAM_BURST`.
- `test/voice.test.mjs` covers three people talking, the badge, a guest refused, mute, leave, calls, the stage, deafen, and Go Live watched directly and through the relay.

**Error log (`analytics.js`, Admin panel > "Problems visitors hit"):** `reportError(kind, msg, place)` in `app.js` posts to `/api/stats/error` (kinds in `ERROR_KINDS`: js, proxy, song, movie, vm, ai, call), each problem once per page load and at most 25. It's called on our own scripts' uncaught errors and rejections (not proxied frames or extensions), WillieJet failures, blank-page fallbacks, VM start failures, songs that won't play, dead vidsrc players and AI errors. Rows are counted by kind and message (`errors`, 500 kept), with how many different people hit it (salted hashes in `errors_seen`). `GET`/`DELETE /api/stats/errors` are owner-only.

**Backups (`backup.js`, Admin panel > Backup):** `GET /api/admin/backup` downloads users, channels, messages (not deleted ones; attachments dropped), reactions, sanctions, user settings and analytics as JSON. `POST` (sent as `text/plain`, up to 60 MB, because the site-wide JSON parser stops at 100 KB) replaces those tables in one transaction, writing only columns the current schema has, then `resetChat()` closes every chat socket with 4005 so pages reload. Uploaded files aren't included.

**Analytics (`analytics.js`, `js/stats.js`, `css/stats.css`, owner only):** Admin panel > Analytics.
- Counts only, per UTC day and hour, in tables `stats` and `stats_seen`: visits, app launches, songs, movies, VM starts, AI replies, chat messages, calls, voice joins, sign-ups. Daily visitors are salted HMAC hashes (the salt lives in memory), pruned after 120 days.
- The page reports through `track(kind,name)` → `POST /api/stats/event` (only `visit`, `app`, `song`, `movie`; apps from `APP_NAMES`); the rest are recorded on the server with `record()`. `GET /api/stats/report?days=7|30|90` is owner-only.
- Charts are hand-drawn SVG at the card's real width (redrawn on resize and theme change), with tooltips and a table view each; the busiest-times heatmap is shown in the owner's local time. On Render's free plan the counts reset with the database on every deploy.
- `test/analytics.test.mjs` covers it.

**Pictures and files in chat (`files.js`, the `FILES` part of `app.js`):**
- The paperclip, pasting, or dropping a file uploads it straight away (`POST /api/chat/files?channel=&name=`, raw body, accounts who may post there, 8 MB, no program files). The next message carries `{file: id}`; a message can be just a file. `chat.js` checks the file is yours, unsent, and for that channel.
- The kind is read from the first bytes: only PNG, JPEG, GIF and WebP show as pictures (with their size, so the chat doesn't jump). Everything else is served as `application/octet-stream` with `Content-Disposition: attachment`; every file gets `nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`, so nothing uploaded runs on our site.
- `GET /api/chat/files/<id>` checks each time (`no-cache`): whoever can read the channel (only the two people for a DM), while the message exists; an unsent upload only for its uploader.
- Bytes live in `DATA_DIR/files/<id>` (table `files`, `messages.file_id`), wiped with the database on Render's free plan. A sweep each minute removes unsent uploads after 15 minutes and files whose message is gone, and the oldest once they pass 400 MB. Limits: 40 uploads per person per 10 minutes, 60 MB an hour.
- `test/files.test.mjs` covers sharing, downloads, a fake picture, blocked and oversized files, guests, DMs, unsent uploads, deleting, and pasting.

**Chat extras in the page:** the search and pins panel (`#dc-find`, `dcFindOpen('search'|'pins')`, Ctrl+F while chat is open), unread counts per channel (`dcUnread`, plus `dcMentioned`, which shows red with an @; DMs are always red), the taskbar badge (grey, red once a DM or mention is waiting, `bumpBadge(hot)`), the app icon badge (`navigator.setAppBadge`), and per-channel mute (the bell, localStorage `dcMuted`, this device only): no sound, toast, notification or count unless you're @mentioned.

Close codes: `4003` banned, `4004` kicked, `4005` signed out.

Only the owner swears. `tidy()` in `chat.js` runs everyone else's messages, edits, display names, bios and channel names through `censor()` from `profanity.js`, which stars the word out ("f***"). Sign-up refuses usernames with bad words. The word lists are `CONTAINS` (caught anywhere in a word), `PREFIX` and `EXACT` (whole word only, so "class" and "assess" survive), plus `ALLOW` for real words that collide. After changing them, check against a list of everyday words.

### Remote PC relay (`remote.js` + `agent/`)
- **Agents** connect with `Authorization: Bearer <REMOTE_KEY>` and `?name=`. Several named PCs can be online; a new agent with the same name replaces the old one (close code `4002`).
- **Viewers** must be the owner (checked from the cookie at upgrade) and send `{t:'auth', key}` as their first message. Close code `4001` means a bad key.
- **Never put the key in a URL.**
- Binary frames from an agent go verbatim to that agent's viewers. Viewer JSON goes to the selected agent, except `{t:'select'}`, which the relay handles itself.
- Mouse coordinates are normalized to 0..10000 of the chosen monitor.
- `agent/willies-agent.mjs` writes an embedded PowerShell script that compiles C# with `Add-Type` (GDI capture, `user32` input, `EnumDisplayMonitors`).
- The C# host speaks a line protocol:
  - **stdin:** commands such as `m x y`, `k 1 vk`, `mon i`, `q 45`.
  - **stdout:** frames, each `WVM1` + a uint32 LE length + JPEG bytes.
  - **stderr:** `META w h monitor layout` lines.
- Clipboard is read and written through separate `powershell Get-Clipboard` / `Set-Clipboard` calls.
- **Binary frames are tagged.** Anything without a tag is a JPEG frame.
  - `WVF1` + uint32 id + bytes: file chunks, in both directions. The relay forwards viewer binary only when it carries this tag.
  - `WVA1` + uint32 rate + uint16 channels + 2 spare bytes + int16 PCM: PC sound.
- **Files** live in `agent/files.mjs`, plain Node, so it runs and tests on Linux.
  - JSON messages: `fs.list`, `file.get`, `file.put`, `file.put.end`, `file.ack`, `file.cancel`.
  - Both sides ack every 1 MB and keep at most 4 MB in flight.
  - The viewer side is `public/js/remote-extra.js`.
- **Sound** is a second PowerShell process running C# WASAPI loopback (`AUDIO_PS1`). It starts on `{t:'audio',on}` and stops when no viewers are left.
- None of the Windows side runs on Linux. You can still compile the embedded C# to catch errors: `mcs -langversion:5 -target:library` on the text between `@'` and `'@` (Windows PowerShell's `Add-Type` only accepts C# 5). Add `-r:System.Drawing.dll` for the capture host.

### In-memory state (lost on restart)
Several things live only in memory:
- the admin activity log (`logEvent`)
- the live-VM maps (`e2bSandboxes`, `xenvVMs`)
- the chat presence roster
- the rate-limit buckets

VM lifetimes are 30 minutes for guests and 60 for accounts, enforced by the providers (E2B, and XENV at `loremgroup.org`).

VM limits (the "VM limits" section of `server.js`, via the `vmStartGate` middleware; the owner is exempt):
- Running at once: 1 per guest, 2 per account, `MAX_LIVE_VMS` site-wide. VMs still starting or waiting in the XENV queue count too (`vmPending`); a queued one keeps its slot only while the page keeps polling.
- Starts: 6 an hour per person, 20 an hour per network.
- Stopping a VM needs a session, and only whoever started it (matched by `vmWho()`, the full guest id or username) or the owner may stop it.

### Front end (`public/`)
No framework and no modules.

- `index.html` holds all the markup.
- `js/app.js` is one large classic script of global functions, written in a dense one-liner style, with `$`/`$$` query helpers.
- `js/motion.js` loads first and exposes `window.motion` (`celebrate`, `pop`, `shake`, `countUp`, `emojiBurst`, and more).
- After `app.js` come the feature scripts. Each is an IIFE that uses `app.js` globals and exposes one object:
  - `js/music.js` → `window.music`
  - `js/ai.js` → `window.ai`
  - `js/calls.js` → `window.calls`
  - `js/remote-extra.js` → `window.rmx`
  - `app.js` calls into them through optional chaining (for example `window.calls?.onMessage(d)`).
- **Music:**
  - Four sources, picked with the switch at the top of the music window (`#mu-src`, `lib.source` in the synced library, SoundCloud by default). Search, the home charts and "find the full version" follow it. A song's source is in its id: SoundCloud ids are bare numbers (as in older saved libraries), the rest carry a prefix (`yt:<video>`, `au:<track>`); `srcOf()` reads it, and rows from other sources get a badge.
  - **SoundCloud** songs play in a plain `<audio id="mu-audio">` from `/api/music/stream/<track id>`. The server fetches the audio, so the browser never talks to SoundCloud: it works where SoundCloud is blocked, in any browser, in the background and with media keys.
    - Stream picking (`streamsOf` in `music.js`), best first: the track's progressive MP3 (passed through with Range requests so seeking works), then MP3 in HLS pieces, then AAC in HLS pieces.
    - HLS-only songs are fetched whole, stitched into one file in `DATA_DIR/music` (`MUSIC_DIR`, 300 MB, played-longest-ago cleared first) and served with `sendFile` without ETag/Last-Modified.
    - Signed links that run out (401/403/404/410) are asked for again, once.
    - Tracks with any encrypted (DRM) stream are label uploads nobody can stream, so `playable` leaves them out of search and chart matching picks fan uploads.
    - `?warm=1` gets the next queued song ready. The stream route has its own limit (400 a minute per network), apart from search (90).
  - **Audius** (free, public API, full MP3s): search, trending per genre (`AUDIUS_GENRES` maps our chart genres), and `/api/music/stream/au:<id>` through the same pass-through. Its API redirects to a signed link on a community-run content server, which redirects again; `audiusFile` follows each hop by hand (`redirect: "manual"`) and refuses non-https and any host resolving to a private address (`isPrivateIp` from `fastnet.js`). Members-only (`is_stream_gated`) tracks are left out. Artwork from its content servers is allowed only on its `/content/<cid>/<size>.jpg` paths, after the same private-address check.
  - **YouTube**: search goes through the server (`youtubei.js`, regular YouTube search filtered to 30 s–20 min videos; YouTube Music's own search returns nothing to servers). The audio can't: YouTube answers datacenter addresses (ours, Render's) with "Sign in to confirm you're not a bot". So a YouTube song plays in the visitor's browser, in YouTube's embedded player (`youtube-nocookie.com`) in a hidden, off-screen `credentialless` frame (`#mu-yt`), driven by the postMessage protocol its IFrame API script speaks (`listening`, `command`, `infoDelivery`, `onReady`, `onError`). Every control (`resume`, `pause`, `seekTo`, volume, media keys) goes to whichever engine the current song uses, and the audio element's events are ignored while YouTube plays.
    - A blocked video (region, school filter) just never starts, without an error, so a YouTube song that isn't playing within 15 s counts as failed (`ytWatch`). A chart or Deezer song matched to YouTube then falls back to SoundCloud (`orig`, `noYT`); after two YouTube failures in a row, matching tries SoundCloud first for the session (`ytFails`).
  - **Deezer**: its catalogue search (`deezerSearch`) and charts, which need no key. Its full tracks are DRM-locked, so Deezer songs are `chart:true` entries matched to a full upload when played (`/api/music/resolve?via=yt|sc`): YouTube first for the YouTube and Deezer sources, SoundCloud first otherwise, any failure falling through to the next. `scoreMatch` marks covers, remixes, remakes, bootlegs and the like (`JUNK`) down.
  - The home charts are Deezer's for every source but Audius, which shows its own trending.
  - `/api/music` also covers `art` (image proxy host-locked to SoundCloud's, Deezer's and YouTube's image CDNs, plus Audius artwork paths).
  - The library is localStorage `music`.
  - `SOUNDCLOUD_API`, `DEEZER_API` and `AUDIUS_API` exist only for the tests (`test/site.mjs` has a pretend SoundCloud under `/sc/` and `/sc-cdn/`, Deezer under `/dz/`, and Audius under `/au/` with content servers at `/au-node/`, including a link into a private network that must be refused). YouTube can't be faked; test it live (in this sandbox Chromium needs `--proxy-server=https=<HTTPS_PROXY host>` and the proxy CA trusted, and many label videos are region-blocked here). The test MP3 is hand-made silent frames, because Playwright's Chromium can't decode AAC.
- **Movies** (`public/js/movies.js` → `window.movies`, full-screen `#movies-wrap`, `css/movies.css`; server side `movies.js`, mounted at `/api/movies`):
  - Listings come from Cinemeta, Stremio's public catalogue, which needs no key and hands back IMDB ids: popular movies, popular shows, anime (Cinemeta's series Animation chart), genre charts (`GENRES` in `movies.js`, movies and shows only — the anime row is itself a genre filter, and Cinemeta can't stack two), search and a show's episode list, all proxied and cached on our server. The first title with a backdrop becomes the hero banner at the top of the grid. Posters go through `/api/movies/art` (host-locked to `metahub.space` and `media-amazon.com`) because of COEP. `CINEMETA_API` exists only for tests.
  - The video is vidsrc, embedded straight by IMDB id (`/embed/movie/<id>`, `/embed/tv/<id>/<season>/<episode>`) in a `credentialless` frame — same COEP trick as the CloudMoon portal, with the same new-tab fallback for browsers without it. None of the video touches our server.
  - vidsrc's chain: its page fetches a short-lived `?vs=` token (`/vs_src.php`) and frames a poster page on `cloudorchestranova.com`, which frames the real player only after play is pressed (`autoStart` is false on every mirror). Every mirror (`MIRRORS`: vidsrc.ir, vidsrc.sh, vidsrc2.ru, vidsrcme.ru) uses that same player host but hands out a fresh token and stream host each load, so a dead player is retried by moving to the next mirror.
  - Player health comes from the messages vidsrc relays to our page (`e.source` is the frame): the poster page sends `PLAYER_TITLE` within a few seconds, the real player `PLAYER_UI`/`PLAYER_EVENT`. No message in 15 s means a dead poster page (for example "cloudorchestranova.com sent an invalid response"), and it moves to the next mirror on its own. A click into the frame (seen as our window's `blur`) with no player message in 20 s shows the `#mv-stall` bar instead of reloading, since the click may have been on vidsrc's own menus. "Reload player" (`#mv-reload`) does the same by hand.
  - "Continue watching" is localStorage `movies.recent` (12 titles, this device only); reopening a show resumes on its last episode. The cards reuse the cloud-gaming grid classes (`.cg-*`), with 2:3 posters. `#movies-wrap [hidden]` is forced to `display:none` because the app's own display rules would beat the attribute.
- **AI** (taskbar, desktop, launcher, Alt+A): a chat window over `/api/ai` (`ai.js`).
  - The API key stays on the server (`AI_API_KEY`, never in the repo or the browser). `/api/ai/status` lists the API's models and picks a default (`AI_MODEL`, else a general chat model from the list). `/api/ai/chat` adds our system message, caps history (40 messages, 32k characters) and replies (2048 tokens), and streams the reply to the page as JSON lines (`{t:'text'}`, `{t:'done'}`, `{t:'error'}`).
  - Needs a session. Limited to 40 messages per person and 240 per network every 10 minutes.
  - Replies are drawn as escaped Markdown (`md()` in `js/ai.js`): HTML in a message is shown, never run. Links open in the browser app.
  - Chats live in localStorage `ai.chats` (50, this device only, not synced; not kept in incognito). The chosen model is `ai.model`.
  - **Actions:** with `actions:true` the system message (`ACTIONS` in `ai.js`) teaches the model to write `[[action {"do":…}]]` lines, which any model can do. `js/ai.js` hides them from the reply, carries them out (`ACTIONS` there: `music.play`/`pause`/`resume`/`next`/`prev`, `movies.open`, `app.open`, `browser.open`, `theme.preset`, `theme.set`, `widget.set`, `todo.add`, `chat.read`; at most 5 a reply) and shows a chip for each. Keep the two lists in step. The page also sends `context`, a short note about the screen (`siteContext()`: what's playing, open apps, the chat channel, the look), which the server caps at 1500 characters and labels as information, not instructions.
    - Reasoning models (the production default, `minimax-m3`, is one) stream their thinking inside `<think>…</think>` first. `answerOf()` drops it: never shown, and actions are only taken from the answer after it.
    - `chat.read` sends the open channel's last 80 messages back as a hidden user message for a second reply, which runs with `actions:false`: text other people wrote can't make your AI act.
    - `music.playQuery` plays without opening the Music window; `movies.browse({row,genre,query})` opens Movies there.
  - **Thinking and streaming:** `/api/ai/chat` is sent as `text/event-stream` with `no-transform`, so proxies don't buffer it. Thinking the API sends apart (`delta.reasoning_content`/`reasoning`) comes through as `{t:'think'}`; inline `<think>` works too (`thinkOf()`). With "Show thinking" on it's a fold above the answer ("Thinking…", then "Thought for Xs"). Text that lands in big chunks is typed out a little each frame (`revealAt`, `revealed()`).
  - **Customize** (`#ai-custom`, localStorage `ai.custom`, this device only): "about me", "how to answer", style chips (`STYLES`), show thinking, read aloud. `customText()` goes along as `custom` (the server caps it at 2000 characters and adds it to the system message) and into the local models' system message.
  - **Extras:** the model picker `#ai-mp` is drawn from the hidden `#ai-model` select (which still holds the value; picking dispatches `change`), with search, badges and keyboard support. Under a finished answer: copy, read aloud (speechSynthesis), Answer again (replaces the last answer), and the model and speed. Edit on your own message (`editingAt`) resends it and drops what came after. `/` shortcuts (`SLASH`), voice typing (`#ai-mic`, SpeechRecognition, hidden without it), chat search (`#ai-search`) and download as Markdown (`#ai-export`).
  - **Pictures** (`#ai-attach`, paste, or drop on the window; `pending` shows in `#ai-tray`): shrunk to 1280 px JPEG (`shrink()`), kept in IndexedDB `wvm-ai` (`img` store, in memory only in incognito; messages hold ids in `imgs`/`made`; deleting a chat deletes its pictures). They go to `/api/ai/chat` as `images` (data URLs); the server keeps only real PNG/JPEG/WebP/GIF data, 4 a message, the newest 6 in the conversation, and sends them as OpenAI `image_url` parts. That route alone parses JSON up to 10 MB. Models on this device can't see pictures (they're told one was attached).
  - **Making pictures** (`POST /api/ai/image {prompt}`): `AI_IMAGE_MODEL` on the same API (`/images/generations`) if set, else Pollinations (free, no key, `IMAGE_API` overrides it for tests), proxied back as bytes because of COEP. `/image <prompt>` goes straight there (`drawOnly`); the chat model can also write `image.make {prompt}`. Counts against the AI limits.
  - **Typing in the box:** an app window's global key handler must check `ownsKeys()` in `apps.js` (top window, focus inside it or nowhere); Snake once swallowed W/A/S/D and space typed into the AI. Opening the AI raises it above any app windows, and the music mini-player moves up off the message box while it's open.
  - Tests use a pretend API on the test site (`/v1/*` in `test/site.mjs`; "reason first" sends `reasoning_content`, "please draw" acts with `image.make`, `/img/` is a pretend Pollinations); the main test server gets `AI_API_KEY=test-ai-key`, the strict one no key. Certain messages ("play the test song", "go synth", "catch me up") get replies with actions.
- **AI on this device** (`js/local-ai.js` → `window.localAI`, workers `js/local-ai-webllm.js` and `js/local-ai-tf.js`): models that run in the visitor's browser, free and private, offered in the AI app's picker as `local:<engine>:<model>` ("On this device") plus `local:auto` (`pick()`: WebLLM Llama 3.2 1B with a graphics chip and 4 GB+, else Chrome's Gemini Nano, else WebLLM Qwen 0.5B, else wllama Qwen 0.5B, else Transformers.js SmolLM2 360M). With no online AI the app offers it with a button rather than picking it, because the first use downloads hundreds of MB.
  - Engines, libraries pinned on jsDelivr, models from Hugging Face (`MODELS`): **WebLLM** 0.2.85 (WebGPU, in a worker; the `q4f32` build when the GPU lacks `shader-f16`), **Transformers.js** 4.3.0 (imported as `+esm`, since its web build imports `onnxruntime-web` by bare name; WebGPU `q4f16` or CPU `q4`, in a worker, stopped by a `StoppingCriteria` subclass), **wllama** 3.6.1 (llama.cpp on the CPU, GGUF files), **MediaPipe** tasks-genai 0.10.29 (WebGPU; only `-web.task` builds run in browsers, other `.task` files crash its detokenizer; Gemma 4 E2B/E4B web builds need no login; `maxTokens` must fit the file's `ekv` context; it takes only a real stream reader, so progress is a `TransformStream`; `cleaner()` cuts its raw end-of-turn markers), and **Chrome's Prompt API** (`LanguageModel`, or the older `ai.languageModel`; a session per reply).
  - One model in memory at a time. Each engine keeps its own download (Cache Storage, OPFS; MediaPipe's in `wvm-local-ai`); "Delete downloaded AI models…" in the picker clears them (`forget()`).
  - The page gets the same instructions as the server's models from `GET /api/ai/system`, adds the same screen note, sends the last 12 messages, and runs actions the same way.
  - Checked for real in this sandbox: Transformers.js (SmolLM2 135M, CPU), wllama (Qwen 0.5B) and MediaPipe (Gemma 4 E2B on SwiftShader) answer; WebLLM downloads and loads but SwiftShader never finished compiling its kernels, so it's untested past loading here. `test/local-ai.test.mjs` covers the app with a stand-in Gemini Nano; `test/local-ai-live.mjs` runs a real model by hand.
- **Desktop extras** (`js/desk.js` → `window.desk`, `css/desk.css`):
  - **Theme presets** (`PRESETS`, Settings > Appearance, `#presets`): each sets `theme`, `accent`, `accent2`, `gradient`, `glow` and `wallpaper` at once.
  - **Live wallpapers:** `WALLS` entries with `live` (`live-aurora`, `live-flow`, `live-synth`, `live-lava`, `live-stars`, `live-sea`). `applyWallpaper` sets `#bg-live[data-live]`, and pure CSS draws them (the element and its two pseudo layers). They pause with motion off, performance mode or `prefers-reduced-motion`.
  - **Widgets** in `#widgets` over the desktop: clock (`S.wClock`, on by default), weather (`wWeather`; Open-Meteo straight from the browser, CORS, no key; city search or geolocation; °F/°C), now playing (`wMusic`, on by default; hides while nothing plays; uses `window.music.now/playPause/next/prev`) and a to-do list (`wTodo`). Switches in Settings > Desktop > Widgets.
  - **Dragging:** widgets by any part that isn't a control; desktop icons too. The first icon drag turns `#icons` into free spots (`.free`), snapping to a 92×98 grid; dropping on another icon swaps them; the click that ends a drag doesn't launch. "Reset layout" (`#desk-reset`) forgets both.
  - Positions (fractions of the desktop for widgets, grid cells for icons), the to-dos (100) and the weather city live in localStorage `desk`, which settings sync carries (`SYNC_KEYS`; `window.desk.reload()` on a pull). `applyAll()` calls `window.desk?.apply()`.
  - `test/desk.test.mjs` covers presets, live wallpapers, widgets, the to-do list, dragging and reset.
- **Apps** (`js/apps.js` → `window.apps`, `css/apps.css`; taskbar `#tb-apps`, desktop icon, Alt+P): a launcher window with two kinds of app. `WEB` sites (YouTube, Discord, TikTok, …) open through the proxy in a window of their own, with no tabs or address bar (`openWeb`: `proxyEngine(engineFor(url)).frame(iframe).go(url)`); ↗ moves one into the browser app. Their logos are real icons saved from each site into `public/icons/apps/<id>.png` (served from our origin, since COEP blocks other sites' images), shown on a white tile; a missing file falls back to the coloured letter tile. Tools get `GLYPH[id]`: a white line drawing (24×24 SVG) on a gradient tile. `T` tools are built in (calculator, notes, paint, code playground, focus timer, stopwatch, calendar, unit converter, password maker, dictionary via dictionaryapi.dev, typing test, camera, screen recorder, soundboard, world clock, word counter, colour picker, snake). Windows (`.aw`, identified by `data-win`; never `data-app`, which the page treats as a launch button, so a click inside the window, its ✕ included, reopened it) drag by the title bar, resize from the corner, maximize on double-click, and stack above the full-screen apps. Notes, events, favourites and the like are in localStorage `apps`. Add a tool with `tool(id, name, icon, color, desc, w, h, build)`; push cleanup (timers, camera) to `win.cleanup`. `test/apps.test.mjs` covers it.
- **Welcome tour and What's new** (`js/tour.js` → `window.tour`, styles in `css/desk.css`): a first visit gets `STEPS`, a spotlight (`.tour-hole`, dimming with a huge `outline`, since a huge `box-shadow` didn't paint) on real taskbar buttons plus a card. Returning visitors (`RETURNING` in `app.js`: settings saved before this load, or an account over an hour old, `since` from `/api/auth/me`) get the `NEWS` card instead, for entries newer than `wvm.news.seen`. Add new entries at the top of `NEWS` with a bigger id. Settings > Desktop has "Show the tour" and "What's new". Browsers driven by tests (`navigator.webdriver`) skip both unless `wvm.tour.test` is set.
- **Auto-healing connections (`keepAlive`, `socketDead`, `probeSockets` in `app.js`):** chat, voice and the call relay register their sockets. Each pings every 15 s (`{type:'ping'}` / `{t:'ping'}` / `ping`; `chat.js` answers all three) and any message counts as alive. One that has heard nothing for 35 s (2 minutes in a background tab, whose timers run late) has its `onclose` called at once with code 4000, because a dead socket can take minutes to close by itself; each socket's own reconnect then runs. Going back online or back to the tab checks all of them within 5 s and reconnects chat if it's down.
  - Chat comes back to the channel or DM you had open (`dcResumeTo`). While it reconnects you can keep typing: plain messages wait in `dcOutbox` (20 at most) and go out on `ready`.
  - A direct call that reaches `disconnected` gets 3 s, then `pc.restartIce()`, then after 10 s more moves to the relay (`heal` in `calls.js`), instead of waiting the ~30 s the browser takes to say `failed`. The `online` event restarts its paths too (`window.calls.heal`).
- **Adaptive quality (`autoLite`, `measureFrames`, `adaptVideo` in `app.js`):** a device with 2 GB of memory or 2 cores or fewer, or whose desktop runs under 35 fps (or a quarter of its frames late) twice in a row while nothing heavy is open, gets the light look: `data-perf="on"` without touching `S.perf`, remembered in `wvm.autoLite` for a week. `S.autoPerf` (Settings > Performance, device-only) turns it off; performance mode set by hand wins. Test browsers skip it unless `wvm.autoLite.test` is set. `adaptVideo(pc)` watches every video sender of a call and of each Go Live viewer: three checks in a row limited by bandwidth or CPU scale the resolution down by 1.5 (to 3 at most) with `degradationPreference: 'balanced'`, so motion stays smooth instead of freezing; six good checks scale it back up.
- `test/heal.test.mjs` covers the heartbeat, chat (reconnect, back to the DM, a message written offline), voice and the relay reconnecting, a direct call's ICE restart, `adaptVideo` down and up, and the light look on a choppy desktop.
- **Sound that the browser blocks (`soundUnlock`, `playSound`, `resumeSound` in `app.js`):** calls and voice channels start their `<audio>` elements and AudioContexts through these. A blocked `play()` (NotAllowedError) or a context left suspended waits for the next click or key press anywhere, with a "Click anywhere to turn the sound on" toast. Chrome never blocks while the microphone is on, so this is for Safari and iPhones (a call that moves to the relay mid-call creates its context with no click).
- `test/audio.test.mjs` measures what each page actually plays (a meter on every `<audio>` and on every node wired to a running AudioContext's speakers): both ways in a direct call, a relay call, the mid-call move to the relay and a three-person voice channel, plus mute and deafen. Headless Chrome ignores the autoplay rule, so `soundUnlock` is tested with stand-ins.
- `test/close.test.mjs` opens and closes everything: each full-screen app, the VM, Remote PC, the launcher, every panel (and Escape), app windows (also after a minimize), the start menu and dialogs (Escape or the backdrop close them).
- `test/extras.test.mjs` covers compression, the tour, chat search, pins, unread counts, mentions, muting, the error log and backups.
- **Settings sync** (`SETTINGS SYNC` in `app.js`):
  - Stores `S`, `bookmarks`, `favGames`, `music` and `desk` per account in the `user_settings` table.
  - `save()` and `put()` mark the local copy dirty; the newest copy wins.
  - Keys in `SYNC_LOCAL_ONLY` stay on the device.
- **Install / notifications:**
  - `manifest.webmanifest` and `icons/` make the site installable.
  - `notify()` shows desktop notifications, only while the page is hidden, and generic ones while the tab is cloaked.
- The CSS is layered: `css/app.css` (base), `css/features.css` (admin, chat and remote additions), `css/calls.css`, `css/desk.css`, `css/music.css`, `css/movies.css`, `css/ai.css`, then `css/motion.css` (animations).

Patterns to follow:
- **Your own games (`games.js`, `public/games/`):** every folder with an `index.html` (or any `.html`), and every single `.html` file, in `public/games/` is a game; names starting with `.` or `_` are skipped. `GET /api/games/local` lists them: the title from `game.json`, else the page's `<title>`, else the name; the cover from a `cover`/`thumbnail`/`thumb`/`icon`/`logo`/`preview` picture. They show under "My games" at the top of the Games panel (`renderMyGames`) and in the Apps launcher, and play in an app window (`window.apps.play`), in an iframe without `allow-top-navigation`. `/games/` is served with COEP `credentialless` so games can load CDN files. `public/games/README.md` explains it for the owner.
- **The Arcade (`arcade.js` on the server, `js/arcade.js` → `window.arcade`, `css/arcade.css`; what the Games button opens, also an Apps tool):** it also lists the site's older `GAMES` (category "Cloud & web", opened in the browser with `launchGame` as before) and your own games from `public/games/` ("My games"); the launcher tile counts all of them. The old Games panel (`openGames`) is still there, reachable from the Arcade's data only through code. about 1,770 single-file games from the `bubbls/ugs-singlefile` collection, listed in `public/data/arcade.json` (`{f: file, t: title, c: category, fl: Flash}`). The ~960 console games that load ROMs were left out on purpose; don't add them. jsDelivr serves the files as text/plain, so `/play/arcade/<file>` (only files on the list, 120 a minute per network) fetches one from `ARCADE_UPSTREAM`, caches it (48 MB), injects `SHIM` after `<head>` and serves it with COEP `credentialless`.
  - Games are other people's pages, so they're framed with `sandbox` **without** `allow-same-origin`: an opaque origin, no access to our cookies, storage or signed-in APIs, no top navigation. Never add `allow-same-origin`.
  - Browsers refuse localStorage to an opaque origin, so `SHIM` puts an in-memory `localStorage`/`sessionStorage`/`document.cookie` in its place, seeded from the address's `#arcade=` part (a sandboxed frame's `window.name` is wiped on the way in) and posted back as `{arcadeSave}` on every change. The desktop keeps saves per game in IndexedDB `wvm-arcade` (5 MB each, none in incognito).
  - The library: search, category chips with counts, Favourites and Recent (localStorage `arcade`), A–Z/Z–A/shuffle, random, 72 cards at a time with more on scroll. Covers are generated SVG (gradient from the title's hash, the category's icon, the title); the collection has no pictures.
  - Tests point `ARCADE_UPSTREAM` at `test/site.mjs`'s `/ugs/`, a pretend 2048 that counts plays in localStorage and tries to read our page.
- **Minimize (`MINIMIZE` in `app.js`):** each full-screen app (browser, VM, cloud, remote, movies, music, AI, chat) gets a Minimize button next to its Close, which adds `.minimized` to its wrap (hidden, state kept) and a dot under its taskbar button; launching the app again (`restoreApp`, also called by `openChat`, `openBrowser` and `openVM`) brings it back as it was. App windows (`.aw`) minimize to chips in `#tb-min` on the taskbar. Class names in a tool's markup must not reuse the desktop's (a world clock's `.wc` once squashed the launcher's window buttons); prefix them.
- **Toasts never catch clicks** (`pointer-events:none`): they sit bottom-right over windows' controls (one once covered the AI app's Stop button). They're text only; don't put buttons in them.
- **Settings:** stored in `localStorage` under `wvm.settings.v1`, as object `S` merged over `DEFAULTS`. `set(k, v)` saves them, and `applyAll()` mirrors many onto `html[data-*]` attributes that the CSS keys off. Controls bind declaratively with a `data-setting` attribute (`.switch`, `.seg`, range or input). Adding a setting means a `DEFAULTS` entry, a control with `data-setting`, and, if CSS needs it, a line in `applyAll()`.
- **Leaving the tab (`askBeforeLeaving`, `S.confirmLeave`, on by default; Settings > Privacy & Cloak):** a `beforeunload` handler makes the browser ask "Leave site?" before the tab closes or reloads. It always asks while a VM is running. Browsers use their own wording and only ask after a click or keypress on the page. Anything that leaves or reloads on purpose calls `leaveQuietly()` first so it doesn't ask. That covers the panic key, auto about:blank, log out, "Clear everything", account delete, guest upgrade, the chat sign-out reload and the "Proxy installing" reload; add new ones to that list. The about:blank cloak window gets the same handler.
- **Apps and panels:** `data-app="x"` launches `APPS.x`. Panels open with `openPanel(id)`; any element with `data-close="<id>"` closes one. Add new panel ids to `closeAllPanels()`. Full-screen apps (chat, browser, VM, cloud, remote, music, AI) all sit at `z-index:60`. The music and AI windows hide themselves when another one opens.
- **Dialogs:** `dcModal({title, sub, fields, okLabel, onOk, danger})`. `onOk` may be async; throwing keeps the dialog open and shows the message.
- **Chat rendering:** `dcRenderMessages()` rebuilds the whole list on every change. Only message ids in `dcFresh` get the entrance animation, so re-renders don't replay it.
- **Animations** must stay off when `html[data-motion="off"]`, `[data-perf="on"]`, `[data-bouncy="off"]` or `prefers-reduced-motion` is set. `motion.js` writes only the individual `translate`/`rotate`/`scale` properties, never `transform`, so it stacks on the stylesheet's hover transforms. Keep it that way.

## Conventions
- Every source file starts with the proprietary copyright header (`william's vm … All rights reserved`); new files get it too. The project is `UNLICENSED`; see `LICENSE`.
- Comments explain *why*, in plain sentences; match that density.
