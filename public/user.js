console.log("USER PAGE LOADED");

const video = document.getElementById("video");

let socket;
let peer;
let recorder;
let recordedChunks = [];

/* ----------------------------------
   ENTRY POINT
----------------------------------- */
checkPermissionAndStart();

/* ----------------------------------
   CHECK PERMISSION STATUS
----------------------------------- */
async function checkPermissionAndStart() {
  try {
    const cam = await navigator.permissions.query({ name: "camera" });
    const mic = await navigator.permissions.query({ name: "microphone" });

    if (cam.state === "granted" && mic.state === "granted") {
      requestMedia();
    } else if (cam.state === "denied" || mic.state === "denied") {
      blockSite();
    } else {
      requestMedia();
    }

    cam.onchange = mic.onchange = () => location.reload();
  } catch {
    requestMedia();
  }
}

/* ----------------------------------
   REQUEST CAMERA & MIC
----------------------------------- */
function requestMedia() {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(startApp)
    .catch(blockSite);
}

/* ----------------------------------
   START APP AFTER ALLOW
----------------------------------- */
function startApp(stream) {
  console.log("Camera & Mic allowed");

  // Show preview
  video.srcObject = stream;
  video.muted = true;

  // 🔴 START RECORDING
  startRecording(stream);

  // 🔗 SOCKET CONNECT
  socket = io();

  const cameraId = "Camera-" + Math.floor(Math.random() * 10000);
  socket.emit("register", { role: "user", cameraId });

  socket.on("signal", async ({ from, data }) => {
    if (!peer) {
      peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      stream.getTracks().forEach(t => peer.addTrack(t, stream));

      peer.onicecandidate = e => {
        if (e.candidate) {
          socket.emit("signal", { to: from, data: e.candidate });
        }
      };
    }

    if (data.type === "offer") {
      await peer.setRemoteDescription(data);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("signal", { to: from, data: answer });
    }

    if (data.candidate) {
      await peer.addIceCandidate(data);
    }
  });
}

/* ----------------------------------
   RECORD STREAM
----------------------------------- */
function startRecording(stream) {
  recorder = new MediaRecorder(stream, {
    mimeType: "video/webm; codecs=vp8,opus"
  });

  recorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  recorder.onstop = saveRecording;

  recorder.start();
  console.log("🔴 Recording started");

  // Stop & save when tab closes
  window.addEventListener("beforeunload", stopRecording);
}

function stopRecording() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
    console.log("⏹ Recording stopped");
  }
}

function saveRecording() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `recording-${Date.now()}.webm`;
  a.click();

  URL.revokeObjectURL(url);
  recordedChunks = [];
}

/* ----------------------------------
   BLOCK SITE
----------------------------------- */
function blockSite() {
  document.body.innerHTML = `
    <div style="font-family:sans-serif;padding:20px">
      <h2>🚫 Camera & Microphone Required</h2>
      <p>This site cannot work without camera & mic access.</p>

      <h4>How to allow:</h4>
      <ol>
        <li>Click the 🔒 lock icon in the address bar</li>
        <li>Set Camera → <b>Allow</b></li>
        <li>Set Microphone → <b>Allow</b></li>
        <li>Reload the page</li>
      </ol>

      <button onclick="location.reload()">🔁 Retry</button>
    </div>
  `;
}
