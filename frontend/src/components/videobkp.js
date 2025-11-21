//here when user share with video with screenshare then opponnet only visible screenshare not visible video

// Video.js

//nov 14 last

// here multi user video working when join with link
import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';
import { AuthContext } from './AuthContext';
import SchedulePage from './SchedulePage';
import JoinRoom from './JoinRoom';

const SIGNALING_SERVER_URL = 'http://localhost:3000';

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div className="error-message">Something went wrong. Please refresh the page.</div>;
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

const Video = ({ isExternal = false, meetingId, userEmail, userName: propUserName, isHostM }) => {
  const { user, logout } = useContext(AuthContext);
  const { roomId: paramRoomId } = useParams();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState(paramRoomId || meetingId || '');
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [inRoom, setInRoom] = useState(!!paramRoomId || !!meetingId);
  const [peers, setPeers] = useState({});
  const [debugLog, setDebugLog] = useState([]);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({});
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [userName, setUserName] = useState(isExternal ? propUserName : user?.name || '');
  const [email, setEmail] = useState(isExternal ? userEmail : user?.email || '');
  const [isHost, setIsHost] = useState(false);
  const [participantControls, setParticipantControls] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [showSchedulePage, setShowSchedulePage] = useState(false);

  const lastTabSwitch = useRef(0);
  const renegotiationQueue = useRef({});
  const pendingRemoteStreams = useRef({});
  const videoStreamCount = useRef({});
  const socketRef = useRef();
  const userVideoRef = useRef({ camera: null, screen: null });
  const peerVideoRefs = useRef({});
  const pendingCandidates = useRef({});
  const peersRef = useRef({});
  const chatRef = useRef();
  const detectionIntervals = useRef({});
  const screenShareTrackRef = useRef(null);
  const screenShareCleanupRef = useRef(null);
  const screenShareActiveRef = useRef(false);

  const localStreamRef = useRef(null);

  const pendingPeerCreations = useRef({});

  const hasJoinedRef = useRef(false);
  const isJoiningRef = useRef(false);

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

  const shortId = (id) => id.slice(0, 8);

  const cleanupScreenSharing = useCallback(async () => {
    logDebug('Starting comprehensive screen sharing cleanup...');
    screenShareActiveRef.current = false;

    if (screenStream) {
      screenStream.getTracks().forEach((track) => {
        track.onended = null;
        if (track.readyState === 'live') {
          track.stop();
        }
      });
      setScreenStream(null);
    }

    if (screenShareTrackRef.current) {
      screenShareTrackRef.current.onended = null;
      screenShareTrackRef.current = null;
    }

    const cleanupPromises = Object.entries(peersRef.current).map(async ([peerId, peer]) => {
      if (peer && peer._pc) {
        try {
          const screenSender = peer._pc.getSenders().find((s) => s.track?._type === 'screen');
          if (screenSender) {
            await screenSender.replaceTrack(null);
            logDebug(`Removed screen track from peer ${peerId}`);
            await renegotiatePeer(peer, peerId, 0, true);
          }
        } catch (err) {
          logDebug(`Error cleaning up screen track for peer ${peerId}: ${err.message}`);
        }
      }
    });

    await Promise.all(cleanupPromises);

    if (userVideoRef.current?.screen) {
      userVideoRef.current.screen.srcObject = null;
    }

    if (screenShareCleanupRef.current) {
      screenShareCleanupRef.current();
      screenShareCleanupRef.current = null;
    }

    logDebug('Screen sharing cleanup completed');
  }, [screenStream, logDebug]);

  useEffect(() => {
    if (isExternal && isHostM !== undefined) {
      console.log('isHost set from isHostM1:', isHostM);
      setIsHost(isHostM);
      console.log('isHost set from isHostM2:', isHostM);
    }
  }, [isHostM, isExternal]);

  useEffect(() => {
    if (isExternal && isHostM !== undefined) {
      setIsHost(!!isHostM);

      if (roomId && userName && email && socketRef.current?.connected) {
        socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, !!isHostM);
      }
    }
  }, [isExternal, isHostM, roomId, userName, email]);

  useEffect(() => {
    if (!isExternal && !user) {
      navigate('/login');
    }
  }, [user, isExternal, navigate]);

  useEffect(() => {
    console.log('1 :if (localStream && userVideoRef.current.camera) ')

    if (localStream && userVideoRef.current.camera) {
      userVideoRef.current.camera.srcObject = localStream;
      userVideoRef.current.camera.play().catch((err) => {
        logDebug(`Error playing local camera stream: ${err.message}`);
        addAlert('Failed to play local camera stream.', 'error');
      });
      logDebug('Local camera stream assigned to video element.');
    }
  }, [localStream, logDebug, addAlert]);

  // DELETE THESE TWO EFFECTS:
  // useEffect #1 (line ~175) - assigning to video element
  // useEffect #7 (line ~331) - localStream with localStreamRef

  // REPLACE WITH THIS SINGLE, SAFE EFFECT:
  // useEffect(() => {
  //   console.log('1 & 7 COMBINED: Safe local stream assignment + tagging');

  //   if (!localStream || !userVideoRef.current.camera) return;

  //   const videoElement = userVideoRef.current.camera;
  //   const streamId = localStream.id;

  //   // PREVENT DUPLICATE ASSIGNMENT
  //   if (videoElement.srcObject === localStream) {
  //     logDebug('Local stream already assigned, skipping duplicate');
  //     return;
  //   }

  //   // PREVENT RE-ASSIGNMENT OF SAME STREAM
  //   if (videoElement.dataset.streamId === streamId) {
  //     logDebug('Same stream already assigned, skipping');
  //     return;
  //   }

  //   // CLEANUP old stream
  //   if (videoElement.srcObject) {
  //     logDebug('Cleaning up previous local stream');
  //     videoElement.srcObject.getTracks().forEach(t => t.stop());
  //     videoElement.srcObject = null;
  //   }

  //   // ASSIGN ONCE
  //   videoElement.srcObject = localStream;
  //   videoElement.dataset.streamId = streamId; // Track which stream is assigned

  //   // PLAY SAFELY
  //   const playPromise = videoElement.play();
  //   if (playPromise !== undefined) {
  //     playPromise
  //       .then(() => {
  //         logDebug('Local camera stream PLAYED successfully');
  //       })
  //       .catch((err) => {
  //         if (err.name === 'NotAllowedError') {
  //           logDebug('Autoplay blocked: User must interact first');
  //           addAlert('Click to enable camera video.', 'warning');
  //         } else if (err.name !== 'AbortError') {
  //           logDebug(`Play failed: ${err.message}`);
  //         }
  //       });
  //   }

  //   // TAG TRACKS ONCE (only on first acquisition)
  //   const videoTrack = localStream.getVideoTracks()[0];
  //   if (videoTrack && !videoTrack._tagged) {
  //     videoTrack._type = 'camera';
  //     videoTrack._tagged = true; // Prevent re-tagging
  //     logDebug(`Tagged camera track ONCE: ${videoTrack.id}`);
  //   }

  //   // SYNC REF
  //   localStreamRef.current = localStream;

  // }, [localStream, addAlert, logDebug]);




  useEffect(() => {
    console.log('2 :auto join ')
    const autoJoin = async () => {
      if (isExternal && roomId && userName && email) {
        logDebug(`Auto-joining external user to meeting: ${roomId}`);
        const hasPermissions = await checkPermissions();
        if (!hasPermissions) return;

        await joinRoom(roomId, userName, email, false);
      }
    };
    autoJoin();
  }, [isExternal, roomId, userName, email]);


  useEffect(() => {
    console.log('3 : if (screenStream && userVideoRef.current.screen) ')
    if (screenStream && userVideoRef.current.screen) {
      userVideoRef.current.screen.srcObject = screenStream;
      userVideoRef.current.screen.play().catch((err) => {
        logDebug(`Error playing local screen share stream: ${err.message}`);
        addAlert('Failed to play local screen share stream.', 'error');
      });
    }
    screenShareCleanupRef.current = () => {
      if (userVideoRef.current?.screen) {
        userVideoRef.current.screen.srcObject = null;
      }
    };
    return () => {
      if (screenShareCleanupRef.current) {
        screenShareCleanupRef.current();
      }
    };
  }, [screenStream, logDebug, addAlert]);

  useEffect(() => {
    console.log('4 :!isscreensharing')
    if (!isScreenSharing && userVideoRef.current.screen) {
      userVideoRef.current.screen.srcObject = null;
    }
  }, [isScreenSharing]);

  useEffect(() => {
    console.log('5 :handleVisibilityChange')
    const handleVisibilityChange = () => {
      if (document.hidden && !isScreenSharing && participantControls[socketRef.current?.id]?.proctor) {
        const now = Date.now();
        if (now - lastTabSwitch.current > 1000) {
          lastTabSwitch.current = now;
          logDebug('Tab switch detected during proctor mode');
          addAlert('Tab switching detected in proctor mode.', 'warning');
          socketRef.current.emit('tab-switch-alert', {
            roomId,
            userId: socketRef.current.id,
            userName,
            userEmail: email,
            message: `${userName} switched tabs during proctor mode.`,
          });
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isScreenSharing, participantControls, roomId, userName, email, logDebug, addAlert]);


  useEffect(() => {
    console.log('6 :isExternal && inRoom && !localStreamRef.current && roomId');
    if (isExternal && inRoom && !localStreamRef.current && roomId && userName && email && !hasJoinedRef.current) {
      logDebug(`🚀 Starting SINGLE auto-join for ${userName} (${email})`);
      hasJoinedRef.current = true;

      const attemptJoin = async (attempt = 1) => {
        if (isJoiningRef.current) {
          logDebug(`⏭️ Auto-join already in progress, skipping`);
          return;
        }

        isJoiningRef.current = true;

        if (!socketRef.current?.connected) {
          logDebug(`Socket not connected, attempt ${attempt}/5`);
          isJoiningRef.current = false;
          if (attempt <= 5) {
            setTimeout(() => attemptJoin(attempt + 1), 1000);
            return;
          }
          addAlert('Failed to connect to server. Please refresh.', 'error');
          navigate('/video');
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true },
          });


          stream.getVideoTracks().forEach((track) => {
            track.enabled = true;
            track._type = 'camera';
          });
          stream.getAudioTracks().forEach((track) => {
            track.enabled = true;
          });

          localStreamRef.current = stream;
          setLocalStream(stream);
          setIsVideoOn(true);
          setIsAudioOn(true);

          logDebug('Local stream acquired ONCE for external user');


          const joinAsHost = isHost;
          socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, joinAsHost);
          logDebug(`📡 Emitted join-room with isHost: ${joinAsHost}`);

          setInRoom(true);
          addAlert(`Joined meeting: ${roomId}`, 'success');

        } catch (err) {
          logDebug(`Auto-join failed: ${err.message}`);
          if (attempt <= 5) {
            isJoiningRef.current = false;
            setTimeout(() => attemptJoin(attempt + 1), 1000);
            return;
          }
          addAlert(`Failed to join meeting: ${err.message}`, 'error');
          navigate('/video');
        } finally {
          isJoiningRef.current = false;
        }
      };

      attemptJoin();
    }
  }, [isExternal, inRoom, roomId, userName, email, isHost]);


  useEffect(() => {
    console.log('7 :localStream with localStreamRef')
    if (localStream) {
      localStreamRef.current = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    console.log('8 : const isSupportedBrowser = !!window.RTCPeerConnection')
    const isSupportedBrowser = !!window.RTCPeerConnection && !!navigator.mediaDevices.getUserMedia;
    if (!isSupportedBrowser) {
      logDebug('Warning: Your browser may not fully support WebRTC.');
      addAlert('Please use a modern browser like Chrome or Firefox for video calls.', 'error');
    }

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
    console.log('9 :  socketRef.current = io(SIGNALING_SERVER_URL')
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
        socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, isHost);
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

    socketRef.current.on('room-users', (users) => {
      logDebug(`Room users: ${JSON.stringify(users)}`);
      const currentUserId = socketRef.current.id;

      // Find if there's already a host
      const hasHost = users.some(u => u.isHost && u.userId !== currentUserId);
      const isCurrentUserHost = users.find(u => u.userId === currentUserId)?.isHost;

      if (!hasHost && !isCurrentUserHost) {
        // No host exists → make current user host
        setIsHost(true);
        socketRef.current.emit('claim-host', { roomId });
        addAlert('You are now the host (first in room).', 'success');
        logDebug('Claimed host role');
      } else if (isCurrentUserHost) {
        setIsHost(true);
      }
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

    socketRef.current.on('tab-switch-alert', (data) => {
      if (isHost) {
        logDebug(`Tab switch alert from ${data.userId} (${data.userName}): ${data.message}`);
        addAlert(data.message, 'warning');
      }
    });

    socketRef.current.on('toggle-proctor', (data) => {
      if (data.userId === socketRef.current.id) {
        setParticipantControls((prev) => ({
          ...prev,
          [socketRef.current.id]: {
            ...prev[socketRef.current.id],
            proctor: data.proctor,
          },
        }));
        logDebug(`Proctor mode ${data.proctor ? 'enabled' : 'disabled'} by host`);
        addAlert(`Proctor mode ${data.proctor ? 'enabled' : 'disabled'} by host.`, 'info');
      }
    });

    socketRef.current.on('screen-share-status', (data) => {
      logDebug(`Received screen share status from ${data.userId} (${data.userName}): isScreenSharing=${data.isScreenSharing}`);

      setConnectionStatus((prev) => ({
        ...prev,
        [data.userId]: {
          ...prev[data.userId],
          streams: {
            ...prev[data.userId]?.streams,
            screen: data.isScreenSharing,
          },
        },
      }));

      addAlert(`${data.userName} ${data.isScreenSharing ? 'started' : 'stopped'} screen sharing.`, 'info');
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
  }, [roomId, inRoom, userName, email, isHost, logDebug, addAlert]);

  // useEffect(() => {
  //   console.log('10 :  const videoTrack = localStream.getVideoTracks()[0];')
  //   if (localStream) {

  //     const videoTrack = localStream.getVideoTracks()[0];
  //     if (videoTrack) {
  //       videoTrack._type = 'camera';
  //       logDebug(`Tagged camera track with type: camera (ID: ${videoTrack.id})`);
  //     }
  //   }
  // }, [localStream, logDebug]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // console.log('11 : if (!isHost) return;')
    // if (!isHost) return;

    Object.keys(participantControls).forEach((userId) => {
      const proctorEnabled = participantControls[userId]?.proctor;
      const existingInterval = detectionIntervals.current[userId];

      if (proctorEnabled && !existingInterval) {
        const videoElement = peerVideoRefs.current[userId]?.camera;
        if (videoElement && videoElement.srcObject) {
          const interval = setInterval(async () => {
            try {
              const detections = await faceapi.detectAllFaces(videoElement).withFaceLandmarks();
              logDebug(`Face detection for ${userId} (camera stream): ${detections.length} faces detected`);
              if (detections.length !== 1) {
                const participantName = connectionStatus[userId]?.userName || shortId(userId);
                const hostMessage = detections.length === 0
                  ? `No face detected for ${participantName} on camera stream.`
                  : `Multiple faces detected for ${participantName} on camera stream.`;
                const participantMessage = detections.length === 0
                  ? 'No face detected. Please ensure you are visible on your camera.'
                  : 'Multiple faces detected. Please ensure only you are visible.';
                addAlert(hostMessage, 'warning');
                socketRef.current.emit('face-detection-alert', {
                  roomId,
                  userId,
                  message: participantMessage,
                });
                logDebug(`Sent face detection alert to ${userId}`);
              }
            } catch (err) {
              logDebug(`Face detection error for ${userId} (camera stream): ${err.message}`);
              const participantName = connectionStatus[userId]?.userName || shortId(userId);
              const hostMessage = `Face detection error for ${participantName} on camera stream.`;
              const participantMessage = 'Face detection error. Please check your camera feed.';
              addAlert(hostMessage, 'error');
              socketRef.current.emit('face-detection-alert', {
                roomId,
                userId,
                message: participantMessage,
              });
            }
          }, 5000);
          detectionIntervals.current[userId] = interval;
          logDebug(`Started face detection for ${userId} on camera stream`);
        } else {
          logDebug(`Camera video element not ready for ${userId}`);
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
  }, [participantControls, connectionStatus, logDebug, isHost, addAlert, roomId]);

  useEffect(() => {
    console.log('12 :  const interval = setInterval')
    const interval = setInterval(() => {
      Object.keys(pendingRemoteStreams.current).forEach((userId) => {
        const pending = Object.values(pendingRemoteStreams.current[userId] || {}).filter((s) => s);
        if (pending.length > 0) {
          logDebug(`Pending streams for ${userId}: ${pending.length}`);
          Object.keys(pendingRemoteStreams.current[userId]).forEach((type) => {
            if (pendingRemoteStreams.current[userId][type] && peerVideoRefs.current[userId]?.[type]) {
              assignPeerStream(userId, type, pendingRemoteStreams.current[userId][type]);
            }
          });
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [logDebug]);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
        track._type = 'camera';
      });
      stream.getAudioTracks().forEach((track) => (track.enabled = true));

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      logDebug('Local camera stream acquired successfully.');
      socketRef.current.emit('join-room', newRoomId, socketRef.current.id, userName, email, true);
      setInRoom(true);
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };

  const joinRoom = async () => {
    if (!roomId.trim() || !userName.trim()) {
      logDebug('Please enter Room ID and username.');
      addAlert('Please enter Room ID and username.', 'error');
      return;
    }

    if (!(await checkPermissions())) {
      logDebug('Camera/microphone permissions denied.');
      return;
    }

    logDebug(`Joining room: ${roomId} as ${userName}`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
        track._type = 'camera';
      });
      stream.getAudioTracks().forEach((track) => (track.enabled = true));
      // NEW: Set both state and ref
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      logDebug('Local camera stream acquired successfully.');
      socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, false);
      setInRoom(true);
      addAlert(`Joined room: ${roomId}`, 'success');
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };

  const toggleVideo = async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        logDebug(`Camera track ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
        addAlert(`Camera ${videoTrack.enabled ? 'enabled' : 'disabled'}`, 'info');

        Object.values(peersRef.current).forEach((peer) => {
          const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video' && !s.track.label?.includes('screen'));
          if (sender) {
            sender.replaceTrack(videoTrack.enabled ? videoTrack : null).catch((err) => {
              logDebug(`Error replacing camera track for peer ${peer._id || 'unknown'}: ${err.message}`);
              addAlert('Failed to update camera stream.', 'error');
            });
            renegotiatePeer(peer, peer._id);
          }
        });

        if (!isHost && socketRef.current?.connected) {
          socketRef.current.emit('toggle-media', {
            roomId,
            userId: socketRef.current.id,
            video: videoTrack.enabled,
            audio: isAudioOn,
          });
        }
      } else if (isVideoOn) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          const newVideoTrack = newStream.getVideoTracks()[0];
          newVideoTrack._type = 'camera';
          localStreamRef.current = newStream;
          setLocalStream(newStream);
          setIsVideoOn(true);
          logDebug('Reacquired camera stream successfully.');
          addAlert('Camera stream reacquired.', 'success');

          Object.values(peersRef.current).forEach((peer) => {
            const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video' && !s.track.label?.includes('screen'));
            if (sender) {
              sender.replaceTrack(newVideoTrack).catch((err) => {
                logDebug(`Error replacing new camera track for peer ${peer._id || 'unknown'}: ${err.message}`);
                addAlert('Failed to update camera stream.', 'error');
              });
              renegotiatePeer(peer, peer._id);
            }
          });

          if (userVideoRef.current?.camera) {
            userVideoRef.current.camera.srcObject = newStream;
            userVideoRef.current.camera.play().catch((err) => {
              logDebug(`Error playing reacquired camera stream: ${err.message}`);
              addAlert('Failed to play reacquired camera stream.', 'error');
            });
          }

          if (!isHost && socketRef.current?.connected) {
            socketRef.current.emit('toggle-media', {
              roomId,
              userId: socketRef.current.id,
              video: true,
              audio: isAudioOn,
            });
          }
        } catch (err) {
          logDebug(`Error reacquiring camera stream: ${err.message}`);
          addAlert('Failed to reacquire camera stream.', 'error');
        }
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
        logDebug(`Audio track ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
        addAlert(`Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`, 'info');

        if (!isHost && socketRef.current?.connected) {
          socketRef.current.emit('toggle-media', {
            roomId,
            userId: socketRef.current.id,
            video: isVideoOn,
            audio: audioTrack.enabled,
          });
        }
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        if (screenShareActiveRef.current) {
          await cleanupScreenSharing();
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const isProctorEnabled = participantControls[socketRef.current?.id]?.proctor || false;
        addAlert(
          isProctorEnabled
            ? 'Proctor mode requires sharing your entire screen.'
            : 'Select a screen, window, or tab to share.',
          'info'
        );

        const videoConstraints = isProctorEnabled ? { video: { displaySurface: 'monitor', cursor: 'never' } } : { video: true };
        const newScreenStream = await navigator.mediaDevices.getDisplayMedia(videoConstraints);
        const newScreenTrack = newScreenStream.getVideoTracks()[0];
        newScreenTrack._type = 'screen';
        const settings = newScreenTrack.getSettings();
        logDebug(`Screen share settings: ${JSON.stringify(settings)}`);

        if (isProctorEnabled && settings.displaySurface !== 'monitor') {
          newScreenTrack.stop();
          newScreenStream.getTracks().forEach((track) => track.stop());
          addAlert('Proctor mode requires sharing the entire screen.', 'error');
          return;
        }

        screenShareActiveRef.current = true;
        screenShareTrackRef.current = newScreenTrack;
        const addTrackPromises = Object.entries(peersRef.current).map(async ([peerId, peer]) => {
          if (peer && peer._pc && peer._pc.signalingState === 'stable') {
            try {
              const existingScreenSender = peer._pc.getSenders().find((s) => s.track?._type === 'screen');
              if (existingScreenSender) {
                await existingScreenSender.replaceTrack(null);
                logDebug(`Cleaned up existing screen track for peer ${peerId}`);
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              peer._pc.addTrack(newScreenTrack, newScreenStream);
              logDebug(`Added new screen track to peer ${peerId}`);
              await new Promise((resolve) => setTimeout(resolve, 200));
              await renegotiatePeer(peer, peerId, 0, true);
            } catch (err) {
              logDebug(`Error adding screen track to peer ${peerId}: ${err.message}`);
            }
          }
        });

        await Promise.all(addTrackPromises);
        setScreenStream(newScreenStream);
        setIsScreenSharing(true);
        addAlert(isProctorEnabled ? 'Screen sharing started (entire screen).' : 'Screen sharing started.', 'success');

        const sendScreenShareStatus = (attempt = 1) => {
          if (socketRef.current?.connected) {
            socketRef.current.emit('screen-share-status', {
              roomId,
              userName,
              userEmail: email,
              isScreenSharing: true,
            });
            logDebug(`Sent screen-share-status (start) to room ${roomId}`);
          } else if (attempt <= 5) {
            logDebug(`Socket not connected, retrying screen-share-status (start) (${attempt}/5)...`);
            setTimeout(() => sendScreenShareStatus(attempt + 1), 1000);
          } else {
            logDebug(`Failed to send screen-share-status (start) after 5 attempts`);
            addAlert('Failed to notify others of screen sharing start.', 'error');
          }
        };
        sendScreenShareStatus();

        newScreenTrack.onended = () => {
          logDebug('Screen share track ended by browser/system');
          stopScreenShare();
        };
      } catch (err) {
        logDebug(`Error starting screen share: ${err.message}`);
        screenShareActiveRef.current = false;
        screenShareTrackRef.current = null;
        if (err.name === 'NotAllowedError') {
          addAlert('Screen sharing permission denied.', 'error');
        } else if (err.name === 'NotSupportedError') {
          addAlert('Browser does not support entire screen sharing. Use Chrome or Edge.', 'error');
        } else {
          addAlert('Failed to start screen sharing.', 'error');
        }
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
    logDebug('Stopping screen share with full cleanup...');
    setIsScreenSharing(false);
    await cleanupScreenSharing();
    addAlert('Screen sharing stopped.', 'info');

    const sendScreenShareStatus = (attempt = 1) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('screen-share-status', {
          roomId,
          userName,
          userEmail: email,
          isScreenSharing: false,
        });
        logDebug(`Sent screen-share-status (stop) to room ${roomId}`);
      } else if (attempt <= 5) {
        logDebug(`Socket not connected, retrying screen-share-status (stop) (${attempt}/5)...`);
        setTimeout(() => sendScreenShareStatus(attempt + 1), 1000);
      } else {
        logDebug(`Failed to send screen-share-status (stop) after 5 attempts`);
        addAlert('Failed to notify others of screen sharing stop.', 'error');
      }
    };
    sendScreenShareStatus();
  };

  const renegotiatePeer = async (peer, userId, retryCount = 0, isCleanup = false) => {
    const queueKey = `${userId}_${isCleanup ? 'cleanup' : 'regular'}`;
    if (renegotiationQueue.current[queueKey]) {
      logDebug(`Renegotiation for ${userId} (${isCleanup ? 'cleanup' : 'regular'}) already queued, skipping...`);
      return;
    }
    renegotiationQueue.current[queueKey] = true;

    try {
      let attempts = 0;
      const maxAttempts = 20;
      while (peer._pc.signalingState !== 'stable' && attempts < maxAttempts) {
        logDebug(`Waiting for stable state for ${userId} (${attempts + 1}/${maxAttempts}), current: ${peer._pc.signalingState}`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        attempts++;
      }

      if (peer._pc.signalingState !== 'stable') {
        logDebug(`Peer ${userId} not in stable state after ${maxAttempts} attempts (state: ${peer._pc.signalingState})`);
        throw new Error(`Peer not in stable state after ${maxAttempts} attempts`);
      }

      const offerOptions = {
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
        iceRestart: isCleanup,
      };

      const offer = await peer._pc.createOffer(offerOptions);
      await peer._pc.setLocalDescription(offer);
      logDebug(`Sending ${isCleanup ? 'cleanup' : 'new'} offer to ${userId}: ${JSON.stringify(offer).slice(0, 100)}...`);
      socketRef.current.emit('offer', { signal: offer, to: userId });

      const answerTimeout = setTimeout(() => {
        logDebug(`Timeout waiting for answer from ${userId} (${isCleanup ? 'cleanup' : 'regular'})`);
        delete renegotiationQueue.current[queueKey];
      }, 15000);

      socketRef.current.once(`answer_${userId}_${Date.now()}`, (data) => {
        if (data.from === userId) {
          clearTimeout(answerTimeout);
          logDebug(`Received answer from ${userId} for ${isCleanup ? 'cleanup' : 'renegotiation'}`);
          peer.signal(data.signal);
          delete renegotiationQueue.current[queueKey];
        }
      });
    } catch (err) {
      logDebug(`Error renegotiating peer connection for ${userId} (${isCleanup ? 'cleanup' : 'regular'}): ${err.message}`);
      if (retryCount < 3) {
        logDebug(`Retrying renegotiation for ${userId} (${retryCount + 1}/3)...`);
        setTimeout(() => {
          delete renegotiationQueue.current[queueKey];
          renegotiatePeer(peer, userId, retryCount + 1, isCleanup);
        }, 1500);
      } else {
        addAlert(`Failed to renegotiate connection with ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'error');
        delete renegotiationQueue.current[queueKey];
      }
    }
  };

  const assignPeerStream = (userId, streamType, singleTrackStream, attempt = 1) => {
    const videoElement = peerVideoRefs.current[userId]?.[streamType];
    if (videoElement && !videoElement.srcObject) {
      videoElement.srcObject = singleTrackStream;
      videoElement.play().catch((err) => {
        logDebug(`Error playing ${streamType} stream for ${userId}: ${err.message}`);
        addAlert(`Failed to play ${streamType} stream for ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'error');
      });
      logDebug(`Assigned ${streamType} stream to video element for ${userId}`);
      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          status: 'connected',
          streams: { ...prev[userId]?.streams, [streamType]: true },
        },
      }));
      if (pendingRemoteStreams.current[userId]) {
        pendingRemoteStreams.current[userId][streamType] = null;
      }
    } else if (attempt <= 20 && !videoElement) {
      logDebug(`Video element for ${userId} (${streamType}) not ready, retrying (${attempt}/20)...`);
      setTimeout(() => assignPeerStream(userId, streamType, singleTrackStream, attempt + 1), 500);
    } else if (videoElement && videoElement.srcObject && attempt === 1) {
      logDebug(`Video element for ${userId} (${streamType}) already has stream, skipping assignment`);
    } else {
      logDebug(`Failed to assign ${streamType} stream for ${userId} after 20 attempts`);
      addAlert(`Failed to assign ${streamType} stream for ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'error');
    }
  };

  const createPeer = (userId, initiator, retryCount = 0) => {
    logDebug(`Creating peer for ${userId}, initiator: ${initiator}, retry: ${retryCount}`);

    // NEW: Use localStreamRef for synchronous access
    if (!localStreamRef.current) {
      if (retryCount < 5) {
        logDebug(`Local stream not available for peer ${userId}, retrying in 1000ms (${retryCount + 1}/5)...`);
        setTimeout(() => createPeer(userId, initiator, retryCount + 1), 1000);
        return null;
      }
      logDebug(`Failed to create peer for ${userId} after ${retryCount} retries: localStream unavailable`);
      addAlert('Failed to initialize video stream. Please check camera permissions.', 'error');
      return null;
    }

    const peer = new SimplePeer({
      initiator,
      trickle: true,
      stream: localStreamRef.current,
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

    peer._id = userId;

    const videoTracks = localStreamRef.current.getVideoTracks();
    const audioTracks = localStreamRef.current.getAudioTracks();
    logDebug(`Local stream tracks for peer ${userId}: ${videoTracks.length} video, ${audioTracks.length} audio`);

    if (isScreenSharing && screenStream && screenShareTrackRef.current) {
      const screenTrack = screenShareTrackRef.current;
      if (screenTrack && screenTrack.readyState === 'live') {
        try {
          peer._pc.addTrack(screenTrack, screenStream);
          logDebug(`Added screen share track to new peer ${userId}`);
          setTimeout(() => renegotiatePeer(peer, userId), 500);
        } catch (err) {
          logDebug(`Error adding screen track to new peer ${userId}: ${err.message}`);
        }
      }
    }

    peer.on('signal', (signal) => {
      setTimeout(() => {
        if (signal.type === 'offer') {
          socketRef.current.emit('offer', { signal, to: userId });
          logDebug(`Sent offer to ${userId}: ${JSON.stringify(signal).slice(0, 100)}...`);
        } else if (signal.type === 'answer') {
          socketRef.current.emit('answer', { signal, to: userId });
          logDebug(`Sent answer to ${userId}`);
        } else if (signal.candidate) {
          socketRef.current.emit('ice-candidate', { candidate: signal.candidate, to: userId });
          logDebug(`Sent ICE candidate to ${userId}`);
        }
      }, 100);
    });

    peer.on('stream', (stream) => {
      logDebug(`Received stream from ${userId}, tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.label || t.id} (type: ${t._type || 'unknown'})`).join(', ')}`);
      if (!peersRef.current[userId]) {
        peersRef.current[userId] = { remoteStreams: {} };
      }
      pendingRemoteStreams.current[userId] = pendingRemoteStreams.current[userId] || {
        camera: null,
        screen: null,
        audio: null,
      };
      if (!videoStreamCount.current[userId]) videoStreamCount.current[userId] = 0;

      stream.getTracks().forEach((track) => {
        logDebug(`Processing track ${track.id}: ${track.kind} (enabled: ${track.enabled}, type: ${track._type || 'unknown'})`);
        if (track.kind === 'audio') {
          if (track.enabled) {
            const audioStream = new MediaStream([track]);
            pendingRemoteStreams.current[userId].audio = audioStream;
            logDebug(`Stored audio stream for ${userId} (track: ${track.id})`);
            setTimeout(() => {
              const videoElements = [];
              if (peerVideoRefs.current[userId]?.camera) {
                videoElements.push(peerVideoRefs.current[userId].camera);
              }
              if (peerVideoRefs.current[userId]?.screen) {
                videoElements.push(peerVideoRefs.current[userId].screen);
              }
              videoElements.forEach((element) => {
                if (element && element.srcObject && !element.srcObject.getAudioTracks().length) {
                  const videoTracks = element.srcObject.getVideoTracks();
                  const combinedStream = new MediaStream([...videoTracks, ...audioStream.getAudioTracks()]);
                  element.srcObject = combinedStream;
                  logDebug(`Assigned audio stream to video element for ${userId}`);
                }
              });
            }, 200);
          }
        } else if (track.kind === 'video') {
          videoStreamCount.current[userId]++;
          const settings = track.getSettings ? track.getSettings() : {};
          let isScreen =
            track._type === 'screen' ||
            settings.displaySurface ||
            track.label?.toLowerCase().includes('screen') ||
            track.id.includes('screen') ||
            (settings.width >= 1280 && settings.height >= 720 && !settings.facingMode);
          if (!isScreen && videoStreamCount.current[userId] > 1) {
            isScreen = true;
          }
          const streamType = isScreen ? 'screen' : 'camera';
          logDebug(`Classified track ${track.id} as '${streamType}'`);
          const singleTrackStream = new MediaStream([track]);
          pendingRemoteStreams.current[userId][streamType] = singleTrackStream;
          assignPeerStream(userId, streamType, singleTrackStream);
        }
      });

      setTimeout(() => {
        if (pendingRemoteStreams.current[userId]) {
          Object.keys(pendingRemoteStreams.current[userId]).forEach((type) => {
            if (pendingRemoteStreams.current[userId][type] && peerVideoRefs.current[userId]?.[type]) {
              assignPeerStream(userId, type, pendingRemoteStreams.current[userId][type]);
            }
          });
        }
      }, 1000);

    });

    peer.on('connect', () => {
      logDebug(`Peer connection established with ${userId}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: { ...prev[userId], status: 'connected' } }));
      addAlert(`Connected to ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'success');
    });

    peer.on('error', (err) => {
      logDebug(`Peer error (${userId}): ${err.message}`);
      setConnectionStatus((prev) => ({ ...prev, [userId]: { ...prev[userId], status: 'failed' } }));
      addAlert(`Connection error with ${connectionStatus[userId]?.userName || shortId(userId)}.`, 'error');
    });

    peer.on('close', () => {
      logDebug(`Peer connection closed for ${userId}`);
      setConnectionStatus((prev) => {
        const newStatus = { ...prev };
        delete newStatus[userId];
        return newStatus;
      });
      addAlert(`${connectionStatus[userId]?.userName || shortId(userId)} disconnected.`, 'info');
    });

    peersRef.current[userId] = peer;
    if (pendingCandidates.current[userId]) {
      pendingCandidates.current[userId].forEach((signal) => peer.signal(signal));
      delete pendingCandidates.current[userId];
    }

    return peer;
  };


  const handleUserJoined = (userId, userName, userEmail, isUserHost) => {

    if (!userId || userId === 'null' || userId === null) {
      logDebug(` Skipping invalid userId: ${userId} (${userName})`);
      return;
    }

    logDebug(`👤 User joined: ${userId} (${userName}), isHost: ${isUserHost}`);

    if (peersRef.current[userId]) {
      logDebug(`⏭️ Skipping peer creation for ${userId}: already connected`);
      return;
    }
    if (pendingPeerCreations.current[userId]) {
      logDebug(`⏭️ Skipping peer creation for ${userId}: already queued`);
      return;
    }

    setConnectionStatus((prev) => ({
      ...prev,
      [userId]: {
        status: 'connecting',
        userName,
        userEmail,
        isHost: isUserHost,
        streams: { camera: false, screen: false, audio: false },
      },
    }));
    setParticipantControls((prev) => ({ ...prev, [userId]: { video: true, audio: true, proctor: false } }));

    if (!localStreamRef.current) {
      logDebug(`⏳ Local stream not ready for ${userId}, queuing...`);
      pendingPeerCreations.current[userId] = { userName, userEmail, isUserHost };
      return;
    }

    const peer = createPeer(userId, true);
    if (!peer) {
      logDebug(`❌ Failed to create peer for ${userId}, queuing...`);
      pendingPeerCreations.current[userId] = { userName, userEmail, isUserHost };
      return;
    }

    setPeers((prev) => ({ ...prev, [userId]: peer }));
    addAlert(`${userName} joined the meeting.`, 'info');
  };

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}: ${JSON.stringify(data.signal).slice(0, 100)}...`);
    let peer = peersRef.current[data.from];
    if (!peer) {
      logDebug(`No peer found for ${data.from}, creating new peer...`);
      peer = createPeer(data.from, false);
      if (peer) {
        peersRef.current[data.from] = peer;
        setPeers((prev) => ({ ...prev, [data.from]: peer }));
      } else {
        logDebug(`Failed to create peer for offer from ${data.from}, queuing signal...`);
        if (!pendingCandidates.current[data.from]) {
          pendingCandidates.current[data.from] = [];
        }
        pendingCandidates.current[data.from].push(data.signal);
        return;
      }
    }
    if (peer._pc.signalingState === 'stable' || peer._pc.signalingState === 'have-local-offer') {
      try {
        peer.signal(data.signal);
        logDebug(`Applied offer from ${data.from}`);
      } catch (err) {
        logDebug(`Error applying offer from ${data.from}: ${err.message}`);
        addAlert(`Failed to process offer from ${connectionStatus[data.from]?.userName || shortId(data.from)}.`, 'error');
      }
    } else {
      logDebug(`Invalid signaling state for offer from ${data.from}: ${peer._pc.signalingState}, queuing...`);
      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }
      pendingCandidates.current[data.from].push(data.signal);
    }
  };

  const handleAnswer = (data) => {
    logDebug(`Received answer from ${data.from}`);
    const peer = peersRef.current[data.from];
    if (peer && (peer._pc.signalingState === 'have-local-offer' || peer._pc.signalingState === 'stable')) {
      try {
        peer.signal(data.signal);
        logDebug(`Applied answer from ${data.from}`);
      } catch (err) {
        logDebug(`Error applying answer from ${data.from}: ${err.message}`);
        addAlert(`Failed to process answer from ${connectionStatus[data.from]?.userName || shortId(data.from)}.`, 'error');
      }
    } else {
      logDebug(`Invalid peer or signaling state for answer from ${data.from}: ${peer ? peer._pc.signalingState : 'no peer'}, queuing...`);
      if (!peer && !pendingCandidates.current[data.from]) {
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
    if (pendingRemoteStreams.current[userId]) {
      delete pendingRemoteStreams.current[userId];
    }
    if (pendingPeerCreations.current[userId]) {
      delete pendingPeerCreations.current[userId];
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
        if (peerVideoRefs.current[userId].camera) peerVideoRefs.current[userId].camera.srcObject = null;
        if (peerVideoRefs.current[userId].screen) peerVideoRefs.current[userId].screen.srcObject = null;
        delete peerVideoRefs.current[userId];
      }
    }
    addAlert(`${userName} left the meeting.`, 'info');
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
      if (localStreamRef.current) {
        if (data.video !== undefined) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = data.video;
            setIsVideoOn(data.video);
            logDebug(`Camera track set to ${data.video ? 'enabled' : 'disabled'} by host`);
            addAlert(`Camera ${data.video ? 'enabled' : 'disabled'} by host.`, 'info');
            Object.values(peersRef.current).forEach((peer) => {
              const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video' && !s.track.label?.includes('screen'));
              if (sender) {
                sender.replaceTrack(data.video ? videoTrack : null).catch((err) => {
                  logDebug(`Error updating camera track for peer ${peer._id || 'unknown'}: ${err.message}`);
                  addAlert('Failed to update camera stream.', 'error');
                });
                renegotiatePeer(peer, peer._id);
              }
            });
          } else if (data.video) {
            navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            })
              .then((newStream) => {
                const newVideoTrack = newStream.getVideoTracks()[0];
                newVideoTrack._type = 'camera';
                localStreamRef.current = newStream;
                setLocalStream(newStream);
                setIsVideoOn(true);
                logDebug('Reacquired camera stream for host toggle.');
                addAlert('Camera stream reacquired.', 'success');
                Object.values(peersRef.current).forEach((peer) => {
                  const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video' && !s.track.label?.includes('screen'));
                  if (sender) {
                    sender.replaceTrack(newVideoTrack).catch((err) => {
                      logDebug(`Error replacing new camera track for peer ${peer._id || 'unknown'}: ${err.message}`);
                      addAlert('Failed to update camera stream.', 'error');
                    });
                    renegotiatePeer(peer, peer._id);
                  }
                });
                if (userVideoRef.current?.camera) {
                  userVideoRef.current.camera.srcObject = newStream;
                  userVideoRef.current.camera.play().catch((err) => {
                    logDebug(`Error playing reacquired camera stream: ${err.message}`);
                    addAlert('Failed to play reacquired camera stream.', 'error');
                  });
                }
              })
              .catch((err) => {
                logDebug(`Error reacquiring camera stream: ${err.message}`);
                addAlert('Failed to reacquire camera stream.', 'error');
              });
          }
        }
        if (data.audio !== undefined) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
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
      socketRef.current.emit('chat-message', { roomId, message: chatInput, userName, userEmail: email });
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
          `${type.charAt(0).toUpperCase() + type.slice(1)} ${newControls[userId][type] ? 'enabled' : 'disabled'} for ${connectionStatus[userId]?.userName || shortId(userId)
          }.`,
          'info'
        );
      } else if (type === 'proctor') {
        socketRef.current.emit('toggle-proctor', {
          roomId,
          userId,
          userName: connectionStatus[userId]?.userName || shortId(userId),
          userEmail: connectionStatus[userId]?.userEmail || 'unknown',
          proctor: newControls[userId].proctor,
        });
        logDebug(`Host toggled proctor for ${userId} to ${newControls[userId][type]}`);
        addAlert(
          `Proctor mode ${newControls[userId][type] ? 'enabled' : 'disabled'} for ${connectionStatus[userId]?.userName || shortId(userId)
          }.`,
          'info'
        );
      }
      return newControls;
    });
  };

  const leaveRoom = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
    }
    Object.values(peersRef.current).forEach((peer) => peer.destroy());
    socketRef.current.disconnect();
    setInRoom(false);
    setIsHost(false);
    setPeers({});
    setMessages([]);
    setConnectionStatus({});
    setParticipantControls({});
    localStreamRef.current = null;
    navigate('/video');
  };

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
          <JoinRoom
            roomId={roomId}
            setRoomId={setRoomId}
            userName={userName}
            setUserName={setUserName}
            userEmail={email}
            setUserEmail={setEmail}
            joinRoom={joinRoom}
            createRoom={createRoom}
            isExternal={isExternal}
          />
        ) : (
          <div className="conference-room">
            <header className="top-bar">
              <div className="meeting-info">
                <h2>Meeting: {roomId} {isHost ? '(Host)' : ''}</h2>
                <span>{Object.keys(peers).length + 1} participant(s)</span>
              </div>
              <div className="top-controls">
                <button onClick={() => setShowChat(!showChat)} title={showChat ? 'Hide Chat' : 'Show Chat'}>
                  <i className="fas fa-comment"></i>
                </button>
                <button onClick={() => setShowDebug(!showDebug)} title={showDebug ? 'Hide Debug' : 'Show Debug'}>
                  <i className="fas fa-bug"></i>
                </button>
                {!isExternal && <button onClick={logout} title="Log Out">Log Out</button>}
              </div>
            </header>
            <div className="main-content">
              <div className="video-container">


                <div className="video-gallery">
  {/* First, render all screen shares prominently */}
  {Object.keys(peers).map((userId) => {
    const status = connectionStatus[userId];
    if (status?.streams?.screen) {
      return (
        <div className="video-item screen-share-item" key={`${userId}-screen`}>
          <div className="video-wrapper screen-share-video">
            <video
              ref={(el) => {
                if (el) {
                  peerVideoRefs.current[userId] = peerVideoRefs.current[userId] || {};
                  peerVideoRefs.current[userId].screen = el;
                  if (pendingRemoteStreams.current[userId]?.screen) {
                    el.srcObject = pendingRemoteStreams.current[userId].screen;
                    el.play().catch(() => { });
                    pendingRemoteStreams.current[userId].screen = null;
                  }
                }
              }}
              autoPlay
              playsInline
              className="video-element screen-element"
            />
            <div className="video-overlay">
              <span className="video-name">
                {status?.userName || `Participant (${shortId(userId)})`} - Screen Share
              </span>
              <div className="video-status">
                <i className="fas fa-desktop"></i>
                <span>Screen Sharing</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  })}

  {/* Then render local user screen share if active */}
  {isScreenSharing && (
    <div className="video-item screen-share-item local-screen-share">
      <div className="video-wrapper screen-share-video">
        <video
          ref={(el) => (userVideoRef.current.screen = el)}
          autoPlay
          muted
          playsInline
          className="video-element screen-element"
        />
        <div className="video-overlay">
          <span className="video-name">You ({userName}) - Screen Share</span>
          <div className="video-status">
            <i className="fas fa-desktop"></i>
            <span>You are sharing screen</span>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* Then render all camera videos - including users who are screen sharing */}
  <div className="video-item local-video">
    <div className="video-wrapper">
      <video
        ref={(el) => (userVideoRef.current.camera = el)}
        autoPlay
        muted
        playsInline
        className="video-element"
      />
      <div className="video-overlay">
        <span className="video-name">You ({userName}) - Camera</span>
        <div className="video-status">
          {isVideoOn ? <i className="fas fa-video"></i> : <i className="fas fa-video-slash"></i>}
          {isAudioOn ? <i className="fas fa-microphone"></i> : <i className="fas fa-microphone-slash"></i>}
        </div>
      </div>
    </div>
  </div>

  {/* Render ALL participants' camera videos - don't skip screen sharers */}
  {Object.keys(peers).map((userId) => {
    const status = connectionStatus[userId];
    const controls = participantControls[userId];

    if (!peerVideoRefs.current[userId]) {
      peerVideoRefs.current[userId] = {};
    }

    return (
      <div className="video-item" key={`${userId}-camera`}>
        <div className="video-wrapper">
          <video
            ref={(el) => {
              if (el && peerVideoRefs.current[userId].camera !== el) {
                peerVideoRefs.current[userId].camera = el;
                logDebug(`Video element READY for ${shortId(userId)}`);

                if (pendingRemoteStreams.current[userId]?.camera) {
                  el.srcObject = pendingRemoteStreams.current[userId].camera;
                  el.play().catch(() => { });
                  logDebug(`Assigned PENDING camera stream to ${shortId(userId)}`);
                  pendingRemoteStreams.current[userId].camera = null;
                }
              }
            }}
            autoPlay
            playsInline
            muted={false}
            className="video-element"
            style={{ background: '#000' }}
          />
          <div className="video-overlay">
            <span className="video-name">
              {status?.userName || `Participant (${shortId(userId)})`} - Camera
              {status?.streams?.screen && " (Also Sharing Screen)"}
            </span>
            <div className="video-status">
              <span>{status?.status || 'connecting'}</span>

              {isHost && controls && (
                <div className="proctor-controls">
                  <button onClick={() => toggleParticipantMedia(userId, 'video')}>
                    <i className={controls.video ? 'fas fa-video' : 'fas fa-video-slash'}></i>
                  </button>
                  <button onClick={() => toggleParticipantMedia(userId, 'audio')}>
                    <i className={controls.audio ? 'fas fa-microphone' : 'fas fa-microphone-slash'}></i>
                  </button>
                  <button onClick={() => toggleParticipantMedia(userId, 'proctor')}>
                    <i className={controls.proctor ? 'fas fa-user-check' : 'fas fa-user'}></i>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  })}
</div>
              </div>
              <div className={`side-panel ${showChat ? 'open' : ''}`}>
                <div className="chat-container">
                  <div className="chat-header">
                    <h3>Chat</h3>
                    <button onClick={() => setShowChat(false)} title="Close chat">
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="chat-messages" ref={chatRef}>
                    {messages.map((msg, index) => (
                      <div key={index} className={`chat-message ${msg.from === socketRef.current.id ? 'own-message' : ''}`}>
                        <div className="chat-meta">
                          <span className="chat-sender">{msg.from === socketRef.current.id ? 'You' : msg.userName}</span>
                          <span className="chat-time">{msg.time}</span>
                        </div>
                        <div className="chat-text">{msg.message}</div>
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
                    <button onClick={sendChatMessage} title="Send message">
                      <i className="fas fa-paper-plane"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <footer className="bottom-bar">
              <div className="controls">
                <button
                  onClick={toggleVideo}
                  disabled={isHost ? false : !isVideoOn}
                  className={isVideoOn ? '' : 'disabled'}
                  title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
                >
                  <i className={isVideoOn ? 'fas fa-video' : 'fas fa-video-slash'}></i>
                </button>
                <button
                  onClick={toggleAudio}
                  disabled={isHost ? false : !isAudioOn}
                  className={isAudioOn ? '' : 'disabled'}
                  title={isAudioOn ? 'Mute' : 'Unmute'}
                >
                  <i className={isAudioOn ? 'fas fa-microphone' : 'fas fa-microphone-slash'}></i>
                </button>
                <button
                  onClick={toggleScreenShare}
                  className={isScreenSharing ? 'sharing' : ''}
                  title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                >
                  <i className={isScreenSharing ? 'fas fa-desktop' : 'fas fa-share-square'}></i>
                </button>
                <button onClick={leaveRoom} title="Leave meeting">
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </div>
            </footer>
            {showDebug && (
              <div className="debug-panel">
                <h4>Debug Log</h4>
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
          {`:root {
    --primary-bg: #1a1a2e;
    --secondary-bg: #16213e;
    --accent-blue: #00b7eb;
    --accent-purple: #6b48ff;
    --text-color: #e0e0e0;
    --error: #ff4d4d;
    --success: #00cc69;
    --warning: #ffaa00;
    --info: #00b7eb;
    --border: #2e2e4b;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .app-container {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--primary-bg);
    color: var(--text-color);
    overflow: hidden;
  }

  .error-message {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 18px;
    color: var(--error);
  }

  .alert-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2000;
    max-width: 320px;
    width: 90%;
  }

  .alert {
    padding: 10px 14px;
    margin-bottom: 8px;
    border-radius: 6px;
    color: var(--text-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    animation: fadeIn 0.3s ease-in-out;
    font-size: 13px;
    background: var(--secondary-bg);
    border: 1px solid var(--border);
  }

  .alert-error { border-color: var(--error); }
  .alert-success { border-color: var(--success); }
  .alert-info { border-color: var(--info); }
  .alert-warning { border-color: var(--warning); }

  .alert-close {
    background: none;
    border: none;
    color: var(--text-color);
    font-size: 14px;
    cursor: pointer;
    padding: 0 8px;
    opacity: 0.7;
  }

  .alert-close:hover {
    opacity: 1;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Enhanced screen sharing styles */
.screen-share-item {
  grid-column: 1 / -1 !important;
  max-width: 90% !important;
  margin: 0 auto 20px auto !important;
}

.screen-share-video {
  aspect-ratio: 16 / 9 !important;
  max-height: 70vh !important;
  width: 100% !important;
}

.screen-element {
  object-fit: contain !important;
  background: #000 !important;
  border-radius: 8px !important;
}

.local-screen-share {
  border-color: var(--success) !important;
}

.local-screen-share .video-overlay {
  background: linear-gradient(to top, rgba(0, 200, 100, 0.3), transparent) !important;
}

.screen-share-item .video-overlay {
  background: linear-gradient(to top, rgba(0, 183, 235, 0.3), transparent) !important;
  padding: 12px !important;
}

.screen-share-item .video-name {
  font-size: 16px !important;
  font-weight: 600 !important;
  color: var(--accent-blue) !important;
}

.screen-share-item .video-status {
  font-size: 14px !important;
  color: var(--text-color) !important;
}

.screen-share-item .video-status i {
  margin-right: 8px !important;
}

/* Ensure regular videos don't take too much space when screen share is active */
.video-gallery:has(.screen-share-item) .video-item:not(.screen-share-item) {
  max-width: 300px !important;
  grid-column: span 1 !important;
}

/* Responsive design for screen shares */
@media (max-width: 1024px) {
  .screen-share-video {
    max-height: 50vh !important;
  }
}

@media (max-width: 768px) {
  .video-gallery:has(.screen-share-item) .video-item:not(.screen-share-item) {
    max-width: 200px !important;
  }
  
  .screen-share-item {
    max-width: 95% !important;
  }
}
  .join-room {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    padding: 24px;
    background: var(--secondary-bg);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    max-width: 360px;
    margin: auto;
  }

  .join-room h2 {
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 20px;
    color: var(--text-color);
  }

  .join-room input {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 14px;
    background: #24244a;
    color: var(--text-color);
    transition: border-color 0.2s;
  }

  .join-room input:focus {
    border-color: var(--accent-blue);
    outline: none;
  }

  .join-buttons {
    display: flex;
    gap: 12px;
    font-size: 12px;
    width: 100%;
  }

  .join-buttons button {
    flex: 1;
    padding: 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-color);
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
    transition: opacity 0.2s;
  }

  .join-buttons button:hover {
    opacity: 0.9;
  }

  .conference-room {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: var(--secondary-bg);
    border-bottom: 1px solid var(--border);
  }

  .meeting-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .meeting-info h2 {
    font-size: 16px;
    font-weight: 600;
  }

  .meeting-info span {
    font-size: 12px;
    color: #a0a0c0;
  }

  .top-controls {
    display: flex;
    gap: 8px;
  }

  .top-controls button {
    padding: 8px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-color);
    font-size: 14px;
    transition: background-color 0.2s;
  }

  .top-controls button:hover {
    background: #2e2e4b;
  }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .video-container {
    flex: 1;
    padding: 12px;
    background: #000;
    overflow: auto;
  }

  .video-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .video-item {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #1c1c38;
    border-radius: 10px;
    overflow: hidden;
    transition: transform 0.2s;
  }

  .local-video {
    grid-column: span 2;
    max-width: 500px;
    margin: 0 auto;
  }

  .video-item:hover {
    transform: scale(1.02);
  }

  .video-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
  }

  /* Enhanced screen sharing styles - ONLY for screen shares */
  .screen-share-wrapper {
    grid-column: 1 / -1;
    max-width: 100%;
    margin: 0;
    background: #000;
    border: 2px solid var(--accent-blue);
  }

  .screen-share-wrapper .video-wrapper {
    aspect-ratio: 16 / 9;
    max-height: 70vh;
  }

  .screen-share-wrapper .video-element {
    object-fit: contain;
    background: #000;
  }

  .screen-share-wrapper .video-overlay {
    background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
  }

  .screen-share-wrapper .video-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent-blue);
  }

  .video-element {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .video-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
    color: var(--text-color);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .video-name {
    font-size: 13px;
    font-weight: 500;
  }

  .video-status {
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .video-status span {
    color: #a0a0c0;
  }

  .proctor-controls {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  .proctor-controls button {
    padding: 6px;
    background: rgba(255,255,255,0.1);
    border: none;
    border-radius: 4px;
    color: var(--text-color);
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.2s;
  }

  .proctor-controls button:hover {
    background: rgba(255,255,255,0.2);
  }

  .proctor-controls button.disabled {
    background: var(--error);
  }

  .proctor-controls button.proctor-enabled {
    background: var(--success);
  }

  .side-panel {
    width: 300px;
    background: var(--secondary-bg);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
  }

  .side-panel.open {
    transform: translateX(0);
  }

  .chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 12px;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .chat-header h3 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .chat-header button {
    background: none;
    border: none;
    font-size: 14px;
    cursor: pointer;
    color: var(--text-color);
    opacity: 0.7;
  }

  .chat-header button:hover {
    opacity: 1;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    background: #1c1c38;
    border-radius: 6px;
    margin-bottom: 12px;
  }

  .chat-message {
    margin-bottom: 12px;
    padding: 10px;
    border-radius: 6px;
    background: #24244a;
    max-width: 80%;
  }

  .chat-message.own-message {
    background: var(--accent-blue);
    margin-left: auto;
  }

  .chat-meta {
    display: flex;
    gap: 6px;
    align-items: baseline;
    margin-bottom: 4px;
  }

  .chat-sender {
    font-weight: 500;
    color: var(--accent-purple);
  }

  .chat-time {
    color: #a0a0c0;
    font-size: 0.75em;
  }

  .chat-text {
    font-size: 13px;
  }

  .chat-input {
    display: flex;
    gap: 8px;
  }

  .chat-input input {
    flex: 1;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 13px;
    background: #24244a;
    color: var(--text-color);
  }

  .chat-input input:focus {
    border-color: var(--accent-blue);
    outline: none;
  }

  .chat-input button {
    padding: 10px;
    background: var(--accent-blue);
    color: var(--text-color);
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .chat-input button:hover {
    background: var(--accent-purple);
  }

  .bottom-bar {
    display: flex;
    justify-content: center;
    padding: 10px;
    background: var(--secondary-bg);
    border-top: 1px solid var(--border);
  }

  .controls {
    display: flex;
    gap: 12px;
  }

  .controls button {
    padding: 10px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-color);
    font-size: 14px;
    transition: background-color 0.2s;
  }

  .controls button:hover {
    background: #2e2e4b;
  }

  .controls button.disabled {
    color: var(--error);
    border-color: var(--error);
  }

  .controls button.sharing {
    color: var(--success);
    border-color: var(--success);
  }

  .debug-panel {
    position: absolute;
    bottom: 60px;
    left: 16px;
    right: 16px;
    max-height: 200px;
    overflow-y: auto;
    background: var(--secondary-bg);
    border: 1px solid var(--border);
    padding: 12px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 1000;
  }

  .debug-panel h4 {
    font-size: 14px;
    margin-bottom: 8px;
  }

  .debug-panel ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .debug-panel li {
    font-size: 12px;
    margin-bottom: 4px;
    color: #a0a0c0;
  }

  @media (max-width: 1024px) {
    .main-content {
      flex-direction: column;
    }
    .side-panel {
      width: 100%;
      height: 40%;
      border-left: none;
      border-top: 1px solid var(--border);
      transform: translateY(100%);
    }
    .side-panel.open {
      transform: translateY(0);
    }
    .video-container {
      height: 60%;
    }
    .video-gallery {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
    .local-video {
      grid-column: span 1;
    }
    .screen-share-wrapper .video-wrapper {
      max-height: 50vh;
    }
  }

  @media (max-width: 768px) {
    .top-bar {
      flex-direction: column;
      gap: 8px;
      padding: 8px 16px;
    }
    .controls {
      gap: 8px;
    }
    .controls button {
      padding: 8px;
      font-size: 12px;
    }
    .alert-container {
      top: 8px;
      right: 8px;
      max-width: 90%;
    }
    .join-room {
      padding: 16px;
      max-width: 90%;
    }
    .video-gallery {
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    }
    .screen-share-wrapper .video-wrapper {
      max-height: 40vh;
    }
  }`}
        </style>
      </div>
    </ErrorBoundary>
  );
};

export default Video;
