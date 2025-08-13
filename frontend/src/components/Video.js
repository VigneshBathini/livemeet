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
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({});

  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});
  const pendingCandidates = useRef({});
  const peersRef = useRef({});

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
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
    });

    socketRef.current.on('connect', () => {
      logDebug('Connected to signaling server');
      if (inRoom) {
        logDebug('Rejoining room after reconnect');
        socketRef.current.emit('join-room', roomId, socketRef.current.id);
      }
    });
    socketRef.current.on('connect_error', (err) => {
      logDebug(`Socket connection error: ${err.message}`);
      setTimeout(() => socketRef.current.connect(), 2000);
    });
    socketRef.current.on('reconnect', (attempt) => logDebug(`Reconnected after attempt ${attempt}`));
    socketRef.current.on('reconnect_failed', () => {
      logDebug('Reconnection failed. Retrying manually...');
      socketRef.current.connect();
    });

    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-left', handleUserLeft);

    const testIceServers = async () => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
        ],
      });
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          logDebug(`ICE candidate generated: ${JSON.stringify(e.candidate)}`);
        }
      };
      pc.createDataChannel('test');
      await pc.createOffer().then(offer => pc.setLocalDescription(offer));
      setTimeout(() => pc.close(), 5000);
    };
    testIceServers();

    return () => {
      socketRef.current.disconnect();
    };
  }, [logDebug, roomId, inRoom]);

  useEffect(() => {
    if (!localStream || !inRoom) return;

    const assignStream = (attempt = 1) => {
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = localStream;
        userVideoRef.current.play().catch((err) => {
          logDebug(`Error playing local video: ${err.message}`);
        });
        logDebug('Local stream assigned to video element.');
      } else if (attempt <= 10) {
        logDebug(`Retrying local stream assignment (${attempt}/10)...`);
        setTimeout(() => assignStream(attempt + 1), 1000);
      } else {
        logDebug('Failed to assign local stream after 10 attempts');
      }
    };
    assignStream();
  }, [localStream, inRoom, logDebug]);

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      logDebug(`Permission check failed: ${err.name} - ${err.message}`);
      return false;
    }
  };

  const joinRoom = async () => {
    if (!roomId.trim()) {
      logDebug('Please enter a Room ID.');
      alert('Please enter a Room ID.');
      return;
    }

    if (!(await checkPermissions())) {
      logDebug('Camera/microphone permissions denied.');
      alert('Please grant camera and microphone permissions.');
      return;
    }

    logDebug(`Joining room: ${roomId}`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      logDebug('Local stream acquired successfully.');
      logDebug(`Local stream tracks: ${stream.getTracks().map(t => `${t.kind}:${t.enabled}`).join(', ')}`);
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      alert('Failed to access camera/microphone. Please check permissions or devices.');
      return;
    }

    socketRef.current.emit('join-room', roomId, socketRef.current.id);
    setInRoom(true);
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        logDebug(`Video track ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
        logDebug(`Audio track ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        // Stop existing video tracks
        if (localStream) {
          localStream.getVideoTracks().forEach(track => track.stop());
        }

        // Replace tracks for all peers
        Object.values(peersRef.current).forEach(peer => {
          const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
            logDebug(`Replaced video track for peer ${peer._id || 'unknown'}`);
          }
        });

        // Update local video
        const assignScreenStream = (attempt = 1) => {
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = screenStream;
            userVideoRef.current.play().catch(err => logDebug(`Error playing screen share: ${err.message}`));
            logDebug('Screen stream assigned to local video element.');
          } else if (attempt <= 10) {
            logDebug(`Retrying screen stream assignment (${attempt}/10)...`);
            setTimeout(() => assignScreenStream(attempt + 1), 1000);
          } else {
            logDebug('Failed to assign screen stream after 10 attempts');
          }
        };
        assignScreenStream();

        setLocalStream(screenStream);
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          logDebug('Screen sharing stopped by user.');
          revertToCamera();
        };

        // Renegotiate peers
        Object.keys(peersRef.current).forEach(userId => renegotiatePeer(userId));
      } catch (err) {
        logDebug(`Error starting screen share: ${err.message}`);
        alert('Failed to start screen sharing. Please try again.');
      }
    } else {
      revertToCamera();
    }
  };

  const revertToCamera = async () => {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const cameraTrack = cameraStream.getVideoTracks()[0];

      // Stop existing video tracks
      if (localStream) {
        localStream.getVideoTracks().forEach(track => track.stop());
      }

      // Replace tracks for all peers
      Object.values(peersRef.current).forEach(peer => {
        const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(cameraTrack);
          logDebug(`Replaced video track for peer ${peer._id || 'unknown'}`);
        }
      });

      // Update local video
      const assignCameraStream = (attempt = 1) => {
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = cameraStream;
          userVideoRef.current.play().catch(err => logDebug(`Error playing camera stream: ${err.message}`));
          logDebug('Camera stream assigned to local video element.');
        } else if (attempt <= 10) {
          logDebug(`Retrying camera stream assignment (${attempt}/10)...`);
          setTimeout(() => assignCameraStream(attempt + 1), 1000);
        } else {
          logDebug('Failed to assign camera stream after 10 attempts');
        }
      };
      assignCameraStream();

      setLocalStream(cameraStream);
      setIsScreenSharing(false);

      // Renegotiate peers
      Object.keys(peersRef.current).forEach(userId => renegotiatePeer(userId));
    } catch (err) {
      logDebug(`Error reverting to camera: ${err.message}`);
      alert('Failed to revert to camera. Please check permissions or devices.');
    }
  };

  const renegotiatePeer = (userId) => {
    const peer = peersRef.current[userId];
    if (!peer) return;

    logDebug(`Renegotiating peer connection for ${userId}`);
    peer.destroy();
    delete peersRef.current[userId];
    setPeers((prev) => {
      const newPeers = { ...prev };
      delete newPeers[userId];
      return newPeers;
    });

    const newPeer = createPeer(userId, true);
    peersRef.current[userId] = newPeer;
    setPeers((prev) => ({ ...prev, [userId]: newPeer }));
    setConnectionStatus((prev) => ({ ...prev, [userId]: 'connecting' }));
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
          { urls: 'stun:stun2.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
        ],
      },
    });

    peer.on('signal', (signal) => {
      setTimeout(() => {
        if (signal.type === 'offer') {
          socketRef.current.emit('offer', { signal, to: userId });
        } else if (signal.type === 'answer') {
          socketRef.current.emit('answer', { signal, to: userId });
        } else if (signal.candidate) {
          socketRef.current.emit('ice-candidate', { candidate: signal.candidate, to: userId });
        }
      }, 100); // Small delay to prevent signaling race conditions
    });

    peer.on('stream', (stream) => {
      logDebug(`Received stream from ${userId}, tracks: ${stream.getTracks().map(t => `${t.kind}:${t.enabled}`).join(', ')}`);
      peersRef.current[userId].remoteStream = stream;
      const assignPeerStream = (attempt = 1) => {
        if (peerVideoRefs.current[userId]) {
          peerVideoRefs.current[userId].srcObject = stream;
          peerVideoRefs.current[userId].play().catch((err) => {
            logDebug(`Error playing video for ${userId}: ${err.message}`);
          });
          logDebug(`Stream assigned to video element for ${userId}`);
          setConnectionStatus((prev) => ({ ...prev, [userId]: 'connected' }));
        } else if (attempt <= 15) {
          logDebug(`Video element for ${userId} not ready, retrying (${attempt}/15)...`);
          setTimeout(() => assignPeerStream(attempt + 1), 1000);
        } else {
          logDebug(`Failed to assign stream for ${userId} after 15 attempts`);
          setConnectionStatus((prev) => ({ ...prev, [userId]: 'failed' }));
        }
      };
      assignPeerStream();
    });

    peer.on('connect', () => {
      logDebug(`Peer connection established with ${userId}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: 'connected' }));
    });
    peer.on('error', (err) => {
      logDebug(`Peer error (${userId}): ${err.message}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: 'failed' }));
    });
    peer.on('close', () => {
      logDebug(`Peer connection closed for ${userId}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: 'disconnected' }));
    });
    peer.on('iceconnectionstatechange', () => {
      const state = peer._pc.iceConnectionState;
      logDebug(`ICE connection state for ${userId}: ${state}`);
      if (state === 'disconnected' || state === 'failed') {
        logDebug(`Renegotiating peer ${userId} due to ${state} state`);
        renegotiatePeer(userId);
      } else if (state === 'connected') {
        logDebug(`Peer ${userId} successfully connected`);
        setConnectionStatus((prev) => ({ ...prev, [userId]: 'connected' }));
      }
    });

    peersRef.current[userId] = peer;
    if (pendingCandidates.current[userId]) {
      pendingCandidates.current[userId].forEach((signal) => {
        peer.signal(signal);
      });
      delete pendingCandidates.current[userId];
    }

    return peer;
  };

  const handleUserJoined = (userId) => {
    logDebug(`User joined: ${userId}, current peers: ${Object.keys(peersRef.current)}`);
    setConnectionStatus((prev) => ({ ...prev, [userId]: 'connecting' }));
    const peer = createPeer(userId, true);
    setPeers((prev) => ({ ...prev, [userId]: peer }));
  };

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}`);
    let peer = peersRef.current[data.from];
    if (!peer) {
      peer = createPeer(data.from, false);
      peersRef.current[data.from] = peer;
      setPeers((prev) => ({ ...prev, [data.from]: peer }));
    }
    peer.signal(data.signal);
  };

  const handleAnswer = (data) => {
    logDebug(`Received answer from ${data.from}`);
    const peer = peersRef.current[data.from];
    if (peer) {
      peer.signal(data.signal);
    } else {
      logDebug(`No peer for ${data.from}, queuing answer...`);
      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }
      pendingCandidates.current[data.from].push(data.signal);
    }
  };

  const handleIceCandidate = (data) => {
    logDebug(`Received ICE candidate from ${data.from}`);
    const peer = peersRef.current[data.from];
    if (peer) {
      peer.signal({ candidate: data.candidate });
    } else {
      logDebug(`Peer not ready for ICE candidate from ${data.from}, queuing...`);
      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }
      pendingCandidates.current[data.from].push({ candidate: data.candidate });
    }
  };

  const handleUserLeft = (userId) => {
    logDebug(`User left: ${userId}`);
    setConnectionStatus((prev) => ({ ...prev, [userId]: 'disconnected' }));
    if (peersRef.current[userId]) {
      peersRef.current[userId].destroy();
      delete peersRef.current[userId];
      setPeers((prev) => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
      if (peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId].srcObject = null;
        delete peerVideoRefs.current[userId];
      }
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
            <div className="controls">
              <button onClick={toggleVideo}>
                {isVideoOn ? 'Turn Video Off' : 'Turn Video On'}
              </button>
              <button onClick={toggleAudio}>
                {isAudioOn ? 'Mute Audio' : 'Unmute Audio'}
              </button>
              <button onClick={toggleScreenShare}>
                {isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              </button>
            </div>
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
                        if (peersRef.current[userId]?.remoteStream) {
                          el.srcObject = peersRef.current[userId].remoteStream;
                          el.play().catch((err) => {
                            logDebug(`Error playing video for ${userId}: ${err.message}`);
                          });
                        }
                      }
                    }}
                    autoPlay
                    playsInline
                    style={{ width: '320px', height: '240px', border: '1px solid #000', background: '#000' }}
                  />
                  <div>
                    Peer: {userId} ({connectionStatus[userId] || 'connecting'})
                  </div>
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
            .controls {
              margin-bottom: 10px;
              display: flex;
              gap: 10px;
            }
            .controls button {
              padding: 8px 16px;
              cursor: pointer;
            }
            .join-room {
              display: flex;
              gap: 10px;
              margin-bottom: 20px;
            }
            .join-room input {
              padding: 8px;
            }
            .join-room button {
              padding: 8px 16px;
              cursor: pointer;
            }
            .debug {
              margin-top: 20px;
              max-height: 200px;
              overflow-y: auto;
            }
          `}
        </style>
      </div>
    </ErrorBoundary>
  );
};

export default Video;