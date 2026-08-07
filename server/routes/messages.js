const express = require("express");
const router = express.Router();
const { messageQueries, playerQueries, createMessage } = require("../db");
const { MAX_MESSAGE_LENGTH } = require("../../config/config");

function sanitize(str) {
  return str.replace(/<[^>]*>/g, "").trim();
}

// GET /api/messages/:playerId - get message history for a player
router.get("/messages/:playerId", (req, res) => {
  const { playerId } = req.params;
  const player = playerQueries.getById.get(playerId);
  if (!player) {
    return res.status(404).json({ error: "Player not found" });
  }

  const messages = messageQueries.getForPlayer.all(playerId);
  res.json(messages);
});

// POST /api/message - create and dispatch a message
router.post("/message", (req, res) => {
  const { targetType, targetPlayerId, body, source = "dm" } = req.body;

  if (!targetType || !["player", "broadcast", "system"].includes(targetType)) {
    return res.status(400).json({ error: "Invalid target type" });
  }

  if (targetType === "player" && !targetPlayerId) {
    return res.status(400).json({ error: "targetPlayerId required for player messages" });
  }

  if (!body || typeof body !== "string") {
    return res.status(400).json({ error: "Message body is required" });
  }

  const cleanBody = sanitize(body);
  if (cleanBody.length === 0) {
    return res.status(400).json({ error: "Message body cannot be empty" });
  }
  if (cleanBody.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
  }

  if (targetType === "player") {
    const player = playerQueries.getById.get(targetPlayerId);
    if (!player) {
      return res.status(404).json({ error: "Target player not found" });
    }
  }

  const result = createMessage(req.app.locals.db, {
    targetType,
    targetPlayerId,
    body: cleanBody,
    source,
  });

  const message = {
    id: result.lastInsertRowid,
    target_type: targetType,
    target_player_id: targetPlayerId || null,
    body: cleanBody,
    source,
    created_at: new Date().toISOString(),
  };

  const io = req.app.locals.io;

  if (targetType === "broadcast") {
    io.emit("message:new", message);
  } else {
    io.to(`player:${targetPlayerId}`).emit("message:new", message);
  }

  // Also emit to admin room for God view
  io.to("admin").emit("message:new", message);

  res.status(201).json(message);
});

module.exports = router;
