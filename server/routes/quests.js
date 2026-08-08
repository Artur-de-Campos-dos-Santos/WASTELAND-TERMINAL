const express = require("express");
const router = express.Router();
const { questQueries, questStageQueries, createMessage } = require("../db");

function sanitize(str) {
  if (!str || typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").trim();
}

function getLastId(db) {
  return db.prepare("SELECT last_insert_rowid() as id").get().id;
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
  const quest = questQueries.getById.get(getLastId(req.app.locals.db));
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
  const stage = questStageQueries.getById.get(getLastId(req.app.locals.db));
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

  questStageQueries.update.run(name, broadcastText, isDone, doneAt, sortOrder, stageId);
  const updated = questStageQueries.getById.get(stageId);

  // Check if this was the last undone stage and broadcast_text exists
  if (isDone === 1 && updated.broadcast_text) {
    const remaining = questStageQueries.countUndone.get(id);
    if (remaining.remaining === 0) {
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
