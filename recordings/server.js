const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8
});

app.use(express.static("public"));

const recordingsDir = path.join(__dirname, "recordings");
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir);
}

let users = {};
let admins = {};

io.on("connection", (socket) => {

  console.log("Connected:", socket.id);

  /* -------------------------
     REGISTER USER / ADMIN
  ------------------------- */
  socket.on("register", ({ role, cameraId }) => {

    if (role === "user") {
      users[socket.id] = cameraId;
      socket.cameraId = cameraId;

      // Notify admins
      Object.keys(admins).forEach(adminId => {
        io.to(adminId).emit("new-camera", {
          socketId: socket.id,
          cameraId
        });
      });

      // 🔴 START RECORD FILE
      const filePath = path.join(
        recordingsDir,
        `${cameraId}-${Date.now()}.webm`
      );

      socket.fileStream = fs.createWriteStream(filePath);
      console.log("Recording started:", filePath);
    }

    if (role === "admin") {
      admins[socket.id] = true;

      // Send existing cameras
      Object.entries(users).forEach(([id, camId]) => {
        socket.emit("new-camera", {
          socketId: id,
          cameraId: camId
        });
      });
    }
  });

  /* -------------------------
     WEBRTC SIGNALING (IMPORTANT)
  ------------------------- */
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", {
      from: socket.id,
      data
    });
  });

  /* -------------------------
     RECORDING CHUNKS
  ------------------------- */
  socket.on("recording-chunk", (chunk) => {
    if (socket.fileStream) {
      socket.fileStream.write(Buffer.from(chunk));
    }
  });

  /* -------------------------
     DISCONNECT
  ------------------------- */
  socket.on("disconnect", () => {

    if (socket.fileStream) {
      socket.fileStream.end();
      console.log("Recording saved for:", socket.cameraId);
    }

    delete users[socket.id];
    delete admins[socket.id];

    // Inform admins camera went offline
    Object.keys(admins).forEach(adminId => {
      io.to(adminId).emit("camera-disconnected", socket.id);
    });

    console.log("Disconnected:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
