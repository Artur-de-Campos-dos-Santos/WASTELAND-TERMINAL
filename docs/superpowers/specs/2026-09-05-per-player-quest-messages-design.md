# Per-Player Quest Stage Messages

## Overview

Each quest stage can have custom messages per player. When a stage is completed, each player receives their tailored message. Players without a custom message receive the existing `broadcast_text` as a fallback.

## Database

New table `quest_stage_player_message`:

```sql
CREATE TABLE quest_stage_player_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stage_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  message_text TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (stage_id) REFERENCES quest_stage(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE CASCADE,
  UNIQUE(stage_id, player_id)
);
```

- `stage_id` links to `quest_stage.id`
- `player_id` links to `player.id`
- `message_text` is the custom message for this player at this stage
- `UNIQUE(stage_id, player_id)` ensures one message per player per stage
- The existing `quest_stage.broadcast_text` column remains as the default/fallback

## API

### New routes: `/api/quests/:id/stages/:stageId/messages`

| Method | Purpose |
|--------|---------|
| `GET /api/quests/:id/stages/:stageId/messages` | List all player messages for a stage |
| `PUT /api/quests/:id/stages/:stageId/messages` | Upsert a player message. Body: `{ player_id, message_text }` |
| `DELETE /api/quests/:id/stages/:stageId/messages/:messageId` | Delete a player message |

### GET response

```json
[
  { "id": 1, "stage_id": 5, "player_id": "alice", "message_text": "You found the key!" }
]
```

### PUT body

```json
{ "player_id": "alice", "message_text": "You found the key!" }
```

If `message_text` is empty/null, the row is deleted (no message = use fallback).

### Existing route change

`PUT /api/quests/:id/stages/:stageId` — no changes to this endpoint. `broadcast_text` continues to be saved as before.

## Broadcast Logic (stage completion)

When `PUT /api/quests/:id/stages/:stageId` marks a stage as done (`is_done = 1`):

1. Query all players from the `player` table
2. Query all custom messages for the stage from `quest_stage_player_message`
3. For each player:
   - If a custom message exists, use it
   - If not, use `broadcast_text`
4. For each player, save the message to `message` table with `target_type: 'player'` and `target_player_id: <player_id>`
5. Emit to each player's Socket.IO room: `io.to('player:<id>').emit('message:new', message)`
6. Emit to `admin` room for God view

Players offline at the time of completion still get their message saved to the database for history retrieval.

## DM UI (Quest Journal)

### Stage row layout

Each stage row gains a player message section below the existing `broadcast_text`:

```
[END] Stage Name                         [delete]
Default broadcast: [textarea]            (nenhum)
Player: [dropdown]  Message: [textarea]
  Alice  Bob  (no msg for Carol)
```

- **Player dropdown**: populated from `GET /api/players`, shows all players
- **Message textarea**: appears when a player is selected from the dropdown
- **Configured list**: shows badges for players with messages configured, click to edit, click X to delete
- **Empty state**: shows "(nenhum)" when no players have messages configured

### Interaction flow

1. DM creates/edits a stage
2. DM selects a player from the dropdown
3. DM types the message for that player
4. Auto-saves on blur (debounced 500ms, same pattern as other fields)
5. Player badge appears in the configured list
6. DM can click a badge to edit, or X to delete
7. If `broadcast_text` is set, players without custom messages get that

## Files to modify

| File | Change |
|------|--------|
| `server/db.js` | Add `quest_stage_player_message` table DDL, add prepared queries |
| `server/routes/quests.js` | Add player message CRUD routes, modify stage completion broadcast logic |
| `public/dm/quests.js` | Add player message UI rendering and event listeners |
| `public/dm/quests.css` | Styles for player dropdown, message textarea, configured badges |

## Edge cases

- **Player added after stage creation**: DM can select them and add a message — no retroactive setup needed
- **Player deleted**: CASCADE delete removes their messages automatically
- **Stage deleted**: CASCADE delete removes all player messages for that stage
- **All players have custom messages**: `broadcast_text` is ignored entirely
- **No players have custom messages**: behaves exactly as current system (sends `broadcast_text` to all)
- **Empty `message_text`**: treated as "no custom message" — row is deleted, player gets fallback
