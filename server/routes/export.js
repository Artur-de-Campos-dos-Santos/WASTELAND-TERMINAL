const express = require("express");
const router = express.Router();
const archiver = require("archiver");
const { messageQueries, playerQueries } = require("../db");

function formatMessage(msg) {
  const time = new Date(msg.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `[${time}] ${msg.body}`;
}

// GET /api/export/combined - full combined transcript
router.get("/combined", (req, res) => {
  const messages = messageQueries.getCombined.all();
  const lines = messages.map((m) => {
    const target = m.target_type === "broadcast" ? "BROADCAST" : `TO:${m.target_player_id}`;
    return `[${target}] ${formatMessage(m)}`;
  });

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", 'attachment; filename="combined-transcript.txt"');
  res.send(lines.join("\n"));
});

// GET /api/export/player/:id - one player's transcript
router.get("/player/:id", (req, res) => {
  const { id } = req.params;
  const player = playerQueries.getById.get(id);
  if (!player) {
    return res.status(404).json({ error: "Player not found" });
  }

  const messages = messageQueries.getForPlayer.all(id);
  const lines = messages.map(formatMessage);

  res.setHeader("Content-Type", "text/plain");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${id}-transcript.txt"`
  );
  res.send(lines.join("\n"));
});

// GET /api/export/all - zip of combined + all per-player transcripts
router.get("/all", (req, res) => {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="wasteland-transcripts.zip"');

  const archive = archiver("zip");
  archive.pipe(res);

  // Combined transcript
  const combined = messageQueries.getCombined.all();
  const combinedLines = combined.map((m) => {
    const target = m.target_type === "broadcast" ? "BROADCAST" : `TO:${m.target_player_id}`;
    return `[${target}] ${formatMessage(m)}`;
  });
  archive.append(combinedLines.join("\n"), { name: "combined-transcript.txt" });

  // Per-player transcripts
  const players = playerQueries.getAll.all();
  for (const player of players) {
    const messages = messageQueries.getForPlayer.all(player.id);
    const lines = messages.map(formatMessage);
    archive.append(lines.join("\n"), { name: `${player.id}-transcript.txt` });
  }

  archive.finalize();
});

module.exports = router;
