# Fallout Radio Pip-Boy Screen

> **Implementation type:** Server-authoritative radio with Pip-Boy UI
> **Date:** 2026-08-31

## Overview

Add a `/radio` page to the Wasteland Terminal that simulates a Fallout Pip-Boy radio screen. The radio plays autonomously — music, DJ commentary, and news segments — with all connected clients hearing the same thing simultaneously (server-authoritative). The UI features Monofonto font, green-on-black Pip-Boy styling, animated radio wave, fake station selectors, and a live clock.

## Audio Inventory

| Folder | Count | Format | Purpose |
|--------|-------|--------|---------|
| `music` | 18 | FLAC | Songs |
| `músicas` | 18 | M4A | Per-song DJ flavor comments (mapped 1:1 to songs) |
| `notícias` | 6 | M4A | News segment voice lines |
| `musica - noticia` | 6 | M4A | Music→News transition audio |
| `fim noticia` | 8 | M4A | End-of-news jingles |
| `flavor audio` | 10 | M4A | Random DJ flavor audio |

### Song ↔ Flavor Mapping

Songs and their flavor comments are mapped by order in `Músicas & Rádio Fallout New Orleans .md`:

| Index | Song File | Flavor File |
|-------|-----------|-------------|
| 1 | Blind Willie McTell - I Got the Cross the River Jordan.flac | Recording.m4a |
| 2 | Champion Jack Dupree - Junker's Blues.flac | Recording (2).m4a |
| 3 | Johnny Shines - Travelling Back Home.flac | Recording (3).m4a |
| 4 | Robert Johnson - Come On In My Kitchen.flac | Recording (4).m4a |
| 5 | Furry Lewis - Judge Harsh Blues.flac | Recording (5).m4a |
| 6 | Rev. Gary Davis - Samson And Delilah.flac | Recording (6).m4a |
| 7 | John Lee Hooker - Boom Boom.flac | Recording (7).m4a |
| 8 | Lightnin' Hopkins - What'd I Say_.flac | Recording (8).m4a |
| 9 | John Lee Hooker - Boogie Chillen'.flac | Recording (9).m4a |
| 10 | B.B. King - The Thrill Is Gone.flac | Recording (10).m4a |
| 11 | Robert Johnson - Hell Hound On My Trail.flac | Recording (11).m4a |
| 12 | Big Joe Williams - Baby Please Don't Go.flac | Recording (12).m4a |
| 13 | Bobby Day - Rockin' Robin.flac | Recording (13).m4a |
| 14 | Lightnin' Hopkins - Mojo Hand.flac | Recording (14).m4a |
| 15 | Robert Petway - Catfish Blues.flac | Recording (15).m4a |
| 16 | Louis Armstrong - St. James Infirmary (Gambler's Blues).flac | Recording (16).m4a |
| 17 | Lee Dorsey - Working in the Coal Mine.flac | Recording (17).m4a |
| 18 | Louis Armstrong - A Kiss to Build a Dream On.flac | Recording (18).m4a |

## Audio Scheduling Flow

Server-authoritative: the server tracks state and broadcasts `radio:play` events via Socket.IO. All clients play the same audio at the same time.

### State Machine

```
IDLE
  ↓ (pick next from queue)
PLAYING { type, title, filePath, duration }
  ↓ (audio ends)
EVALUATE → pick next action
  ↓
PLAYING → EVALUATE → ... (continuous loop)
```

### Rules

1. **Music block**: 2-3 songs play in sequence (random batch size).
2. **After each song**: 30% chance to play that song's flavor comment (indexed mapping from .md). If triggered, play flavor before moving to next song.
3. **After 2-3 songs**: Trigger news segment:
   - Play one transition audio (`musica - noticia`) — random pick
   - Play 1-2 news clips (`notícias`) — random selection, no repeat until all used
   - Play one end-of-news jingle (`fim noticia`) — random pick
4. **Between any two sounds**: 15% chance to play a random flavor audio (`flavor audio`). Roll independently at each transition point.
5. **After news segment**: Start new music block (2-3 songs).

### Queue Behavior

- Songs shuffle without repeat until all 18 play, then reshuffle.
- News clips shuffle without repeat until all 6 play, then reshuffle.
- Flavor comments: per-song, no repeat tracking needed (each song only plays its own).
- Transition and end-of-news jingles: random pick each time, no dedup.

### Track Duration & Advancement

The server uses a **client-reported `ended` event** to advance the queue:

1. Server sends `radio:play` with `{ type, title, filePath }` to all clients.
2. The client that receives the event creates an `Audio` element and plays the file.
3. When the audio finishes, the client emits `radio:trackEnded` back to the server.
4. Server advances the queue and broadcasts the next `radio:play`.

**Fallback for missed `ended` events:** Server uses a conservative timeout (4 minutes for songs, 45 seconds for commentary/news). If the timeout fires before `trackEnded` arrives, server advances anyway. This prevents the radio from getting stuck if a client disconnects mid-play.

**Duration detection on client:** When loading an audio file, the client can read `audio.duration` once the `loadedmetadata` event fires. This value is sent with `trackEnded` so the server can log actual durations for future scheduling.

### Queue Advancement Priority

- If multiple clients are connected, the first `trackEnded` to arrive advances the queue.
- Subsequent `trackEnded` events for the same track are ignored (idempotent).

## UI Layout

```
┌─────────────────────────────────────────────────┐
│  HP 45/45   LVL 08   WG 135/200     [real time] │  ← stats bar (live clock)
├──────────────┬──────────────────────────────────┤
│  RADIO       │  RÁDIO DELTA ROOTS               │  ← station header
│              │                                   │
│ ▸ Galaxy News│    ╭─────────────────────╮        │
│   Radio      │    │  ~~~∿∿∿~~~∿∿∿~~~   │        │  ← animated wave
│              │    │  ∿∿~~~∿∿∿~~~∿∿∿   │        │
│ ▸ Diamond    │    ╰─────────────────────╯        │
│   City Radio │                                   │
│              │  NOW PLAYING:                     │
│ ▸ Radio New  │  B.B. King - The Thrill Is Gone   │  ← track title
│   Vegas      │                                   │
│              │  "Blues Man"                      │  ← DJ name
│ ▸ Mojave     │                                   │
│   Music      │  ──────────────── ◆ ──────────── │  ← volume slider
│              │                                   │
│ ▸ Enclave    │                                   │
│   Radio      │                                   │
│              │                                   │
│ ▸ Agatha's   │                                   │
│   Station    │                                   │
├──────────────┴──────────────────────────────────┤
│  STATS  │  EFFECTS  │  DATA  │  MAP  │  RADIO   │  ← fake tab bar
└─────────────────────────────────────────────────┘
```

### Elements

| Element | Behavior |
|---------|----------|
| Stats bar | Static HP/LVL/WG values, live clock (actual time, updated every second) |
| Station list | Static text, non-interactive, green text with selection indicator (▸) |
| Station header | "RÁDIO DELTA ROOTS" — always visible |
| Wave animation | CSS/JS looping animated wave — continuous, not audio-reactive |
| Now playing | Shows current track title or news segment label |
| DJ name | Always shows "Blues Man" |
| Volume slider | Controls audio volume, Pip-Boy styled |
| Tab bar | Static text, non-interactive, "RADIO" tab highlighted |

## Visual Design

### Font

- **Monofonto** (the Fallout Pip-Boy font)
- Self-hosted: `public/fonts/monofonto.otf` (renamed from `monofonto rg.otf`)
- Applied via `@font-face` to all text on the page

### Color Scheme

Uses the existing `theme-pipboy` CSS variables:

| Variable | Value |
|----------|-------|
| `--bg` | #0a0a0a |
| `--text` | #33ff33 |
| `--text-dim` | #1a5c1a |
| `--accent` | #2db82d |
| `--border` | #1a3d1a |
| `--glow` | 0 0 10px rgba(51, 255, 51, 0.5) |
| `--glow-strong` | 0 0 20px rgba(51, 255, 51, 0.5) |

### CRT Effects

- Scanline overlay (repeating-linear-gradient)
- Subtle flicker animation
- Radial vignette (CRT curvature feel)
- Text glow (`text-shadow`)

### Wave Animation

A looping CSS animation of an SVG or canvas wave. Not audio-reactive — just a constant animated oscillation that gives the feel of a live radio signal. Uses multiple overlapping sine waves with different speeds and amplitudes for a natural look.

## Architecture

### Server Side

#### `server/radio.js` — Radio State Machine

Exports:
- `RadioStateMachine` class
- Manages playlist queue, scheduling, and state transitions
- Emits events via Socket.IO when tracks change
- Handles song shuffle, news rotation, flavor chance logic

State:
```javascript
{
  state: "idle" | "playing" | "transitioning",
  currentTrack: { type, title, filePath, duration },
  musicQueue: [...],         // shuffled song indices
  newsQueue: [...],          // shuffled news indices
  songsSinceNews: 0,         // count of songs in current block
  blockTarget: 2,            // random 2 or 3
  pendingFlavor: null,       // flavor to play after current track
}
```

Events emitted:
- `radio:play` — `{ type, title, filePath, duration }` — sent to all clients
- `radio:sync` — full state snapshot — sent to newly connected clients

#### `server/sockets.js` — Modify

On client connection, emit `radio:sync` with current radio state.

#### `server/server.js` — Modify

- Add `GET /radio` route serving `public/radio/index.html`
- Initialize `RadioStateMachine` on server start

### Client Side

#### `public/radio/index.html`

Single page with:
- Stats bar, station list, wave area, now playing display, volume slider, tab bar
- Loads `radio.css` and `radio.js`
- Includes Socket.IO client

#### `public/radio/radio.css`

- Full Pip-Boy styling using CSS variables
- Wave animation keyframes
- Responsive layout
- CRT effects (scanlines, glow, flicker)
- Monofonto font via `@font-face`

#### `public/radio/radio.js`

- Connects to Socket.IO
- Listens for `radio:play` → creates `Audio` element, plays file, updates "now playing" UI
- Listens for `radio:sync` → syncs to current state (for mid-session joins)
- Manages volume slider
- Updates live clock every second

### Audio Serving

All audio files served via Express static middleware from `public/radio/`. The server references files by relative path, and clients receive the path via Socket.IO events to play them.

## Files to Create

| File | Purpose |
|------|---------|
| `public/radio/index.html` | Radio page |
| `public/radio/radio.css` | Pip-Boy styling, wave animation |
| `public/radio/radio.js` | Client-side player, Socket.IO listener |
| `server/radio.js` | Server-side radio state machine |
| `public/fonts/monofonto.otf` | Monofonto font file (renamed from `monofonto rg.otf` to remove space) |

## Files to Modify

| File | Change |
|------|--------|
| `server/server.js` | Add `/radio` route, initialize radio state machine |
| `server/sockets.js` | Emit `radio:sync` on client connection |

## Audio File Placement

Copy audio files from `fallout radio/` to `public/radio/` with renamed folders:

```
public/radio/
├── music/              ← from fallout radio/music/
├── music-flavor/       ← from fallout radio/músicas/
├── news/               ← from fallout radio/notícias/
├── news-transition/    ← from fallout radio/musica - noticia/
├── news-end/           ← from fallout radio/fim noticia/
└── flavor/             ← from fallout radio/flavor audio/
```

## Verification

1. Start server: `node server/server.js`
2. Open `http://localhost:3000/radio`
3. Verify Pip-Boy styling, Monofonto font, CRT effects
4. Verify wave animation plays continuously
5. Verify live clock updates
6. Verify audio plays — songs play in sequence
7. Verify news segments trigger after 2-3 songs
8. Verify flavor comments play after songs (~30% chance)
9. Verify flavor audio plays between sounds (~15% chance)
10. Open second browser tab — verify both tabs hear same audio (server-authoritative)
11. Join mid-session — verify sync to current track
