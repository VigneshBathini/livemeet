// VideoConference.jsx
import React, { useState, useRef } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';

const Video = () => {
  const [roomId, setRoomId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [inRoom, setInRoom] = useState(false);
  const [peers, setPeers] = useState({});
  const [debugLog, setDebugLog] = useState([]);

  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});

  const logDebug = (msg) => setDebugLog((prev) => [...prev, msg]);

  const joinRoom = async () => {
    if (!roomId.trim()) {
      logDebug('Please enter a Room ID.');
      return;
    }

    logDebug(`Joining room: ${roomId}`);

    // Connect socket
    socketRef.current = io('https://livemeet-ribm.onrender.com');

    // Get local stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
        logDebug('Local stream acquired.');
      }
    } catch (err) {
      logDebug(`Error accessing media: ${err.message}`);
      return;
    }

    // Socket listeners
    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-left', handleUserLeft);

    // Tell server we joined
    socketRef.current.emit('join-room', roomId);

    setInRoom(true);
  };

  const createPeer = (userId, initiator) => {
    const peer = new SimplePeer({
      initiator,
      trickle: false,
      stream: localStream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:relay1.expressturn.com:3478',
            username: 'efFjNn6ZpYbyQH5a',
            credential: 'Rj7aYz2cGJ7SkFhK'
          }
        ]
      }
    });

    peer.on('signal', (signal) => {
      logDebug(`Sending ${initiator ? 'offer' : 'answer'} to ${userId}`);
      socketRef.current.emit(initiator ? 'offer' : 'answer', { signal, to: userId });
    });

    peer.on('stream', (stream) => {
      logDebug(`Received stream from ${userId}`);
      if (peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId].srcObject = stream;
      }
    });

    peer.on('error', (err) => logDebug(`Peer error (${userId}): ${err.message}`));

    return peer;
  };

  const handleUserJoined = (userId) => {
    logDebug(`User joined: ${userId}`);
    const peer = createPeer(userId, true);
    setPeers((prev) => ({ ...prev, [userId]: peer }));
  };

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}`);
    const peer = createPeer(data.from, false);
    peer.signal(data.signal);
    setPeers((prev) => ({ ...prev, [data.from]: peer }));
  };

  const handleAnswer = (data) => {
    logDebug(`Received answer from ${data.from}`);
    peers[data.from]?.signal(data.signal);
  };

  const handleIceCandidate = (data) => {
    logDebug(`Received ICE candidate from ${data.from}`);
    peers[data.from]?.signal(data.candidate);
  };

  const handleUserLeft = (userId) => {
    logDebug(`User left: ${userId}`);
    if (peers[userId]) {
      peers[userId].destroy();
      delete peers[userId];
      delete peerVideoRefs.current[userId];
      setPeers({ ...peers });
    }
  };

  return (
    <div>
      {!inRoom ? (
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
        <div>
          <div className="video-container">
            <div className="video-item">
              <video ref={userVideoRef} autoPlay muted playsInline />
              <div>Your Video</div>
            </div>
            {Object.keys(peers).map((userId) => (
              <div className="video-item" key={userId}>
                <video ref={(el) => (peerVideoRefs.current[userId] = el)} autoPlay playsInline />
                <div>Peer: {userId}</div>
              </div>
            ))}
          </div>
          <div className="debug">
            <h4>Debug Log:</h4>
            <ul>
              {debugLog.map((log, index) => (
                <li key={index}>{log}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default Video;
