import React, { useState, useRef, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { debounce } from 'lodash';

// Polyfill for process.nextTick in the browser
if (typeof window !== 'undefined' && typeof window.process === 'undefined') {
  window.process = {
    nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
  };
}

//const SIGNALING_SERVER_URL = 'http://localhost:3000'; // Change to 'https://livemeet-ribm.onrender.com' for production

const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <h1 className="text-red-500 text-center mt-10">Something went wrong. Please refresh the page.</h1>;
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
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});
  const pendingCandidates = useRef({});
  const peersRef = useRef({});
  const chatContainerRef = useRef();

  const logDebug = useCallback(
    debounce((msg) => {
      console.log(msg);
      setDebugLog((prev) => [...prev, msg].slice(-50));
    }, 500),
    []
  );

  useEffect(() => {
    const isSupportedBrowser = !!window.RTCPeerConnection && !!navigator.mediaDevices.getUserMedia;
    if (!isSupportedBrowser) {
      logDebug('Warning: Your browser may not fully support WebRTC.');
      alert('Please use a modern browser like Chrome or Firefox for video calls.');
    }
  }, [logDebug]);

  useEffect(() => {
    try {
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
          Object.keys(peersRef.current).forEach((userId) => renegotiatePeer(userId));
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
      socketRef.current.on('chat-message', (messageData) => {
        if (messageData.userId !== socketRef.current.id) {
          logDebug(`Received chat message from ${messageData.userId}: ${messageData.message}`);
          setMessages((prev) => [
            ...prev,
            { userId: messageData.userId, message: messageData.message, timestamp: new Date(messageData.timestamp).toLocaleTimeString() },
          ].slice(-100));
        }
      });

      const testIceServers = async () => {
        try {
          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              {
                urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
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
          pc.oniceconnectionstatechange = () => {
            logDebug(`ICE test connection state: ${pc.iceConnectionState}`);
          };
          pc.createDataChannel('test');
          await pc.createOffer().then((offer) => pc.setLocalDescription(offer));
          setTimeout(() => pc.close(), 5000);
        } catch (err) {
          logDebug(`ICE server test failed: ${err.message}`);
        }
      };
      testIceServers();

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    } catch (err) {
      logDebug(`Socket initialization error: ${err.message}`);
    }
  }, [logDebug, roomId, inRoom]);

  useEffect(() => {
    if (!localStream || !inRoom) return;

    const assignStream = (attempt = 1, maxAttempts = 20, delay = 500) => {
      if (attempt > maxAttempts) {
        logDebug('Failed to assign local stream after max attempts');
        return;
      }
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = localStream;
        requestAnimationFrame(() => {
          userVideoRef.current.play().catch((err) => {
            logDebug(`Error playing local video (attempt ${attempt}): ${err.message}`);
          });
          logDebug('Local stream assigned to video element.');
        });
      } else {
        logDebug(`Retrying local stream assignment (attempt ${attempt}/${maxAttempts})...`);
        setTimeout(() => assignStream(attempt + 1, maxAttempts, delay * 1.5), delay);
      }
    };
    assignStream();
  }, [localStream, inRoom, logDebug]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
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
      logDebug(`Local stream tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.enabled}`).join(', ')}`);
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
        Object.keys(peersRef.current).forEach((userId) => renegotiatePeer(userId));
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

        if (localStream) {
          localStream.getVideoTracks().forEach((track) => track.stop());
        }

        Object.values(peersRef.current).forEach((peer) => {
          const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
            logDebug(`Replaced video track for peer ${peer._id || 'unknown'}`);
          }
        });

        const assignScreenStream = (attempt = 1, maxAttempts = 20, delay = 500) => {
          if (attempt > maxAttempts) {
            logDebug('Failed to assign screen stream after max attempts');
            return;
          }
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = screenStream;
            requestAnimationFrame(() => {
              userVideoRef.current.play().catch((err) => logDebug(`Error playing screen share: ${err.message}`));
              logDebug('Screen stream assigned to local video element.');
            });
          } else {
            logDebug(`Retrying screen stream assignment (attempt ${attempt}/${maxAttempts})...`);
            setTimeout(() => assignScreenStream(attempt + 1, maxAttempts, delay * 1.5), delay);
          }
        };
        assignScreenStream();

        setLocalStream(screenStream);
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          logDebug('Screen sharing stopped by user.');
          revertToCamera();
        };

        Object.keys(peersRef.current).forEach((userId) => renegotiatePeer(userId));
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

      if (localStream) {
        localStream.getVideoTracks().forEach((track) => track.stop());
      }

      Object.values(peersRef.current).forEach((peer) => {
        const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(cameraTrack);
          logDebug(`Replaced video track for peer ${peer._id || 'unknown'}`);
        }
      });

      const assignCameraStream = (attempt = 1, maxAttempts = 20, delay = 500) => {
        if (attempt > maxAttempts) {
          logDebug('Failed to assign camera stream after max attempts');
          return;
        }
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = cameraStream;
          requestAnimationFrame(() => {
            userVideoRef.current.play().catch((err) => logDebug(`Error playing camera stream: ${err.message}`));
            logDebug('Camera stream assigned to local video element.');
          });
        } else {
          logDebug(`Retrying camera stream assignment (attempt ${attempt}/${maxAttempts})...`);
          setTimeout(() => assignCameraStream(attempt + 1, maxAttempts, delay * 1.5), delay);
        }
      };
      assignCameraStream();

      setLocalStream(cameraStream);
      setIsScreenSharing(false);

      Object.keys(peersRef.current).forEach((userId) => renegotiatePeer(userId));
    } catch (err) {
      logDebug(`Error reverting to camera: ${err.message}`);
      alert('Failed to revert to camera. Please check permissions or devices.');
    }
  };

  const sendMessage = () => {
    if (chatInput.trim() && socketRef.current?.connected) {
      const messageData = {
        roomId,
        userId: socketRef.current.id,
        message: chatInput,
        timestamp: new Date().toISOString(),
      };
      socketRef.current.emit('chat-message', messageData, (ack) => {
        if (ack?.error) {
          logDebug(`Failed to send chat message: ${ack.error}`);
          alert('Failed to send message. Please try again.');
        } else {
          logDebug(`Sent chat message: ${chatInput}`);
          setMessages((prev) => [
            ...prev,
            { userId: messageData.userId, message: messageData.message, timestamp: new Date().toLocaleTimeString() },
          ].slice(-100));
        }
      });
      setChatInput('');
    } else if (!socketRef.current?.connected) {
      logDebug('Cannot send message: Socket not connected');
      alert('Cannot send message: Not connected to server.');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && chatInput.trim()) {
      sendMessage();
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
    if (newPeer) {
      peersRef.current[userId] = newPeer;
      setPeers((prev) => ({ ...prev, [userId]: newPeer }));
      setConnectionStatus((prev) => ({ ...prev, [userId]: 'connecting' }));
    }
  };

  const createPeer = (userId, initiator) => {
    logDebug(`Creating peer for ${userId}, initiator: ${initiator}`);
    try {
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
              urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
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

      peer._pc.onicegatheringstatechange = () => {
        logDebug(`ICE gathering state for ${userId}: ${peer._pc.iceGatheringState}`);
      };

      peer._pc.oniceconnectionstatechange = () => {
        const state = peer._pc.iceConnectionState;
        logDebug(`ICE connection state for ${userId}: ${state}`);
        if (state === 'disconnected' || state === 'failed') {
          logDebug(`Renegotiating peer ${userId} due to ${state} state`);
          renegotiatePeer(userId);
        } else if (state === 'connected') {
          logDebug(`Peer ${userId} successfully connected`);
          setConnectionStatus((prev) => ({ ...prev, [userId]: 'connected' }));
        }
      };

      const debouncedSignal = debounce((signal) => {
        if (!peer._pc || peer._pc.signalingState === 'closed') {
          logDebug(`Cannot signal for ${userId}: Peer connection closed`);
          return;
        }
        if (signal.type === 'offer') {
          socketRef.current.emit('offer', { signal, to: userId });
          logDebug(`Sent offer to ${userId}`);
        } else if (signal.type === 'answer') {
          socketRef.current.emit('answer', { signal, to: userId });
          logDebug(`Sent answer to ${userId}`);
        } else if (signal.candidate) {
          socketRef.current.emit('ice-candidate', { candidate: signal.candidate, to: userId });
          logDebug(`Sent ICE candidate to ${userId}`);
        }
      }, 100);

      peer.on('signal', (signal) => {
        if (peer._pc.signalingState === 'stable' || signal.candidate) {
          debouncedSignal(signal);
        } else {
          logDebug(`Delaying signal for ${userId} until stable, current state: ${peer._pc.signalingState}`);
          setTimeout(() => debouncedSignal(signal), 500);
        }
      });

      peer.on('stream', (stream) => {
        logDebug(`Received stream from ${userId}, tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.enabled}`).join(', ')}`);
        peersRef.current[userId].remoteStream = stream;
        const assignPeerStream = (attempt = 1, maxAttempts = 30, delay = 500) => {
          if (attempt > maxAttempts) {
            logDebug(`Failed to assign stream for ${userId} after max attempts`);
            setConnectionStatus((prev) => ({ ...prev, [userId]: 'failed' }));
            renegotiatePeer(userId);
            return;
          }
          if (peerVideoRefs.current[userId]) {
            peerVideoRefs.current[userId].srcObject = stream;
            requestAnimationFrame(() => {
              peerVideoRefs.current[userId].play().catch((err) => {
                logDebug(`Error playing video for ${userId} (attempt ${attempt}): ${err.message}`);
                if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
                  logDebug(`Renegotiating peer ${userId} due to video play error`);
                  renegotiatePeer(userId);
                }
              });
              logDebug(`Stream assigned to video element for ${userId}`);
              setConnectionStatus((prev) => ({ ...prev, [userId]: 'connected' }));
            });
          } else {
            logDebug(`Video element for ${userId} not ready, retrying (attempt ${attempt}/${maxAttempts})...`);
            setTimeout(() => assignPeerStream(attempt + 1, maxAttempts, delay * 1.5), delay);
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
        renegotiatePeer(userId);
      });

      peer.on('close', () => {
        logDebug(`Peer connection closed for ${userId}`);
        setConnectionStatus((prev) => ({ ...prev, [userId]: 'disconnected' }));
        renegotiatePeer(userId);
      });

      // Timeout to renegotiate if no stream is received
      setTimeout(() => {
        if (!peersRef.current[userId]?.remoteStream && peer._pc.iceConnectionState !== 'connected') {
          logDebug(`No stream received from ${userId} after timeout, renegotiating`);
          renegotiatePeer(userId);
        }
      }, 10000);

      peersRef.current[userId] = peer;
      if (pendingCandidates.current[userId]) {
        pendingCandidates.current[userId].forEach((signal) => {
          if (peer._pc.signalingState !== 'closed') {
            peer.signal(signal);
            logDebug(`Applied queued signal for ${userId}`);
          }
        });
        delete pendingCandidates.current[userId];
      }

      return peer;
    } catch (err) {
      logDebug(`Peer creation error for ${userId}: ${err.message}`);
      return null;
    }
  };

  const handleUserJoined = (userId) => {
    logDebug(`User joined: ${userId}, current peers: ${Object.keys(peersRef.current)}`);
    setConnectionStatus((prev) => ({ ...prev, [userId]: 'connecting' }));
    const peer = createPeer(userId, true);
    if (peer) {
      setPeers((prev) => ({ ...prev, [userId]: peer }));
    }
  };

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}`);
    let peer = peersRef.current[data.from];
    if (!peer) {
      peer = createPeer(data.from, false);
      if (peer) {
        peersRef.current[data.from] = peer;
        setPeers((prev) => ({ ...prev, [data.from]: peer }));
      }
    }
    if (peer && peer._pc.signalingState !== 'closed') {
      peer.signal(data.signal);
      logDebug(`Processed offer from ${data.from}`);
    }
  };

  const handleAnswer = (data) => {
    logDebug(`Received answer from ${data.from}`);
    const peer = peersRef.current[data.from];
    if (peer && peer._pc.signalingState !== 'closed') {
      peer.signal(data.signal);
      logDebug(`Processed answer from ${data.from}`);
    } else {
      logDebug(`No peer for ${data.from}, queuing answer...`);
      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }
      pendingCandidates.current[data.from].push(data.signal);
    }
  };

  const handleIceCandidate = (data) => {
    logDebug(`Received ICE candidate from ${data.from}: ${JSON.stringify(data.candidate)}`);
    const peer = peersRef.current[data.from];
    if (peer && peer._pc.signalingState !== 'closed') {
      peer.signal({ candidate: data.candidate });
      logDebug(`Processed ICE candidate from ${data.from}`);
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
      <div className="min-h-screen bg-gray-100 p-4 font-sans">
        {!inRoom ? (
          <div className="join-room flex justify-center items-center">
            <div className="bg-white p-6 rounded-lg shadow-md flex gap-4 max-w-md w-full">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter Room ID"
                className="flex-1 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={joinRoom}
                className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition"
              >
                Join Room
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="controls flex gap-2 mb-4 flex-wrap">
                <button
                  onClick={toggleVideo}
                  className={`px-4 py-2 rounded-md transition ${
                    isVideoOn ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                  } text-white`}
                >
                  {isVideoOn ? 'Turn Video Off' : 'Turn Video On'}
                </button>
                <button
                  onClick={toggleAudio}
                  className={`px-4 py-2 rounded-md transition ${
                    isAudioOn ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                  } text-white`}
                >
                  {isAudioOn ? 'Mute Audio' : 'Unmute Audio'}
                </button>
                <button
                  onClick={toggleScreenShare}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
                >
                  {isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
                </button>
              </div>
              <div className="video-container grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="video-item bg-white p-4 rounded-lg shadow-md">
                  <video
                    ref={userVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-60 bg-black rounded-md"
                  />
                  <div className="text-center mt-2 text-gray-700">Your Video</div>
                </div>
                {Object.keys(peers).map((userId) => (
                  <div key={userId} className="video-item bg-white p-4 rounded-lg shadow-md">
                    <div className="relative">
                      <video
                        ref={(el) => {
                          if (el && !peerVideoRefs.current[userId]) {
                            peerVideoRefs.current[userId] = el;
                            logDebug(`Peer video ref assigned for ${userId}: ${!!el}`);
                            if (peersRef.current[userId]?.remoteStream) {
                              el.srcObject = peersRef.current[userId].remoteStream;
                              requestAnimationFrame(() => {
                                el.play().catch((err) => {
                                  logDebug(`Error playing video for ${userId}: ${err.message}`);
                                  if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
                                    logDebug(`Renegotiating peer ${userId} due to video play error`);
                                    renegotiatePeer(userId);
                                  }
                                });
                              });
                            }
                          }
                        }}
                        autoPlay
                        playsInline
                        className="w-full h-60 bg-black rounded-md"
                      />
                      {connectionStatus[userId] === 'connecting' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-md">
                          <svg
                            className="animate-spin h-8 w-8 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v8h8a8 8 0 01-8 8 8 8 0 01-8-8z"
                            ></path>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="text-center mt-2 text-gray-700">
                      Peer: {userId.slice(0, 8)}... ({connectionStatus[userId] || 'connecting'})
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:w-1/3 bg-white p-4 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-2 text-gray-800">Chat</h3>
              <div
                ref={chatContainerRef}
                className="h-64 overflow-y-auto mb-4 p-2 border rounded-md bg-gray-50"
              >
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`mb-2 ${msg.userId === socketRef.current?.id ? 'text-right' : 'text-left'}`}
                  >
                    <span className="text-xs text-gray-500">{msg.timestamp}</span>
                    <div
                      className={`inline-block p-2 rounded-md ${
                        msg.userId === socketRef.current?.id
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-200 text-gray-800'
                      }`}
                    >
                      <strong>{msg.userId.slice(0, 8)}:</strong> {msg.message}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="debug mt-4 bg-white p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2 text-gray-800">Debug Log</h3>
          <ul className="max-h-40 overflow-y-auto text-sm text-gray-600">
            {debugLog.map((log, index) => (
              <li key={index} className="mb-1">{log}</li>
            ))}
          </ul>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Video;