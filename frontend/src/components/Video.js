import React, { useState, useRef, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';

const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';

const ErrorBoundary = ({ children }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const errorHandler = (error) => {
      console.error('ErrorBoundary caught:', error);
      setHasError(true);
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  if (hasError) {
    return <h1 className="text-center text-red-600 text-2xl mt-10">Something went wrong. Please refresh.</h1>;
  }
  return children;
};

const Video = () => {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [inRoom, setInRoom] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [peers, setPeers] = useState({});
  const [debugLog, setDebugLog] = useState([]);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({});
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showDebug, setShowDebug] = useState(true);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [hasMicPermission, setHasMicPermission] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [cheatCount, setCheatCount] = useState(0);
  const [cheatLogs, setCheatLogs] = useState([]);
  const [proctoringActive, setProctoringActive] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelLoadError, setModelLoadError] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [proctoredUsers, setProctoredUsers] = useState({});

  const socketRef = useRef();
  const userVideoRef = useRef();
  const faceVideoRef = useRef();
  const peerVideoRefs = useRef({});
  const peersRef = useRef({});
  const chatRef = useRef();
  const faceDetectionIntervalRef = useRef();

  const logDebug = useCallback((msg) => {
    console.log(msg);
    setDebugLog((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`].slice(-50));
  }, []);

  const triggerAlert = useCallback(
    (message, violationType) => {
      const now = Date.now();
      setAlertQueue((prev) => [...prev, { message, violationType, timestamp: now }]);
      setCheatCount((prev) => {
        const newCount = prev + 1;
        const logEntry = { message, timestamp: new Date().toLocaleString(), type: violationType };
        setCheatLogs((logs) => [...logs, logEntry]);
        if (proctoringActive && socketRef.current) {
          socketRef.current.emit('cheat-detected', {
            roomId,
            userId: socketRef.current.id,
            userName,
            cheatLog: logEntry,
          });
        }
        if (newCount >= 3) {
          alert('Session Terminated: Too many violations.');
          setInRoom(false);
          setLocalStream(null);
          socketRef.current?.disconnect();
          Object.values(peersRef.current).forEach((peer) => peer.close());
        }
        return newCount;
      });
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    },
    [proctoringActive, roomId, userName]
  );

  const createPeerConnection = useCallback(
    (userId, initiator) => {
      logDebug(`Creating peer connection for ${userId}, initiator: ${initiator}`);
      if (!localStream) {
        logDebug(`Cannot create peer for ${userId}: local stream not ready`);
        return null;
      }

      const peer = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
        ],
      });

      localStream.getTracks().forEach((track) => {
        peer.addTrack(track, localStream);
        logDebug(`Added track to peer ${userId}: ${track.kind}, id: ${track.id}, enabled: ${track.enabled}`);
      });

      peer.ontrack = ({ track, streams }) => {
        logDebug(`Received track from ${userId}: ${track.kind}, id: ${track.id}, enabled: ${track.enabled}`);
        peersRef.current[userId].remoteStream = streams[0];
        const videoEl = peerVideoRefs.current[userId];
        if (videoEl) {
          videoEl.srcObject = streams[0];
          videoEl.play().then(() => {
            logDebug(`Playing video for ${userId}`);
            setConnectionStatus((prev) => ({
              ...prev,
              [userId]: { ...prev[userId], status: 'connected', videoEnabled: track.enabled },
            }));
          }).catch((err) => logDebug(`Error playing video for ${userId}: ${err.message}`));
        }
      };

      peer.onicecandidate = ({ candidate }) => {
        if (candidate) {
          logDebug(`Sending ICE candidate for ${userId}`);
          socketRef.current.emit('ice-candidate', { candidate, to: userId, from: socketRef.current.id });
        }
      };

      peer.oniceconnectionstatechange = () => {
        logDebug(`ICE state for ${userId}: ${peer.iceConnectionState}`);
        if (peer.iceConnectionState === 'disconnected' || peer.iceConnectionState === 'failed') {
          setConnectionStatus((prev) => ({ ...prev, [userId]: { ...prev[userId], status: peer.iceConnectionState } }));
        }
      };

      peer.onnegotiationneeded = async () => {
        if (initiator) {
          try {
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            logDebug(`Sending offer for ${userId}`);
            socketRef.current.emit('offer', { signal: peer.localDescription, to: userId, from: socketRef.current.id });
          } catch (err) {
            logDebug(`Error creating offer for ${userId}: ${err.message}`);
          }
        }
      };

      peersRef.current[userId] = peer;
      return peer;
    },
    [localStream, logDebug]
  );

  useEffect(() => {
    const initializeSocket = () => {
      socketRef.current = io(SIGNALING_SERVER_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current.on('connect', () => logDebug('Connected to signaling server'));

      socketRef.current.on('room-created', (newRoomId) => {
        logDebug(`Room created: ${newRoomId}`);
        setRoomId(newRoomId);
        setInRoom(true);
        setIsHost(true);
      });

      socketRef.current.on('user-joined', (userId, userName) => {
        logDebug(`User joined: ${userId} (${userName})`);
        setConnectionStatus((prev) => ({
          ...prev,
          [userId]: { userName, status: 'connecting', proctoring: false, videoEnabled: true },
        }));
        setProctoredUsers((prev) => ({ ...prev, [userId]: false }));
        if (localStream) {
          const peer = createPeerConnection(userId, true);
          if (peer) setPeers((prev) => ({ ...prev, [userId]: peer }));
        }
      });

      socketRef.current.on('offer', async (data) => {
        logDebug(`Received offer from ${data.from}`);
        let peer = peersRef.current[data.from];
        if (!peer) {
          peer = createPeerConnection(data.from, false);
          if (peer) setPeers((prev) => ({ ...prev, [data.from]: peer }));
        }
        try {
          await peer.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          logDebug(`Sending answer to ${data.from}`);
          socketRef.current.emit('answer', { signal: peer.localDescription, to: data.from, from: socketRef.current.id });
        } catch (err) {
          logDebug(`Error handling offer from ${data.from}: ${err.message}`);
        }
      });

      socketRef.current.on('answer', async (data) => {
        logDebug(`Received answer from ${data.from}`);
        const peer = peersRef.current[data.from];
        if (peer) {
          try {
            await peer.setRemoteDescription(new RTCSessionDescription(data.signal));
          } catch (err) {
            logDebug(`Error handling answer from ${data.from}: ${err.message}`);
          }
        }
      });

      socketRef.current.on('ice-candidate', async (data) => {
        logDebug(`Received ICE candidate from ${data.from}`);
        const peer = peersRef.current[data.from];
        if (peer && data.candidate) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (err) {
            logDebug(`Error adding ICE candidate from ${data.from}: ${err.message}`);
          }
        }
      });

      socketRef.current.on('user-left', (userId) => {
        logDebug(`User left: ${userId}`);
        if (peersRef.current[userId]) {
          peersRef.current[userId].close();
          delete peersRef.current[userId];
          setPeers((prev) => {
            const newPeers = { ...prev };
            delete newPeers[userId];
            return newPeers;
          });
        }
        setConnectionStatus((prev) => {
          const newStatus = { ...prev };
          delete newStatus[userId];
          return newStatus;
        });
        setProctoredUsers((prev) => {
          const newProctored = { ...prev };
          delete newProctored[userId];
          return newProctored;
        });
      });

      socketRef.current.on('chat-message', (data) => {
        setMessages((prev) => [
          ...prev,
          { from: data.from, userName: data.userName, message: data.message, time: new Date().toLocaleTimeString() },
        ]);
      });

      socketRef.current.on('toggle-proctoring', (data) => {
        logDebug(`Proctoring toggle for ${data.userId}: ${data.enable}`);
        if (data.userId === socketRef.current.id) {
          setProctoringActive(data.enable);
        }
        setProctoredUsers((prev) => ({ ...prev, [data.userId]: data.enable }));
        setConnectionStatus((prev) => ({
          ...prev,
          [data.userId]: { ...prev[data.userId], proctoring: data.enable },
        }));
      });

      socketRef.current.on('cheat-detected', (data) => {
        if (isHost) {
          setCheatLogs((prev) => [
            ...prev,
            { ...data.cheatLog, userId: data.userId, userName: data.userName },
          ]);
        }
      });

      socketRef.current.on('video-toggle', (data) => {
        logDebug(`Video toggle from ${data.userId}: ${data.enabled}`);
        setConnectionStatus((prev) => ({
          ...prev,
          [data.userId]: { ...prev[data.userId], videoEnabled: data.enabled },
        }));
      });

      socketRef.current.on('error', (data) => {
        logDebug(`Server error: ${data.message}`);
        alert(`Error: ${data.message}`);
      });

      return () => socketRef.current?.disconnect();
    };

    initializeSocket();
  }, [logDebug, localStream, isHost, createPeerConnection]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setHasCameraPermission(true);
        setHasMicPermission(true);
        setLocalStream(stream);
        if (userVideoRef.current && faceVideoRef.current) {
          userVideoRef.current.srcObject = stream;
          faceVideoRef.current.srcObject = stream;
          userVideoRef.current.play().catch((err) => logDebug(`Local video play error: ${err.message}`));
          faceVideoRef.current.play().catch((err) => logDebug(`Face video play error: ${err.message}`));
        }
        stream.getTracks().forEach((track) => {
          logDebug(`Initial track: ${track.kind}, id: ${track.id}, enabled: ${track.enabled}`);
        });

        try {
          await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('/weights'),
            faceapi.nets.faceLandmark68Net.loadFromUri('/weights'),
          ]);
          logDebug('Face detection models loaded');
          setModelsLoading(false);
        } catch (err) {
          logDebug(`Model load error: ${err.message}`);
          setModelLoadError('Failed to load face detection models');
          setModelsLoading(false);
        }
      } catch (err) {
        logDebug(`Media permission error: ${err.message}`);
        setHasCameraPermission(false);
        setHasMicPermission(false);
        setModelsLoading(false);
      }
    };
    initialize();
  }, [logDebug]);

  useEffect(() => {
    if (!proctoringActive || modelLoadError || !localStream) return;

    const detectFaces = async () => {
      if (!faceVideoRef.current || faceVideoRef.current.readyState !== 4) {
        logDebug('Face detection video not ready');
        return;
      }

      try {
        const detections = await faceapi
          .detectAllFaces(faceVideoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks();
        const faceCount = detections.length;
        logDebug(`Detected ${faceCount} faces`);

        setFaceDetected(faceCount === 1);
        if (faceCount === 0) {
          triggerAlert('Face not detected! Stay in view.', 'FaceNotDetected');
        } else if (faceCount > 1) {
          triggerAlert('Multiple faces detected! Only one person allowed.', 'MultipleFaces');
        }
      } catch (err) {
        logDebug(`Face detection error: ${err.message}`);
        triggerAlert('Face detection failed.', 'FaceDetectionError');
      }
    };

    faceDetectionIntervalRef.current = setInterval(detectFaces, 3000);
    return () => clearInterval(faceDetectionIntervalRef.current);
  }, [proctoringActive, modelLoadError, localStream, triggerAlert, logDebug]);

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOn(videoTrack.enabled);
      logDebug(`Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
      socketRef.current.emit('video-toggle', { roomId, userId: socketRef.current.id, enabled: videoTrack.enabled });
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioOn(audioTrack.enabled);
      logDebug(`Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      localStream.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      userVideoRef.current.srcObject = stream;
      faceVideoRef.current.srcObject = stream;
      Object.values(peersRef.current).forEach((peer) => {
        const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(stream.getVideoTracks()[0]);
      });
      setIsScreenSharing(false);
      logDebug('Reverted to camera');
    } else {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setLocalStream(stream);
      userVideoRef.current.srcObject = stream;
      faceVideoRef.current.srcObject = stream;
      Object.values(peersRef.current).forEach((peer) => {
        const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(stream.getVideoTracks()[0]);
      });
      setIsScreenSharing(true);
      logDebug('Screen sharing started');
    }
  };

  const createRoom = async () => {
    if (!userName.trim()) {
      alert('Enter a username');
      return;
    }
    socketRef.current.emit('create-room', socketRef.current.id, userName);
  };

  const joinRoom = async () => {
    if (!roomId.trim() || !userName.trim()) {
      alert('Enter both Room ID and username');
      return;
    }
    socketRef.current.emit('join-room', roomId, socketRef.current.id, userName);
    setInRoom(true);
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

  const toggleProctoring = (userId) => {
    if (!isHost) return;
    socketRef.current.emit('toggle-proctoring', { roomId, userId, enable: !proctoredUsers[userId] });
    setProctoredUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  useEffect(() => {
    if (alertQueue.length && !currentAlert) {
      const nextAlert = alertQueue[0];
      setCurrentAlert(nextAlert);
      setAlertQueue((prev) => prev.slice(1));
      setTimeout(() => setCurrentAlert(null), 4000);
    }
  }, [alertQueue, currentAlert]);

  if (modelsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-600"></div>
        <p className="mt-4 text-lg">Loading models...</p>
      </div>
    );
  }

  if (hasCameraPermission === false || hasMicPermission === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <p className="text-lg text-red-600">Camera or microphone access denied.</p>
        <button onClick={() => window.location.reload()} className="mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-7xl mx-auto p-4 bg-gray-100 min-h-screen">
        <video ref={faceVideoRef} autoPlay playsInline className="hidden" />
        {!inRoom ? (
          <div className="flex flex-col items-center gap-4">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your username"
              className="p-3 border rounded-lg w-80"
            />
            <button onClick={createRoom} className="bg-green-600 text-white px-6 py-3 rounded-lg w-80">
              Create Room
            </button>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Room ID"
              className="p-3 border rounded-lg w-80"
            />
            <button onClick={joinRoom} className="bg-blue-600 text-white px-6 py-3 rounded-lg w-80">
              Join Room
            </button>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold text-center mb-4">
              Room: {roomId} {isHost ? '(Host)' : ''}
            </h2>
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              <button onClick={toggleVideo} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
                {isVideoOn ? 'Turn Video Off' : 'Turn Video On'}
              </button>
              <button onClick={toggleAudio} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
                {isAudioOn ? 'Mute Audio' : 'Unmute Audio'}
              </button>
              <button onClick={toggleScreenShare} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
                {isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              </button>
              <button onClick={() => setShowDebug(!showDebug)} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
                {showDebug ? 'Hide Debug' : 'Show Debug'}
              </button>
            </div>
            {currentAlert && (
              <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-yellow-400 text-black p-4 rounded-lg shadow-lg">
                <p className="font-semibold">{currentAlert.message}</p>
                <button onClick={() => setCurrentAlert(null)} className="mt-2 bg-gray-800 text-white px-2 py-1 rounded">
                  Dismiss
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div className="bg-white p-3 rounded-lg shadow-md">
                <video
                  ref={userVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-60 bg-black rounded-lg"
                />
                <div className="mt-2 text-center">
                  You ({userName}) {proctoringActive && faceDetected ? '✅' : proctoringActive ? '❌' : ''}
                </div>
                <div className="text-sm text-gray-600 text-center">Violations: {cheatCount}/3</div>
              </div>
              {Object.keys(peers).map((userId) => (
                <div key={userId} className="bg-white p-3 rounded-lg shadow-md">
                  {connectionStatus[userId]?.videoEnabled ? (
                    <video
                      ref={(el) => (peerVideoRefs.current[userId] = el)}
                      autoPlay
                      playsInline
                      className="w-full h-60 bg-black rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-60 bg-black rounded-lg flex items-center justify-center text-white">
                      Video Off
                    </div>
                  )}
                  <div className="mt-2 text-center">
                    {connectionStatus[userId]?.userName || userId.slice(0, 8)} (
                    {connectionStatus[userId]?.status || 'connecting'})
                  </div>
                  {isHost && (
                    <button
                      onClick={() => toggleProctoring(userId)}
                      className={`mt-2 w-full py-2 rounded-lg ${
                        proctoredUsers[userId] ? 'bg-red-600' : 'bg-green-600'
                      } text-white`}
                    >
                      {proctoredUsers[userId] ? 'Disable Proctoring' : 'Enable Proctoring'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md max-w-md mx-auto">
              <h3 className="text-lg font-semibold mb-2">Chat</h3>
              <div ref={chatRef} className="h-64 overflow-y-auto bg-gray-50 p-2 rounded-lg mb-2">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`mb-2 p-2 rounded-lg ${
                      msg.from === socketRef.current?.id ? 'bg-blue-600 text-white ml-4' : 'bg-gray-200'
                    }`}
                  >
                    <span className="font-semibold">{msg.from === socketRef.current?.id ? 'You' : msg.userName}</span>: {msg.message}
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
                  className="flex-1 p-2 border rounded-lg"
                />
                <button onClick={sendChatMessage} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
                  Send
                </button>
              </div>
            </div>
            {isHost && (
              <div className="mt-4 bg-white p-4 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-2">Proctoring Alerts</h3>
                {cheatLogs.length === 0 ? (
                  <p className="text-sm text-gray-600">No alerts yet.</p>
                ) : (
                  cheatLogs.map((log, index) => (
                    <p key={index} className="text-sm">
                      {log.timestamp} - {log.userName} ({log.userId.slice(0, 8)}): {log.message}
                    </p>
                  ))
                )}
              </div>
            )}
            {showDebug && (
              <div className="mt-4 bg-white p-4 rounded-lg shadow-md max-h-48 overflow-y-auto">
                <h3 className="text-lg font-semibold mb-2">Debug Log</h3>
                {debugLog.map((log, index) => (
                  <p key={index} className="text-sm">{log}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default Video;