console.log("USER PAGE LOADED");

const video = document.getElementById("video");

let socket;
let recorder;

/* ----------------------------------
   START AFTER PERMISSION
----------------------------------- */
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    video.srcObject = stream;
    video.muted = true;

    socket = io();

    const cameraId = "Camera-" + Math.floor(Math.random() * 10000);
    socket.emit("register", { role: "user", cameraId });

    // 🔴 START SERVER RECORDING
    socket.emit("start-recording", { cameraId });

    recorder = new MediaRecorder(stream, {
      mimeType: "video/webm; codecs=vp8,opus"
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        e.data.arrayBuffer().then(buffer => {
          socket.emit("recording-chunk", buffer);
        });
      }
    };

    recorder.start(1000); // ⏱ 1 second chunks
    console.log("🔴 Recording started");

    window.addEventListener("beforeunload", stopRecording);
  })
  .catch(err => {
    alert("Camera & mic required");
    console.error(err);
  });

function stopRecording() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
    socket.emit("stop-recording");
    console.log("⏹ Recording stopped");
  }
}
