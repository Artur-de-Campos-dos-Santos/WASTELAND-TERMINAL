# Quest Journal Design Spec

**Date:** 2026-08-08
**Feature:** DM Dashboard Quest Journal
**Status:** Approved

## Overview

Add a quest journal to the DM dashboard — a dedicated page where the DM can create, manage, and track quests and their stages. Inspired by Fallout 4's quest system, each quest has ordered stages that can be marked done, with optional broadcasts fired when stages complete.

## Goals

- Let DMs create and organize quests during a session
- Track quest progression through ordered stages
- Auto-broadcast messages to players when specific quest stages are reached
- Auto-broadcast on the final stage if configured
- Support flexible stage reordering via drag-and-drop
- Allow adding stages mid-quest as the story evolves

## Data Model

### `quest` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| name | TEXT NOT NULL | Quest name |
| description | TEXT | Optional summary/flavor text |
| status | TEXT NOT NULL DEFAULT 'active' | One of: `active`, `completed`, `failed` |
| sort_order | INTEGER NOT NULL DEFAULT 0 | For ordering quests in the list |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

### `quest_stage` table

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| quest_id | INTEGER NOT NULL | FK → quest.id ON DELETE CASCADE |
| name | TEXT NOT NULL | Stage name |
| broadcast_text | TEXT | Nullable — message to broadcast when stage is done |
| sort_order | INTEGER NOT NULL DEFAULT 0 | For drag-and-drop ordering |
| is_done | INTEGER NOT NULL DEFAULT 0 | 0 = pending, 1 = completed |
| done_at | DATETIME | Set when is_done flips to 1 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

## UI Layout

### Quest Journal Page (`/dm/quests`)

Two-panel layout with Fallout Pip-Boy aesthetic:

**Left Panel — Quest List:**
- Scrollable list of all quests
- Each quest shows: status indicator (green dot = active, checkmark = completed, red X = failed) + name
- "+ New Quest" button at the bottom
- Click a quest to select it and show details in the right panel

**Right Panel — Quest Detail:**
- Quest name (click to edit inline)
- Description (click to edit inline)
- Status dropdown (Active / Completed / Failed)
- Stage list with drag handles, checkboxes, names, broadcast text
- "+ Add Stage" button below the stage list
- "Mark Complete" and "Mark Failed" buttons at the bottom
- Trash icon to delete the quest

### Stage Row Layout

```
⠿  [☐/☑]  Stage Name              [broadcast text preview]  [×]
```

- `⠿` — Drag handle for reordering
- `☐/☑` — Checkbox to toggle done state
- Stage Name — Click to edit inline
- Broadcast text — Click to edit, shows preview or "(none)"
- `×` — Delete stage button

## Navigation

- Dashboard (`/dm`) gets a new "QUEST JOURNAL" button in the header
- Quest journal page (`/dm/quests`) has a "← Back" button to return to dashboard

## API Endpoints

### Quests

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quests` | List all quests ordered by sort_order |
| POST | `/api/quests` | Create a new quest (body: `{name, description?}`) |
| PUT | `/api/quests/:id` | Update quest (body: `{name?, description?, status?, sort_order?}`) |
| DELETE | `/api/quests/:id` | Delete quest and cascade-delete all stages |

### Quest Stages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quests/:id/stages` | List stages for a quest, ordered by sort_order |
| POST | `/api/quests/:id/stages` | Add a stage (body: `{name, broadcast_text?}`) |
| PUT | `/api/quests/:id/stages/:stageId` | Update stage (body: `{name?, broadcast_text?, is_done?, sort_order?}`) |
| DELETE | `/api/quests/:id/stages/:stageId` | Delete a stage |
| PUT | `/api/quests/:id/stages/reorder` | Bulk update sort_order (body: `{stageIds: [1,2,3]}`) |

## Broadcast Behavior

### When a stage is marked done:
1. Server receives `PUT /api/quests/:id/stages/:stageId` with `is_done: 1`
2. Server sets `done_at` to current timestamp
3. Server checks if this was the **last undone stage**:
   - Query: `SELECT COUNT(*) as remaining FROM quest_stage WHERE quest_id = ? AND is_done = 0`
   - If `remaining == 0` after this update → this was the last undone stage
4. If last undone stage AND `broadcast_text` is not null/empty:
   - Send broadcast via `POST /api/message` with `targetType: "broadcast"` and the broadcast_text as `body`
   - Message appears in God View and all player terminals in real-time
5. If last undone stage AND `broadcast_text` IS null/empty → no broadcast

### Broadcast text editing:
- Each stage has an optional broadcast_text field
- If set, shows a preview in the stage row (truncated with ellipsis)
- If not set, shows "(none)" in grey

## Files to Create

| File | Purpose |
|------|---------|
| `public/dm/quests.html` | Quest journal page |
| `public/dm/quests.css` | Quest journal styles (Fallout theme) |
| `public/dm/quests.js` | Quest journal client-side logic |
| `server/routes/quests.js` | API routes for quests and stages |

## Files to Modify

| File | Change |
|------|--------|
| `server/db.js` | Add `quest` and `quest_stage` tables + prepared queries |
| `server/server.js` | Register `/api/quests` routes + serve `/dm/quests` page |
| `public/dm/index.html` | Add "QUEST JOURNAL" button to header |

## UI Behavior Details

### Creating a quest:
1. DM clicks "+ New Quest"
2. Right panel shows a form with Name (required) and Description (optional) fields
3. DM fills in fields and clicks "Save"
4. Quest is created with status "active", appears in left panel, is auto-selected

### Adding a stage:
1. DM clicks "+ Add Stage" in the quest detail panel
2. A new stage row appears at the bottom of the list with empty name field focused
3. DM types the stage name and optionally adds broadcast text
4. Stage is saved when the DM clicks away or presses Enter

### Reordering stages:
1. DM grabs the drag handle (⠿) on a stage
2. Drags up or down to reorder
3. On drop, all stage sort_order values are updated via the reorder API

### Marking a stage done:
1. DM clicks the checkbox on a stage
2. `is_done` flips to 1, `done_at` is set
3. Stage gets a visual "done" style (strikethrough or dimmed)
4. If this was the last undone stage and broadcast_text exists → broadcast fires

### Marking quest complete/failed:
1. DM clicks "Mark Complete" or "Mark Failed" button
2. Quest status updates, quest list indicator changes
3. Stages remain as-is (preserved for reference)

## Edge Cases

- **No stages yet**: Quest shows "No stages yet. Add one!" placeholder
- **All stages done**: All checkboxes checked, no remaining undone stages
- **Adding a stage after all others are done**: New stage is pending, DM can check it to trigger broadcast
- **Broadcast text is empty string**: Treats as null — no broadcast fires
- **Deleting a quest with done stages**: Cascade deletes everything, no broadcast fires
- **Reordering with drag-and-drop**: Only affects `sort_order`, no other data changes
