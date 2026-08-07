const express = require("express");
const router = express.Router();
const { DM_PIN } = require("../../config/config");

// POST /api/auth/dm - validate DM PIN
router.post("/auth/dm", (req, res) => {
  if (!DM_PIN) {
    return res.json({ ok: true, authRequired: false });
  }

  const { pin } = req.body;
  if (pin === DM_PIN) {
    res.json({ ok: true, authRequired: true });
  } else {
    res.status(401).json({ error: "Invalid PIN" });
  }
});

// GET /api/auth/dm/check - check if DM auth is required
router.get("/auth/dm/check", (req, res) => {
  res.json({ authRequired: !!DM_PIN });
});

module.exports = router;
