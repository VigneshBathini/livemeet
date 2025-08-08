import React, { useState, useRef, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';

const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong. Please refresh the page.</h1>;
    }
    return this.props.children;
  }
}

const Video = () => {
  const [roomId, setRoomId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [inRoom, setInRoom] = useState(false);
  const [peers, setPeers] = useState({});
  const [debugLog, setDebugLog] = useState([]);

  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});

  const logDebug = useCallback((msg) => {
    console.log(msg);
    setDebugLog((prev) => [...prev, msg].slice(-50));
  }, []);

  useEffect(() => {
    const isSupportedBrowser = !!window.RTCPeerConnection && !!navigator.mediaDevices.getUserMedia;
    if (!isSupportedBrowser) {
      logDebug('Warning: Your browser may not fully support WebRTC.');
      alert('Please use a modern browser like Chrome or Firefox for video calls.');
    }
  }, [logDebug]);

  useEffect(() => {
    socketRef.current = io(SIGNALING_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current.on('connect', () => logDebug('Connected to signaling server'));
    socketRef.current.on('connect_error', (err) => {
      logDebug(`Socket connection error: ${err.message}, type: ${err.type}, code: ${err.code}, description: ${err.description || 'N/A'}`);
      console.error('Socket connect error:', err);
    });
    socketRef.current.on('reconnect', (attempt) => logDebug(`Reconnected after attempt ${attempt}`));
    socketRef.current.on('reconnect_failed', () => logDebug('Reconnection failed after maximum attempts'));

    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-left', handleUserLeft);

    return () => {
      socketRef.current.disconnect();
    };
  }, [logDebug]);

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
      if (err.name === 'NotAllowedError') {
        alert('Please grant camera and microphone permissions.');
      } else if (err.name === 'NotFoundError') {
        alert('No camera or microphone found. Please check your device.');
      }
      return;
    }

    socketRef.current.emit('join-room', roomId, socketRef.current.id);
    setInRoom(true);
  };

  const createPeer = (userId, initiator) => {
    logDebug(`Creating peer for ${userId}, initiator: ${initiator}`);
    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream: localStream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceTransportPolicy: 'all'
      }
    });

    peer.answered = false;
    let offerSent = false;
    peer.on('signal', (signal) => {
      if (initiator && !offerSent) {
        logDebug(`Sending offer to ${userId}`);
        socketRef.current.emit('offer', { signal, to: userId });
        offerSent = true;
      } else if (!initiator) {
        logDebug(`Sending answer to ${userId}`);
        socketRef.current.emit('answer', { signal, to: userId });
      }
    });

    peer.on('stream', (stream) => {
      logDebug(`Received stream from ${userId}`);
      if (peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId].srcObject = stream;
        logDebug(`Stream assigned to video element for ${userId}`);
      } else {
        logDebug(`Error: No video element for ${userId}`);
        setTimeout(() => {
          if (peerVideoRefs.current[userId]) {
            peerVideoRefs.current[userId].srcObject = stream;
            logDebug(`Stream assigned on retry for ${userId}`);
          }
        }, 500);
      }
    });

    peer.on('connect', () => {
      logDebug(`Peer connection established with ${userId}`);
    });

    peer.on('iceStateChange', (iceConnectionState) => {
      logDebug(`ICE connection state for ${userId}: ${iceConnectionState}`);
      if (iceConnectionState === 'failed') {
        logDebug(`ICE connection failed for ${userId}, attempting recovery`);
      }
    });

    peer.on('error', (err) => logDebug(`Peer error (${userId}): ${err.message}`));

    return peer;
  };

  const handleUserJoined = (userId) => {
    logDebug(`User joined: ${userId}, current peers: ${Object.keys(peers)}`);
    const peer = createPeer(userId, true);
    setPeers((prev) => ({ ...prev, [userId]: peer }));
  };

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}`);
    if (!peers[data.from]) {
      const peer = createPeer(data.from, false);
      peer.signal(data.signal);
      setPeers((prev) => ({ ...prev, [data.from]: peer }));
      peer.on('signal', (signal) => {
        logDebug(`Sending answer to ${data.from}`);
        socketRef.current.emit('answer', { signal, to: data.from });
      });
    } else {
      logDebug(`Peer already exists for ${data.from}, signaling existing peer`);
      peers[data.from].signal(data.signal);
    }
  };

  const handleAnswer = (data) => {
    logDebug(`Received answer from ${data.from}, current peers: ${Object.keys(peers)}`);
    if (!peers[data.from]) {
      logDebug(`Warning: No peer found for ${data.from}, attempting recovery`);
      const peer = createPeer(data.from, false);
      peer.signal(data.signal);
      setPeers((prev) => ({ ...prev, [data.from]: peer }));
      peer.answered = true;
      logDebug(`Recovered peer for ${data.from}`);
      return;
    }
    if (!peers[data.from].answered) {
      peers[data.from].signal(data.signal);
      peers[data.from].answered = true;
      logDebug(`Processed answer from ${data.from}`);
    } else {
      logDebug(`Ignoring duplicate answer from ${data.from}`);
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
      setPeers((prev) => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
      delete peerVideoRefs.current[userId];
    }
  };

  return (
    <ErrorBoundary>
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
                      if (el && !peerVideoRefs.current[userId]) {
                        peerVideoRefs.current[userId] = el;
                        logDebug(`Peer video ref assigned for ${userId}: ${!!el}`);
                      }
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
    </ErrorBoundary>
  );
};

export default Video;
