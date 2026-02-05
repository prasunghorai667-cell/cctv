const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/user.html'));
});

const users = {}; // socketId -> { role, cameraId }

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // REGISTER USER / ADMIN
  socket.on("register", ({ role, cameraId }) => {
    console.log("📥 Register event:", socket.id, role, cameraId);

    users[socket.id] = { role, cameraId };

    // If USER joins, notify admin
    if (role === "user") {
      const adminId = getAdmin();
      console.log("👤 User joined. Admin:", adminId);

      if (adminId) {
        io.to(adminId).emit("new-user", {
          socketId: socket.id,
          cameraId,
        });
        console.log("📤 Sent new-user to admin");
      }
    }

    // If ADMIN joins, send all existing users
    if (role === "admin") {
      console.log("🛠 Admin joined. Sending existing users");

      Object.keys(users).forEach((id) => {
        if (users[id].role === "user") {
          socket.emit("new-user", {
            socketId: id,
            cameraId: users[id].cameraId,
          });
          console.log("📤 Sent existing user:", id);
        }
      });
    }
  });

  // WEBRTC SIGNALING
  socket.on("signal", ({ to, data }) => {
    console.log(
      "📡 Signal:",
      socket.id,
      "→",
      to,
      data.type || "ICE"
    );

    io.to(to).emit("signal", {
      from: socket.id,
      data,
    });
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
    delete users[socket.id];
    io.emit("user-left", socket.id);
  });
});

function getAdmin() {
  const admin = Object.keys(users).find(
    (id) => users[id].role === "admin"
  );
  return admin;
}

server.listen(3000, () => {
  console.log("🚀 Server running at http://localhost:3000");
});
