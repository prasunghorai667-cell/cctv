console.log("ADMIN PAGE LOADED");

// 🔐 SIMPLE PASSWORD CHECK
const password = "Linux@2025%";
const userEnteredPassword = prompt("Please enter admin password");

if (password !== userEnteredPassword) {
  alert("Wrong password");
  window.location.href = "/";
}

// 🔌 SOCKET CONNECT
const socket = io();

socket.emit("register", {
  role: "admin",
});

const container = document.getElementById("videos");
const peers = {};

// 🎛 SEND CONTROL TO USER
function sendControl(userId, action) {
  console.log("🎛 Sending control:", action, "to", userId);

  socket.emit("control", {
    to: userId,
    action,
  });
}

// 📹 WHEN NEW USER CONNECTS
socket.on("new-user", async ({ socketId, cameraId }) => {
  console.log("📹 New user:", socketId, cameraId);

  // 📦 WRAPPER
  const wrapper = document.createElement("div");
  wrapper.style.border = "1px solid #ccc";
  wrapper.style.margin = "10px";
  wrapper.style.padding = "10px";

  // 🏷 LABEL
  const label = document.createElement("h4");
  label.innerText = cameraId;

  // 🎥 VIDEO CONTAINER (MULTIPLE STREAM SUPPORT)
  const videoContainer = document.createElement("div");

  // 🎛 CONTROLS
  const controls = document.createElement("div");

  const btnFront = document.createElement("button");
btnFront.innerText = "Front";
btnFront.onclick = () => sendControl(socketId, "front");

const btnBack = document.createElement("button");
btnBack.innerText = "Back";
btnBack.onclick = () => sendControl(socketId, "back");

const btnBoth = document.createElement("button");
btnBoth.innerText = "Both";
btnBoth.onclick = () => sendControl(socketId, "both");

const btnAudioOn = document.createElement("button");
btnAudioOn.innerText = "Audio ON";
btnAudioOn.onclick = () => sendControl(socketId, "audio-on");

const btnAudioOff = document.createElement("button");
btnAudioOff.innerText = "Audio OFF";
btnAudioOff.onclick = () => sendControl(socketId, "audio-off");

controls.append(
  btnFront,
  btnBack,
  btnBoth,
  btnAudioOn,
  btnAudioOff
);

  wrapper.appendChild(label);
  wrapper.appendChild(controls);
  wrapper.appendChild(videoContainer);
  container.appendChild(wrapper);

  // 🔗 CREATE PEER
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peers[socketId] = {
    peer,
    videoContainer,
  };

  // 🎯 RECEIVE MULTIPLE TRACKS
  peer.ontrack = (e) => {
    console.log("🎥 Track received:", e.track.kind, "from", socketId);

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.controls = true;
    video.style.width = "300px";
    video.style.margin = "5px";

    video.srcObject = e.streams[0];

    videoContainer.appendChild(video);
  };

  // 📡 ICE
  peer.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("signal", {
        to: socketId,
        data: e.candidate,
      });
    }
  };

  // 🔑 RECEIVE ONLY MODE
  peer.addTransceiver("video", { direction: "recvonly" });
  peer.addTransceiver("audio", { direction: "recvonly" });

  console.log("📡 Creating offer for", socketId);

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  socket.emit("signal", {
    to: socketId,
    data: offer,
  });
});

// 📡 HANDLE SIGNALS
socket.on("signal", async ({ from, data }) => {
  const entry = peers[from];
  if (!entry) return;

  const peer = entry.peer;

  if (data.type === "answer") {
    console.log("📡 Answer received from", from);
    await peer.setRemoteDescription(data);
  } else if (data.candidate) {
    await peer.addIceCandidate(data);
  }
});

// ❌ USER DISCONNECT
socket.on("user-left", (socketId) => {
  console.log("❌ User left:", socketId);

  if (peers[socketId]) {
    peers[socketId].peer.close();
    delete peers[socketId];
  }
});