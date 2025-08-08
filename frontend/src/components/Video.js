import React, { useState, useRef, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';

// Dynamic server URL
const SIGNALING_SERVER_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3000'
  : 'https://livemeet-ribm.onrender.com';

const Video = () => {
  const [roomId, setRoomId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [inRoom, setInRoom] = useState(false);
  const [peers, setPeers] = useState({});
  const [debugLog, setDebugLog] = useState([]);

  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});

  // Debounced logging
  const logDebug = useCallback((msg) => {
    console.log(msg);
    setDebugLog((prev) => [...prev, msg].slice(-50));
  }, []);

  // Initialize socket
  useEffect(() => {
    socketRef.current = io(SIGNALING_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => logDebug('Connected to signaling server'));
    socketRef.current.on('connect_error', (err) => {
      logDebug(`Socket connection error: ${err.message}, type: ${err.type}, code: ${err.code}, description: ${err.description || 'N/A'}`);
      console.error('Socket connect error:', err);
    });
    socketRef.current.on('reconnect_failed', () => logDebug('Reconnection failed after 5 attempts'));

    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-left', handleUserLeft);

    return () => {
      socketRef.current.disconnect();
    };
  }, [logDebug]);

  // Assign local stream
  useEffect(() => {
    if (!localStream || !inRoom) return;

    const assignStream = () => {
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = localStream;
        logDebug('Local stream assigned to video element.');
      } else {
        logDebug('Retrying stream assignment...');
        setTimeout(assignStream, 100);
      }
    };
    assignStream();
  }, [localStream, inRoom, logDebug]);

  const joinRoom = async () => {
    if (!roomId.trim()) {
      logDebug('Please enter a Room ID.');
      return;
    }
    logDebug(`Joining room: ${roomId}`);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      logDebug('Local stream acquired successfully.');
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      return;
    }

    socketRef.current.emit('join-room', roomId, socketRef.current.id);
    setInRoom(true);
  };

  const createPeer = (userId, initiator) => {
    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream: localStream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
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
        logDebug(`Stream assigned to video element for ${userId}`);
      } else {
        logDebug(`Error: No video element for ${userId}`);
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
    if (peers[data.from]) {
      peers[data.from].signal(data.signal);
    } else {
      logDebug(`Error: No peer found for ${data.from}`);
    }
  };

  const handleIceCandidate = (data) => {
    logDebug(`Received ICE candidate from ${data.from}`);
    if (peers[data.from]) {
      peers[data.from].signal({ candidate: data.candidate });
    } else {
      logDebug(`Error: No peer found for ICE candidate from ${data.from}`);
    }
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
              <video
                ref={userVideoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '320px', height: '240px', border: '1px solid #000', background: '#000' }}
              />
              <div>Your Video</div>
            </div>
            {Object.keys(peers).map((userId) => (
              <div className="video-item" key={userId}>
                <video
                  ref={(el) => {
                    peerVideoRefs.current[userId] = el;
                    console.log(`Peer video ref assigned for ${userId}:`, !!el);
                  }}
                  autoPlay
                  playsInline
                  style={{ width: '320px', height: '240px', border: '1px solid #000', background: '#000' }}
                />
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
      <style>
        {`
          .video-container {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }
          .video-item {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
        `}
      </style>
    </div>
  );
};

export default Video;