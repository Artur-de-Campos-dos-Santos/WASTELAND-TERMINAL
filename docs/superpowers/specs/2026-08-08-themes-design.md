# Themes System Design Spec

**Date:** 2026-08-08
**Feature:** Visual Theme System
**Status:** Approved

## Overview

Add a visual theme system to the Wasteland Terminal. The DM picks a theme from a dropdown, and it applies to both the DM dashboard and all player terminals in real-time.

## Goals

- Let DMs switch visual themes on the fly
- Themes apply to DM dashboard, quest journal, and all player terminals
- Real-time theme sync via Socket.IO — players see the change instantly
- Theme persists across sessions
- Each theme has unique colors, fonts, and optional texture backgrounds

## Themes

| Theme | Background | Text | Font | Effects |
|-------|-----------|------|------|---------|
| **Pip-Boy** (default) | #0a0a0a | #33ff33 | Share Tech Mono | CRT scanlines, green glow |
| **Old Paper** | #f4e8c1 | #3e2a14 | Caveat (handwritten) | Paper texture background |
| **Cave Writings** | #1a1a1a | #c9b896 | MedievalSharp | Stone texture background |
| **Noir Detective** | #e8dfc4 | #1a1a1a | Special Elite (typewriter) | Yellowed paper, film grain |

## Architecture

### CSS Variables

All colors, fonts, and backgrounds are defined as CSS custom properties on `<body>`. Each theme class overrides these variables:

```css
body.theme-pipboy {
  --bg: #0a0a0a;
  --text: #33ff33;
  --text-dim: #1a5c1a;
  --accent: #2db82d;
  --border: #1a3d1a;
  --danger: #ff4444;
  --font-main: "Share Tech Mono", "VT323", monospace;
  --bg-texture: none;
  --overlay: repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px);
  --glow: 0 0 10px rgba(51, 255, 51, 0.5);
}

body.theme-oldpaper {
  --bg: #f4e8c1;
  --text: #3e2a14;
  --text-dim: #7a6548;
  --accent: #8b6914;
  --border: #c9b88a;
  --danger: #8b2500;
  --font-main: "Caveat", cursive;
  --bg-texture: url("/images/paper-texture.png");
  --overlay: none;
  --glow: none;
}
```

### Theme Switching Flow

1. DM clicks theme dropdown in header
2. `PUT /api/config/theme` saves to server database
3. Server emits `theme:changed` event to all connected sockets
4. All clients set `document.body.className` to the new theme class
5. CSS variables update instantly — no page reload

### Server-Side Config

A `config` table stores key-value pairs:

```sql
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Theme is stored as `key: 'theme', value: 'pipboy'`.

API endpoints:
- `GET /api/config/theme` — returns `{ theme: "pipboy" }`
- `PUT /api/config/theme` — accepts `{ theme: "oldpaper" }`, saves and broadcasts

### Socket.IO Event

- Event name: `theme:changed`
- Payload: `{ theme: "pipboy" }`
- Emitted to all clients (broadcast)

## Texture Images

Three small tileable PNGs for background textures:

- `public/images/paper-texture.png` — subtle parchment grain (~5KB)
- `public/images/stone-texture.png` — dark rock surface (~8KB)
- `public/images/noise.png` — film grain for noir (~2KB)

Pip-Boy uses CSS scanlines instead of a texture image.

## UI Integration

### DM Dashboard Header

A dropdown added to `.header-actions`:

```html
<select id="theme-select">
  <option value="pipboy">PIP-BOY</option>
  <option value="oldpaper">OLD PAPER</option>
  <option value="cave">CAVE WRITINGS</option>
  <option value="noir">NOIR DETECTIVE</option>
</select>
```

### Quest Journal Header

Same dropdown added to the quest journal header.

### Player Terminal

No UI controls — receives theme via Socket.IO event.

## Files to Modify

| File | Change |
|------|--------|
| `public/dm/dashboard.css` | Replace hardcoded colors with CSS variables |
| `public/dm/quests.css` | Replace hardcoded colors with CSS variables |
| `public/player/terminal.css` | Replace hardcoded colors with CSS variables |
| `public/dm/index.html` | Add theme dropdown in header |
| `public/dm/quests.html` | Add theme dropdown in header |
| `public/dm/dashboard.js` | Theme switcher logic + Socket.IO listener |
| `public/dm/quests.js` | Theme switcher logic + Socket.IO listener |
| `public/player/terminal.js` | Listen for `theme:changed` event |
| `server/server.js` | Add theme config routes + Socket.IO broadcast |
| `server/db.js` | Add `config` table |

## Files to Create

| File | Purpose |
|------|---------|
| `public/images/paper-texture.png` | Old Paper background texture |
| `public/images/stone-texture.png` | Cave Writings background texture |
| `public/images/noise.png` | Noir Detective film grain |

## Edge Cases

- **New player connects**: Server sends current theme on connection
- **Invalid theme value**: Server rejects with 400 error
- **Theme dropdown sync**: All open dashboard/quest tabs update when DM changes theme
- **No texture for Pip-Boy**: Uses CSS scanlines only, `--bg-texture: none`
