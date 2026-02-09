const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const recordingsDir = path.join(__dirname, "recordings");
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir);
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  let fileStream = null;

  socket.on("start-recording", ({ cameraId }) => {
    const filePath = path.join(
      recordingsDir,
      `${cameraId}-${Date.now()}.webm`
    );

    fileStream = fs.createWriteStream(filePath);
    console.log("🎥 Recording started:", filePath);
  });

  socket.on("recording-chunk", (chunk) => {
    if (fileStream) {
      fileStream.write(Buffer.from(chunk));
    }
  });

  socket.on("stop-recording", () => {
    if (fileStream) {
      fileStream.end();
      console.log("⏹ Recording saved");
      fileStream = null;
    }
  });

  socket.on("disconnect", () => {
    if (fileStream) fileStream.end();
    console.log("🔴 Disconnected:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
