const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8 // allow large chunks
});

app.use(express.static("public")); // DO NOT expose recordings folder

const recordingsDir = path.join(__dirname, "recordings");
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir);
}

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  const cameraId = "Camera-" + socket.id.slice(0, 6);
  const filePath = path.join(
    recordingsDir,
    `${cameraId}-${Date.now()}.webm`
  );

  const fileStream = fs.createWriteStream(filePath);

  console.log("🎥 Recording started:", filePath);

  socket.on("recording-chunk", (chunk) => {
    fileStream.write(Buffer.from(chunk));
  });

  socket.on("disconnect", () => {
    fileStream.end();
    console.log("⏹ Recording saved:", filePath);
  });
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
