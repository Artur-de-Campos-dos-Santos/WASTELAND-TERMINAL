const express = require("express");
const router = express.Router();
const { messageQueries } = require("../db");

// POST /api/session/reset - delete all messages (keeps players)
router.post("/session/reset", (req, res) => {
  messageQueries.deleteAll.run();

  const io = req.app.locals.io;
  io.emit("terminal:clear");

  res.json({ ok: true });
});

module.exports = router;
