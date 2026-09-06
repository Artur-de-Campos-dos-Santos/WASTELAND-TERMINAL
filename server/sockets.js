const { playerQueries, configQueries } = require("./db");

let radioInstance = null;

function setRadioInstance(radio) {
  radioInstance = radio;
}

function emitTheme(socket) {
  const themeRow = configQueries.get.get("theme");
  socket.emit("theme:changed", { theme: themeRow ? themeRow.value : "pipboy" });
}

module.exports = function setupSockets(io, db) {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Sync radio state for new connections
    if (radioInstance) {
      const state = radioInstance.getState();
      socket.emit("radio:sync", state);
    }

    socket.on("radio:trackEnded", () => {
      if (radioInstance) {
        radioInstance.onTrackEnded();
      }
    });

    socket.on("radio:clientReady", () => {
      if (radioInstance) {
        radioInstance.clientReady();
      }
    });

    socket.on("join", (room) => {
      if (room === "admin") {
        socket.join("admin");
        console.log(`Socket ${socket.id} joined admin room`);
        emitTheme(socket);
        return;
      }

      // Player room: verify player exists
      if (room.startsWith("player:")) {
        const playerId = room.replace("player:", "");
        const player = playerQueries.getById.get(playerId);
        if (!player) {
          console.log(`[SOCK] Player not found for room: ${room}`);
          socket.emit("error", { message: "Player not found" });
          return;
        }
        socket.join(room);
        socket.data.playerId = playerId;
        console.log(`[SOCK] Socket ${socket.id} joined room ${room} (player: ${player.display_name})`);
        emitTheme(socket);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports.setRadioInstance = setRadioInstance;
