console.log("USER PAGE LOADED");

const socket = io();

const cameraId = "Camera-" + Math.floor(Math.random() * 10000);

console.log("Registering USER with", cameraId);

socket.emit("register", {
  role: "user",
  cameraId
});

const video = document.getElementById("video");
let peer;

navigator.mediaDevices.getUserMedia({
  video: true,
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
})

  .then((stream) => {
    console.log("Camera access granted");

    video.srcObject = stream;
    video.muted = true;


    socket.on("signal", async ({ from, data }) => {
      console.log("USER received:", data.type || "ICE");

      if (!peer) {
        peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

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
  });
