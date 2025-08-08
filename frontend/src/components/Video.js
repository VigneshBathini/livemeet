import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";

export default function VideoConference() {
  const [roomId, setRoomId] = useState("");
  const [joinedRoom, setJoinedRoom] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});

  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});

  useEffect(() => {
    // Connect to your deployed backend server
    socketRef.current = io("https://livemeet-server.onrender.com", {
      transports: ["websocket"],
    });

    socketRef.current.on("user-joined", (userId) => {
      console.log("New user joined:", userId);
      createPeer(userId, socketRef.current.id, localStream);
    });

    socketRef.current.on("offer", ({ signal, from }) => {
      console.log("Offer received from:", from);
      addPeer(signal, from, localStream);
    });

    socketRef.current.on("answer", ({ signal, from }) => {
      console.log("Answer received from:", from);
      peers[from]?.signal(signal);
    });

    socketRef.current.on("disconnect-user", (userId) => {
      console.log("User disconnected:", userId);
      if (peers[userId]) {
        peers[userId].destroy();
        setPeers((prev) => {
          const updated = { ...prev };
          delete updated[userId];
          return updated;
        });
      }
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [localStream]);

  // Create peer as initiator
  const createPeer = (userToSignal, callerId, stream) => {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: stream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls: "turn:relay1.expressturn.com:3478",
            username: "efFjNn6ZpYbyQH5a",
            credential: "Rj7aYz2cGJ7SkFhK",
          },
        ],
      },
    });

    peer.on("signal", (signal) => {
      socketRef.current.emit("offer", { userToSignal, signal, from: callerId });
    });

    peer.on("stream", (stream) => {
      if (!peerVideoRefs.current[userToSignal]) return;
      peerVideoRefs.current[userToSignal].srcObject = stream;
    });

    setPeers((prev) => ({ ...prev, [userToSignal]: peer }));
  };

  // Add peer as receiver
  const addPeer = (incomingSignal, from, stream) => {
    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
      stream: stream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls: "turn:relay1.expressturn.com:3478",
            username: "efFjNn6ZpYbyQH5a",
            credential: "Rj7aYz2cGJ7SkFhK",
          },
        ],
      },
    });

    peer.on("signal", (signal) => {
      socketRef.current.emit("answer", { signal, to: from });
    });

    peer.on("stream", (stream) => {
      if (!peerVideoRefs.current[from]) return;
      peerVideoRefs.current[from].srcObject = stream;
    });

    peer.signal(incomingSignal);

    setPeers((prev) => ({ ...prev, [from]: peer }));
  };

  // Join room after entering ID
  const joinRoom = () => {
    if (roomId && socketRef.current) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          setLocalStream(stream);
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = stream;
          }
          socketRef.current.emit("join-room", roomId, socketRef.current.id);
          setJoinedRoom(true);
        })
        .catch((err) => console.error("Media access error:", err));
    } else {
      console.log("Room ID is empty or socket not ready");
    }
  };

  return (
    <div>
      {!joinedRoom ? (
        <div className="join-room">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter Room ID"
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <div className="video-container">
          <div className="video-item">
            <video ref={userVideoRef} autoPlay muted playsInline />
            <div>Your Video</div>
          </div>
          {Object.keys(peers).map((userId) => (
            <div className="video-item" key={userId}>
              <video
                ref={(el) => (peerVideoRefs.current[userId] = el)}
                autoPlay
                playsInline
              />
              <div>Peer: {userId}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
