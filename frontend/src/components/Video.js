import React, { useState, useRef, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';

const SIGNALING_SERVER_URL = 'http://localhost:3000';
// const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';

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

const Alert = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`alert alert-${type}`}>
      {message}
      <button onClick={onClose} className="alert-close">×</button>
    </div>
  );
};

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
  const [showDebug, setShowDebug] = useState(false);
  const [userName, setUserName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [participantControls, setParticipantControls] = useState({});
  const [alerts, setAlerts] = useState([]);

  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});
  const pendingCandidates = useRef({});
  const peersRef = useRef({});
  const chatRef = useRef();
  const detectionIntervals = useRef({});

  const addAlert = useCallback((message, type = 'error') => {
    const id = Date.now();
    setAlerts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const logDebug = useCallback((msg) => {
    console.log(msg);
    setDebugLog((prev) => [...prev, msg].slice(-50));
  }, []);

  useEffect(() => {
    const isSupportedBrowser = !!window.RTCPeerConnection && !!navigator.mediaDevices.getUserMedia;
    if (!isSupportedBrowser) {
      logDebug('Warning: Your browser may not fully support WebRTC.');
      addAlert('Please use a modern browser like Chrome or Firefox for video calls.', 'error');
    }

    // Load face-api.js models
    const loadFaceApiModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/weights'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/weights'),
        ]);
        logDebug('Face-api.js models loaded successfully.');
        addAlert('Face detection models loaded successfully.', 'success');
      } catch (err) {
        logDebug(`Error loading face-api.js models: ${err.message}`);
        addAlert('Failed to load face detection models.', 'error');
      }
    };
    loadFaceApiModels();
  }, [logDebug, addAlert]);

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
      addAlert('Connected to server.', 'success');
      if (inRoom) {
        logDebug('Rejoining room after reconnect');
        socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, isHost);
      }
    });
    socketRef.current.on('connect_error', (err) => {
      logDebug(`Socket connection error: ${err.message}`);
      addAlert('Connection error. Retrying...', 'error');
      setTimeout(() => socketRef.current.connect(), 2000);
    });
    socketRef.current.on('reconnect', (attempt) => {
      logDebug(`Reconnected after attempt ${attempt}`);
      addAlert(`Reconnected to server after ${attempt} attempts.`, 'success');
    });
    socketRef.current.on('reconnect_failed', () => {
      logDebug('Reconnection failed. Retrying manually...');
      addAlert('Reconnection failed. Retrying...', 'error');
      socketRef.current.connect();
    });

    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-left', handleUserLeft);
    socketRef.current.on('chat-message', handleChatMessage);
    socketRef.current.on('toggle-media', handleToggleMedia);
    socketRef.current.on('face-detection-alert', (data) => {
      if (data.userId === socketRef.current.id) {
        logDebug(`Received face detection alert: ${data.message}`);
        addAlert(data.message, 'warning');
      }
    });

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
      await pc.createOffer().then((offer) => pc.setLocalDescription(offer));
      setTimeout(() => pc.close(), 5000);
    };
    testIceServers();

    return () => {
      socketRef.current.disconnect();
    };
  }, [logDebug, roomId, inRoom, userName, isHost, addAlert]);

  useEffect(() => {
    if (!localStream || !inRoom) return;

    const assignStream = (attempt = 1) => {
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = localStream;
        userVideoRef.current.play().catch((err) => {
          logDebug(`Error playing local video: ${err.message}`);
          addAlert('Failed to play local video.', 'error');
        });
        logDebug('Local stream assigned to video element.');
      } else if (attempt <= 10) {
        logDebug(`Retrying local stream assignment (${attempt}/10)...`);
        setTimeout(() => assignStream(attempt + 1), 1000);
      } else {
        logDebug('Failed to assign local stream after 10 attempts');
        addAlert('Failed to assign local video stream.', 'error');
      }
    };
    assignStream();
  }, [localStream, inRoom, logDebug, addAlert]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isHost) return;

    Object.keys(participantControls).forEach((userId) => {
      const proctorEnabled = participantControls[userId]?.proctor;
      const existingInterval = detectionIntervals.current[userId];

      if (proctorEnabled && !existingInterval) {
        const videoElement = peerVideoRefs.current[userId];
        if (videoElement && videoElement.srcObject) {
          const interval = setInterval(async () => {
            try {
              const detections = await faceapi.detectAllFaces(videoElement).withFaceLandmarks();
              logDebug(`Face detection for ${userId}: ${detections.length} faces detected`);
              if (detections.length === 0) {
                const participantName = connectionStatus[userId]?.userName || shortId(userId);
                const hostMessage = `No face detected for ${participantName}.`;
                const participantMessage = 'No face detected. Please ensure you are visible.';
                // Alert for host
                addAlert(hostMessage, 'warning');
                // Emit alert to participant
                socketRef.current.emit('face-detection-alert', {
                  roomId,
                  userId,
                  message: participantMessage,
                });
                logDebug(`Sent face detection alert to ${userId}`);
              }
            } catch (err) {
              logDebug(`Face detection error for ${userId}: ${err.message}`);
              const participantName = connectionStatus[userId]?.userName || shortId(userId);
              const hostMessage = `Face detection error for ${participantName}.`;
              const participantMessage = 'Face detection error. Please check your video feed.';
              // Alert for host
              addAlert(hostMessage, 'error');
              // Emit alert to participant
              socketRef.current.emit('face-detection-alert', {
                roomId,
                userId,
                message: participantMessage,
              });
            }
          }, 5000);
          detectionIntervals.current[userId] = interval;
          logDebug(`Started face detection for ${userId}`);
        } else {
          logDebug(`Video element not ready for ${userId}`);
        }
      } else if (!proctorEnabled && existingInterval) {
        clearInterval(existingInterval);
        delete detectionIntervals.current[userId];
        logDebug(`Stopped face detection for ${userId}`);
      }
    });

    return () => {
      Object.values(detectionIntervals.current).forEach((interval) => clearInterval(interval));
      detectionIntervals.current = {};
    };
  }, [participantControls, connectionStatus, logDebug, isHost, addAlert]);

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      logDebug(`Permission check failed: ${err.name} - ${err.message}`);
      addAlert('Camera/microphone permissions denied.', 'error');
      return false;
    }
  };

  const createRoom = async () => {
    if (!userName.trim()) {
      logDebug('Please enter a username.');
      addAlert('Please enter a username.', 'error');
      return;
    }

    if (!(await checkPermissions())) {
      logDebug('Camera/microphone permissions denied.');
      return;
    }

    const newRoomId = uuidv4();
    setRoomId(newRoomId);
    setIsHost(true);
    logDebug(`Created room: ${newRoomId} as host (${userName})`);
    addAlert(`Room created: ${newRoomId}`, 'success');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      logDebug('Local stream acquired successfully.');
      logDebug(`Local stream tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.enabled}`).join(', ')}`);
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
      return;
    }

    socketRef.current.emit('join-room', newRoomId, socketRef.current.id, userName, true);
    setInRoom(true);
  };

  const joinRoom = async () => {
    if (!roomId.trim()) {
      logDebug('Please enter a Room ID.');
      addAlert('Please enter a Room ID.', 'error');
      return;
    }
    if (!userName.trim()) {
      logDebug('Please enter a username.');
      addAlert('Please enter a username.', 'error');
      return;
    }

    if (!(await checkPermissions())) {
      logDebug('Camera/microphone permissions denied.');
      return;
    }

    logDebug(`Joining room: ${roomId} as ${userName}`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      logDebug('Local stream acquired successfully.');
      logDebug(`Local stream tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.enabled}`).join(', ')}`);
      addAlert(`Joined room: ${roomId}`, 'success');
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
      return;
    }

    socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, false);
    setInRoom(true);
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        logDebug(`Video track ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
        addAlert(`Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`, 'info');
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
        addAlert(`Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`, 'info');
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
            logDebug(`Replaced video track with screen share for peer ${peer._id || 'unknown'}`);
          }
        });

        const assignScreenStream = (attempt = 1) => {
          if (userVideoRef.current) {
            userVideoRef.current.srcObject = screenStream;
            userVideoRef.current.play().catch((err) => {
              logDebug(`Error playing screen share: ${err.message}`);
              addAlert('Failed to play screen share.', 'error');
            });
            logDebug('Screen stream assigned to local video element.');
          } else if (attempt <= 10) {
            logDebug(`Retrying screen stream assignment (${attempt}/10)...`);
            setTimeout(() => assignScreenStream(attempt + 1), 1000);
          } else {
            logDebug('Failed to assign screen stream after 10 attempts');
            addAlert('Failed to assign screen share stream.', 'error');
          }
        };
        assignScreenStream();

        setLocalStream(screenStream);
        setIsScreenSharing(true);
        addAlert('Screen sharing started.', 'success');

        screenTrack.onended = () => {
          logDebug('Screen sharing stopped by user.');
          addAlert('Screen sharing stopped.', 'info');
          revertToCamera();
        };
      } catch (err) {
        logDebug(`Error starting screen share: ${err.message}`);
        addAlert('Failed to start screen sharing. Try again.', 'error');
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
          logDebug(`Replaced video track with camera for peer ${peer._id || 'unknown'}`);
        }
      });

      const assignCameraStream = (attempt = 1) => {
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = cameraStream;
          userVideoRef.current.play().catch((err) => {
            logDebug(`Error playing camera stream: ${err.message}`);
            addAlert('Failed to play camera stream.', 'error');
          });
          logDebug('Camera stream assigned to local video element.');
        } else if (attempt <= 10) {
          logDebug(`Retrying camera stream assignment (${attempt}/10)...`);
          setTimeout(() => assignCameraStream(attempt + 1), 1000);
        } else {
          logDebug('Failed to assign camera stream after 10 attempts');
          addAlert('Failed to assign camera stream.', 'error');
        }
      };
      assignCameraStream();

      setLocalStream(cameraStream);
      setIsScreenSharing(false);
      addAlert('Reverted to camera.', 'success');
    } catch (err) {
      logDebug(`Error reverting to camera: ${err.message}`);
      addAlert('Failed to revert to camera. Check permissions.', 'error');
    }
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
      }, 100);
    });

    peer.on('stream', (stream) => {
      logDebug(`Received stream from ${userId}, tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.enabled}`).join(', ')}`);
      peersRef.current[userId].remoteStream = stream;
      const assignPeerStream = (attempt = 1) => {
        if (peerVideoRefs.current[userId]) {
          peerVideoRefs.current[userId].srcObject = stream;
          peerVideoRefs.current[userId].play().catch((err) => {
            logDebug(`Error playing video for ${userId}: ${err.message}`);
            addAlert(`Failed to play video for ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'error');
          });
          logDebug(`Stream assigned to video element for ${userId}`);
          setConnectionStatus((prev) => ({ ...prev, [userId]: 'connected' }));
        } else if (attempt <= 15) {
          logDebug(`Video element for ${userId} not ready, retrying (${attempt}/15)...`);
          setTimeout(() => assignPeerStream(attempt + 1), 1000);
        } else {
          logDebug(`Failed to assign stream for ${userId} after 15 attempts`);
          addAlert(`Failed to assign video stream for ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'error');
          setConnectionStatus((prev) => ({ ...prev, [userId]: 'failed' }));
        }
      };
      assignPeerStream();
    });

    peer.on('connect', () => {
      logDebug(`Peer connection established with ${userId}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: 'connected' }));
      addAlert(`Connected to ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'success');
    });
    peer.on('error', (err) => {
      logDebug(`Peer error (${userId}): ${err.message}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: 'failed' }));
      addAlert(`Connection error with ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'error');
    });
    peer.on('close', () => {
      logDebug(`Peer connection closed for ${userId}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: 'disconnected' }));
      addAlert(`${connectionStatus[userId]?.userName || shortId(userId)} disconnected.`, 'info');
    });
    peer.on('iceconnectionstatechange', () => {
      const state = peer._pc.iceConnectionState;
      logDebug(`ICE connection state for ${userId}: ${state}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: state }));
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

  const handleUserJoined = (userId, userName, isUserHost) => {
    logDebug(`User joined: ${userId} (${userName}), isHost: ${isUserHost}, current peers: ${Object.keys(peersRef.current)}`);
    setConnectionStatus((prev) => ({ ...prev, [userId]: { status: 'connecting', userName, isHost: isUserHost } }));
    setParticipantControls((prev) => ({ ...prev, [userId]: { video: true, audio: true, proctor: false } }));
    const peer = createPeer(userId, true);
    setPeers((prev) => ({ ...prev, [userId]: peer }));
    addAlert(`${userName} joined the room.`, 'info');
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
    const userName = connectionStatus[userId]?.userName || shortId(userId);
    setConnectionStatus((prev) => {
      const newStatus = { ...prev };
      delete newStatus[userId];
      return newStatus;
    });
    setParticipantControls((prev) => {
      const newControls = { ...prev };
      delete newControls[userId];
      return newControls;
    });
    if (detectionIntervals.current[userId]) {
      clearInterval(detectionIntervals.current[userId]);
      delete detectionIntervals.current[userId];
    }
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
    addAlert(`${userName} left the room.`, 'info');
  };

  const handleChatMessage = (data) => {
    logDebug(`Received chat message from ${data.from} (${data.userName}): ${data.message}`);
    setMessages((prev) => {
      const exists = prev.some(
        (msg) => msg.from === data.from && msg.message === data.message && msg.time === new Date().toLocaleTimeString()
      );
      if (exists) return prev;
      return [
        ...prev,
        { from: data.from, userName: data.userName || 'Unknown', message: data.message, time: new Date().toLocaleTimeString() },
      ];
    });
  };

  const handleToggleMedia = (data) => {
    logDebug(`Received toggle-media from host for ${data.userId}: video=${data.video}, audio=${data.audio}`);
    if (data.userId === socketRef.current.id) {
      if (localStream) {
        if (data.video !== undefined) {
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = data.video;
            setIsVideoOn(data.video);
            logDebug(`Video track set to ${data.video ? 'enabled' : 'disabled'} by host`);
            addAlert(`Video ${data.video ? 'enabled' : 'disabled'} by host.`, 'info');
          }
        }
        if (data.audio !== undefined) {
          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = data.audio;
            setIsAudioOn(data.audio);
            logDebug(`Audio track set to ${data.audio ? 'enabled' : 'disabled'} by host`);
            addAlert(`Audio ${data.audio ? 'enabled' : 'disabled'} by host.`, 'info');
          }
        }
      }
    }
  };

  const sendChatMessage = () => {
    if (chatInput.trim()) {
      socketRef.current.emit('chat-message', { roomId, message: chatInput, userName });
      setMessages((prev) => [
        ...prev,
        { from: socketRef.current.id, userName, message: chatInput, time: new Date().toLocaleTimeString() },
      ]);
      setChatInput('');
    }
  };

  const toggleParticipantMedia = (userId, type) => {
    if (!isHost) return;
    setParticipantControls((prev) => {
      const newControls = { ...prev };
      newControls[userId] = {
        ...newControls[userId],
        [type]: !newControls[userId][type],
      };
      if (type === 'video' || type === 'audio') {
        socketRef.current.emit('toggle-media', {
          roomId,
          userId,
          video: type === 'video' ? newControls[userId].video : undefined,
          audio: type === 'audio' ? newControls[userId].audio : undefined,
        });
        logDebug(`Host toggled ${type} for ${userId} to ${newControls[userId][type]}`);
        addAlert(
          `${type.charAt(0).toUpperCase() + type.slice(1)} ${newControls[userId][type] ? 'enabled' : 'disabled'} for ${
            connectionStatus[userId]?.userName || shortId(userId)
          }.`,
          'info'
        );
      } else if (type === 'proctor') {
        logDebug(`Host toggled proctor for ${userId} to ${newControls[userId][type]}`);
        addAlert(
          `Proctor mode ${newControls[userId][type] ? 'enabled' : 'disabled'} for ${
            connectionStatus[userId]?.userName || shortId(userId)
          }.`,
          'info'
        );
      }
      return newControls;
    });
  };

  const shortId = (id) => id.slice(0, 8);

  return (
    <ErrorBoundary>
      <div className="app-container">
        <div className="alert-container">
          {alerts.map((alert) => (
            <Alert
              key={alert.id}
              message={alert.message}
              type={alert.type}
              onClose={() => removeAlert(alert.id)}
            />
          ))}
        </div>
        {!inRoom ? (
          <div className="join-room">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your username"
            />
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter Room ID"
            />
            <button onClick={joinRoom}>Join Room</button>
            <button onClick={createRoom}>Create Room</button>
          </div>
        ) : (
          <div className="conference-room">
            <header>
              <h2>Room: {roomId} {isHost ? '(Host)' : ''}</h2>
            </header>
            <div className="controls">
              <button onClick={toggleVideo} disabled={isHost ? false : !isVideoOn}>
                {isVideoOn ? 'Turn Video Off' : 'Turn Video On'}
              </button>
              <button onClick={toggleAudio} disabled={isHost ? false : !isAudioOn}>
                {isAudioOn ? 'Mute Audio' : 'Unmute Audio'}
              </button>
              <button onClick={toggleScreenShare}>
                {isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              </button>
              <button onClick={() => setShowDebug(!showDebug)}>
                {showDebug ? 'Hide Debug' : 'Show Debug'}
              </button>
            </div>
            <div className="main-content">
              <div className="video-container">
                <div className="video-item">
                  <video
                    ref={userVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="video-element"
                  />
                  <div className="video-label">You ({userName})</div>
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
                              addAlert(`Failed to play video for ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'error');
                            });
                          }
                        }
                      }}
                      autoPlay
                      playsInline
                      className="video-element"
                    />
                    <div className="video-label">
                      {connectionStatus[userId]?.userName || `Peer: ${shortId(userId)}`} ({connectionStatus[userId]?.status || 'connecting'})
                      {isHost && (
                        <div className="proctor-controls">
                          <button
                            onClick={() => toggleParticipantMedia(userId, 'video')}
                          >
                            {participantControls[userId]?.video ? 'Disable Video' : 'Enable Video'}
                          </button>
                          <button
                            onClick={() => toggleParticipantMedia(userId, 'audio')}
                          >
                            {participantControls[userId]?.audio ? 'Disable Audio' : 'Enable Audio'}
                          </button>
                          <button
                            onClick={() => toggleParticipantMedia(userId, 'proctor')}
                            className={participantControls[userId]?.proctor ? 'proctor-enabled' : ''}
                          >
                            {participantControls[userId]?.proctor ? 'Disable Proctor' : 'Enable Proctor'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="chat-container">
                <h3>Live Chat</h3>
                <div className="chat-messages" ref={chatRef}>
                  {messages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.from === socketRef.current.id ? 'own-message' : ''}`}>
                      <span className="chat-sender">
                        {msg.from === socketRef.current.id ? 'You' : msg.userName}
                      </span>
                      <span className="chat-time">[{msg.time}]</span>: {msg.message}
                    </div>
                  ))}
                </div>
                <div className="chat-input">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  />
                  <button onClick={sendChatMessage}>Send</button>
                </div>
              </div>
            </div>
            {showDebug && (
              <div className="debug">
                <h4>Debug Log:</h4>
                <ul>
                  {debugLog.map((log, index) => (
                    <li key={index}>{log}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <style>
          {`
            .app-container {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 1400px;
              margin: 0 auto;
              padding: 20px;
              background: #f5f6f5;
              position: relative;
            }
            .alert-container {
              position: fixed;
              top: 20px;
              right: 20px;
              z-index: 1000;
              max-width: 400px;
              width: 100%;
            }
            .alert {
              padding: 12px 16px;
              margin-bottom: 10px;
              border-radius: 6px;
              color: white;
              display: flex;
              justify-content: space-between;
              align-items: center;
              animation: slideIn 0.3s ease-in-out;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            .alert-error {
              background-color: #dc3545;
            }
            .alert-success {
              background-color: #28a745;
            }
            .alert-info {
              background-color: #17a2b8;
            }
            .alert-warning {
              background-color: #ffc107;
              color: #333;
            }
            .alert-close {
              background: none;
              border: none;
              color: white;
              font-size: 16px;
              cursor: pointer;
              padding: 0 8px;
            }
            .alert-close:hover {
              color: #ddd;
            }
            @keyframes slideIn {
              from {
                transform: translateX(100%);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
            header {
              text-align: center;
              margin-bottom: 20px;
              color: #333;
            }
            .join-room {
              display: flex;
              justify-content: center;
              gap: 10px;
              margin-bottom: 20px;
              flex-wrap: wrap;
            }
            .join-room input, .chat-input input {
              padding: 12px;
              border: 1px solid #ccc;
              border-radius: 6px;
              flex: 1;
              min-width: 200px;
              font-size: 16px;
              transition: border-color 0.3s;
            }
            .join-room input:focus, .chat-input input:focus {
              border-color: #007bff;
              outline: none;
            }
            .controls {
              display: flex;
              justify-content: center;
              gap: 12px;
              margin-bottom: 20px;
              flex-wrap: wrap;
            }
            .controls button, .join-room button, .chat-input button, .proctor-controls button {
              padding: 12px 24px;
              background-color: #007bff;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              transition: background-color 0.3s, transform 0.2s;
              font-size: 16px;
            }
            .controls button:hover, .join-room button:hover, .chat-input button:hover, .proctor-controls button:hover {
              background-color: #0056b3;
              transform: translateY(-2px);
            }
            .controls button:disabled, .proctor-controls button:disabled {
              background-color: #cccccc;
              cursor: not-allowed;
              transform: none;
            }
            .proctor-controls button.proctor-enabled {
              background-color: #28a745;
            }
            .proctor-controls button.proctor-enabled:hover {
              background-color: #218838;
            }
            .main-content {
              display: flex;
              gap: 20px;
              flex-direction: row;
            }
            .video-container {
              flex: 3;
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
              gap: 20px;
            }
            .video-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              background: #fff;
              padding: 12px;
              border-radius: 8px;
              box-shadow: 0 4px 8px rgba(0,0,0,0.1);
              transition: transform 0.2s;
            }
            .video-item:hover {
              transform: translateY(-4px);
            }
            .video-element {
              width: 100%;
              height: auto;
              border: 1px solid #ddd;
              background: #000;
              border-radius: 8px;
              max-height: 240px;
              object-fit: cover;
            }
            .video-label {
              margin-top: 8px;
              font-weight: 600;
              color: #333;
              font-size: 14px;
              text-align: center;
            }
            .proctor-controls {
              margin-top: 8px;
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
              justify-content: center;
            }
            .proctor-controls button {
              padding: 8px 16px;
              font-size: 14px;
            }
            .chat-container {
              flex: 1;
              display: flex;
              flex-direction: column;
              border: 1px solid #ccc;
              border-radius: 8px;
              padding: 15px;
              background: #fff;
              box-shadow: 0 4px 8px rgba(0,0,0,0.1);
              max-width: 400px;
            }
            .chat-messages {
              flex: 1;
              overflow-y: auto;
              max-height: 400px;
              margin-bottom: 15px;
              padding: 10px;
              background: #f9f9f9;
              border-radius: 6px;
            }
            .chat-message {
              margin-bottom: 10px;
              word-break: break-word;
              padding: 8px;
              border-radius: 6px;
              background: #e9ecef;
              transition: background-color 0.3s;
            }
            .chat-message.own-message {
              background: #007bff;
              color: white;
              margin-left: 20%;
            }
            .chat-sender {
              font-weight: 600;
              color: #007bff;
            }
            .chat-message.own-message .chat-sender {
              color: white;
            }
            .chat-time {
              color: #666;
              font-size: 0.8em;
              margin-left: 5px;
            }
            .chat-input {
              display: flex;
              gap: 10px;
            }
            .debug {
              margin-top: 20px;
              max-height: 200px;
              overflow-y: auto;
              border: 1px solid #ccc;
              padding: 15px;
              border-radius: 8px;
              background: #fff;
            }
            @media (max-width: 768px) {
              .main-content {
                flex-direction: column;
              }
              .chat-container {
                max-width: 100%;
              }
              .video-container {
                grid-template-columns: 1fr;
              }
              .alert-container {
                top: 10px;
                right: 10px;
                max-width: 90%;
              }
            }
          `}
        </style>
      </div>
    </ErrorBoundary>
  );
};

export default Video;