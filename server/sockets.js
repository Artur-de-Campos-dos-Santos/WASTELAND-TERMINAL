const { playerQueries } = require("./db");

module.exports = function setupSockets(io, db) {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join", (room) => {
      if (room === "admin") {
        socket.join("admin");
        console.log(`Socket ${socket.id} joined admin room`);
        return;
      }

      // Player room: verify player exists
      if (room.startsWith("player:")) {
        const playerId = room.replace("player:", "");
        const player = playerQueries.getById.get(playerId);
        if (!player) {
          socket.emit("error", { message: "Player not found" });
          return;
        }
        socket.join(room);
        socket.data.playerId = playerId;
        console.log(`Socket ${socket.id} joined room ${room}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
