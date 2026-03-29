console.log("USER PAGE LOADED");

const video = document.getElementById("video");

let peer;
let socket;
let currentStream = null;
let currentVideoTrack = null;
let adminId = null;

let frontCameraId = null;
let backCameraId = null;
let currentCameraId = null;
let currentFacingMode = "user";
let cameraPermissionGranted = false;
let isConnected = false;
let pendingRenegotiation = false;

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { 
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject"
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject"
  }
];

function updateStatusUI(status, message, showButton = false) {
  const indicator = document.getElementById('status-indicator');
  const text = document.getElementById('permission-text');
  const msg = document.getElementById('permission-msg');
  const btn = document.getElementById('enable-btn');
  
  if (indicator) {
    indicator.className = 'status-indicator ' + status;
  }
  
  if (text) {
    text.textContent = message;
  }
  
  if (msg) {
    if (showButton) {
      msg.classList.add('show');
      msg.innerHTML = message;
    } else {
      msg.classList.remove('show');
    }
  }
  
  if (btn) {
    btn.style.display = showButton ? 'inline-block' : 'none';
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
    
    cameras.forEach((cam, index) => {
      const label = (cam.label || '').toLowerCase();
      const deviceId = cam.deviceId;
      
      console.log(`Camera ${index}:`, cam.label || 'No label', "| ID:", deviceId);
      
      if (label.includes('front') || label.includes('front')) {
        frontCameraId = deviceId;
        console.log("  → Identified as FRONT camera");
      } else if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
        backCameraId = deviceId;
        console.log("  → Identified as BACK camera");
      }
    });
    
    if (!frontCameraId && cameras.length >= 1) {
      frontCameraId = cameras[0].deviceId;
      console.log("  → Using Camera 0 as FRONT (by default)");
    }
    
    if (!backCameraId && cameras.length >= 2) {
      backCameraId = cameras[1].deviceId;
      console.log("  → Using Camera 1 as BACK (by default)");
    } else if (!backCameraId && cameras.length === 1) {
      backCameraId = cameras[0].deviceId;
      console.log("  → Only one camera available, using same for BACK");
    }
    
    console.log("frontCameraId:", frontCameraId);
    console.log("backCameraId:", backCameraId);
    
    return cameras;
  } catch (err) {
    console.error("Failed to enumerate cameras:", err);
    return [];
  }
}

async function requestCameraAccess() {
  updateStatusUI('prompt', 'Requesting camera access...', false);
  
  try {
    console.log("Requesting camera access...");
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    
    console.log("Camera access granted!");
    
    cameraPermissionGranted = true;
    currentStream = stream;
    currentVideoTrack = stream.getVideoTracks()[0];
    currentFacingMode = "user";
    
    video.srcObject = stream;
    video.muted = true;
    
    updateStatusUI('granted', 'Camera Connected', false);
    updateCameraBadge('front');
    
    await enumerateCameras();
    
    connectToServer();
    
  } catch (err) {
    console.error("Camera access error:", err.name, err.message);
    
    let errorMessage = 'Camera access failed.';
    
    if (err.name === 'NotAllowedError') {
      errorMessage = 'Camera access denied. Please tap the button below and allow camera access.';
    } else if (err.name === 'NotFoundError') {
      errorMessage = 'No camera found on this device.';
    } else if (err.name === 'NotReadableError') {
      errorMessage = 'Camera is in use by another app. Please close other apps.';
    } else if (err.name === 'OverconstrainedError') {
      errorMessage = 'Camera settings not supported.';
    } else if (err.name === 'SecurityError') {
      errorMessage = 'HTTPS required for camera access.';
    } else {
      errorMessage = 'Camera error: ' + err.message;
    }
    
    updateStatusUI('denied', errorMessage, true);
  }
}

function connectToServer() {
  console.log("Connecting to server...");
  
  socket = io();

  const cameraId = "Camera-" + Math.floor(Math.random() * 10000);

  socket.on("connect", () => {
    console.log("✅ Socket connected:", socket.id);
    updateStatusUI('connected', 'Connected - Waiting for admin...', false);
    
    socket.emit("register", {
      role: "user",
      cameraId
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected");
    isConnected = false;
    updateStatusUI('prompt', 'Disconnected - Tap to reconnect', true);
  });

  socket.on("signal", async ({ from, data }) => {
    adminId = from;
    console.log("📡 Signal received from:", from);

    if (!peer) {
      console.log("Creating new RTCPeerConnection...");
      peer = new RTCPeerConnection({
        iceServers: ICE_SERVERS
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

      peer.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", peer.iceConnectionState);
        
        if (peer.iceConnectionState === 'connected') {
          console.log("✅ WebRTC Connected!");
          isConnected = true;
          updateStatusUI('connected', 'Connected to Admin', false);
        } else if (peer.iceConnectionState === 'failed') {
          console.error("❌ WebRTC Failed");
          isConnected = false;
          updateStatusUI('denied', 'Connection failed - Tap to retry', true);
          setTimeout(() => reconnectPeer(), 2000);
        } else if (peer.iceConnectionState === 'disconnected') {
          console.warn("⚠️ WebRTC disconnected");
          isConnected = false;
        }
      };

      peer.onicegatheringstatechange = () => {
        console.log("ICE Gathering State:", peer.iceGatheringState);
      };

      peer.ontrack = (e) => {
        console.log("🎥 Track received:", e.track.kind);
      };
    }

    if (data.type === "offer") {
      console.log("📨 Received offer, creating answer...");
      await peer.setRemoteDescription(data);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("signal", {
        to: from,
        data: answer
      });
      console.log("📤 Sent answer");
      
      if (pendingRenegotiation) {
        console.log("Renegotiation complete");
        pendingRenegotiation = false;
      }
    } else if (data.candidate) {
      try {
        await peer.addIceCandidate(data);
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    }
  });

  socket.on("control", async (action) => {
    console.log("🎛 Control received:", action);

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
}

async function reconnectPeer() {
  if (!adminId || !socket) return;
  
  console.log("Attempting to reconnect peer...");
  
  try {
    if (peer) {
      peer.close();
    }
    
    peer = new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });

    currentStream.getTracks().forEach(track => {
      peer.addTrack(track, currentStream);
    });

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("signal", {
          to: adminId,
          data: e.candidate
        });
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peer.iceConnectionState);
      
      if (peer.iceConnectionState === 'connected') {
        console.log("✅ WebRTC Reconnected!");
        isConnected = true;
        updateStatusUI('connected', 'Reconnected to Admin', false);
      } else if (peer.iceConnectionState === 'failed') {
        console.error("❌ WebRTC Reconnection Failed");
        setTimeout(() => reconnectPeer(), 3000);
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit("signal", {
      to: adminId,
      data: offer
    });
    
    console.log("Reconnection offer sent");
  } catch (err) {
    console.error("Reconnection error:", err);
    setTimeout(() => reconnectPeer(), 3000);
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

  const targetCameraId = target === "front" ? frontCameraId : backCameraId;
  
  if (!targetCameraId) {
    console.error("Camera ID not found for:", target);
    return false;
  }

  if (currentCameraId === targetCameraId) {
    console.log("Already using this camera:", target);
    return true;
  }

  console.log("Switching camera to:", target, "| Camera ID:", targetCameraId);

  if (pendingRenegotiation) {
    console.log("Renegotiation already in progress, waiting...");
    return false;
  }

  try {
    const audioTracks = currentStream.getAudioTracks();
    let newStream;
    let newVideoTrack;

    const constraints = [
      { video: { deviceId: { exact: targetCameraId } }, audio: false },
      { video: { deviceId: targetCameraId }, audio: false },
      { video: { facingMode: target === "front" ? "user" : "environment" }, audio: false },
      { video: true, audio: false }
    ];

    let lastError = null;
    
    for (let i = 0; i < constraints.length; i++) {
      try {
        console.log("Trying method", i + 1, "...");
        newStream = await navigator.mediaDevices.getUserMedia(constraints[i]);
        newVideoTrack = newStream.getVideoTracks()[0];
        console.log("Method", i + 1, "succeeded! Track:", newVideoTrack.label);
        break;
      } catch (err) {
        lastError = err;
        console.warn("Method", i + 1, "failed:", err.name, err.message);
      }
    }

    if (!newStream || !newVideoTrack) {
      console.error("All methods failed");
      throw lastError;
    }

    if (currentVideoTrack) {
      currentVideoTrack.stop();
    }

    currentStream.getTracks().forEach(track => track.stop());
    
    currentStream = new MediaStream([
      newVideoTrack,
      ...audioTracks
    ]);
    
    video.srcObject = currentStream;
    currentVideoTrack = newVideoTrack;
    currentCameraId = targetCameraId;
    currentFacingMode = target === "front" ? "user" : "environment";

    console.log("Triggering renegotiation...");
    pendingRenegotiation = true;
    
    await renegotiatePeer();
    
    updateCameraBadge(target);
    console.log("Camera switched successfully to:", target);
    return true;

  } catch (err) {
    console.error("Camera switch failed:", err);
    pendingRenegotiation = false;
    return false;
  }
}

async function renegotiatePeer() {
  if (!peer || !adminId || !socket) {
    console.error("Cannot renegotiate: missing peer, adminId, or socket");
    pendingRenegotiation = false;
    return;
  }

  console.log("Starting renegotiation...");

  try {
    const senders = peer.getSenders();
    const videoSender = senders.find(s => s.track && s.track.kind === "video");
    
    if (videoSender && currentVideoTrack) {
      console.log("Replacing video track...");
      await videoSender.replaceTrack(currentVideoTrack);
    }

    console.log("Creating renegotiation offer...");
    const offer = await peer.createOffer({ iceRestart: true });
    await peer.setLocalDescription(offer);

    socket.emit("signal", {
      to: adminId,
      data: offer
    });

    console.log("Renegotiation offer sent");

  } catch (err) {
    console.error("Renegotiation failed:", err);
    pendingRenegotiation = false;
  }
}

function toggleAudio(enable) {
  if (!currentStream) return;

  currentStream.getAudioTracks().forEach(track => {
    track.enabled = enable;
  });
}

function enableCamera() {
  console.log("Enable camera button clicked");
  requestCameraAccess();
}

updateStatusUI('prompt', 'Tap the button to enable camera', true);
