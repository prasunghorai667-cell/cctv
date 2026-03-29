const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve frontend files
app.use(express.static("public"));

// Store users
// socketId -> { role, cameraId }
const users = {};

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // ==============================
  // REGISTER USER / ADMIN
  // ==============================
  socket.on("register", ({ role, cameraId }) => {
    console.log("📥 Register:", socket.id, role, cameraId);

    users[socket.id] = { role, cameraId };

    // 🔹 USER JOINED → notify admin
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

    // 🔹 ADMIN JOINED → send all users
    if (role === "admin") {
      console.log("🛠 Admin joined. Sending users...");

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

  // ==============================
  // WEBRTC SIGNALING
  // ==============================
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

  // ==============================
  // 🔥 ADMIN CONTROL SYSTEM
  // ==============================
  socket.on("control", ({ to, action }) => {
    console.log(
      "🎛 Control:",
      socket.id,
      "→",
      to,
      "| Action:",
      action
    );

    // Only allow admin to control users
    if (users[socket.id]?.role !== "admin") {
      console.log("❌ Unauthorized control attempt");
      return;
    }

    // Send control to target user
    io.to(to).emit("control", action);
  });

  // ==============================
  // CAMERA SWITCHED NOTIFICATION
  // ==============================
  socket.on("camera-switched", ({ to, camera }) => {
    console.log("📷 Camera switched:", socket.id, "→", camera);

    io.to(to).emit("camera-switched", {
      from: socket.id,
      camera
    });
  });

  // ==============================
  // DISCONNECT
  // ==============================
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);

    delete users[socket.id];

    // Notify everyone user left
    io.emit("user-left", socket.id);
  });
});

// ==============================
// GET ADMIN SOCKET ID
// ==============================
function getAdmin() {
  return Object.keys(users).find(
    (id) => users[id].role === "admin"
  );
}

// ==============================
// START SERVER
// ==============================
server.listen(3000, () => {
  console.log("🚀 Server running at http://localhost:3000");
});