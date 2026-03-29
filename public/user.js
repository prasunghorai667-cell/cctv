console.log("USER PAGE LOADED");

const video = document.getElementById("video");

let peer;
let socket;
let currentStream = null;
let currentVideoTrack = null;
let adminId = null;

// 🔥 START APP
async function start() {
  try {
    // 🔥 Initial camera (FRONT default)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });

    currentStream = stream;
    currentVideoTrack = stream.getVideoTracks()[0];

    video.srcObject = stream;
    video.muted = true;

    console.log("Mobile camera ready");

    // 🔥 SOCKET CONNECT
    socket = io();

    const cameraId = "Camera-" + Math.floor(Math.random() * 10000);

    socket.emit("register", {
      role: "user",
      cameraId
    });

    // 🔥 SIGNAL HANDLING
    socket.on("signal", async ({ from, data }) => {
      adminId = from;

      if (!peer) {
        peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        // ADD TRACKS ONCE
        currentStream.getTracks().forEach(track => {
          peer.addTrack(track, currentStream);
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

    // 🎛 CONTROL FROM ADMIN
    socket.on("control", async (action) => {
      if (!peer) return;

      console.log("🎛 Mobile control:", action);

      if (action === "front") {
        await switchCamera("user");
      }

      if (action === "back") {
        await switchCamera("environment");
      }

      if (action === "audio-on") {
        toggleAudio(true);
      }

      if (action === "audio-off") {
        toggleAudio(false);
      }

      // 🚫 IGNORE "both" on mobile (not supported)
    });

  } catch (err) {
    console.error("Camera error:", err);
  }
}

// 🔥 MOBILE CAMERA SWITCH (SMOOTH)
async function switchCamera(mode) {
  try {
    console.log("Switching to:", mode);

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: mode } },
      audio: false // 🔥 IMPORTANT (avoid mic restart glitch)
    });

    const newVideoTrack = newStream.getVideoTracks()[0];

    // 🔥 Replace ONLY video track (smooth switch)
    const sender = peer.getSenders().find(s => s.track && s.track.kind === "video");

    if (sender) {
      await sender.replaceTrack(newVideoTrack);
    }

    // Stop old video track only
    if (currentVideoTrack) {
      currentVideoTrack.stop();
    }

    currentVideoTrack = newVideoTrack;

    // Update local preview
    const combinedStream = new MediaStream([
      newVideoTrack,
      ...currentStream.getAudioTracks()
    ]);

    video.srcObject = combinedStream;

  } catch (err) {
    console.warn("Exact mode failed, fallback...");

    // 🔥 fallback for iPhone / some Android
    const fallbackStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode },
      audio: false
    });

    const fallbackTrack = fallbackStream.getVideoTracks()[0];

    const sender = peer.getSenders().find(s => s.track && s.track.kind === "video");

    if (sender) {
      await sender.replaceTrack(fallbackTrack);
    }

    if (currentVideoTrack) {
      currentVideoTrack.stop();
    }

    currentVideoTrack = fallbackTrack;

    const combinedStream = new MediaStream([
      fallbackTrack,
      ...currentStream.getAudioTracks()
    ]);

    video.srcObject = combinedStream;
  }
}

// 🔥 AUDIO CONTROL (STABLE)
function toggleAudio(enable) {
  if (!currentStream) return;

  console.log("Audio:", enable ? "ON" : "OFF");

  currentStream.getAudioTracks().forEach(track => {
    track.enabled = enable;
  });
}

// START
start();