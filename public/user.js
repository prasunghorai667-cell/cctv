console.log("USER PAGE LOADED");

const video = document.getElementById("video");
let peer;
let socket;

// STEP 1 — Ask for camera FIRST
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
})
.then((stream) => {
  console.log("Camera access granted");

  // Show local preview
  video.srcObject = stream;
  video.muted = true;

  // STEP 2 — ONLY NOW connect to server
  socket = io();

  const cameraId = "Camera-" + Math.floor(Math.random() * 10000);
  console.log("Registering USER with", cameraId);

  socket.emit("register", {
    role: "user",
    cameraId
  });

  socket.on("signal", async ({ from, data }) => {
    console.log("USER received:", data.type || "ICE");

    if (!peer) {
      peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      // Send camera + mic to admin
      stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
      });

      peer.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("signal", {
            to: from,
            data: e.candidate
          });
        }
      };
    }

    if (data.type === "offer") {
      await peer.setRemoteDescription(data);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("signal", {
        to: from,
        data: answer
      });
    } else if (data.candidate) {
      await peer.addIceCandidate(data);
    }
  });
})
.catch(err => {
  console.error("Camera error:", err);

  // 🔥 HARD STOP — NO SOCKET, NO LOGIN
  if (err.name === "NotAllowedError") {
    alert(
      "Camera & microphone access is REQUIRED to use this site.\n\n" +
      "Please allow permissions and reload the page."
    );
  } else if (err.name === "NotFoundError") {
    alert("No camera or microphone found on this device.");
  } else {
    alert("Camera error: " + err.message);
  }

  // Optional: visually block the page
  document.body.innerHTML = `
    <h2>Camera & Mic Permission Required</h2>
    <p>Please allow access and reload the page.</p>
  `;
});
