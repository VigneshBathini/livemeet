import React, { useState, useRef, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as faceapi from 'face-api.js';

const SIGNALING_SERVER_URL = 'http://localhost:3000'; // Update to match your server URL

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <h1 className="text-center text-red-600 text-2xl mt-10">Something went wrong. Please refresh the page.</h1>;
    }
    return this.props.children;
  }
}

const Video = () => {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
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
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [hasMicPermission, setHasMicPermission] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [cheatCount, setCheatCount] = useState(0);
  const [cheatLogs, setCheatLogs] = useState([]);
  const [proctoringActive, setProctoringActive] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelLoadError, setModelLoadError] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [alertQueue, setAlertQueue] = useState([]);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [alertLogs, setAlertLogs] = useState([]);
  const [lastFacePosition, setLastFacePosition] = useState(null);
  const [multipleFacesCount, setMultipleFacesCount] = useState(0);
  const [activeTab, setActiveTab] = useState('webcam');
  const [isHost, setIsHost] = useState(false);
  const [proctoredUserId, setProctoredUserId] = useState(null);

  const socketRef = useRef();
  const userVideoRef = useRef();
  const userScreenRef = useRef();
  const webcamRef = useRef();
  const peerVideoRefs = useRef({});
  const peerScreenRefs = useRef({});
  const pendingCandidates = useRef({});
  const peersRef = useRef({});
  const chatRef = useRef();
  const faceDetectionIntervalRef = useRef();
  const lastAlertTime = useRef({});

  const APP_SWITCH_THRESHOLD = 2000;
  const ALERT_DEBOUNCE_MS = 15000;
  const VIOLATION_RESET_MS = 30000;
  const MAX_VIOLATIONS = 3;
  const MOVEMENT_THRESHOLD = 50;
  const MULTIPLE_FACES_CONFIRMATION_FRAMES = 3;

  const logDebug = useCallback((msg, obj) => {
    const message = obj ? `${msg}: ${JSON.stringify(obj, null, 2)}` : msg;
    console.log(message);
    setDebugLog((prev) => [...prev, message].slice(-50));
  }, []);

  const triggerAlert = useCallback(
    (message, violationType) => {
      const now = Date.now();
      const lastAlert = lastAlertTime.current[violationType] || 0;
      const lastAnyAlert = lastAlertTime.current._lastAnyAlert || 0;

      if (now - lastAlert < ALERT_DEBOUNCE_MS || now - lastAnyAlert < 2000) {
        logDebug(`Debouncing alert: ${violationType}`);
        return;
      }

      logDebug(`Triggering alert: ${message} (${violationType}) at ${new Date(now).toLocaleTimeString()}`);
      setAlertQueue((prev) => [...prev, { message, violationType, timestamp: now }]);
      setAlertLogs((prev) => [
        ...prev,
        { message, violationType, timestamp: now, triggered: true },
      ]);
      lastAlertTime.current[violationType] = now;
      lastAlertTime.current._lastAnyAlert = now;

      setCheatCount((prev) => {
        const newCount = prev + 1;
        const timestamp = new Date().toLocaleString();
        setCheatLogs((logs) => [...logs, { message, timestamp, type: violationType }]);

        socketRef.current.emit('proctoring-violation', {
          roomId,
          userId: socketRef.current.id,
          userName,
          message,
          violationType,
          timestamp,
          cheatCount: newCount,
        });

        if (newCount >= MAX_VIOLATIONS) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance('Session terminated due to too many violations.');
          utterance.lang = 'en-US';
          window.speechSynthesis.speak(utterance);
          alert('Session Terminated: Too many violations detected.');
          setInRoom(false);
          setLocalStream(null);
          setScreenStream(null);
          socketRef.current?.disconnect();
          Object.values(peersRef.current).forEach(({ peer }) => peer.destroy());
        }
        return newCount;
      });

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'en-US';
      utterance.pitch = 1.0;
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    },
    [logDebug, roomId, userName]
  );

  useEffect(() => {
    if (alertQueue.length === 0) return;

    if (!currentAlert) {
      const nextAlert = alertQueue[0];
      setCurrentAlert(nextAlert);
      setAlertQueue((prev) => prev.slice(1));

      const timeout = setTimeout(() => {
        setCurrentAlert(null);
      }, 4000);

      return () => clearTimeout(timeout);
    }
  }, [alertQueue, currentAlert]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setHasCameraPermission(true);
        setHasMicPermission(true);
        stream.getTracks().forEach((track) => track.stop());

        const loadModels = async (attempt = 1) => {
          try {
            await Promise.all([
              faceapi.nets.ssdMobilenetv1.loadFromUri('/weights'),
              faceapi.nets.faceLandmark68Net.loadFromUri('/weights'),
            ]);
            logDebug('face-api.js models loaded successfully');
            setModelsLoading(false);
          } catch (error) {
            if (attempt < 3) {
              logDebug(`Model load attempt ${attempt} failed: ${error.message}. Retrying...`);
              setTimeout(() => loadModels(attempt + 1), 2000);
            } else {
              logDebug(`Failed to load face-api.js models after 3 attempts: ${error.message}`);
              setModelLoadError('Failed to load face detection models.');
              if (socketRef.current?.id === proctoredUserId) {
                triggerAlert('⚠️ Failed to load face detection models.', 'ModelLoadError');
              }
              setModelsLoading(false);
            }
          }
        };
        loadModels();
      } catch (error) {
        logDebug(`Media permission error: ${error.message}`);
        setHasCameraPermission(false);
        setHasMicPermission(false);
        setModelLoadError('Camera and microphone access required.');
        setModelsLoading(false);
      }
    };
    initialize();

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
        socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, isHost);
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

    socketRef.current.on('user-joined', (userId, userName, userIsHost) => {
      logDebug(`User joined: ${userId} (${userName}), isHost: ${userIsHost}`);
      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: { status: 'connecting', userName, isHost: userIsHost },
      }));
      if (userId !== socketRef.current.id) {
        const peer = createPeer(userId, true);
        setPeers((prev) => ({ ...prev, [userId]: peer }));
      }
    });

    socketRef.current.on('offer', (data) => {
      logDebug(`Received offer from ${data.from}`);
      let peer = peersRef.current[data.from]?.peer;
      if (!peer) {
        peer = createPeer(data.from, false);
        setPeers((prev) => ({ ...prev, [data.from]: peer }));
      }
      peer.signal(data.signal);
    });

    socketRef.current.on('answer', (data) => {
      logDebug(`Received answer from ${data.from}`);
      const peer = peersRef.current[data.from]?.peer;
      if (peer) {
        peer.signal(data.signal);
      } else {
        logDebug(`No peer for ${data.from}, queuing answer...`);
        if (!pendingCandidates.current[data.from]) {
          pendingCandidates.current[data.from] = [];
        }
        pendingCandidates.current[data.from].push(data.signal);
      }
    });

    socketRef.current.on('ice-candidate', (data) => {
      logDebug(`Received ICE candidate from ${data.from}`);
      const peer = peersRef.current[data.from]?.peer;
      if (peer) {
        peer.signal({ candidate: data.candidate });
      } else {
        logDebug(`Peer not ready for ICE candidate from ${data.from}, queuing...`);
        if (!pendingCandidates.current[data.from]) {
          pendingCandidates.current[data.from] = [];
        }
        pendingCandidates.current[data.from].push({ candidate: data.candidate });
      }
    });

    socketRef.current.on('screen-share-stopped', ({ from }) => {
      logDebug(`Screen sharing stopped by ${from}`);
      if (peerScreenRefs.current[from]) {
        peerScreenRefs.current[from].srcObject = null;
        delete peersRef.current[from].screenTrack;
        setActiveTab(`webcam-${from}`);
      }
    });

    socketRef.current.on('user-left', (userId) => {
      logDebug(`User left: ${userId}`);
      setConnectionStatus((prev) => {
        const newStatus = { ...prev };
        delete newStatus[userId];
        return newStatus;
      });
      if (peersRef.current[userId]) {
        peersRef.current[userId].peer.destroy();
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
        if (peerScreenRefs.current[userId]) {
          peerScreenRefs.current[userId].srcObject = null;
          delete peerScreenRefs.current[userId];
        }
        if (userId === proctoredUserId) {
          setProctoredUserId(null);
          setCheatCount(0);
          setCheatLogs([]);
          setProctoringActive(false);
          logDebug('Proctored user left, resetting proctoring.');
        }
      }
    });

    socketRef.current.on('chat-message', (data) => {
      logDebug(`Received chat message from ${data.from} (${data.userName}): ${data.message}`);
      setMessages((prev) => [
        ...prev,
        { from: data.from, userName: data.userName || 'Unknown', message: data.message, time: new Date().toLocaleTimeString() },
      ]);
    });

    socketRef.current.on('set-proctored-user', (data) => {
      logDebug(`Proctored user set to ${data.userId} (${data.userName})`);
      setProctoredUserId(data.userId);
      setProctoringActive(socketRef.current.id === data.userId);
    });

    socketRef.current.on('proctoring-violation', (data) => {
      logDebug(`Received proctoring violation from ${data.userId} (${data.userName}): ${data.message}`);
      setAlertLogs((prev) => [
        ...prev,
        {
          message: data.message,
          violationType: data.violationType,
          timestamp: data.timestamp,
          userName: data.userName,
          triggered: true,
        },
      ]);
      setAlertQueue((prev) => [
        ...prev,
        {
          message: `${data.userName}: ${data.message}`,
          violationType: data.violationType,
          timestamp: data.timestamp,
        },
      ]);
      if (data.userId === proctoredUserId) {
        setCheatCount(data.cheatCount);
        setCheatLogs((prev) => [...prev, { message: data.message, timestamp: data.timestamp, type: data.violationType }]);
      }
    });

    return () => {
      socketRef.current.disconnect();
      if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
      if (webcamRef.current?.srcObject) {
        webcamRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }
      if (screenStream) {
        screenStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [inRoom, roomId, userName, logDebug, screenStream, proctoredUserId]);

  useEffect(() => {
    if (!localStream || !inRoom) return;

    const assignStream = (attempt = 1) => {
      if (userVideoRef.current && webcamRef.current) {
        userVideoRef.current.srcObject = localStream;
        webcamRef.current.srcObject = localStream;
        userVideoRef.current.play().catch((err) => {
          logDebug(`Error playing local video: ${err.message}`);
        });
        webcamRef.current.play().catch((err) => {
          logDebug(`Error playing webcam video: ${err.message}`);
        });
        logDebug('Local stream assigned to video elements.');
        setVideoReady(true);
      } else if (attempt <= 10) {
        logDebug(`Retrying local stream assignment (${attempt}/10)...`);
        setTimeout(() => assignStream(attempt + 1), 1000);
      } else {
        logDebug('Failed to assign local stream after 10 attempts');
        setWarningMessage('Failed to initialize video stream.');
      }
    };
    assignStream();
  }, [localStream, inRoom, logDebug]);

  useEffect(() => {
    if (!screenStream || !inRoom) return;

    const assignScreenStream = (attempt = 1) => {
      if (userScreenRef.current) {
        userScreenRef.current.srcObject = screenStream;
        userScreenRef.current.play().catch((err) => {
          logDebug(`Error playing screen share video: ${err.message}`);
        });
        logDebug('Screen stream assigned to video element.');
      } else if (attempt <= 10) {
        logDebug(`Retrying screen stream assignment (${attempt}/10)...`);
        setTimeout(() => assignScreenStream(attempt + 1), 1000);
      } else {
        logDebug('Failed to assign screen stream after 10 attempts');
        setWarningMessage('Failed to initialize screen share stream.');
      }
    };
    assignScreenStream();
  }, [screenStream, inRoom, logDebug]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!proctoringActive || modelLoadError || !videoReady || !inRoom) {
      setFaceDetected(false);
      return;
    }

    const monitorFaces = async () => {
      if (!hasCameraPermission) {
        logDebug('Skipping face detection: No camera permission');
        return;
      }

      if (!webcamRef.current?.srcObject) {
        logDebug('Webcam stream not available');
        setWarningMessage('Webcam stream not available.');
        setFaceDetected(false);
        triggerAlert('⚠️ Webcam stream not available. Ensure camera is working.', 'FaceDetectionError');
        return;
      }

      const video = webcamRef.current;
      if (video.readyState !== 4) {
        logDebug('Video not ready:', video.readyState);
        return;
      }

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
          .withFaceLandmarks();
        const faceCount = detections.length;
        logDebug(`Face detection: ${faceCount} faces detected`);

        setFaceDetected(faceCount > 0);

        if (faceCount > 1) {
          setMultipleFacesCount((prev) => prev + 1);
          if (multipleFacesCount + 1 >= MULTIPLE_FACES_CONFIRMATION_FRAMES) {
            triggerAlert('⚠️ Multiple faces detected! Only one person allowed in view.', 'MultipleFaces');
            setMultipleFacesCount(0);
          }
        } else {
          setMultipleFacesCount(0);
        }

        if (faceCount === 1 && detections[0].landmarks) {
          const landmarks = detections[0].landmarks.positions;
          const noseTip = landmarks[30];
          if (lastFacePosition) {
            const movement = Math.sqrt(
              Math.pow(noseTip.x - lastFacePosition.x, 2) + Math.pow(noseTip.y - lastFacePosition.y, 2)
            );
            if (movement > MOVEMENT_THRESHOLD) {
              triggerAlert('⚠️ Excessive face movement detected! Keep your face steady.', 'FaceMovement');
            }
          }
          setLastFacePosition({ x: noseTip.x, y: noseTip.y });
        } else {
          setLastFacePosition(null);
        }

        if (faceCount === 0) {
          triggerAlert('⚠️ Face not detected! Keep your face in view.', 'FaceDetection');
        }
      } catch (error) {
        logDebug(`Face detection error: ${error.message}`);
        setWarningMessage('Face detection failed.');
        triggerAlert('⚠️ Face detection error occurred.', 'FaceDetectionError');
      }
    };

    faceDetectionIntervalRef.current = setInterval(monitorFaces, 1000);
    return () => {
      clearInterval(faceDetectionIntervalRef.current);
      setWarningMessage('');
      setLastFacePosition(null);
      setMultipleFacesCount(0);
    };
  }, [proctoringActive, modelLoadError, videoReady, hasCameraPermission, logDebug, triggerAlert, lastFacePosition, multipleFacesCount]);

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

  const joinRoom = async (isCreator = false) => {
    if (!roomId.trim()) {
      logDebug('Please enter a Room ID.');
      alert('Please enter a Room ID.');
      return;
    }
    if (!userName.trim()) {
      logDebug('Please enter a username.');
      alert('Please enter a username.');
      return;
    }

    if (!(await checkPermissions())) {
      logDebug('Camera/microphone permissions denied.');
      alert('Please grant camera and microphone permissions.');
      return;
    }

    logDebug(`Joining room: ${roomId} as ${userName}, isHost: ${isCreator}`);
    setIsHost(isCreator);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      if (isCreator) {
        setProctoringActive(false);
      }
      logDebug('Local stream acquired successfully.', { tracks: stream.getTracks().map((t) => t.id) });
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      alert('Failed to access camera/microphone.');
      return;
    }

    socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, isCreator);
    setInRoom(true);
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        logDebug(`Video track ${videoTrack.enabled ? 'enabled' : 'disabled'}`, { trackId: videoTrack.id });
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
        logDebug(`Audio track ${audioTrack.enabled ? 'enabled' : 'disabled'}`, { trackId: audioTrack.id });
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const newScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(newScreenStream);
        setIsScreenSharing(true);
        setActiveTab('screen');
        logDebug('Screen sharing started.', { tracks: newScreenStream.getVideoTracks().map((t) => t.id) });

        Object.values(peersRef.current).forEach(({ peer }) => {
          const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video' && s.track !== localStream.getVideoTracks()[0]);
          if (sender) {
            sender.replaceTrack(newScreenStream.getVideoTracks()[0]);
          } else {
            peer.addTrack(newScreenStream.getVideoTracks()[0], newScreenStream);
          }
          logDebug(`Added/updated screen share track for peer ${peer._id || 'unknown'}`, {
            trackId: newScreenStream.getVideoTracks()[0].id,
          });
        });

        newScreenStream.getVideoTracks()[0].onended = () => {
          logDebug('Screen sharing stopped by user.');
          stopScreenShare();
        };
      } catch (err) {
        logDebug(`Error starting screen share: ${err.message}`);
        alert('Failed to start screen sharing.');
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      setIsScreenSharing(false);
      setActiveTab('webcam');
      logDebug('Screen sharing stopped.');

      Object.values(peersRef.current).forEach(({ peer }) => {
        const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video' && s.track !== localStream.getVideoTracks()[0]);
        if (sender) {
          peer.removeTrack(sender);
          logDebug(`Removed screen share track from peer ${peer._id || 'unknown'}`);
        }
      });

      socketRef.current.emit('screen-share-stopped', { roomId });
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

    peersRef.current[userId] = { peer, webcamTrack: null, screenTrack: null };

    if (screenStream) {
      peer.addTrack(screenStream.getVideoTracks()[0], screenStream);
      peersRef.current[userId].screenTrack = screenStream.getVideoTracks()[0];
      logDebug(`Added screen share track to new peer ${userId}`, { trackId: screenStream.getVideoTracks()[0].id });
    }

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

    peer.on('track', (track, stream) => {
      logDebug(`Received track from ${userId}: ${track.kind}`, { trackId: track.id });
      const isScreenTrack = screenStream && stream.getVideoTracks().includes(track);
      peersRef.current[userId][isScreenTrack ? 'screenTrack' : 'webcamTrack'] = track;

      const targetRef = isScreenTrack ? peerScreenRefs.current[userId] : peerVideoRefs.current[userId];
      if (targetRef) {
        targetRef.srcObject = stream;
        targetRef.play().catch((err) => {
          logDebug(`Error playing ${isScreenTrack ? 'screen share' : 'webcam'} video for ${userId}: ${err.message}`);
        });
      }

      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], status: 'connected' },
      }));
    });

    peer.on('connect', () => {
      logDebug(`Peer connection established with ${userId}`);
      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], status: 'connected' },
      }));
    });

    peer.on('error', (err) => {
      logDebug(`Peer error (${userId}): ${err.message}`);
      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], status: 'failed' },
      }));
    });

    peer.on('close', () => {
      logDebug(`Peer connection closed for ${userId}`);
      setConnectionStatus((prev) => {
        const newStatus = { ...prev };
        delete newStatus[userId];
        return newStatus;
      });
      if (peersRef.current[userId]) {
        delete peersRef.current[userId];
        setPeers((prev) => {
          const newPeers = { ...prev };
          delete newPeers[userId];
          return newPeers;
        });
      }
    });

    if (pendingCandidates.current[userId]) {
      pendingCandidates.current[userId].forEach((signal) => {
        peer.signal(signal);
      });
      delete pendingCandidates.current[userId];
    }

    return peer;
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

  const selectProctoredUser = (userId, userName) => {
    logDebug(`Host selected proctored user: ${userId} (${userName})`);
    setProctoredUserId(userId);
    setProctoringActive(socketRef.current.id === userId);
    socketRef.current.emit('set-proctored-user', { roomId, userId, userName });
  };

  const shortId = (id) => id.slice(0, 8);

  if (modelsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-600"></div>
        <p className="mt-4 text-lg text-gray-700">Loading face detection models...</p>
      </div>
    );
  }

  if (hasCameraPermission === false || hasMicPermission === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-red-600">No access to camera or microphone. Please enable permissions and refresh.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-7xl mx-auto p-5 bg-gray-100 min-h-screen">
        <video ref={webcamRef} autoPlay playsInline className="hidden" />
        {!inRoom ? (
          <div className="flex flex-col items-center gap-4">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your username"
              className="p-3 border border-gray-300 rounded-lg w-80"
            />
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter Room ID"
              className="p-3 border border-gray-300 rounded-lg w-80"
            />
            <button
              onClick={() => joinRoom(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              Create Room
            </button>
            <button
              onClick={() => joinRoom(false)}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700"
            >
              Join Room
            </button>
          </div>
        ) : (
          <div>
            <header className="text-center mb-5">
              <h2 className="text-2xl font-bold text-gray-800">Room: {roomId} {isHost ? '(Host)' : ''}</h2>
            </header>
            <div className="flex flex-wrap gap-3 justify-center mb-5">
              <button
                onClick={toggleVideo}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                {isVideoOn ? 'Turn Video Off' : 'Turn Video On'}
              </button>
              <button
                onClick={toggleAudio}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                {isAudioOn ? 'Mute Audio' : 'Unmute Audio'}
              </button>
              <button
                onClick={toggleScreenShare}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                {isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              </button>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                {showDebug ? 'Hide Debug' : 'Show Debug'}
              </button>
              {isHost && (
                <select
                  onChange={(e) => {
                    const [userId, userName] = e.target.value.split('|');
                    if (userId) selectProctoredUser(userId, userName);
                  }}
                  className="p-2 border border-gray-300 rounded-lg"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select Proctored User
                  </option>
                  {Object.entries(connectionStatus)
                    .filter(([userId]) => userId !== socketRef.current.id)
                    .map(([userId, { userName }]) => (
                      <option key={userId} value={`${userId}|${userName}`}>
                        {userName} ({shortId(userId)})
                      </option>
                    ))}
                </select>
              )}
            </div>
            {currentAlert && (
              <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-black p-4 rounded-lg shadow-lg z-50">
                <p className="font-semibold">{currentAlert.message}</p>
                <p className="text-sm">
                  Type: {currentAlert.violationType} | Time: {new Date(currentAlert.timestamp).toLocaleTimeString()}
                </p>
                <button
                  onClick={() => setCurrentAlert(null)}
                  className="mt-2 bg-gray-800 text-white px-3 py-1 rounded"
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className="flex flex-col lg:flex-row gap-5">
              <div className="flex-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <div className="relative flex flex-col items-center bg-white p-3 rounded-lg shadow-md hover:shadow-lg transition-transform hover:-translate-y-1">
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => setActiveTab('webcam')}
                      className={`px-4 py-2 rounded-lg ${activeTab === 'webcam' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                    >
                      Webcam
                    </button>
                    {isScreenSharing && (
                      <button
                        onClick={() => setActiveTab('screen')}
                        className={`px-4 py-2 rounded-lg ${activeTab === 'screen' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                      >
                        Screen Share
                      </button>
                    )}
                  </div>
                  {activeTab === 'webcam' ? (
                    <video
                      ref={userVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-60 bg-black rounded-lg object-cover"
                    />
                  ) : (
                    <video
                      ref={userScreenRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-60 bg-black rounded-lg object-cover"
                    />
                  )}
                  <div className="mt-2 font-semibold text-gray-700">
                    You ({userName}) {socketRef.current.id === proctoredUserId && activeTab === 'webcam' && faceDetected ? '✅ Face Detected' : socketRef.current.id === proctoredUserId && activeTab === 'webcam' ? '❌ Face Not Detected' : ''}
                    {socketRef.current.id === proctoredUserId ? ' (Proctored)' : ''}
                  </div>
                  {socketRef.current.id === proctoredUserId && (
                    <div className="text-sm text-gray-600">Violations: {cheatCount}/{MAX_VIOLATIONS}</div>
                  )}
                  {socketRef.current.id === proctoredUserId && warningMessage && (
                    <div className="text-sm text-red-600">{warningMessage}</div>
                  )}
                </div>
                {Object.keys(peers).map((userId) => (
                  <div
                    key={userId}
                    className="relative flex flex-col items-center bg-white p-3 rounded-lg shadow-md hover:shadow-lg transition-transform hover:-translate-y-1"
                  >
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setActiveTab(`webcam-${userId}`)}
                        className={`px-4 py-2 rounded-lg ${activeTab === `webcam-${userId}` ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                      >
                        Webcam
                      </button>
                      {peersRef.current[userId]?.screenTrack && (
                        <button
                          onClick={() => setActiveTab(`screen-${userId}`)}
                          className={`px-4 py-2 rounded-lg ${activeTab === `screen-${userId}` ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                          Screen Share
                        </button>
                      )}
                    </div>
                    {activeTab === `webcam-${userId}` ? (
                      peersRef.current[userId]?.webcamTrack ? (
                        <video
                          ref={(el) => {
                            if (el && !peerVideoRefs.current[userId]) {
                              peerVideoRefs.current[userId] = el;
                              if (peersRef.current[userId]?.webcamTrack) {
                                const stream = new MediaStream([peersRef.current[userId].webcamTrack]);
                                el.srcObject = stream;
                                el.play().catch((err) => {
                                  logDebug(`Error playing webcam video for ${userId}: ${err.message}`);
                                });
                              }
                            }
                          }}
                          autoPlay
                          playsInline
                          className="w-full h-60 bg-black rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-full h-60 bg-gray-200 rounded-lg flex items-center justify-center">
                          <p className="text-gray-700">No webcam stream available</p>
                        </div>
                      )
                    ) : peersRef.current[userId]?.screenTrack ? (
                      <video
                        ref={(el) => {
                          if (el && !peerScreenRefs.current[userId]) {
                            peerScreenRefs.current[userId] = el;
                            if (peersRef.current[userId]?.screenTrack) {
                              const stream = new MediaStream([peersRef.current[userId].screenTrack]);
                              el.srcObject = stream;
                              el.play().catch((err) => {
                                logDebug(`Error playing screen share video for ${userId}: ${err.message}`);
                              });
                            }
                          }
                        }}
                        autoPlay
                        playsInline
                        className="w-full h-60 bg-black rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-full h-60 bg-gray-200 rounded-lg flex items-center justify-center">
                        <p className="text-gray-700">No screen share stream available</p>
                      </div>
                    )}
                    <div className="mt-2 font-semibold text-gray-700">
                      {connectionStatus[userId]?.userName || `Peer: ${shortId(userId)}`} ({connectionStatus[userId]?.status || 'connecting'})
                      {userId === proctoredUserId ? ' (Proctored)' : ''}
                    </div>
                    {userId === proctoredUserId && (
                      <div className="text-sm text-gray-600">Violations: {cheatCount}/{MAX_VIOLATIONS}</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex-1 bg-white p-4 rounded-lg shadow-md max-w-md">
                <h3 className="text-lg font-semibold mb-3">Live Chat</h3>
                <div ref={chatRef} className="h-96 overflow-y-auto bg-gray-50 p-3 rounded-lg mb-3">
                  {messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`mb-2 p-2 rounded-lg ${msg.from === socketRef.current.id ? 'bg-blue-600 text-white ml-10' : 'bg-gray-200'}`}
                    >
                      <span className={`font-semibold ${msg.from === socketRef.current.id ? 'text-white' : 'text-blue-600'}`}>
                        {msg.from === socketRef.current.id ? 'You' : msg.userName}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">[{msg.time}]</span>: {msg.message}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                    className="flex-1 p-2 border border-gray-300 rounded-lg"
                  />
                  <button
                    onClick={sendChatMessage}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
            {showDebug && (
              <div className="mt-5 p-4 bg-white rounded-lg shadow-md max-h-48 overflow-y-auto">
                <h4 className="text-lg font-semibold">Debug Log:</h4>
                <ul className="text-sm text-gray-700">
                  {debugLog.map((log, index) => (
                    <li key={index}>{log}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 p-4 bg-white rounded-lg shadow-md max-h-48 overflow-y-auto">
              <h3 className="text-lg font-semibold mb-3">Alert History</h3>
              {alertLogs.map((log, index) => (
                <p key={index} className="text-sm text-gray-700">
                  {new Date(log.timestamp).toLocaleTimeString()} - {log.userName}: {log.message} ({log.violationType})
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default Video;