console.log("USER PAGE LOADED");

const video = document.getElementById("video");

let peer;
let socket;
let currentStream = null;
let currentVideoTrack = null;
let adminId = null;

let frontCameraId = null;
let backCameraId = null;
let currentFacingMode = "user";
let cameraPermissionGranted = false;

function updatePermissionUI(state) {
  const indicator = document.getElementById('status-indicator');
  const text = document.getElementById('permission-text');
  const msg = document.getElementById('permission-msg');
  
  if (!indicator || !text || !msg) return;
  
  indicator.className = 'status-indicator ' + state;
  
  if (state === 'granted') {
    text.textContent = 'Camera Connected';
    msg.classList.remove('show');
  } else if (state === 'denied') {
    text.textContent = 'Camera Denied';
    msg.classList.add('show');
    msg.style.background = '#f44336';
    msg.textContent = 'Camera access is blocked. Please enable camera in browser settings.';
  } else {
    text.textContent = 'Waiting for permission...';
    msg.classList.add('show');
  }
}

function updateCameraBadge(camera) {
  const badge = document.getElementById('camera-badge');
  if (badge) {
    badge.style.display = 'inline-block';
    badge.textContent = camera.toUpperCase();
    badge.style.background = camera === 'front' ? '#2196F3' : '#4CAF50';
  }
}

async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');
    
    console.log("Available cameras:", cameras.length);
    
    frontCameraId = null;
    backCameraId = null;
    
    if (cameras.length >= 2) {
      frontCameraId = cameras[0].deviceId;
      backCameraId = cameras[1].deviceId;
    } else if (cameras.length === 1) {
      frontCameraId = cameras[0].deviceId;
      backCameraId = cameras[0].deviceId;
    }
    
    cameras.forEach((cam, index) => {
      console.log(`Camera ${index}:`, cam.label || 'No label', "| ID:", cam.deviceId);
    });
    
    console.log("frontCameraId:", frontCameraId);
    console.log("backCameraId:", backCameraId);
    
    return cameras;
  } catch (err) {
    console.error("Failed to enumerate cameras:", err);
    return [];
  }
}

async function start() {
  try {
    updatePermissionUI('prompt');
    
    let stream;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (!stream && attempts < maxAttempts) {
      attempts++;
      console.log("Camera access attempt:", attempts);
      
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        console.log("Camera access granted!");
      } catch (err) {
        console.warn("Attempt", attempts, "failed:", err.message);
        
        if (attempts >= maxAttempts) {
          throw err;
        }
        
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    cameraPermissionGranted = true;
    currentStream = stream;
    currentVideoTrack = stream.getVideoTracks()[0];
    currentFacingMode = "user";
    
    video.srcObject = stream;
    video.muted = true;
    
    updatePermissionUI('granted');
    updateCameraBadge('front');
    console.log("Mobile camera ready");
    
    await enumerateCameras();
    
    socket = io();

    const cameraId = "Camera-" + Math.floor(Math.random() * 10000);

    socket.emit("register", {
      role: "user",
      cameraId
    });

    socket.on("signal", async ({ from, data }) => {
      adminId = from;

      if (!peer) {
        peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

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

    socket.on("control", async (action) => {
      console.log("Control received:", action);

      if (action === "front") {
        const success = await switchCamera("front");
        if (success && adminId) {
          socket.emit("camera-switched", { to: adminId, camera: "front" });
        }
      }

      if (action === "back") {
        const success = await switchCamera("back");
        if (success && adminId) {
          socket.emit("camera-switched", { to: adminId, camera: "back" });
        }
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
    updatePermissionUI('denied');
  }
}

async function switchCamera(target) {
  if (!peer) {
    console.error("Peer not initialized yet");
    return false;
  }

  if (!cameraPermissionGranted) {
    console.error("Camera permission not granted");
    return false;
  }

  const targetFacing = target === "front" ? "user" : "environment";
  
  if (currentFacingMode === targetFacing && currentVideoTrack) {
    console.log("Already using this camera:", targetFacing);
    return true;
  }

  console.log("Switching camera to:", target);

  try {
    let newStream;
    let newVideoTrack;

    const methods = [
      () => navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetFacing },
        audio: false
      }),
      () => navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: targetFacing } },
        audio: false
      }),
      () => navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      })
    ];

    let lastError = null;
    
    for (let i = 0; i < methods.length; i++) {
      try {
        newStream = await methods[i]();
        console.log("Method", i + 1, "succeeded");
        break;
      } catch (err) {
        lastError = err;
        console.warn("Method", i + 1, "failed:", err.message);
      }
    }

    if (!newStream) {
      console.error("All methods failed");
      throw lastError;
    }

    newVideoTrack = newStream.getVideoTracks()[0];

    const sender = peer.getSenders().find(s => s.track && s.track.kind === "video");

    if (sender) {
      await sender.replaceTrack(newVideoTrack);
      console.log("Video track replaced");
    } else {
      peer.addTrack(newVideoTrack, newStream);
    }

    if (currentVideoTrack) {
      currentVideoTrack.stop();
    }

    currentVideoTrack = newVideoTrack;
    currentFacingMode = targetFacing;

    const combinedStream = new MediaStream([
      newVideoTrack,
      ...currentStream.getAudioTracks()
    ]);

    video.srcObject = combinedStream;
    updateCameraBadge(target);
    console.log("Camera switched to:", target);
    return true;

  } catch (err) {
    console.error("Camera switch failed:", err);
    return false;
  }
}

function toggleAudio(enable) {
  if (!currentStream) return;

  currentStream.getAudioTracks().forEach(track => {
    track.enabled = enable;
  });
}

start();
