import React, { useState, useRef, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as faceapi from 'face-api.js';

const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com'; // Adjust if signaling server is on a different port

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

  const socketRef = useRef();
  const userVideoRef = useRef();
  const webcamRef = useRef();
  const peerVideoRefs = useRef({});
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

  const logDebug = useCallback((msg) => {
    console.log(msg);
    setDebugLog((prev) => [...prev, msg].slice(-50));
  }, []);

  const triggerAlert = useCallback((message, violationType) => {
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

      if (newCount >= MAX_VIOLATIONS) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance('Session terminated due to too many violations.');
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
        alert('Session Terminated: Too many violations detected.');
        setInRoom(false);
        setLocalStream(null);
        socketRef.current?.disconnect();
        Object.values(peersRef.current).forEach(peer => peer.destroy());
      }
      return newCount;
    });

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'en-US';
    utterance.pitch = 1.0;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, [logDebug]);

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
        stream.getTracks().forEach(track => track.stop());

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
              triggerAlert('⚠️ Failed to load face detection models.', 'ModelLoadError');
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
        socketRef.current.emit('join-room', roomId, socketRef.current.id, userName);
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

    socketRef.current.on('user-joined', (userId, userName) => {
      logDebug(`User joined: ${userId} (${userName})`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: { status: 'connecting', userName } }));
      const peer = createPeer(userId, true);
      setPeers((prev) => ({ ...prev, [userId]: peer }));
    });
    socketRef.current.on('offer', (data) => {
      logDebug(`Received offer from ${data.from}`);
      let peer = peersRef.current[data.from];
      if (!peer) {
        peer = createPeer(data.from, false);
        peersRef.current[data.from] = peer;
        setPeers((prev) => ({ ...prev, [data.from]: peer }));
      }
      peer.signal(data.signal);
    });
    socketRef.current.on('answer', (data) => {
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
    });
    socketRef.current.on('ice-candidate', (data) => {
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
    });
    socketRef.current.on('user-left', (userId) => {
      logDebug(`User left: ${userId}`);
      setConnectionStatus((prev) => {
        const newStatus = { ...prev };
        delete newStatus[userId];
        return newStatus;
      });
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
    });
    socketRef.current.on('chat-message', (data) => {
      logDebug(`Received chat message from ${data.from} (${data.userName}): ${data.message}`);
      setMessages((prev) => [
        ...prev,
        { from: data.from, userName: data.userName || 'Unknown', message: data.message, time: new Date().toLocaleTimeString() },
      ]);
    });

    return () => {
      socketRef.current.disconnect();
      if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current);
      if (webcamRef.current?.srcObject) {
        webcamRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [inRoom, roomId, userName, logDebug]);

  useEffect(() => {
    if (!localStream || !inRoom) return;

    const assignStream = (attempt = 1) => {
      if (userVideoRef.current && webcamRef.current) {
        userVideoRef.current.srcObject = localStream;
        webcamRef.current.srcObject = localStream; // Fixed: Removed .video
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

      const video = webcamRef.current; // Fixed: Use webcamRef.current directly
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
              Math.pow(noseTip.x - lastFacePosition.x, 2) +
              Math.pow(noseTip.y - lastFacePosition.y, 2)
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

    logDebug(`Joining room: ${roomId} as ${userName}`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      setProctoringActive(true);
      logDebug('Local stream acquired successfully.');
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      alert('Failed to access camera/microphone.');
      return;
    }

    socketRef.current.emit('join-room', roomId, socketRef.current.id, userName);
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
        logDebug(`Audio track ${audioTrack.enabled ? 'disabled' : 'enabled'}`);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        if (localStream) {
          localStream.getVideoTracks().forEach(track => track.stop());
        }

        Object.values(peersRef.current).forEach(peer => {
          const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
            logDebug(`Replaced video track with screen share for peer ${peer._id || 'unknown'}`);
          }
        });

        userVideoRef.current.srcObject = screenStream;
        webcamRef.current.srcObject = screenStream;
        setLocalStream(screenStream);
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          logDebug('Screen sharing stopped by user.');
          revertToCamera();
        };
      } catch (err) {
        logDebug(`Error starting screen share: ${err.message}`);
        alert('Failed to start screen sharing.');
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
        localStream.getVideoTracks().forEach(track => track.stop());
      }

      Object.values(peersRef.current).forEach(peer => {
        const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(cameraTrack);
          logDebug(`Replaced video track with camera for peer ${peer._id || 'unknown'}`);
        }
      });

      if (userVideoRef.current && webcamRef.current) {
        userVideoRef.current.srcObject = cameraStream;
        webcamRef.current.srcObject = cameraStream;
        setLocalStream(cameraStream);
        setIsScreenSharing(false);
      } else {
        logDebug('Video refs not available when reverting to camera');
      }
    } catch (err) {
      logDebug(`Error reverting to camera: ${err.message}`);
      alert('Failed to revert to camera.');
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
      logDebug(`Received stream from ${userId}`);
      peersRef.current[userId].remoteStream = stream;
      if (peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId].srcObject = stream;
        peerVideoRefs.current[userId].play().catch((err) => {
          logDebug(`Error playing video for ${userId}: ${err.message}`);
        });
        setConnectionStatus((prev) => ({ ...prev, [userId]: 'connected' }));
      }
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

    peersRef.current[userId] = peer;
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
              onClick={joinRoom}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              Join Room
            </button>
          </div>
        ) : (
          <div>
            <header className="text-center mb-5">
              <h2 className="text-2xl font-bold text-gray-800">Room: {roomId}</h2>
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
            </div>
            {currentAlert && (
              <div className="fixed top-5 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-black p-4 rounded-lg shadow-lg z-50">
                <p className="font-semibold">{currentAlert.message}</p>
                <p className="text-sm">Type: {currentAlert.violationType} | Time: {new Date(currentAlert.timestamp).toLocaleTimeString()}</p>
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
                  <video
                    ref={userVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-60 bg-black rounded-lg object-cover"
                  />
                  <div className="mt-2 font-semibold text-gray-700">
                    You ({userName}) {faceDetected ? '✅ Face Detected' : '❌ Face Not Detected'}
                  </div>
                  <div className="text-sm text-gray-600">Violations: {cheatCount}/{MAX_VIOLATIONS}</div>
                  {warningMessage && <div className="text-sm text-red-600">{warningMessage}</div>}
                </div>
                {Object.keys(peers).map((userId) => (
                  <div key={userId} className="flex flex-col items-center bg-white p-3 rounded-lg shadow-md hover:shadow-lg transition-transform hover:-translate-y-1">
                    <video
                      ref={(el) => {
                        if (el && !peerVideoRefs.current[userId]) {
                          peerVideoRefs.current[userId] = el;
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
                      className="w-full h-60 bg-black rounded-lg object-cover"
                    />
                    <div className="mt-2 font-semibold text-gray-700">
                      {connectionStatus[userId]?.userName || `Peer: ${shortId(userId)}`} ({connectionStatus[userId]?.status || 'connecting'})
                    </div>
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
                  {new Date(log.timestamp).toLocaleTimeString()} - {log.message} ({log.violationType})
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

