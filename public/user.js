console.log("USER PAGE LOADED");

const video = document.getElementById("video");

let socket;
let recorder;

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {

    video.srcObject = stream;
    video.muted = true;

    socket = io();

    recorder = new MediaRecorder(stream, {
      mimeType: "video/webm; codecs=vp8,opus"
    });

    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        const buffer = await e.data.arrayBuffer();
        socket.emit("recording-chunk", buffer);
      }
    };

    recorder.start(1000); // send every 1 sec
    console.log("🔴 Recording started");

    window.addEventListener("beforeunload", stopRecording);
  })
  .catch(() => {
    alert("Camera & microphone required.");
  });

function stopRecording() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }
}
