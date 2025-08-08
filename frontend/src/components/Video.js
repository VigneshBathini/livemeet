// VideoConference.jsx
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';

const Video = () => {
  const [roomId, setRoomId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});
  const [debugLog, setDebugLog] = useState([]);
  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});

  useEffect(() => {
    socketRef.current = io('http://localhost:3000'
  || 'https://livemeet-ribm.onrender.com');

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setLocalStream(stream);
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
          logDebug('Local stream acquired');
        }
      })
      .catch(err => logDebug(`Error accessing media: ${err.message}`));

    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('user-left', handleUserLeft);

    return () => socketRef.current.disconnect();
  }, []);

  const logDebug = (message) => setDebugLog(prev => [...prev, message]);

  const handleUserJoined = (userId) => {
    logDebug(`User joined: ${userId}`);
    const peer = new SimplePeer({ initiator: true, trickle: false, stream: localStream });

    peer.on('signal', signal => {
      logDebug(`Sending offer to ${userId}`);
      socketRef.current.emit('offer', { signal, to: userId });
    });

    peer.on('stream', stream => {
      logDebug(`Received stream from ${userId}`);
      if (peerVideoRefs.current[userId]) peerVideoRefs.current[userId].srcObject = stream;
    });

    peer.on('error', err => logDebug(`Peer error with ${userId}: ${err.message}`));

    peers[userId] = peer;
    setPeers({ ...peers });
  };

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}`);
    const peer = new SimplePeer({ initiator: false, trickle: false, stream: localStream });

    peer.on('signal', signal => {
      logDebug(`Sending answer to ${data.from}`);
      socketRef.current.emit('answer', { signal, to: data.from });
    });

    peer.on('stream', stream => {
      logDebug(`Received stream from ${data.from}`);
      if (peerVideoRefs.current[data.from]) peerVideoRefs.current[data.from].srcObject = stream;
    });

    peer.on('error', err => logDebug(`Peer error with ${data.from}: ${err.message}`));

    peer.signal(data.signal);
    peers[data.from] = peer;
    setPeers({ ...peers });
  };

  const handleAnswer = (data) => {
    logDebug(`Received answer from ${data.from}`);
    if (peers[data.from]) peers[data.from].signal(data.signal);
  };

  const handleIceCandidate = (data) => {
    logDebug(`Received ICE candidate from ${data.from}`);
    if (peers[data.from]) peers[data.from].signal(data.candidate);
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

  const joinRoom = () => {
    if (roomId && socketRef.current) {
      logDebug(`Joining room: ${roomId}`);
      socketRef.current.emit('join-room', roomId, socketRef.current.id);
    } else {
      logDebug('Room ID or socket not ready');
    }
  };

  return (
    <div>
      {!localStream ? (
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
              <video ref={userVideoRef} autoPlay muted />
              <div>Your Video</div>
            </div>
            {Object.keys(peers).map(userId => (
              <div className="video-item" key={userId}>
                <video ref={el => peerVideoRefs.current[userId] = el} autoPlay />
                <div>Peer: {userId}</div>
              </div>
            ))}
          </div>
          <div className="debug">
            <h4>Debug Log:</h4>
            <ul>
              {debugLog.map((log, index) => <li key={index}>{log}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default Video;