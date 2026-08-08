const express = require("express");
const router = express.Router();
const { playerQueries, messageQueries } = require("../db");
const { MAX_MESSAGE_LENGTH } = require("../../config/config");

function sanitize(str) {
  return str.replace(/<[^>]*>/g, "").trim();
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// GET /api/players - list all players
router.get("/", (req, res) => {
  const players = playerQueries.getAll.all();
  res.json(players);
});

// POST /api/players - create a new player
router.post("/", (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Name is required" });
  }

  const cleanName = sanitize(name);
  if (cleanName.length === 0) {
    return res.status(400).json({ error: "Name cannot be empty" });
  }
  if (cleanName.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: "Name too long" });
  }

  let slug = toSlug(cleanName);
  if (!slug) slug = "player";

  // Handle slug collisions
  let finalSlug = slug;
  let counter = 2;
  while (playerQueries.getById.get(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  playerQueries.create.run(finalSlug, cleanName, null);

  const player = playerQueries.getById.get(finalSlug);
  res.status(201).json(player);
});

// DELETE /api/players/:id - remove a player and their messages
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const player = playerQueries.getById.get(id);
  if (!player) {
    return res.status(404).json({ error: "Player not found" });
  }

  messageQueries.deleteForPlayer.run(id);
  playerQueries.delete.run(id);

  // Disconnect the player if connected
  const io = req.app.locals.io;
  io.to(`player:${id}`).emit("player:removed");
  io.sockets.sockets.forEach((socket) => {
    if (socket.data.playerId === id) {
      socket.disconnect(true);
    }
  });

  res.json({ ok: true });
});

module.exports = router;
