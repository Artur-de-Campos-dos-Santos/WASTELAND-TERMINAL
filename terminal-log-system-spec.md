# Wasteland Terminal — Session Log System

## 1. Overview

A locally-hosted web app for TTRPG sessions that mimics the **Fallout Pip-Boy terminal** aesthetic (green monochrome, scanlines, monospace typewriter text). The DM runs it on their PC; each player connects over the local network (Wi-Fi/LAN) via a browser and sees a personal terminal feed. The DM can send messages to one specific player, to everyone at once, and — in a later phase — trigger automated system messages (combat damage, travel time, etc.) that get logged like in-game terminal output.

**Core principle:** each player's terminal is an independent, real-time log stream. What Player A sees is not necessarily what Player B sees.

---

## 2. Requirements

### Must-have (MVP)
1. DM hosts the app on their own machine; players connect via `http://<dm-ip>:<port>/player/<name>` on the same network.
2. Each player has their own persistent terminal log (a unique feed tied to their player ID).
3. Messages appear in real time (no refresh needed) with a retro "typing out" animation, Fallout-terminal styled (green-on-black, CRT scanline effect, monospace font).
4. DM has a control dashboard (`/dm`) showing:
   - A list of connected players.
   - A textbox + "send" per player, to privately push a message to just that player's terminal.
   - A broadcast textbox to push a message to all players at once.
5. Each player's terminal keeps a scrollback history of everything sent to them so far (persists across a refresh, at least for the session).
6. **Input validation**: all messages capped at 2000 characters; server strips HTML tags from message body and player display names before storing.
7. **Per-player export**: each player can download a plain-text transcript of everything they received — both broadcast messages and private messages targeted at them.

### Should-have (near-term, but not day-one)
8. DM can see a live combined feed of everything sent to everyone (a "God view"), for their own reference.
9. Simple player identification: DM assigns/generates each player a name + a unique link or PIN, no account system needed.
10. **DM PIN authentication**: a hardcoded PIN in server config, required to access the `/dm` dashboard. Prevents accidental or mischievous access from other devices on the network.
11. **Session reset**: a "Clear Log" button on the DM dashboard that deletes all messages but keeps the player list intact. Requires confirmation prompt.
12. **Player removal**: DM can delete a player and all their associated messages from the dashboard.

### Future (design for, don't need to build yet)
13. **Automation API**: an HTTP endpoint (e.g. `POST /api/log`) that external tools/scripts can call to auto-generate templated log lines, such as:
    - `"<Enemy> has taken <X> damage."`
    - `"The party has traveled <X> days."`
    This must support targeting: a specific player, a group, or everyone.
14. Message templates/macros the DM can trigger with one click instead of typing full sentences (e.g. a "Damage Dealt" button with fields for target + amount).
15. Optional sound effects on new message (classic terminal beep/blip), toggleable per player.

**Explicitly out of scope for now:** user accounts/auth beyond simple name+PIN, persistence across multiple separate sessions/campaigns (single "session" state is fine), mobile-native app (responsive web is enough).

---

## 3. Architecture

Real-time, single-session, LAN-hosted web app.

```
                 ┌────────────────────┐
                 │   DM's PC (host)    │
                 │                     │
                 │  Node.js server     │
                 │  - Express (HTTP)   │
                 │  - Socket.IO (WS)   │
                 │  - SQLite (state)   │
                 └─────────┬───────────┘
                            │  LAN (Wi-Fi)
        ┌───────────────────┼───────────────────┐
        │                   │                   │
 ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
 │ Player A    │     │ Player B    │     │  DM Dashboard│
 │ /player/A   │     │ /player/B   │     │  /dm         │
 │ (browser)   │     │ (browser)   │     │  (browser)   │
 └─────────────┘     └─────────────┘     └─────────────┘
```

- **Server** owns all state (players list, message log per player). It is the single source of truth.
- **WebSockets (Socket.IO)** push new lines to the right player's browser instantly — no polling.
- **Each browser tab** only renders the terminal for whichever room (player ID) it's joined to. The DM dashboard joins an "admin" room that also sees a combined feed.
- **SQLite** (via `better-sqlite3`) persists the player list and message history so a page refresh (or the DM restarting the server) doesn't lose the log. On server startup, the existing DB file is copied to `data/backup/session-<timestamp>.sqlite` before opening — simple corruption recovery.

---

## 4. Tech Stack (recommended)

- **Backend:** Node.js + Express
- **Real-time layer:** Socket.IO (handles reconnects, rooms, and broadcast vs. targeted emits cleanly — a good fit here)
- **Storage:** SQLite via `better-sqlite3` (simple, file-based, zero setup — good for a self-hosted single-DM tool).
- **Frontend:** Plain HTML/CSS/JS (no framework needed — this is a small number of views and framework overhead isn't worth it). CSS handles the CRT/scanline/glow look.
- **Hosting:** `node server.js` on the DM's machine; players connect to `http://<dm-local-ip>:3000/player/<id>`. No internet/cloud hosting needed — same Wi-Fi network only.

---

## 5. Data Model

```
Session (singular, one active session at a time)
  - id
  - created_at

Player
  - id (slug, e.g. "aria")
  - display_name
  - pin (optional, simple 4-digit access code)
  - created_at

Message
  - id
  - target_type: "player" | "broadcast" | "system"
  - target_player_id (nullable — null if broadcast)
  - body (text)
  - source: "dm" | "auto"   (auto = future automation API)
  - created_at
```

Every message a player has ever received (targeted at them individually OR broadcast) is part of *their* terminal feed, in chronological order.

---

## 6. Key Flows

### Player joins
1. Player opens `http://<dm-ip>:3000/player/aria` on their phone/laptop.
2. Client connects via Socket.IO, joins room `player:aria`.
3. Server sends them their full message history (their targeted messages + all broadcasts, merged by timestamp) to render on load.
4. New messages after that arrive live via socket events.
5. The join URL is shared by the DM out-of-band (text, Discord, in-person, etc.) — there is no in-app invitation system.

### DM adds a player
1. DM types a player name in the "Add Player" textbox on the dashboard.
2. DM clicks "Add Player".
3. Server generates a slug from the name: lowercase, spaces/special chars replaced with hyphens (e.g. "Artur Dos Santos" → "artur-dos-santos").
4. If the slug already exists, append a number (e.g. "artur-dos-santos-2").
5. Server creates the player record and returns the full join URL.
6. Dashboard adds the player to the list and displays their join URL with a "Copy" button.
7. DM shares the URL with the player out-of-band.

### DM sends a targeted message
1. DM dashboard: select player from list (or a dropdown), type message, hit send.
2. `POST /api/message` (or a socket emit) with `{ targetType: "player", targetPlayerId: "aria", body: "..." }`.
3. Server stores it, emits to room `player:aria` only.

### DM sends a broadcast
1. DM types in the broadcast box, hits send.
2. Server stores it as `target_type: "broadcast"`, emits to *all* connected player rooms + the DM's own combined view.

### DM joins dashboard
1. DM navigates to `/dm`.
2. If `DM_PIN` is set in config, server prompts for PIN before granting access.
3. PIN is validated server-side; a session cookie is set on success.
4. If no PIN is configured, access is granted immediately.

### Session reset
1. DM clicks "Clear Log" on the dashboard.
2. Confirmation prompt appears: "This will delete all messages. Players keep their accounts."
3. `POST /api/session/reset` deletes all rows from the `Message` table.
4. All connected player terminals are cleared via a socket broadcast (`terminal:clear` event).

### Player removal
1. DM clicks the remove button on a player in the dashboard.
2. Confirmation prompt appears.
3. `DELETE /api/players/:id` removes the player and all their associated messages.
4. If that player is currently connected, their socket is disconnected with a `"player removed"` reason.

### Future: automated event
1. Some other process (a combat tracker script, a macro button on the DM dashboard, etc.) calls `POST /api/log` with a target + templated text, e.g.:
   ```json
   { "targetType": "broadcast", "body": "Raider has taken 12 damage." }
   ```
2. Same pipeline as a DM-sent message — this is why "DM sends a message" and "system auto-generates a message" should hit the exact same internal function (`createMessage()`), just with a different `source` value. Build this abstraction from day one even though the automation trigger itself comes later.

### DM exports the session log

1. DM clicks "Export Log" on the dashboard (available any time, not just at session end — useful for a mid-session backup too).
2. DM is offered a choice: **combined transcript** (every message, all players, in chronological order — the DM's "what actually happened" record) or **per-player transcripts** (one file per player, just what that player saw).
3. **Per-player export** includes: all broadcast messages + all messages targeted specifically at that player, in chronological order. This is exactly what appeared on their terminal.
4. **Combined export** includes: all messages (broadcast + targeted) across all players, in chronological order. Includes the target player ID for each message so the DM can see who received what.
5. Server generates plain-text file(s) from the stored `Message` table, formatted like the terminal itself (`[timestamp] body`), and triggers a download. For per-player export with multiple players, bundle as a `.zip` so it's a single download.
6. No special processing needed beyond formatting — this is a straightforward read-and-render of existing stored data, since every message is already persisted with its target and timestamp.

---

## 7. API / Socket Design

**HTTP routes**
- `GET /player/:id` — serves the player terminal page
- `GET /dm` — serves the DM dashboard page
- `GET /api/players` — list all players (for DM dashboard)
- `POST /api/players` — create a new player (name → generates slug/id)
- `DELETE /api/players/:id` — remove a player and all their associated messages
- `GET /api/messages/:playerId` — full message history for one player (used on page load/reconnect)
- `POST /api/message` — create + dispatch a message (used by both DM manual send and, later, automation)
- `POST /api/session/reset` — delete all messages (keeps player list intact)
- `POST /api/auth/dm` — validate DM PIN, return session cookie
- `GET /api/export/combined` — returns the full combined transcript as a downloadable `.txt`
- `GET /api/export/player/:id` — returns one player's transcript as a downloadable `.txt`
- `GET /api/export/all` — returns a `.zip` bundling the combined transcript + every per-player transcript

**Socket.IO events**
- `join` (client → server): join a player room or the admin room
- `message:new` (server → client): a new line to append to the terminal
- `players:update` (server → dm client): connected/disconnected status changes
- `terminal:clear` (server → client): triggered after session reset, tells all player terminals to clear their display

**Validation rules**
- All `POST` endpoints must validate `body` length ≤ 2000 characters before processing.
- All `POST` endpoints must strip HTML tags from `body` and `display_name` before storing.
- Player slugs must match `/^[a-z0-9-]+$/` — reject invalid characters at the API layer.

Keep the automation surface (`POST /api/message` with a `source: "auto"` flag) in mind structurally now, even if the only caller for a while is the DM's own manual send button — this avoids a rewrite later.

---

## 8. UI/UX — Terminal Look

Reference: Fallout 3/NV Pip-Boy terminal.

- Black background, monospace font (e.g. `"Share Tech Mono"`, `"VT323"`, or system `monospace` fallback), green (`#33ff33` / `#4AF626`-ish) text.
- Subtle CRT effect: scanlines (repeating linear-gradient overlay), slight screen curvature/vignette optional, faint flicker/glow via `text-shadow`.
- New lines "type out" character by character (short delay per character, ~15-25ms) rather than appearing instantly — this is the single biggest thing that sells the Fallout feel.
- Each line prefixed with a timestamp or a `>` prompt marker, DM-authored lines vs. system/auto lines could use a subtle visual distinction (e.g. system lines in a slightly different shade) once automation exists.
- Auto-scroll to bottom on new message, but don't yank focus if the player has scrolled up to read history.
- DM dashboard is intentionally *not* styled as a terminal — it's a normal, functional control panel (player list, per-player textbox + send, broadcast textbox + send). Clarity over theming here.
- **DM dashboard — player management section**:
  - **Add Player**: a textbox labeled "Player Name" + an "Add Player" button. On submit, the new player appears in the list below with their join URL.
  - **Player list row**: each row shows the player's name, connection status (green dot = connected, grey = offline), their full join URL in a read-only input field with a one-click "Copy" button, and a "Remove" button.
- **Favicon**: use a green Pip-Boy style terminal icon (SVG or 32x32 PNG) for all pages.
- **Page titles**: player terminal pages show `TERMINAL // {player_name}` in the browser tab; DM dashboard shows `WASTELAND TERMINAL // DM`.

---

## 9. Project Structure (suggested)

```
/server
  server.js          # Express + Socket.IO bootstrap
  db.js              # SQLite setup + queries
  routes/
    players.js
    messages.js
    auth.js           # DM PIN validation
  sockets.js         # Socket.IO room/event handling
/config
  config.js          # DM_PIN, port, and other settings
/public
  /player
    index.html
    terminal.css
    terminal.js
  /dm
    index.html
    dashboard.css
    dashboard.js
  favicon.svg        # Green Pip-Boy terminal icon
/data
  session.sqlite
  /backup            # Auto-created on startup
package.json
```

---

## 10. Build Phases

**Phase 1 — MVP**
- Server with Express + Socket.IO, SQLite storage.
- Player terminal page: connects, loads history, renders live incoming messages with typewriter effect.
- DM dashboard: player list, per-player send box, broadcast send box.
- DM can add new players (generates a shareable link).
- DM can export the combined transcript and per-player transcripts as text (see §6) — cheap to build alongside the message storage, no reason to defer it to a later phase.
- Input validation: max 2000 characters per message, server-side HTML tag stripping.
- SQLite backup on startup (copy to `data/backup/`).

**Phase 2 — Quality of life**
- DM "God view" combined feed.
- Simple PIN protection per player link.
- Sound effect on new message.
- DM PIN authentication (hardcoded in config).
- Session reset ("Clear Log" button).
- Player removal.
- Favicon + themed page titles.

**Phase 3 — Automation**
- `POST /api/message` opened up as a documented automation endpoint.
- A few built-in DM macro buttons (damage dealt, travel time passed, custom templates with fill-in-the-blank fields) that call the same endpoint internally.

---

## 11. Notes for the Coding Agent

- Networking: the server should bind to `0.0.0.0` (not just `localhost`) so it's reachable from other devices on the same Wi-Fi network. The DM will need to share their machine's local IP (e.g. `192.168.1.23:3000`) with players — worth printing this to the console on server start for convenience.
- Print each player's full join URL to the console on server start: `http://<local-ip>:3000/player/<slug>` — makes it easy for the DM to copy/paste and share.
- No internet-facing deployment, no HTTPS requirement, no auth system beyond an optional simple PIN — this is a same-room, same-Wi-Fi tool.
- Prioritize the "each player is an isolated room + DM can target one or all" mechanic above all else — it's the crux of the whole system. Get that solid before touching styling or automation.
- Enforce input validation at the API layer (2000 char limit, HTML strip), not just the client — clients can be bypassed.
- Use `better-sqlite3` with WAL mode for concurrent read safety.
- On startup, copy `data/session.sqlite` to `data/backup/session-<timestamp>.sqlite` before opening — simple corruption recovery.
- Player slugs must be validated against `/^[a-z0-9-]+$/` — reject invalid characters at the API layer.
