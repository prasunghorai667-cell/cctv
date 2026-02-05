console.log("ADMIN PAGE LOADED");

const password = "Linux@2025";
const userEnteredPassword = prompt('please enter your password');

if(password == userEnteredPassword) {
    const socket = io();

    socket.emit("register", {
    role: "admin",
    });

    const container = document.getElementById("videos");
    const peers = {};

    socket.on("new-user", async ({ socketId, cameraId }) => {
    console.log("📹 New user:", socketId, cameraId);

    const wrapper = document.createElement("div");

    const label = document.createElement("h4");
    label.innerText = cameraId;

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;

    wrapper.appendChild(label);
    wrapper.appendChild(video);
    container.appendChild(wrapper);

    const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peers[socketId] = peer;

    // 🔑 THIS IS THE MAGIC LINE
    peer.addTransceiver("video", { direction: "recvonly" });

    peer.ontrack = (e) => {
        console.log("🎥 Video track received from", socketId);
        video.srcObject = e.streams[0];
    };

    peer.onicecandidate = (e) => {
        if (e.candidate) {
        socket.emit("signal", {
            to: socketId,
            data: e.candidate,
        });
        }
    };

    console.log("📡 Creating offer for", socketId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit("signal", {
        to: socketId,
        data: offer,
    });
    });

    socket.on("signal", async ({ from, data }) => {
    const peer = peers[from];
    if (!peer) return;

    if (data.type === "answer") {
        console.log("📡 Answer received from", from);
        await peer.setRemoteDescription(data);
    } else if (data.candidate) {
        await peer.addIceCandidate(data);
    }
    });
}else {
   alert("FUCK YOU!");
   window.history.back();
}
