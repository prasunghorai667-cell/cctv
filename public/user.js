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
      console.log("🎛 Mobile control received:", action);

      if (action === "front") {
        const success = await switchCamera("user");
        if (success && adminId) {
          console.log("📷 Camera switched to front, notifying admin");
          socket.emit("camera-switched", { to: adminId, camera: "front" });
        }
      }

      if (action === "back") {
        const success = await switchCamera("environment");
        if (success && adminId) {
          console.log("📷 Camera switched to back, notifying admin");
          socket.emit("camera-switched", { to: adminId, camera: "back" });
        }
      }

      if (action === "audio-on") {
        toggleAudio(true);
      }

      if (action === "audio-off") {
        toggleAudio(false);
      }

      if (action === "both") {
        console.log("🚫 'both' action not supported on mobile");
      }
    });

  } catch (err) {
    console.error("Camera error:", err);
  }
}

// 🔥 MOBILE CAMERA SWITCH (SMOOTH)
async function switchCamera(mode) {
  if (!peer) {
    console.error("❌ Peer not initialized yet");
    return false;
  }

  try {
    console.log("📷 Switching camera to:", mode);

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: mode } },
      audio: false
    });

    const newVideoTrack = newStream.getVideoTracks()[0];

    const sender = peer.getSenders().find(s => s.track && s.track.kind === "video");

    if (sender) {
      await sender.replaceTrack(newVideoTrack);
      console.log("✅ Video track replaced successfully");
    } else {
      console.warn("⚠️ No video sender found, adding track");
      peer.addTrack(newVideoTrack, newStream);
    }

    if (currentVideoTrack) {
      currentVideoTrack.stop();
    }

    currentVideoTrack = newVideoTrack;

    const combinedStream = new MediaStream([
      newVideoTrack,
      ...currentStream.getAudioTracks()
    ]);

    video.srcObject = combinedStream;
    return true;

  } catch (err) {
    console.warn("Exact mode failed, trying fallback:", err.message);

    try {
      const fallbackStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: false
      });

      const fallbackTrack = fallbackStream.getVideoTracks()[0];

      const sender = peer.getSenders().find(s => s.track && s.track.kind === "video");

      if (sender) {
        await sender.replaceTrack(fallbackTrack);
        console.log("✅ Fallback video track replaced");
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
      return true;

    } catch (fallbackErr) {
      console.error("❌ Camera switch failed:", fallbackErr);
      return false;
    }
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