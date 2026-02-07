console.log("USER PAGE LOADED");

const video = document.getElementById("video");

let socket;
let peer;

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

    console.log("Camera:", cam.state, "Mic:", mic.state);

    if (cam.state === "granted" && mic.state === "granted") {
      requestMedia();
    } else if (cam.state === "denied" || mic.state === "denied") {
      blockSite();
    } else {
      // prompt state
      requestMedia();
    }

    // 🔁 Listen for permission change
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
    .catch(() => blockSite());
}

/* ----------------------------------
   START APP AFTER ALLOW
----------------------------------- */
function startApp(stream) {
  console.log("Camera & Mic allowed");

  video.srcObject = stream;
  video.muted = true;

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
   BLOCK SITE UNTIL PERMISSION
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
