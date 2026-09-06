# THEMES SYSTEM — Implementation Specification

> **Implementation type:** Subagent-driven development
> **Plan file:** `docs/superpowers/plans/2026-08-08-themes.md`
> **Spec file:** `docs/superpowers/specs/2026-08-08-themes-design.md`
> **Plan:** 11 tasks, ~62 min estimated

## Overview

Add a visual theme system to the Wasteland Terminal. The DM picks a theme from a dropdown on the dashboard, and it applies to the DM dashboard, quest journal, and all player terminals in real-time via Socket.IO.

## Themes

| Theme ID | Name | Background | Text | Font | Effects |
|----------|------|-----------|------|------|---------|
| `pipboy` | Pip-Boy | #0a0a0a | #33ff33 | Share Tech Mono | CRT scanlines, green glow |
| `oldpaper` | Old Paper | #f4e8c1 | #3e2a14 | Caveat (handwritten) | Paper texture background |
| `cave` | Cave Writings | #1a1a1a | #c9b896 | MedievalSharp | Stone texture background |
| `noir` | Noir Detective | #f6f4ec | #1a1a1a | Special Elite (typewriter) | Aged paper (multiply blend), film grain |

> **Noir = 1950s broadsheet:** the noir theme renders all three surfaces as a
> classic newspaper (*The New York Times* masthead, serif headlines with double
> rules, typewriter datelines/bylines, underline form fields, roster rows with
> hairlines). It's intended for real-world campaigns (e.g. Call of Cthulhu).
> Newspaper styling is scoped entirely under `body.theme-noir` overrides in
> each CSS file — no HTML/JS behavior changes.

## Architecture

### CSS Variables

All colors, fonts, and backgrounds use CSS custom properties on `<body>`. Each theme class overrides these:

```css
body.theme-pipboy {
  --bg: #0a0a0a;
  --text: #33ff33;
  --text-dim: #1a5c1a;
  --accent: #2db82d;
  --border: #1a3d1a;
  --danger: #ff4444;
  --danger-bg: rgba(255, 68, 68, 0.1);
  --btn-bg: #33ff33;
  --btn-text: #0a0a0a;
  --btn-hover: #4af626;
  --card-bg: #111;
  --input-bg: #0a0a0a;
  --font-main: "Share Tech Mono", "VT323", monospace;
  --bg-texture: none;
  --overlay: repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px);
  --glow: 0 0 10px rgba(51, 255, 51, 0.5);
  --glow-strong: 0 0 20px rgba(51, 255, 51, 0.5);
}
```

### Full Variable Map

| Variable | Pip-Boy | Old Paper | Cave | Noir |
|----------|---------|-----------|------|------|
| `--bg` | #0a0a0a | #f4e8c1 | #1a1a1a | #f6f4ec |
| `--text` | #33ff33 | #3e2a14 | #c9b896 | #1a1a1a |
| `--text-dim` | #1a5c1a | #7a6548 | #7a6e54 | #5a5548 |
| `--accent` | #2db82d | #8b6914 | #8b7d5a | #3a3530 |
| `--border` | #1a3d1a | #c9b88a | #3a3228 | #b8ad94 |
| `--danger` | #ff4444 | #8b2500 | #a63a1a | #6a1a1a |
| `--danger-bg` | rgba(255,68,68,0.1) | rgba(139,37,0,0.1) | rgba(166,58,26,0.1) | rgba(106,26,26,0.1) |
| `--btn-bg` | #33ff33 | #8b6914 | #8b7d5a | #1a1a1a |
| `--btn-text` | #0a0a0a | #f4e8c1 | #1a1a1a | #f6f4ec |
| `--btn-hover` | #4af626 | #a67c1a | #a69470 | #3a3a3a |
| `--card-bg` | #111 | #ebe0c4 | #242018 | #efece0 |
| `--input-bg` | #0a0a0a | #f9f1dc | #1a1714 | #faf8f1 |
| `--font-main` | "Share Tech Mono" | "Caveat" | "MedievalSharp" | "Special Elite" |
| `--bg-texture` | none | url("/images/paper-texture.png") | url("/images/stone-texture.png") | url("/images/grunge-paper.jpg") |
| `--overlay` | repeating-linear-gradient... | none | none | none |
| `--glow` | 0 0 10px rgba(51,255,51,0.5) | none | none | none |

### Noir-only typography variables

Only the noir theme defines these (used by its newspaper overrides):

| Variable | Noir value | Used for |
|----------|-----------|----------|
| `--font-masthead` | "Old Standard TT", Georgia, serif | Nameplate "The New York Times" |
| `--font-headline` | "Old Standard TT", Georgia, serif | Section headlines, broadcast headlines |
| `--font-body` | "Source Serif 4", Georgia, serif | Body text, paragraphs, news briefs |
| `--rule` | #1a1a1a | Heavy double rules under masthead/headlines |
| `--hairline` | #b8ad94 | Light separator lines between rows/items |
| `--ink-tint` | rgba(26,26,26,0.06) | Hover tint on newspaper surfaces |

### Masthead markup

Each page (auth screen, dashboard, quest journal, player terminal) has:

```html
<div class="masthead">
  <span class="masthead-title">The New York Times</span>
  <span class="masthead-date"></span>
</div>
```

- Hidden by default (`.masthead { display: none }`), shown only under `body.theme-noir`.
- `.masthead-date` is filled by JS on load (today's date, pt-BR, "EDIÇÃO DA MANHÃ").
- The player terminal's masthead is compact (`clamp(1.5rem, 4.5vw, 2.2rem)`) since it
  shares the screen with the message feed; DM pages use `clamp(1.9rem, 5vw, 2.7rem)`.

### Newspaper styling summary (noir overrides)

- **Masthead:** centered nameplate + date line, thick 3px + thin 1px double rule below.
- **Section headers** (`section h2` / panel `h2`): Old Standard TT bold serif, double rule beneath.
- **Player terminal:** broadcasts render as front-page headlines (serif bold, double rule above,
  typewriter dateline); private messages are serif paragraphs; system messages are small-caps
  notices. The time is a `.line-time` span, body is a `.line-body` span (inline in other themes).
- **DM feed:** each message is a news brief with typewriter dateline; broadcasts are headline briefs.
- **Forms:** underline fields (no boxes), squared ink buttons.
- **Cards:** player cards and quest items lose their boxed look — hairline-separated roster rows.
- CRT vignette, flicker, and glow are disabled under noir.

## Theme Switching Flow

1. DM selects theme from dropdown in header
2. `PUT /api/config/theme` saves to `config` table
3. Server emits `theme:changed` Socket.IO event to all clients
4. All clients set `document.body.className = "theme-" + theme`
5. CSS variables update instantly — no page reload
6. Theme persists in database across sessions

## API Endpoints

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/config/theme` | — | `{ theme: "pipboy" }` |
| PUT | `/api/config/theme` | `{ theme: "oldpaper" }` | `{ theme: "oldpaper" }` |

Valid theme values: `pipboy`, `oldpaper`, `cave`, `noir`

## Socket.IO Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `theme:changed` | Server → All clients | `{ theme: "pipboy" }` |

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Default row: `key: 'theme', value: 'pipboy'`

## Google Fonts Required

Add to all HTML `<head>` sections:

```html
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=MedievalSharp&family=Old+Standard+TT:wght@400;700&family=Share+Tech+Mono&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Special+Elite&display=swap" rel="stylesheet">
```

## Texture Images

| File | Used By | Size | Description |
|------|---------|------|-------------|
| `public/images/paper-texture.png` | Old Paper theme | ~5KB | Tileable parchment grain |
| `public/images/stone-texture.png` | Cave theme | ~8KB | Tileable dark rock |
| `public/images/grunge-paper.jpg` | Noir theme | ~300KB | Aged crumpled paper (1920×1536, shadow-lifted) — non-tileable, served `cover` + `multiply` blend over the cream background |

## UI Elements

### Theme Dropdown (DM Dashboard + Quest Journal)

```html
<select id="theme-select">
  <option value="pipboy">PIP-BOY</option>
  <option value="oldpaper">OLD PAPER</option>
  <option value="cave">CAVE WRITINGS</option>
  <option value="noir">NOIR DETECTIVE</option>
</select>
```

Style the dropdown to match each theme using the CSS variables.

## Files to Modify

| File | Change |
|------|--------|
| `server/db.js` | Add `config` table + `configQueries` |
| `server/routes/config.js` | **Create** — theme API routes |
| `server/server.js` | Register `/api/config` routes |
| `server/sockets.js` | Emit `theme:changed` on connection |
| `public/dm/dashboard.css` | Replace hardcoded colors with CSS variables |
| `public/dm/quests.css` | Replace hardcoded colors with CSS variables |
| `public/player/terminal.css` | Replace hardcoded colors with CSS variables |
| `public/dm/index.html` | Add theme dropdown + Google Fonts link |
| `public/dm/quests.html` | Add theme dropdown + Google Fonts link |
| `public/player/terminal.html` | Add Google Fonts link |
| `public/dm/dashboard.js` | Theme switcher + Socket.IO listener |
| `public/dm/quests.js` | Theme switcher + Socket.IO listener |
| `public/player/terminal.js` | Listen for `theme:changed` |

## Files to Create

| File | Purpose |
|------|---------|
| `server/routes/config.js` | Theme config API |
| `public/images/paper-texture.png` | Old Paper texture |
| `public/images/stone-texture.png` | Cave texture |
| `public/images/noise.png` | Noir grain |

## CSS Refactoring Guide

When refactoring CSS files, replace these hardcoded values:

| Hardcoded | Replace With |
|-----------|-------------|
| `#0a0a0a` | `var(--bg)` or `var(--input-bg)` |
| `#000` | `var(--bg)` |
| `#33ff33` | `var(--text)` |
| `#1a3d1a` | `var(--border)` |
| `#2db82d` | `var(--accent)` |
| `#1a5c1a` | `var(--text-dim)` |
| `#ff4444` | `var(--danger)` |
| `#111` | `var(--card-bg)` |
| `#333` | `var(--border)` |
| `#4af626` | `var(--btn-hover)` |
| `#666`, `#999` | `var(--text-dim)` |
| `rgba(51,255,51,0.5)` | `var(--glow)` |
| `rgba(51,255,51,0.4)` | `var(--glow)` |
| `rgba(51,255,51,0.3)` | `var(--glow)` |
| `font-family: "Share Tech Mono"...` | `font-family: var(--font-main)` |

Keep `rgba(51,255,51,0.1)` and `rgba(51,255,51,0.05)` as-is — they're fine for subtle backgrounds.

## Verification

1. Start server: `node server/server.js`
2. Open `http://localhost:3000/dm`
3. Default theme = Pip-Boy (green on black)
4. Switch each theme from dropdown — all should work
5. Refresh page — theme persists
6. Open player terminal — theme matches DM
7. Switch theme on DM — player updates in real-time
