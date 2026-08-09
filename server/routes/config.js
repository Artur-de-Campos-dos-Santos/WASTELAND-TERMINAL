const express = require("express");
const router = express.Router();
const { configQueries } = require("../db");

const VALID_THEMES = ["pipboy", "oldpaper", "cave", "noir"];

// GET /api/config/theme - get current theme
router.get("/theme", (req, res) => {
  const row = configQueries.get.get("theme");
  res.json({ theme: row ? row.value : "pipboy" });
});

// PUT /api/config/theme - set theme and broadcast
router.put("/theme", (req, res) => {
  const { theme } = req.body;
  if (!theme || !VALID_THEMES.includes(theme)) {
    return res.status(400).json({ error: "Invalid theme" });
  }

  configQueries.set.run("theme", theme);

  const io = req.app.locals.io;
  io.emit("theme:changed", { theme });

  res.json({ theme });
});

module.exports = router;
