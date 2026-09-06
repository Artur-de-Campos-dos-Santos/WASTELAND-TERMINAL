# Per-Player Quest Stage Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each quest stage to have custom messages per player, sent individually on stage completion, with broadcast_text as fallback.

**Architecture:** New `quest_stage_player_message` table stores per-player messages. Server routes handle CRUD. On stage completion, server iterates players, sends custom message or fallback to each via their Socket.IO room. DM UI adds player dropdown + message textarea per stage.

**Tech Stack:** Node.js, Express, better-sqlite3, Socket.IO, vanilla JS frontend

## Global Constraints

- SQLite database at `data/session.sqlite`
- Express routes in `server/routes/`
- Socket.IO for real-time messaging
- Frontend uses vanilla JS (no framework)
- CSS uses theme variables (pipboy, oldpaper, cave, noir)
- MAX_MESSAGE_LENGTH: 2000 characters

---

### Task 1: Database schema and prepared queries

**Files:**
- Modify: `server/db.js`

**Interfaces:**
- Produces: `questStagePlayerMessageQueries` object with `getByStage`, `getByStageAndPlayer`, `upsert`, `delete`, `deleteByStage` methods

- [ ] **Step 1: Add table DDL to initDatabase**

In `server/db.js`, inside the `db.exec()` block (after the `config` table), add:

```sql
CREATE TABLE IF NOT EXISTS quest_stage_player_message (
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

- [ ] **Step 2: Add query declarations**

After the `questStageQueries` object (around line 129), add:

```js
const questStagePlayerMessageQueries = {
  getByStage: null,
  getByStageAndPlayer: null,
  upsert: null,
  delete: null,
  deleteByStage: null,
};
```

- [ ] **Step 3: Add prepared statements in prepareQueries**

After the `questStageQueries.reorder` line (around line 194), add:

```js
questStagePlayerMessageQueries.getByStage = db.prepare(
  "SELECT * FROM quest_stage_player_message WHERE stage_id = ? ORDER BY created_at"
);
questStagePlayerMessageQueries.getByStageAndPlayer = db.prepare(
  "SELECT * FROM quest_stage_player_message WHERE stage_id = ? AND player_id = ?"
);
questStagePlayerMessageQueries.upsert = db.prepare(
  "INSERT INTO quest_stage_player_message (stage_id, player_id, message_text) VALUES (?, ?, ?) ON CONFLICT(stage_id, player_id) DO UPDATE SET message_text = excluded.message_text"
);
questStagePlayerMessageQueries.delete = db.prepare(
  "DELETE FROM quest_stage_player_message WHERE id = ?"
);
questStagePlayerMessageQueries.deleteByStage = db.prepare(
  "DELETE FROM quest_stage_player_message WHERE stage_id = ?"
);
```

- [ ] **Step 4: Export the new queries**

Add `questStagePlayerMessageQueries` to the `module.exports` object at the bottom of the file.

- [ ] **Step 5: Verify server starts**

Run: `node server/server.js`
Expected: Server starts without errors, new table created in database

---

### Task 2: Player message CRUD API routes

**Files:**
- Modify: `server/routes/quests.js`

**Interfaces:**
- Consumes: `questStagePlayerMessageQueries` from `server/db.js`
- Consumes: `playerQueries` from `server/db.js`
- Produces: Three new endpoints under `/api/quests/:id/stages/:stageId/messages`

- [ ] **Step 1: Import new queries**

At the top of `server/routes/quests.js`, add `questStagePlayerMessageQueries` and `playerQueries` to the destructured require:

```js
const { questQueries, questStageQueries, questStagePlayerMessageQueries, playerQueries, createMessage } = require("../db");
```

- [ ] **Step 2: Add GET route for listing player messages**

After the `PUT /:id/stages/reorder` route (before `module.exports`), add:

```js
// GET /api/quests/:id/stages/:stageId/messages - list player messages for a stage
router.get("/:id/stages/:stageId/messages", (req, res) => {
  const { id, stageId } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const stage = questStageQueries.getById.get(stageId);
  if (!stage || stage.quest_id !== parseInt(id)) {
    return res.status(404).json({ error: "Stage not found" });
  }

  const messages = questStagePlayerMessageQueries.getByStage.all(stageId);
  res.json(messages);
});
```

- [ ] **Step 3: Add PUT route for upserting a player message**

```js
// PUT /api/quests/:id/stages/:stageId/messages - upsert a player message
router.put("/:id/stages/:stageId/messages", (req, res) => {
  const { id, stageId } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const stage = questStageQueries.getById.get(stageId);
  if (!stage || stage.quest_id !== parseInt(id)) {
    return res.status(404).json({ error: "Stage not found" });
  }

  const { player_id, message_text } = req.body;
  if (!player_id) {
    return res.status(400).json({ error: "player_id is required" });
  }

  const player = playerQueries.getById.get(player_id);
  if (!player) {
    return res.status(404).json({ error: "Player not found" });
  }

  const cleanText = sanitize(message_text) || null;

  // If message_text is empty/null, delete the row (no custom message)
  if (!cleanText) {
    const existing = questStagePlayerMessageQueries.getByStageAndPlayer.get(stageId, player_id);
    if (existing) {
      questStagePlayerMessageQueries.delete.run(existing.id);
    }
    return res.json({ deleted: true });
  }

  if (cleanText.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
  }

  questStagePlayerMessageQueries.upsert.run(stageId, player_id, cleanText);
  const updated = questStagePlayerMessageQueries.getByStageAndPlayer.get(stageId, player_id);
  res.json(updated);
});
```

- [ ] **Step 4: Add DELETE route for removing a player message**

```js
// DELETE /api/quests/:id/stages/:stageId/messages/:messageId - delete a player message
router.delete("/:id/stages/:stageId/messages/:messageId", (req, res) => {
  const { id, stageId, messageId } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const stage = questStageQueries.getById.get(stageId);
  if (!stage || stage.quest_id !== parseInt(id)) {
    return res.status(404).json({ error: "Stage not found" });
  }

  questStagePlayerMessageQueries.delete.run(messageId);
  res.json({ ok: true });
});
```

- [ ] **Step 5: Verify routes work**

Run: `node server/server.js`
Test with curl:
```bash
# List messages (should be empty)
curl http://localhost:3000/api/quests/1/stages/1/messages

# Upsert a message
curl -X PUT http://localhost:3000/api/quests/1/stages/1/messages \
  -H "Content-Type: application/json" \
  -d '{"player_id": "alice", "message_text": "You found the key!"}'

# List messages (should show one)
curl http://localhost:3000/api/quests/1/stages/1/messages

# Delete by sending empty text
curl -X PUT http://localhost:3000/api/quests/1/stages/1/messages \
  -H "Content-Type: application/json" \
  -d '{"player_id": "alice", "message_text": ""}'
```

---

### Task 3: Modified stage completion broadcast logic

**Files:**
- Modify: `server/routes/quests.js` (the `PUT /:id/stages/:stageId` route)

**Interfaces:**
- Consumes: `questStagePlayerMessageQueries`, `playerQueries`, `createMessage` from `server/db.js`
- Consumes: `io` from `req.app.locals.io`

- [ ] **Step 1: Replace the broadcast block in PUT route**

In the `PUT /:id/stages/:stageId` route, replace the broadcast block (lines 146-171) with:

```js
  // Broadcast immediately when a stage with broadcast_text is marked done
  if (isDone === 1) {
    const io = req.app.locals.io;
    const db = req.app.locals.db;

    const players = playerQueries.getAll.all();
    const playerMessages = questStagePlayerMessageQueries.getByStage.all(stageId);
    const messageMap = {};
    playerMessages.forEach(function(pm) {
      messageMap[pm.player_id] = pm.message_text;
    });

    const broadcastBody = updated.broadcast_text;
    let anySent = false;

    players.forEach(function(player) {
      const body = messageMap[player.id] || broadcastBody;
      if (!body) return;

      const result = createMessage(db, {
        targetType: "player",
        targetPlayerId: player.id,
        body: body,
        source: "auto",
      });

      const message = {
        id: result.lastInsertRowid,
        target_type: "player",
        target_player_id: player.id,
        body: body,
        source: "auto",
        created_at: new Date().toISOString(),
      };

      io.to("player:" + player.id).emit("message:new", message);
      io.to("admin").emit("message:new", message);
      anySent = true;
    });

    if (anySent) {
      updated._broadcastSent = true;
    }
  }
```

- [ ] **Step 2: Verify broadcast logic**

Run: `node server/server.js`
Create a quest with a stage, add a player, add a player message for that stage, mark the stage done. Verify:
1. The player receives their custom message (not the broadcast_text)
2. The message appears in the admin God view
3. If no custom message is set, the player receives broadcast_text

---

### Task 4: DM UI - Player message rendering and event listeners

**Files:**
- Modify: `public/dm/quests.js`

**Interfaces:**
- Consumes: `GET /api/players` (already exists)
- Consumes: `GET /api/quests/:id/stages/:stageId/messages` (from Task 2)
- Consumes: `PUT /api/quests/:id/stages/:stageId/messages` (from Task 2)
- Consumes: `DELETE /api/quests/:id/stages/:stageId/messages/:messageId` (from Task 2)

- [ ] **Step 1: Add state variable for players list**

At the top of `public/dm/quests.js`, after `var selectedQuestStages = [];`, add:

```js
var allPlayers = [];
```

- [ ] **Step 2: Add loadPlayers function**

After the `loadStages` function, add:

```js
function loadPlayers() {
  return api("GET", "/players").then(function(data) {
    allPlayers = data;
  });
}
```

- [ ] **Step 3: Call loadPlayers on init**

In the `DOMContentLoaded` handler, after `loadQuests()`, add:

```js
loadPlayers();
```

- [ ] **Step 4: Add loadStageMessages function**

After `loadPlayers`, add:

```js
function loadStageMessages(stageId) {
  if (!selectedQuestId) return Promise.resolve([]);
  return api("GET", "/quests/" + selectedQuestId + "/stages/" + stageId + "/messages");
}
```

- [ ] **Step 5: Add upsertStageMessage function**

After `loadStageMessages`, add:

```js
function upsertStageMessage(questId, stageId, playerId, messageText) {
  return api("PUT", "/quests/" + questId + "/stages/" + stageId + "/messages", {
    player_id: playerId,
    message_text: messageText,
  });
}
```

- [ ] **Step 6: Add deleteStageMessage function**

After `upsertStageMessage`, add:

```js
function deleteStageMessage(questId, stageId, messageId) {
  return api("DELETE", "/quests/" + questId + "/stages/" + stageId + "/messages/" + messageId);
}
```

- [ ] **Step 7: Modify renderStages to load and show player messages**

Replace the `renderStages` function with:

```js
function renderStages() {
  var container = document.getElementById("stages-list");

  if (!selectedQuestStages.length) {
    container.innerHTML = '<p class="empty-text">Nenhum estagio. Adicione um!</p>';
    return;
  }

  // Build player messages map for all stages
  var stageMessagePromises = selectedQuestStages.map(function(stage) {
    return loadStageMessages(stage.id).then(function(msgs) {
      return { stageId: stage.id, messages: msgs };
    });
  });

  Promise.all(stageMessagePromises).then(function(results) {
    var messagesByStage = {};
    results.forEach(function(r) {
      messagesByStage[r.stageId] = r.messages;
    });

    container.innerHTML = selectedQuestStages.map(function(stage) {
      var doneClass = stage.is_done ? "done" : "";
      var broadcastPreview;
      if (stage.broadcast_text) {
        var text = escapeHtml(stage.broadcast_text.substring(0, 40));
        if (stage.broadcast_text.length > 40) text += "...";
        broadcastPreview = '<span class="broadcast-preview">' + text + '</span>';
      } else {
        broadcastPreview = '<span class="broadcast-preview none">(nenhum)</span>';
      }

      var endLabel = stage.is_done ? "DONE" : "END";
      var endTitle = stage.is_done ? "Desfazer" : "Finalizar estagio";
      var endedClass = stage.is_done ? " ended" : "";

      // Player messages section
      var playerMsgs = messagesByStage[stage.id] || [];
      var configuredPlayers = playerMsgs.map(function(pm) {
        var player = allPlayers.find(function(p) { return p.id === pm.player_id; });
        var name = player ? escapeHtml(player.display_name) : pm.player_id;
        return '<span class="player-msg-badge" data-stage-id="' + stage.id + '" data-player-id="' + pm.player_id + '" data-message-id="' + pm.id + '">' + name + ' <span class="badge-remove">&times;</span></span>';
      }).join("");

      var playerOptions = allPlayers.map(function(p) {
        return '<option value="' + p.id + '">' + escapeHtml(p.display_name) + '</option>';
      }).join("");

      return '<div class="stage-row ' + doneClass + '" data-id="' + stage.id + '">' +
        '<button class="stage-end-btn' + endedClass + '" title="' + endTitle + '">' + endLabel + '</button>' +
        '<input type="text" class="stage-name-input" value="' + escapeHtml(stage.name) + '" placeholder="Nome do estagio">' +
        '<div class="stage-broadcast">' +
        '<textarea class="stage-broadcast-input" placeholder="Texto do broadcast (fallback)">' + escapeHtml(stage.broadcast_text || "") + '</textarea>' +
        broadcastPreview +
        '</div>' +
        '<button class="stage-delete-btn" title="Excluir estagio"><i class="fas fa-times"></i></button>' +
        '<div class="stage-player-messages">' +
        '<div class="player-msg-row">' +
        '<select class="player-select"><option value="">Selecionar jogador...</option>' + playerOptions + '</select>' +
        '<textarea class="player-msg-input" placeholder="Mensagem para este jogador"></textarea>' +
        '</div>' +
        '<div class="player-msg-badges">' + configuredPlayers + '</div>' +
        '</div>' +
        '</div>';
    }).join("");

    attachStageListeners();
  });
}
```

- [ ] **Step 8: Add event listeners for player message UI**

In the `attachStageListeners` function, after the existing event listeners, add:

```js
  // Player select + message input
  document.querySelectorAll(".player-select").forEach(function(select) {
    select.addEventListener("change", function(e) {
      var stageRow = e.target.closest(".stage-row");
      var stageId = parseInt(stageRow.dataset.id);
      var msgInput = stageRow.querySelector(".player-msg-input");
      var playerId = e.target.value;

      if (!playerId) {
        msgInput.value = "";
        msgInput.disabled = true;
        return;
      }

      msgInput.disabled = false;

      // Load existing message for this player
      loadStageMessages(stageId).then(function(msgs) {
        var existing = msgs.find(function(m) { return m.player_id === playerId; });
        msgInput.value = existing ? existing.message_text : "";
      });
    });
  });

  document.querySelectorAll(".player-msg-input").forEach(function(textarea) {
    var debounce;
    textarea.addEventListener("input", function(e) {
      clearTimeout(debounce);
      debounce = setTimeout(function() {
        var stageRow = e.target.closest(".stage-row");
        var stageId = parseInt(stageRow.dataset.id);
        var select = stageRow.querySelector(".player-select");
        var playerId = select.value;
        if (!playerId) return;

        upsertStageMessage(selectedQuestId, stageId, playerId, e.target.value).then(function() {
          renderStages();
        });
      }, 500);
    });
  });

  // Badge click to edit
  document.querySelectorAll(".player-msg-badge").forEach(function(badge) {
    badge.addEventListener("click", function(e) {
      if (e.target.classList.contains("badge-remove")) return;
      var stageRow = badge.closest(".stage-row");
      var select = stageRow.querySelector(".player-select");
      var msgInput = stageRow.querySelector(".player-msg-input");
      select.value = badge.dataset.playerId;
      msgInput.disabled = false;
      loadStageMessages(parseInt(stageRow.dataset.id)).then(function(msgs) {
        var existing = msgs.find(function(m) { return m.player_id === badge.dataset.playerId; });
        msgInput.value = existing ? existing.message_text : "";
      });
    });
  });

  // Badge remove button
  document.querySelectorAll(".badge-remove").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      var badge = e.target.closest(".player-msg-badge");
      var stageId = badge.dataset.stageId;
      var messageId = badge.dataset.messageId;
      deleteStageMessage(selectedQuestId, stageId, messageId).then(function() {
        renderStages();
      });
    });
  });
```

- [ ] **Step 9: Initialize player message inputs as disabled**

In the `renderStages` function, after setting innerHTML, add before `attachStageListeners()`:

```js
    document.querySelectorAll(".player-msg-input").forEach(function(el) {
      el.disabled = true;
    });
```

- [ ] **Step 10: Verify UI works**

Run: `node server/server.js`
Open DM quest journal, create a quest with stages, add players. Verify:
1. Player dropdown appears per stage
2. Selecting a player shows textarea
3. Typing a message auto-saves
4. Badge appears showing configured player
5. Clicking badge loads that player's message
6. Clicking X on badge deletes the message

---

### Task 5: CSS styles for player message UI

**Files:**
- Modify: `public/dm/quests.css`

**Interfaces:**
- Consumes: existing theme CSS variables

- [ ] **Step 1: Add player message section styles**

At the end of the `/* ==================== STAGES ==================== */` section (before the responsive section), add:

```css
/* --- Player messages per stage --- */

.stage-player-messages {
  width: 100%;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.player-msg-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.player-select {
  padding: 4px 8px;
  font-family: inherit;
  font-size: 0.75rem;
  background: var(--input-bg);
  border: 1px solid var(--border);
  color: var(--text);
  cursor: pointer;
  outline: none;
  min-width: 140px;
}

.player-select:focus {
  border-color: var(--text);
}

.player-select option {
  background: var(--card-bg);
  color: var(--text);
}

.player-msg-input {
  flex: 1;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 0.75rem;
  background: var(--input-bg);
  border: 1px solid var(--border);
  color: var(--text);
  outline: none;
  resize: none;
  min-height: 24px;
  transition: border-color 0.2s;
}

.player-msg-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.player-msg-input:focus {
  border-color: var(--text);
  background: var(--card-bg);
}

.player-msg-input::placeholder {
  color: var(--text-dim);
}

.player-msg-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.player-msg-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 0.7rem;
  background: var(--accent);
  color: var(--btn-text);
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.5px;
}

.player-msg-badge:hover {
  opacity: 0.8;
}

.badge-remove {
  font-weight: bold;
  margin-left: 2px;
}

.badge-remove:hover {
  color: var(--danger);
}
```

- [ ] **Step 2: Add noir theme overrides**

In the `body.theme-noir` section, add:

```css
body.theme-noir .stage-player-messages {
  border-top-color: var(--hairline);
}

body.theme-noir .player-select,
body.theme-noir .player-msg-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--text);
  border-radius: 0;
}

body.theme-noir .player-select:focus,
body.theme-noir .player-msg-input:focus {
  border-bottom: 2px solid var(--text);
}

body.theme-noir .player-msg-badge {
  background: var(--accent);
  color: var(--bg);
  border-radius: 0;
}
```

- [ ] **Step 3: Add responsive styles**

In the `@media (max-width: 768px)` section, add:

```css
  .player-msg-row {
    flex-direction: column;
  }

  .player-select {
    width: 100%;
  }
```

- [ ] **Step 4: Verify styles look correct**

Open DM quest journal, verify:
1. Player message section is visually distinct from broadcast_text
2. Dropdown and textarea align properly
3. Badges are styled and clickable
4. Responsive layout works on mobile
5. All themes (pipboy, oldpaper, cave, noir) look correct

---

### Task 6: Final verification

- [ ] **Step 1: Start server and test full flow**

Run: `node server/server.js`

1. Create a player "Alice"
2. Create a quest "Test Quest" with one stage "Stage 1"
3. Set broadcast_text to "Default message"
4. Select Alice from dropdown, type "Alice gets this!"
5. Mark stage as done
6. Verify Alice receives "Alice gets this!" (not "Default message")
7. Verify admin God view shows the message
8. Verify message history shows the personalized message

- [ ] **Step 2: Test fallback behavior**

1. Create a player "Bob"
2. Add a new stage "Stage 2" with broadcast_text "Fallback message"
3. Do NOT add a custom message for Bob
4. Mark stage as done
5. Verify Bob receives "Fallback message"

- [ ] **Step 3: Test edge cases**

1. Add custom message for Bob on Stage 2
2. Mark stage done again (unmark, then re-mark)
3. Verify Bob now receives their custom message
4. Delete Bob's custom message via badge X
5. Verify Bob falls back to broadcast_text again
