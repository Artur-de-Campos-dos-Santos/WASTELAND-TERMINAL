const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "..", "data", "session.sqlite");
const BACKUP_DIR = path.join(__dirname, "..", "data", "backup");

function backupDatabase() {
  if (!fs.existsSync(DB_PATH)) return;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `session-${timestamp}.sqlite`);
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`Database backed up to ${backupPath}`);
}

function initDatabase() {
  backupDatabase();

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS player (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      pin TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL CHECK(target_type IN ('player', 'broadcast', 'system')),
      target_player_id TEXT,
      body TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'dm' CHECK(source IN ('dm', 'auto')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (target_player_id) REFERENCES player(id) ON DELETE CASCADE
    );

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
  `);

  // Ensure at least one session exists
  const session = db.prepare("SELECT id FROM session LIMIT 1").get();
  if (!session) {
    db.prepare("INSERT INTO session (created_at) VALUES (CURRENT_TIMESTAMP)").run();
  }

  return db;
}

// --- Player queries ---

const playerQueries = {
  create: null, // initialized after db
  getAll: null,
  getById: null,
  delete: null,
};

// --- Message queries ---

const messageQueries = {
  create: null,
  getForPlayer: null,
  getCombined: null,
  deleteAll: null,
  deleteForPlayer: null,
};

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

function prepareQueries(db) {
  playerQueries.create = db.prepare(
    "INSERT INTO player (id, display_name, pin) VALUES (?, ?, ?)"
  );
  playerQueries.getAll = db.prepare("SELECT * FROM player ORDER BY created_at");
  playerQueries.getById = db.prepare("SELECT * FROM player WHERE id = ?");
  playerQueries.delete = db.prepare("DELETE FROM player WHERE id = ?");

  messageQueries.create = db.prepare(
    "INSERT INTO message (target_type, target_player_id, body, source) VALUES (?, ?, ?, ?)"
  );
  messageQueries.getForPlayer = db.prepare(`
    SELECT * FROM message
    WHERE target_player_id = ? OR target_type = 'broadcast'
    ORDER BY created_at ASC
  `);
  messageQueries.getCombined = db.prepare(
    "SELECT * FROM message ORDER BY created_at ASC"
  );
  messageQueries.deleteAll = db.prepare("DELETE FROM message");
  messageQueries.deleteForPlayer = db.prepare(
    "DELETE FROM message WHERE target_player_id = ?"
  );

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
    "UPDATE quest_stage SET name = ?, broadcast_text = ?, is_done = ?, done_at = ?, sort_order = ? WHERE id = ?"
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
}

function createMessage(db, { targetType, targetPlayerId, body, source = "dm" }) {
  return messageQueries.create.run(targetType, targetPlayerId || null, body, source);
}

module.exports = {
  initDatabase,
  prepareQueries,
  createMessage,
  playerQueries,
  messageQueries,
  questQueries,
  questStageQueries,
};
