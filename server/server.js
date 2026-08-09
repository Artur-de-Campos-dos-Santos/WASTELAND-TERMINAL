const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const os = require("os");
const { initDatabase, prepareQueries } = require("./db");
const { PORT } = require("../config/config");

// Initialize database
const db = initDatabase();
prepareQueries(db);

// Express setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// Make db and io available to routes
app.locals.db = db;
app.locals.io = io;

// Routes
app.use("/api/players", require("./routes/players"));
app.use("/api", require("./routes/messages"));
app.use("/api", require("./routes/auth"));
app.use("/api", require("./routes/session"));
app.use("/api/export", require("./routes/export"));
app.use("/api/quests", require("./routes/quests"));
app.use("/api/config", require("./routes/config"));

// Serve pages
app.get("/player/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "player", "index.html"));
});

app.get("/dm", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dm", "index.html"));
});

app.get("/dm/quests", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "dm", "quests.html"));
});

// Socket.IO
require("./sockets")(io, db);

// Get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

server.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log(`\n=== WASTELAND TERMINAL ===`);
  console.log(`Server running on http://${ip}:${PORT}`);
  console.log(`\nDM Dashboard: http://${ip}:${PORT}/dm`);
  console.log(`\nShare player URLs from the dashboard once players are added.`);
  console.log(`=========================\n`);
});
