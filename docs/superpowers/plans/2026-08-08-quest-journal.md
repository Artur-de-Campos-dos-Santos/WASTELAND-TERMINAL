# Quest Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a quest journal to the DM dashboard — a dedicated page where DMs create quests with ordered stages, reorder via drag-and-drop, and auto-broadcast messages when stages complete.

**Architecture:** Two new SQLite tables (quest, quest_stage) with a new Express route module, a new `/dm/quests` page with vanilla JS, and integration with the existing Socket.IO broadcast system.

**Tech Stack:** Node.js, Express 5, SQLite (better-sqlite3), Socket.IO, vanilla HTML/CSS/JS. No frameworks.

## Global Constraints

- UI language: Portuguese (Brazilian) — all labels, buttons, and prompts in Portuguese
- Styling: Fallout Pip-Boy aesthetic — dark background (#0a0a0a), green text (#33ff33), Share Tech Mono font, CRT scanline overlay
- Database: SQLite via better-sqlite3, WAL mode
- Real-time: Socket.IO for broadcast delivery
- No frontend framework — vanilla DOM manipulation
- Max message length: 2000 characters (from config)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `server/db.js` | Modify | Add quest/quest_stage tables + prepared queries |
| `server/routes/quests.js` | Create | API routes for quests and stages |
| `server/server.js` | Modify | Register quest routes + serve quest page |
| `public/dm/index.html` | Modify | Add "QUEST JOURNAL" button to header |
| `public/dm/quests.html` | Create | Quest journal page |
| `public/dm/quests.css` | Create | Quest journal styles |
| `public/dm/quests.js` | Create | Quest journal client-side logic |

---

### Task 1: Database Schema — Add quest and quest_stage tables

**Files:**
- Modify: `server/db.js:23-45` (inside `db.exec()` block)

**Interfaces:**
- Produces: `questQueries` object with prepared statements (consumed by Task 2)

- [ ] **Step 1: Add tables to the CREATE TABLE block**

In `server/db.js`, add the new tables inside the `db.exec()` call, after the `message` table definition (after line 44, before the closing backtick on line 45):

```javascript
    CREATE TABLE IF NOT EXISTS quest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'failed')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quest_stage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      broadcast_text TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_done INTEGER NOT NULL DEFAULT 0,
      done_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quest_id) REFERENCES quest(id) ON DELETE CASCADE
    );
```

- [ ] **Step 2: Add questQueries object and prepared statements**

After the `messageQueries` object definition (after line 73), add:

```javascript
// --- Quest queries ---

const questQueries = {
  create: null,
  getAll: null,
  getById: null,
  update: null,
  delete: null,
  getMaxSortOrder: null,
};

// --- Quest Stage queries ---

const questStageQueries = {
  create: null,
  getByQuest: null,
  getById: null,
  update: null,
  delete: null,
  getMaxSortOrder: null,
  countUndone: null,
  reorder: null,
};
```

- [ ] **Step 3: Add prepared query initialization inside `prepareQueries()`**

At the end of the `prepareQueries()` function (before the closing brace on line 98), add:

```javascript
  // Quest queries
  questQueries.create = db.prepare(
    "INSERT INTO quest (name, description, sort_order) VALUES (?, ?, ?)"
  );
  questQueries.getAll = db.prepare("SELECT * FROM quest ORDER BY sort_order, created_at");
  questQueries.getById = db.prepare("SELECT * FROM quest WHERE id = ?");
  questQueries.update = db.prepare(
    "UPDATE quest SET name = ?, description = ?, status = ? WHERE id = ?"
  );
  questQueries.delete = db.prepare("DELETE FROM quest WHERE id = ?");
  questQueries.getMaxSortOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM quest");

  // Quest Stage queries
  questStageQueries.create = db.prepare(
    "INSERT INTO quest_stage (quest_id, name, broadcast_text, sort_order) VALUES (?, ?, ?, ?)"
  );
  questStageQueries.getByQuest = db.prepare(
    "SELECT * FROM quest_stage WHERE quest_id = ? ORDER BY sort_order, created_at"
  );
  questStageQueries.getById = db.prepare("SELECT * FROM quest_stage WHERE id = ?");
  questStageQueries.update = db.prepare(
    "UPDATE quest_stage SET name = ?, broadcast_text = ?, is_done = ?, sort_order = ? WHERE id = ?"
  );
  questStageQueries.delete = db.prepare("DELETE FROM quest_stage WHERE id = ?");
  questStageQueries.getMaxSortOrder = db.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) as max_sort FROM quest_stage WHERE quest_id = ?"
  );
  questStageQueries.countUndone = db.prepare(
    "SELECT COUNT(*) as remaining FROM quest_stage WHERE quest_id = ? AND is_done = 0"
  );
  questStageQueries.reorder = db.prepare(
    "UPDATE quest_stage SET sort_order = ? WHERE id = ?"
  );
```

- [ ] **Step 4: Export the new query objects**

Update the `module.exports` at the end of `server/db.js` to include the new objects:

```javascript
module.exports = {
  initDatabase,
  prepareQueries,
  createMessage,
  playerQueries,
  messageQueries,
  questQueries,
  questStageQueries,
};
```

- [ ] **Step 5: Verify server starts without errors**

Run: `node server/server.js`
Expected: Server starts, prints "WASTELAND TERMINAL" banner, no SQL errors. Press Ctrl+C to stop.

---

### Task 2: Quest API Routes

**Files:**
- Create: `server/routes/quests.js`

**Interfaces:**
- Consumes: `questQueries`, `questStageQueries`, `createMessage` from `server/db.js`
- Consumes: `io` from `req.app.locals.io`
- Produces: REST API at `/api/quests` and `/api/quests/:id/stages`

- [ ] **Step 1: Create the routes file with all quest endpoints**

Create `server/routes/quests.js` with the following content:

```javascript
const express = require("express");
const router = express.Router();
const { questQueries, questStageQueries, createMessage } = require("../db");

function sanitize(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").trim();
}

// GET /api/quests - list all quests
router.get("/", (req, res) => {
  const quests = questQueries.getAll.all();
  res.json(quests);
});

// POST /api/quests - create a new quest
router.post("/", (req, res) => {
  const { name, description } = req.body;
  const cleanName = sanitize(name);
  if (!cleanName) {
    return res.status(400).json({ error: "Name is required" });
  }

  const maxSort = questQueries.getMaxSortOrder.get();
  const sortOrder = maxSort.max_sort + 1;

  questQueries.create.run(cleanName, sanitize(description) || null, sortOrder);
  const quest = questQueries.getById.get(
    db.prepare("SELECT last_insert_rowid() as id").get().id
  );
  res.status(201).json(quest);
});

// PUT /api/quests/:id - update quest
router.put("/:id", (req, res) => {
  const { id } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const name = sanitize(req.body.name) || quest.name;
  const description = req.body.description !== undefined ? sanitize(req.body.description) || null : quest.description;
  const status = ["active", "completed", "failed"].includes(req.body.status)
    ? req.body.status
    : quest.status;

  questQueries.update.run(name, description, status, id);
  const updated = questQueries.getById.get(id);
  res.json(updated);
});

// DELETE /api/quests/:id - delete quest and all stages
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  questQueries.delete.run(id);
  res.json({ ok: true });
});

// --- Quest Stages ---

// GET /api/quests/:id/stages - list stages for a quest
router.get("/:id/stages", (req, res) => {
  const { id } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const stages = questStageQueries.getByQuest.all(id);
  res.json(stages);
});

// POST /api/quests/:id/stages - add a stage
router.post("/:id/stages", (req, res) => {
  const { id } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const { name, broadcast_text } = req.body;
  const cleanName = sanitize(name);
  if (!cleanName) {
    return res.status(400).json({ error: "Stage name is required" });
  }

  const maxSort = questStageQueries.getMaxSortOrder.get(id);
  const sortOrder = maxSort.max_sort + 1;

  questStageQueries.create.run(id, cleanName, sanitize(broadcast_text) || null, sortOrder);
  const stage = questStageQueries.getById.get(
    db.prepare("SELECT last_insert_rowid() as id").get().id
  );
  res.status(201).json(stage);
});

// PUT /api/quests/:id/stages/:stageId - update a stage
router.put("/:id/stages/:stageId", (req, res) => {
  const { id, stageId } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const stage = questStageQueries.getById.get(stageId);
  if (!stage || stage.quest_id !== parseInt(id)) {
    return res.status(404).json({ error: "Stage not found" });
  }

  const name = sanitize(req.body.name) || stage.name;
  const broadcastText = req.body.broadcast_text !== undefined
    ? sanitize(req.body.broadcast_text) || null
    : stage.broadcast_text;
  const sortOrder = typeof req.body.sort_order === "number" ? req.body.sort_order : stage.sort_order;

  let isDone = stage.is_done;
  let doneAt = stage.done_at;

  if (typeof req.body.is_done === "number") {
    isDone = req.body.is_done ? 1 : 0;
    if (isDone === 1 && !doneAt) {
      doneAt = new Date().toISOString();
    } else if (isDone === 0) {
      doneAt = null;
    }
  }

  questStageQueries.update.run(name, broadcastText, isDone, sortOrder, stageId);
  const updated = questStageQueries.getById.get(stageId);

  // Check if this was the last undone stage and broadcast_text exists
  if (isDone === 1 && updated.broadcast_text) {
    const remaining = questStageQueries.countUndone.get(id);
    if (remaining.remaining === 0) {
      // Fire broadcast
      const io = req.app.locals.io;
      const db = req.app.locals.db;
      const messageBody = updated.broadcast_text;

      const result = createMessage(db, {
        targetType: "broadcast",
        targetPlayerId: null,
        body: messageBody,
        source: "auto",
      });

      const message = {
        id: result.lastInsertRowid,
        target_type: "broadcast",
        target_player_id: null,
        body: messageBody,
        source: "auto",
        created_at: new Date().toISOString(),
      };

      io.emit("message:new", message);
      io.to("admin").emit("message:new", message);

      updated._broadcastSent = true;
    }
  }

  res.json(updated);
});

// DELETE /api/quests/:id/stages/:stageId - delete a stage
router.delete("/:id/stages/:stageId", (req, res) => {
  const { id, stageId } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const stage = questStageQueries.getById.get(stageId);
  if (!stage || stage.quest_id !== parseInt(id)) {
    return res.status(404).json({ error: "Stage not found" });
  }

  questStageQueries.delete.run(stageId);
  res.json({ ok: true });
});

// PUT /api/quests/:id/stages/reorder - bulk update sort_order
router.put("/:id/stages/reorder", (req, res) => {
  const { id } = req.params;
  const quest = questQueries.getById.get(id);
  if (!quest) {
    return res.status(404).json({ error: "Quest not found" });
  }

  const { stageIds } = req.body;
  if (!Array.isArray(stageIds)) {
    return res.status(400).json({ error: "stageIds array is required" });
  }

  const reorderTransaction = req.app.locals.db.transaction((ids) => {
    ids.forEach((stageId, index) => {
      questStageQueries.reorder.run(index, stageId);
    });
  });

  reorderTransaction(stageIds);

  const stages = questStageQueries.getByQuest.all(id);
  res.json(stages);
});

module.exports = router;
```

- [ ] **Step 2: Fix the `db` reference issue**

The routes file uses `db.prepare("SELECT last_insert_rowid()...")` but `db` is not in scope. Replace those lines with a helper. At the top of `server/routes/quests.js`, after the require statements, add:

```javascript
function getLastId(db) {
  return db.prepare("SELECT last_insert_rowid() as id").get().id;
}
```

Then replace both occurrences of `db.prepare("SELECT last_insert_rowid() as id").get().id` in the POST handlers with `getLastId(req.app.locals.db)`.

- [ ] **Step 3: Verify routes load without syntax errors**

Run: `node -e "require('./server/routes/quests')"`
Expected: No output (module loads successfully). If error, fix syntax.

---

### Task 3: Register Routes and Serve Quest Page

**Files:**
- Modify: `server/server.js:26-39`

**Interfaces:**
- Consumes: quest routes module from Task 2
- Produces: `/api/quests` API prefix and `/dm/quests` page route

- [ ] **Step 1: Register the quest API routes**

In `server/server.js`, add the quest routes after the existing route registrations (after line 30):

```javascript
app.use("/api/quests", require("./routes/quests"));
```

- [ ] **Step 2: Add the quest page route**

In `server/server.js`, add the quest page route after the DM dashboard route (after line 39):

```javascript
app.get("/dm/quests", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dm", "quests.html"));
});
```

- [ ] **Step 3: Verify server starts and routes are accessible**

Run: `node server/server.js`
Expected: Server starts. Then in another terminal:
- `curl http://localhost:3000/api/quests` should return `[]` (empty array)
- `curl http://localhost:3000/dm/quests` should return HTML (the quests page, once created in Task 4)

---

### Task 4: Quest Journal HTML Page

**Files:**
- Create: `public/dm/quests.html`

**Interfaces:**
- Consumes: Socket.IO from `/socket.io/socket.io.js`
- Consumes: Quest API from `/api/quests`

- [ ] **Step 1: Create the quest journal HTML**

Create `public/dm/quests.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WASTELAND TERMINAL // DIÁRIO DE MISSÕES</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link rel="stylesheet" href="quests.css">
</head>
<body>
  <div id="quest-journal">
    <header>
      <a href="/dm" class="back-btn"><i class="fas fa-arrow-left"></i> VOLTAR</a>
      <h1>WASTELAND TERMINAL // DIÁRIO DE MISSÕES</h1>
    </header>

    <div class="quest-layout">
      <aside class="quest-list-panel">
        <h2>MISSÕES</h2>
        <div id="quest-list"></div>
        <button id="btn-new-quest" class="new-quest-btn">+ NOVA MISSÃO</button>
      </aside>

      <main class="quest-detail-panel">
        <div id="quest-detail" class="hidden">
          <div class="quest-header">
            <input type="text" id="quest-name" class="quest-name-input" placeholder="Nome da missão">
            <textarea id="quest-description" class="quest-desc-input" placeholder="Descrição (opcional)"></textarea>
            <div class="quest-status-row">
              <label>STATUS:</label>
              <select id="quest-status">
                <option value="active">ATIVA</option>
                <option value="completed">COMPLETA</option>
                <option value="failed">FALHOU</option>
              </select>
              <button id="btn-delete-quest" class="delete-quest-btn"><i class="fas fa-trash"></i></button>
            </div>
          </div>

          <div class="stages-section">
            <h2>ESTÁGIOS</h2>
            <div id="stages-list"></div>
            <button id="btn-add-stage" class="add-stage-btn">+ ADICIONAR ESTÁGIO</button>
          </div>
        </div>

        <div id="quest-empty" class="quest-empty">
          <p>Selecione uma missão ou crie uma nova.</p>
        </div>
      </main>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="quests.js"></script>
</body>
</html>
```

---

### Task 5: Quest Journal CSS

**Files:**
- Create: `public/dm/quests.css`

**Interfaces:**
- Consumes: Fallout theme colors/fonts from the existing design system

- [ ] **Step 1: Create the quest journal stylesheet**

Create `public/dm/quests.css` with the full Fallout-themed styling. This file should include:

- Base reset and body styles (same as dashboard.css: #0a0a0a background, #33ff33 text, Share Tech Mono font, CRT scanline overlay)
- `.hidden` class
- Scrollbar styling (same as dashboard)
- Header with back button and title
- Two-panel layout (`.quest-layout`): left sidebar (280px fixed) + right main area (flex: 1)
- Quest list panel: scrollable, quest items with status indicators
- Quest items: `.quest-item` with status dot (green=active, checkmark=completed, red X=failed), name, active state highlighting
- Quest detail panel: editable name input, description textarea, status dropdown
- Stage list: `.stage-row` with drag handle, checkbox, name input, broadcast text area, delete button
- Drag handle styling (`⠿` character or grip icon)
- Done stage visual: strikethrough or dimmed text
- Buttons: green primary, red danger, matching dashboard style
- Empty state styling
- Responsive: stack panels vertically on mobile (768px breakpoint)

The full CSS should be approximately 300-400 lines, following the exact same design patterns as `dashboard.css`.

---

### Task 6: Quest Journal JavaScript Logic

**Files:**
- Create: `public/dm/quests.js`

**Interfaces:**
- Consumes: Quest API endpoints from Task 2
- Consumes: Socket.IO for real-time updates
- Produces: Interactive quest journal UI

- [ ] **Step 1: Create the quest journal JavaScript**

Create `public/dm/quests.js` with the following structure:

```javascript
// --- State ---
let quests = [];
let selectedQuestId = null;
let selectedQuestStages = [];
let dragState = null;

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  loadQuests();
  setupEventListeners();
});

// --- API helpers ---
async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error);
  }
  return res.json();
}

// --- Quest CRUD ---
async function loadQuests() {
  quests = await api("GET", "/quests");
  renderQuestList();
}

async function createQuest() {
  const name = prompt("Nome da missão:");
  if (!name) return;
  const quest = await api("POST", "/quests", { name });
  quests.push(quest);
  renderQuestList();
  selectQuest(quest.id);
}

async function updateQuest(id, data) {
  const updated = await api("PUT", `/quests/${id}`, data);
  const idx = quests.findIndex(q => q.id === id);
  if (idx !== -1) quests[idx] = updated;
  renderQuestList();
}

async function deleteQuest(id) {
  if (!confirm("Tem certeza que deseja excluir esta missão?")) return;
  await api("DELETE", `/quests/${id}`);
  quests = quests.filter(q => q.id !== id);
  selectedQuestId = null;
  renderQuestList();
  renderQuestDetail();
}

// --- Stage CRUD ---
async function loadStages(questId) {
  selectedQuestStages = await api("GET", `/quests/${questId}/stages`);
  renderStages();
}

async function addStage(questId) {
  const stage = await api("POST", `/quests/${questId}/stages`, { name: "Novo estágio" });
  selectedQuestStages.push(stage);
  renderStages();
  // Focus the new stage name for editing
  const nameInputs = document.querySelectorAll(".stage-name-input");
  if (nameInputs.length) nameInputs[nameInputs.length - 1].focus();
}

async function updateStage(questId, stageId, data) {
  const updated = await api("PUT", `/quests/${questId}/stages/${stageId}`, data);
  const idx = selectedQuestStages.findIndex(s => s.id === stageId);
  if (idx !== -1) selectedQuestStages[idx] = updated;
  renderStages();
  renderQuestList(); // Update status indicators if needed
  return updated;
}

async function deleteStage(questId, stageId) {
  if (!confirm("Excluir este estágio?")) return;
  await api("DELETE", `/quests/${questId}/stages/${stageId}`);
  selectedQuestStages = selectedQuestStages.filter(s => s.id !== stageId);
  renderStages();
}

async function reorderStages(questId, stageIds) {
  await api("PUT", `/quests/${questId}/stages/reorder`, { stageIds });
  await loadStages(questId);
}

// --- Rendering ---
function renderQuestList() {
  const container = document.getElementById("quest-list");
  if (!quests.length) {
    container.innerHTML = '<p class="empty-text">Nenhuma missão ainda.</p>';
    return;
  }

  container.innerHTML = quests.map(q => {
    const statusIcon = q.status === "active" ? "●"
      : q.status === "completed" ? "✓" : "✗";
    const statusClass = q.status === "completed" ? "completed"
      : q.status === "failed" ? "failed" : "";
    const activeClass = q.id === selectedQuestId ? "active" : "";

    return `
      <div class="quest-item ${activeClass}" data-id="${q.id}">
        <span class="quest-status ${statusClass}">${statusIcon}</span>
        <span class="quest-name">${escapeHtml(q.name)}</span>
      </div>
    `;
  }).join("");

  // Attach click listeners
  container.querySelectorAll(".quest-item").forEach(el => {
    el.addEventListener("click", () => selectQuest(parseInt(el.dataset.id)));
  });
}

function renderQuestDetail() {
  const detail = document.getElementById("quest-detail");
  const empty = document.getElementById("quest-empty");

  if (!selectedQuestId) {
    detail.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  detail.classList.remove("hidden");
  empty.classList.add("hidden");

  const quest = quests.find(q => q.id === selectedQuestId);
  if (!quest) return;

  document.getElementById("quest-name").value = quest.name;
  document.getElementById("quest-description").value = quest.description || "";
  document.getElementById("quest-status").value = quest.status;
}

function renderStages() {
  const container = document.getElementById("stages-list");

  if (!selectedQuestStages.length) {
    container.innerHTML = '<p class="empty-text">Nenhum estágio. Adicione um!</p>';
    return;
  }

  container.innerHTML = selectedQuestStages.map(stage => {
    const doneClass = stage.is_done ? "done" : "";
    const broadcastPreview = stage.broadcast_text
      ? `<span class="broadcast-preview">${escapeHtml(stage.broadcast_text.substring(0, 40))}${stage.broadcast_text.length > 40 ? "..." : ""}</span>`
      : '<span class="broadcast-preview none">(nenhum)</span>';

    return `
      <div class="stage-row ${doneClass}" data-id="${stage.id}" draggable="true">
        <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
        <input type="checkbox" class="stage-checkbox" ${stage.is_done ? "checked" : ""}>
        <input type="text" class="stage-name-input" value="${escapeHtml(stage.name)}" placeholder="Nome do estágio">
        <div class="stage-broadcast">
          <textarea class="stage-broadcast-input" placeholder="Texto do broadcast (opcional)">${escapeHtml(stage.broadcast_text || "")}</textarea>
          ${broadcastPreview}
        </div>
        <button class="stage-delete-btn" title="Excluir estágio"><i class="fas fa-times"></i></button>
      </div>
    `;
  }).join("");

  attachStageListeners();
  attachDragListeners();
}

function attachStageListeners() {
  const questId = selectedQuestId;

  document.querySelectorAll(".stage-checkbox").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const stageId = parseInt(e.target.closest(".stage-row").dataset.id);
      updateStage(questId, stageId, { is_done: e.target.checked ? 1 : 0 });
    });
  });

  document.querySelectorAll(".stage-name-input").forEach(input => {
    let debounce;
    input.addEventListener("input", (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const stageId = parseInt(e.target.closest(".stage-row").dataset.id);
        updateStage(questId, stageId, { name: e.target.value });
      }, 500);
    });
  });

  document.querySelectorAll(".stage-broadcast-input").forEach(textarea => {
    let debounce;
    textarea.addEventListener("input", (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const stageId = parseInt(e.target.closest(".stage-row").dataset.id);
        updateStage(questId, stageId, { broadcast_text: e.target.value });
      }, 500);
    });
  });

  document.querySelectorAll(".stage-delete-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const stageId = parseInt(e.target.closest(".stage-row").dataset.id);
      deleteStage(questId, stageId);
    });
  });
}

// --- Drag and Drop ---
function attachDragListeners() {
  const rows = document.querySelectorAll(".stage-row");
  rows.forEach(row => {
    row.addEventListener("dragstart", handleDragStart);
    row.addEventListener("dragover", handleDragOver);
    row.addEventListener("dragend", handleDragEnd);
    row.addEventListener("drop", handleDrop);
  });
}

function handleDragStart(e) {
  dragState = { draggedId: parseInt(e.target.dataset.id) };
  e.target.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const row = e.target.closest(".stage-row");
  if (row && parseInt(row.dataset.id) !== dragState.draggedId) {
    row.classList.add("drag-over");
  }
}

function handleDragEnd(e) {
  document.querySelectorAll(".stage-row").forEach(r => {
    r.classList.remove("dragging", "drag-over");
  });
  dragState = null;
}

function handleDrop(e) {
  e.preventDefault();
  const targetRow = e.target.closest(".stage-row");
  if (!targetRow || !dragState) return;

  const targetId = parseInt(targetRow.dataset.id);
  const draggedId = dragState.draggedId;
  if (targetId === draggedId) return;

  // Build new order
  const stageIds = selectedQuestStages.map(s => s.id);
  const fromIdx = stageIds.indexOf(draggedId);
  const toIdx = stageIds.indexOf(targetId);

  stageIds.splice(fromIdx, 1);
  stageIds.splice(toIdx, 0, draggedId);

  // Optimistic reorder
  selectedQuestStages = stageIds.map(id => selectedQuestStages.find(s => s.id === id));
  renderStages();

  // Persist
  reorderStages(selectedQuestId, stageIds);
}

// --- Event Listeners ---
function setupEventListeners() {
  document.getElementById("btn-new-quest").addEventListener("click", createQuest);

  document.getElementById("btn-add-stage").addEventListener("click", () => {
    if (selectedQuestId) addStage(selectedQuestId);
  });

  document.getElementById("quest-name").addEventListener("change", (e) => {
    if (selectedQuestId) updateQuest(selectedQuestId, { name: e.target.value });
  });

  document.getElementById("quest-description").addEventListener("change", (e) => {
    if (selectedQuestId) updateQuest(selectedQuestId, { description: e.target.value });
  });

  document.getElementById("quest-status").addEventListener("change", (e) => {
    if (selectedQuestId) updateQuest(selectedQuestId, { status: e.target.value });
  });

  document.getElementById("btn-delete-quest").addEventListener("click", () => {
    if (selectedQuestId) deleteQuest(selectedQuestId);
  });
}

function selectQuest(id) {
  selectedQuestId = id;
  renderQuestList();
  renderQuestDetail();
  loadStages(id);
}

// --- Helpers ---
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
```

---

### Task 7: Add Quest Journal Button to Dashboard

**Files:**
- Modify: `public/dm/index.html:23-27` (header actions)

**Interfaces:**
- Produces: Navigation link to `/dm/quests`

- [ ] **Step 1: Add the quest journal button**

In `public/dm/index.html`, add a button inside the `.header-actions` div (after line 26, before the closing `</div>`):

```html
        <button id="btn-quest-journal">DIÁRIO DE MISSÕES</button>
```

- [ ] **Step 2: Add click handler in dashboard.js**

In `public/dm/dashboard.js`, add at the end of the file (before the closing):

```javascript
// Quest Journal navigation
document.getElementById("btn-quest-journal").addEventListener("click", () => {
  window.location.href = "/dm/quests";
});
```

---

### Task 8: Final Integration Test

- [ ] **Step 1: Start the server**

Run: `node server/server.js`

- [ ] **Step 2: Test quest creation flow**

Open `http://localhost:3000/dm` in browser:
1. Click "DIÁRIO DE MISSÕES" button → should navigate to `/dm/quests`
2. Click "+ NOVA MISSÃO" → prompt appears, enter "Missão de Teste"
3. Quest appears in left panel, detail shows in right panel
4. Click "+ ADICIONAR ESTÁGIO" → new stage row appears
5. Type stage name "Encontrar o Vault"
6. Add broadcast text "O Vault foi encontrado!"
7. Add another stage "Resgatar os sobreviventes"
8. Drag stages to reorder
9. Check first stage checkbox → stage dims
10. Check second stage (last undone) → broadcast fires to players
11. Change quest status to "COMPLETA" → quest indicator changes
12. Click "VOLTAR" → returns to dashboard

- [ ] **Step 3: Test edge cases**

1. Create quest with no stages → shows "Nenhum estágio" message
2. Create stage with no broadcast text → no broadcast fires when checked
3. Delete a stage → removed from list
4. Delete a quest → removed from list, all stages gone
5. Refresh page → quests and stages persist from database

---

## Summary

| Task | Deliverable | Est. Time |
|------|-------------|-----------|
| 1 | Database schema + queries | 5 min |
| 2 | Quest API routes | 10 min |
| 3 | Route registration + page serving | 2 min |
| 4 | Quest journal HTML | 3 min |
| 5 | Quest journal CSS | 8 min |
| 6 | Quest journal JavaScript | 15 min |
| 7 | Dashboard integration | 2 min |
| 8 | Integration testing | 5 min |
| **Total** | | **~50 min** |
