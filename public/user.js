console.log("USER PAGE LOADED");

const video = document.getElementById("video");

let peer;
let socket;
let currentStream = null;
let adminId = null;

// 🔥 START APP
async function start() {
  try {
    // STEP 1 — Ask permission FIRST
    await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    console.log("Camera permission granted");

    // STEP 2 — Connect socket
    socket = io();

    const cameraId = "Camera-" + Math.floor(Math.random() * 10000);

    socket.emit("register", {
      role: "user",
      cameraId
    });

    // 🔥 SIGNAL HANDLING
    socket.on("signal", async ({ from, data }) => {
      adminId = from;

      console.log("USER received:", data.type || "ICE");

      if (!peer) {
        peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
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

    // 🔥 CONTROL FROM ADMIN
    socket.on("control", async (action) => {
      console.log("🎛 Control received:", action);

      if (!peer) {
        console.warn("Peer not ready yet");
        return;
      }

      if (action === "front") {
        await switchCamera("user");
      }

      if (action === "back") {
        await switchCamera("environment");
      }

      if (action === "both") {
        await useBothCameras();
      }

      if (action === "audio-on") {
        toggleAudio(true);
      }

      if (action === "audio-off") {
        toggleAudio(false);
      }
    });

  } catch (err) {
    console.error("Camera error:", err);

    if (err.name === "NotAllowedError") {
      alert("Camera & mic permission REQUIRED.");
    } else {
      alert("Error: " + err.message);
    }
  }
}

// 🔥 SWITCH CAMERA (FRONT / BACK)
async function switchCamera(mode) {
  try {
    console.log("Switching camera:", mode);

    stopCurrentStream();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode },
      audio: true
    });

    currentStream = stream;

    video.srcObject = stream;
    video.muted = true;

    replaceTracks(stream);

  } catch (err) {
    console.error("Switch camera error:", err);
  }
}

// 🔥 BOTH CAMERAS
async function useBothCameras() {
  try {
    console.log("Using BOTH cameras");

    stopCurrentStream();

    const front = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });

    let back = null;

    try {
      back = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
    } catch (e) {
      console.warn("Back camera not supported");
    }

    currentStream = front;

    video.srcObject = front;
    video.muted = true;

    replaceTracks(front);

    // 🔥 Add BACK camera tracks separately
    if (back) {
      back.getTracks().forEach(track => {
        peer.addTrack(track, back);
      });
    }

  } catch (err) {
    console.error("Both camera error:", err);
  }
}

// 🔥 REPLACE TRACKS (IMPORTANT)
function replaceTracks(stream) {
  const senders = peer.getSenders();

  stream.getTracks().forEach(track => {
    const sender = senders.find(s => s.track && s.track.kind === track.kind);

    if (sender) {
      sender.replaceTrack(track);
    } else {
      peer.addTrack(track, stream);
    }
  });
}

// 🔥 STOP OLD STREAM
function stopCurrentStream() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
}

// 🔥 AUDIO CONTROL
function toggleAudio(enable) {
  if (!currentStream) return;

  console.log("Audio:", enable ? "ON" : "OFF");

  currentStream.getAudioTracks().forEach(track => {
    track.enabled = enable;
  });
}

// START
start();