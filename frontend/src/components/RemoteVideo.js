//updated code of UI related

//jan9 4.45 working code for rejoin too in scheduling

import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';
import { AuthContext } from './AuthContext';
import SchedulePage from './SchedulePage';
import JoinRoom from './JoinRoom';

import axios from 'axios';
import { set } from 'date-fns';

// Import Components
import Alert from './Alert';
import VideoControls from './VideoControls';
import ChatPanel from './ChatPanel';
import MeetingHeader from './MeetingHeader';
import VideoLayout from './VideoLayout';
import DebugPanel from './DebugPanel';




// const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';
// const API_URL = "https://livemeet-ribm.onrender.com";

const SIGNALING_SERVER_URL = 'http://localhost:3000';
const API_URL = "http://localhost:3000";



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

// const Alert = ({ message, type, onClose }) => {
//   useEffect(() => {
//     const timer = setTimeout(onClose, 5000);
//     return () => clearTimeout(timer);
//   }, [onClose]);

//   return (
//     <div className={`alert alert-${type}`}>
//       {message}
//       <button onClick={onClose} className="alert-close">×</button>
//     </div>
//   );
// };

const Video = ({ isExternal = false, meetingId, userEmail, userName: propUserName, isHostM, validated = false }) => {
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
  const [pendingPeerStreams, setPendingPeerStreams] = useState({});
  const [currentVideoPage, setCurrentVideoPage] = useState(1);
  const [totalVideoPages, setTotalVideoPages] = useState(1);

  const isAnyScreenSharing = isScreenSharing ||
    Object.values(connectionStatus).some(status => status?.streams?.screen === true);

  // Keep all the existing refs (they remain the same)
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
  const cameraSendersRef = useRef({});
  const cameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const screenSendersRef = useRef({});
  const videoSenderRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingPeerCreations = useRef({});
  const hasJoinedRef = useRef(false);
  const isJoiningRef = useRef(false);


  // const [currentVideoPage, setCurrentVideoPage] = useState(1);
  // const [totalVideoPages, setTotalVideoPages] = useState(1);


  // Initials helper
  const getInitials = (name = '') => {
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  };

  // Navigation functions for video pages
  const navigateVideoPage = (direction) => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) return;

    setCurrentVideoPage(prev => {
      if (direction === 'next') {
        return prev >= totalVideoPages ? 1 : prev + 1;
      } else {
        return prev <= 1 ? totalVideoPages : prev - 1;
      }
    });
  };

  useEffect(() => {
    // Check if we're joining from scheduled meetings
    const joiningData = sessionStorage.getItem('joiningMeeting');
    if (joiningData && isExternal) {
      const data = JSON.parse(joiningData);
      setRoomId(data.roomId);
      setUserName(data.userName);
      setEmail(data.userEmail);
      setIsHost(data.isHost);
      setInRoom(true);


      sessionStorage.removeItem('joiningMeeting');
    }
  }, [isExternal]);


  useEffect(() => {
    if (!isAnyScreenSharing) {
      setCurrentVideoPage(1);
      setTotalVideoPages(1);
      return;
    }

    // Count ALL camera videos including local user
    const cameraVideoCount = 1 + Object.keys(peers).length; // Local user + all peers

    // Fixed number of videos per page/column
    const VIDEOS_PER_PAGE = 3;

    // Calculate total pages needed
    const calculatedTotalPages = Math.ceil(cameraVideoCount / VIDEOS_PER_PAGE);
    setTotalVideoPages(calculatedTotalPages);

    // Ensure current page is within bounds
    if (currentVideoPage > calculatedTotalPages) {
      setCurrentVideoPage(calculatedTotalPages || 1);
    }
  }, [peers, isAnyScreenSharing, currentVideoPage]);

  // Update the function to get videos for current page - include local video
  const getCurrentPageCameraVideos = () => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) {
      // Return all videos when no screen sharing or only one page
      const allVideos = ['local', ...Object.keys(peers)];
      return allVideos;
    }

    const VIDEOS_PER_PAGE = 3;
    const startIndex = (currentVideoPage - 1) * VIDEOS_PER_PAGE;
    const endIndex = startIndex + VIDEOS_PER_PAGE;

    // Get ALL video IDs including local
    const allVideoIds = ['local', ...Object.keys(peers)];
    return allVideoIds.slice(startIndex, endIndex);
  };

  // Add this function to ensure all peer streams are properly managed
  const ensurePeerStreams = useCallback(() => {
    Object.keys(peersRef.current).forEach(userId => {
      if (userId === 'local') return;

      // Ensure peer video refs exist
      if (!peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId] = {};
      }

      // Check if there are pending streams for this peer
      if (pendingRemoteStreams.current[userId]) {
        Object.keys(pendingRemoteStreams.current[userId]).forEach(streamType => {
          const stream = pendingRemoteStreams.current[userId][streamType];
          if (stream && peerVideoRefs.current[userId]?.[streamType]) {
            assignPeerStream(userId, streamType, stream);
          }
        });
      }
    });
  }, []);

  // Call this function whenever the current page changes
  useEffect(() => {
    if (isAnyScreenSharing) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        ensurePeerStreams();
      }, 100);
    }
  }, [currentVideoPage, isAnyScreenSharing, ensurePeerStreams]);

  // Also call when peers change
  useEffect(() => {
    if (isAnyScreenSharing) {
      ensurePeerStreams();
    }
  }, [peers, isAnyScreenSharing, ensurePeerStreams]);

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

    // 🔥 FIX: Also remove screen track from local stream
    if (localStreamRef.current) {
      const screenTrack = localStreamRef.current.getVideoTracks().find(t => t._type === 'screen');
      if (screenTrack) {
        localStreamRef.current.removeTrack(screenTrack);
        screenTrack.stop();
        logDebug('Removed screen track from local stream');
      }
    }

    const cleanupPromises = Object.entries(peersRef.current).map(async ([peerId, peer]) => {
      if (peer && peer._pc) {
        try {
          // 🔥 FIX: Also look for _isScreen property
          const screenSender = peer._pc.getSenders().find((s) =>
            s.track?._type === 'screen' || s.track?._isScreen === true
          );
          if (screenSender) {
            // 🔥 FIX: Replace with null track to properly remove
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
    if ((isExternal && isHostM !== undefined) || validated) {
      console.log('isHost set from isHostM1:', isHostM);
      setIsHost(isHostM);
      console.log('isHost set from isHostM2:', isHostM);
    }
  }, [isHostM, isExternal, validated]);

  useEffect(() => {
    if ((isExternal && isHostM !== undefined) || validated) {
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


  // Add this useEffect to handle local video stream assignment
  useEffect(() => {
    if (isAnyScreenSharing && localStreamRef.current && userVideoRef.current.camera) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const videoElement = userVideoRef.current.camera;
        if (videoElement && !videoElement.srcObject && localStreamRef.current) {
          videoElement.srcObject = localStreamRef.current;
          videoElement.play().catch((err) => {
            logDebug(`Error playing local stream after page change: ${err.message}`);
          });
          logDebug(`Reassigned local stream after page change to page ${currentVideoPage}`);
        }
      }, 50);
    }
  }, [currentVideoPage, isAnyScreenSharing, logDebug]);



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
  }, [isExternal, roomId, userName, email, isHostM]);


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


// In the useEffect that handles auto-join / rejoin for scheduled meetings
useEffect(() => {
  if (!isExternal || !validated || !inRoom || localStreamRef.current) return;

  const joinScheduledMeeting = async () => {
    try {
      // 1. First get media — very important order!
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      // Tag & prepare
      stream.getVideoTracks().forEach(t => { t._type = 'camera'; t.enabled = true; });
      stream.getAudioTracks().forEach(t => { t.enabled = true; });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);

      logDebug("✓ Stream acquired before join");

      // 2. Now safely join
      if (socketRef.current?.connected) {
        socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, isHost);
        logDebug("→ join-room emitted AFTER stream ready");
      }

      // 3. Then ask for current users (very important!)
      setTimeout(() => {
        socketRef.current?.emit('get-room-users', roomId, (users) => {
          // ... handle users, create connections
          createConnectionsToExistingUsers(users);
        });
      }, 800);

    } catch (err) {
      logDebug("Media error during scheduled join", err);
      addAlert("Cannot access camera/microphone", "error");
    }
  };

  joinScheduledMeeting();
}, [isExternal, validated, inRoom, roomId, userName, email, isHost]);

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
      addAlert('Reconnected to server', 'success');

      if (inRoom && roomId) {
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
      logDebug(`room-users event: ${users.length} users`, users);

      const mySocketId = socketRef.current?.id;

      const newStatus = {};

      users.forEach((u) => {
        if (u.userId === mySocketId) {
          if (u.isHost && !isHost) {
            setIsHost(true);
            addAlert('You are the Host!', 'success');
          }
          // Do NOT have: else if (!u.isHost && isHost) setIsHost(false);
          return;
        }

        // CRITICAL: Include videoOn/audioOn from server
        newStatus[u.userId] = {
          userName: u.userName,
          userEmail: u.userEmail,
          isHost: u.isHost,
          status: 'connected',
          streams: { camera: false, screen: false },
          videoOn: u.videoOn ?? true,
          audioOn: u.audioOn ?? true,
        };
      });

      setConnectionStatus(newStatus);
    });
    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-left', ({ userId, userName }) => handleUserLeft(userId, userName));
    socketRef.current.on('chat-message', handleChatMessage);
    socketRef.current.on('toggle-media', handleToggleMedia);
    socketRef.current.on('media-state-change', (data) => {
      const { userId, userName, videoOn, audioOn } = data;

      logDebug(`${userName || shortId(userId)} media → video: ${videoOn}, audio: ${audioOn}`);

      setConnectionStatus(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          userName: prev[userId]?.userName || userName,
          videoOn: videoOn ?? true,
          audioOn: audioOn ?? true,
        }
      }));

      // Extra safety: sync local UI if it's me
      if (userId === socketRef.current?.id) {
        if (videoOn !== undefined) setIsVideoOn(videoOn);
        if (audioOn !== undefined) setIsAudioOn(audioOn);
      }
    });
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
      console.log('data:', connectionStatus);
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
      if (socketRef.current) {
        socketRef.current.disconnect();
        console.log('Socket disconnected on cleanup 9');
        socketRef.current = null;
      }
    };
  }, [roomId, inRoom, userName, email, isHost, logDebug, addAlert,validated]);

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
  if (inRoom && !localStreamRef.current && socketRef.current?.connected) {
    joinRoom(); // One clean call
  }
}, [inRoom, socketRef.current?.connected]);

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

  // useEffect(() => {
  //   console.log('12 :  const interval = setInterval')
  //   const interval = setInterval(() => {
  //     Object.keys(pendingRemoteStreams.current).forEach((userId) => {
  //       const pending = Object.values(pendingRemoteStreams.current[userId] || {}).filter((s) => s);
  //       if (pending.length > 0) {
  //         logDebug(`Pending streams for ${userId}: ${pending.length}`);
  //         Object.keys(pendingRemoteStreams.current[userId]).forEach((type) => {
  //           if (pendingRemoteStreams.current[userId][type] && peerVideoRefs.current[userId]?.[type]) {
  //             assignPeerStream(userId, type, pendingRemoteStreams.current[userId][type]);
  //           }
  //         });
  //       }
  //     });
  //   }, 5000);
  //   return () => clearInterval(interval);
  // }, [logDebug]);

  // Add this function or logic inside your Video component
  // REPLACE THE BROKEN useEffect WITH THIS ONE
  // useEffect(() => {
  //   if (!isExternal || !meetingId || !email) return;

  //   const checkAndClaimHost = async () => {
  //     try {
  //       const res = await axios.post('http://localhost:3000/api/claim-host', {
  //         meetingId,
  //         email
  //       });



  //       console.log('check host',res.data)

  //       if (res.data.isHost) {
  //         setIsHost(true);

  //         socketRef.current?.emit('claim-host', { roomId: meetingId });
  //         addAlert('You are now the Host!', 'success');
  //         logDebug('Host role claimed successfully (late join)');
  //       }
  //     } catch (err) {
  //       console.log('Not the creator or server error');
  //     }
  //   };

  //   // Check immediately + every 3 seconds (in case participants joined first)
  //   checkAndClaimHost();
  //   const interval = setInterval(checkAndClaimHost, 3000);

  //   return () => clearInterval(interval);
  // }, []);

const createConnectionsToExistingUsers = useCallback((providedUsers = null) => {
  if (!localStreamRef.current) {
    logDebug("Cannot create connections — no local stream yet");
    return;
  }

  const doCreate = (users) => {
    if (!Array.isArray(users)) return;

    const others = users.filter(u => u.userId !== socketRef.current?.id);

    logDebug(`Creating connections to ${others.length} existing users`);

    others.forEach(user => {
      if (peersRef.current[user.userId]) return; // already have

      // Small delay → helps a lot with signaling race
      setTimeout(() => {
        if (!peersRef.current[user.userId] && localStreamRef.current) {
          const peer = createPeer(user.userId, true); // YOU initiate
          if (peer) {
            peersRef.current[user.userId] = peer;
            setPeers(p => ({ ...p, [user.userId]: peer }));
          }
        }
      }, 300 + Math.random() * 400); // tiny jitter helps
    });
  };

  if (providedUsers) {
    doCreate(providedUsers);
  } else {
    // Fallback - ask server
    socketRef.current?.emit('get-room-users', roomId, doCreate);
  }
}, [roomId]);

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      logDebug(`Permission che ck failed: ${err.name} - ${err.message}`);
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

    // addAlert('create user');
    console.log('user', user)


    // creatorId,creatorName,creatorEmail,meetingTitle
    // const {creatorId,creatorName,creatorEmail,meetingTitle}=req.body;
    const res = await axios.post(`${API_URL}/api/instant`, {
      meetingTitle: "Instant Meeting",
      creatorId: user.id,
      // creatorName: user.name,
      // creatorEmail: user.email, 
    })

    console.log('create meeting', res.data);
    const data = res.data;

    const newRoomId = data.roomId;
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
      socketRef.current.emit('join-room', newRoomId, user.id, userName, email, true);
      setInRoom(true);
      // After acquiring stream and joining
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };

const joinRoom = async () => {
  if (!roomId.trim() || !userName.trim()) {
    addAlert('Please enter Room ID and username.', 'error');
    return;
  }

  if (!(await checkPermissions())) {
    addAlert('Camera/microphone permissions denied.', 'error');
    return;
  }

  let isHost = false;
  let valid = false;

  if (!validated) {
    try {
      const res = await axios.post(`${API_URL}/api/validate-instant`, {
        roomId: roomId.trim(),
        email: email,
      });

      valid = res.data.valid;
      isHost = !!res.data.isHost;
      setIsHost(isHost);

      if (!valid) {
        addAlert('Not authorized to join this meeting.', 'error');
        return;
      }

      addAlert(isHost ? 'Welcome back, Host!' : 'Joined instant meeting.', 'success');
    } catch (err) {
      console.error('Validation error:', err);
      addAlert(
        err.response?.data?.message || 'Invalid meeting or access denied.',
        'error'
      );
      return;
    }
  }

  // === Proceed to acquire media and join room ===
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

    // Emit join with correct isHost value
    socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, isHost);
    setInRoom(true);

    // IMPORTANT: Create connections to existing users after a delay
    // setTimeout(() => {
    //   createConnectionsToExistingUsers();
    // }, 2000);

    // Broadcast initial media state
    setTimeout(() => {
      socketRef.current.emit('media-state-change', {
        roomId,
        userId: socketRef.current.id,
        userName,
        videoOn: true,
        audioOn: true,
      });
    }, 1000);

  } catch (err) {
    logDebug(`Error accessing media: ${err.message}`);
    addAlert('Failed to access camera/microphone. Check permissions.', 'error');
  }
};

  
  const toggleVideo = async () => {
    if (!localStreamRef.current) {
      logDebug("No local stream available");
      return;
    }

    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      // ——— CASE 1: Track exists → just toggle enabled state ———
      const willEnable = !videoTrack.enabled;
      videoTrack.enabled = willEnable;
      setIsVideoOn(willEnable);

      logDebug(`Video track ${willEnable ? 'enabled' : 'disabled'} locally`);
      addAlert(`Camera ${willEnable ? 'turned on' : 'turned off'}`, 'info');

      // Sync track state across all existing peers
      Object.values(peersRef.current).forEach((peer) => {
        if (!peer?._pc) return;
        const sender = peer._pc.getSenders().find(
          (s) => s.track?.kind === 'video' && s.track?._type === 'camera'
        );
        if (sender?.track) {
          sender.track.enabled = willEnable;
          logDebug(`Updated peer ${peer._id} video track enabled = ${willEnable}`);
        }
      });

      // ——— BROADCAST CURRENT STATE TO EVERYONE (THIS FIXES UI SYNC) ———
      socketRef.current?.emit('media-state-change', {
        roomId,
        userId: socketRef.current.id,
        userName,
        videoOn: willEnable,
        audioOn: isAudioOn,
      });
    }
    else if (!isVideoOn) {
      // ——— CASE 2: No video track but user wants to turn ON → reacquire camera ———
      try {
        logDebug("Re-acquiring camera because track was removed");
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        newVideoTrack._type = 'camera';
        newVideoTrack.enabled = true;

        // Add to existing local stream
        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(localStreamRef.current);
        setIsVideoOn(true);

        // Add track to all existing peers
        Object.values(peersRef.current).forEach((peer) => {
          if (peer?._pc) {
            peer._pc.addTrack(newVideoTrack, localStreamRef.current);
            logDebug(`Added new video track to peer ${peer._id}`);
          }
        });

        // Renegotiate all peers to send the new track
        setTimeout(() => {
          Object.entries(peersRef.current).forEach(([userId, peer]) => {
            renegotiatePeer(peer, userId);
          });
        }, 300);

        addAlert("Camera turned on", "success");

        // Broadcast new state
        socketRef.current?.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: isAudioOn,
        });
      } catch (err) {
        logDebug("Failed to reacquire camera: " + err.message);
        addAlert("Failed to turn on camera", "error");
      }
    }
  };


  const toggleAudio = () => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    const willEnable = !audioTrack.enabled;
    audioTrack.enabled = willEnable;
    setIsAudioOn(willEnable);

    // Sync across peers
    Object.values(peersRef.current).forEach((peer) => {
      const sender = peer._pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender?.track) sender.track.enabled = willEnable;
    });

    addAlert(`Microphone ${willEnable ? 'unmuted' : 'muted'}`, 'info');

    // Broadcast correct state
    socketRef.current?.emit('media-state-change', {
      roomId,
      userId: socketRef.current.id,
      userName,
      videoOn: isVideoOn,
      audioOn: willEnable,
    });
  };


  const toggleScreenShare = async () => {
  // STOP if already sharing
  if (screenStreamRef.current) {
    await stopScreenShare();
    return;
  }

  try {
    const isProctorEnabled =
      participantControls[socketRef.current?.id]?.proctor || false;

    addAlert(
      isProctorEnabled
        ? 'Proctor mode requires sharing your entire screen.'
        : 'Select a screen, window, or tab to share.',
      'info'
    );

    // 1️⃣ Get display media
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: isProctorEnabled
        ? { displaySurface: 'monitor', cursor: 'never' }
        : { frameRate: 30 },
      audio: false,
    });

    const screenTrack = screenStream.getVideoTracks()[0];
    screenTrack._type = 'screen';

    // 2️⃣ Proctor validation
    if (
      isProctorEnabled &&
      screenTrack.getSettings().displaySurface !== 'monitor'
    ) {
      screenTrack.stop();
      screenStream.getTracks().forEach(t => t.stop());
      addAlert('Proctor mode requires sharing the entire screen.', 'error');
      return;
    }

    // 3️⃣ Store refs
    screenStreamRef.current = screenStream;
    screenTrackRef.current = screenTrack;

    setScreenStream(screenStream);
    setIsScreenSharing(true);

    // 4️⃣ Clear previous screen senders completely
Object.keys(screenSendersRef.current).forEach(peerId => {
  delete screenSendersRef.current[peerId];
});

// 5️⃣ Create fresh senders for each peer
const renegotiationPromises = [];
let hasAnyScreenSender = false;

Object.entries(peersRef.current).forEach(([peerId, peer]) => {
  const pc = peer?._pc;
  if (!pc) return;

  // Check if there's already a screen track in the connection
  const existingScreenSender = pc.getSenders().find(s => 
    s.track?._type === 'screen'
  );

  try {
    let newSender;

    if (existingScreenSender) {
      // Replace existing screen track
      newSender = existingScreenSender;
      existingScreenSender.replaceTrack(screenTrack)
        .then(() => {
          logDebug(`Replaced screen track for ${peerId}`);
        })
        .catch(err => {
          logDebug(`replaceTrack failed, creating new sender for ${peerId}: ${err.message}`);
          // Fallback to creating new sender
          const fallbackSender = pc.addTrack(screenTrack, screenStream);
          screenSendersRef.current[peerId] = fallbackSender;
          hasAnyScreenSender = true;
        });
    } else {
      // Create new sender
      newSender = pc.addTrack(screenTrack, screenStream);
      screenSendersRef.current[peerId] = newSender;
      hasAnyScreenSender = true;
      logDebug(`Created new screen sender for peer ${peerId}`);
    }

    // Store the sender
    if (newSender && newSender.track) {
      screenSendersRef.current[peerId] = newSender;
    }

  } catch (err) {
    logDebug(`Error adding screen track to peer ${peerId}: ${err.message}`);
  }

  // Queue renegotiation
  renegotiationPromises.push(
    new Promise((resolve) => {
      setTimeout(() => {
        if (hasAnyScreenSender) {
          renegotiatePeer(peer, peerId, 0, false);
        }
        resolve();
      }, 500);
    })
  );
});

// Wait for renegotiations
Promise.allSettled(renegotiationPromises).then(() => {
  logDebug('All renegotiations completed');
});

    // 6️⃣ Notify peers
    socketRef.current?.emit('screen-share-status', {
      roomId,
      userId: socketRef.current.id,
      userName,
      userEmail: email,
      isScreenSharing: true,
    });

    addAlert('Screen sharing started.', 'success');

    // 7️⃣ Handle browser stop
    screenTrack.onended = () => {
      logDebug('Screen share ended by browser');
      stopScreenShare();
    };

  } catch (err) {
    logDebug(`Screen share error: ${err.message}`);
    addAlert('Failed to start screen sharing.', 'error');
  }
};


 const stopScreenShare = async () => {
  if (!screenStreamRef.current) return;

  // 1. Stop all tracks in the stream
  screenStreamRef.current.getTracks().forEach(track => {
    if (track.readyState === 'live') {
      track.stop();
    }
  });

  // 2. Clean up each peer connection properly
  Object.entries(peersRef.current).forEach(([peerId, peer]) => {
    if (!peer?._pc) return;

    try {
      // Find the screen sender
      const senders = peer._pc.getSenders();
      const screenSender = senders.find(s => 
        s.track?._type === 'screen' || 
        (s.track && s.track.id === screenTrackRef.current?.id)
      );

      if (screenSender) {
        // Important: Replace with null track FIRST
        screenSender.replaceTrack(null).catch(() => {});
        
        // Remove the sender from the peer connection
        peer._pc.removeTrack(screenSender);
        logDebug(`Removed screen sender for peer ${peerId}`);
      }

      // Also remove from our ref
      delete screenSendersRef.current[peerId];
      
      // Renegotiate to clean up
      setTimeout(() => {
        renegotiatePeer(peer, peerId, 0, true);
      }, 500);
    } catch (err) {
      logDebug(`Error cleaning up screen sender for ${peerId}: ${err.message}`);
    }
  });

  // 3. Clear refs
  screenStreamRef.current = null;
  screenTrackRef.current = null;
  screenSendersRef.current = {}; // Clear ALL, don't keep null references

  // 4. Update state
  setScreenStream(null);
  setIsScreenSharing(false);

  // 5. Notify peers
  socketRef.current?.emit('screen-share-status', {
    roomId,
    userId: socketRef.current?.id,
    userName,
    userEmail: email,
    isScreenSharing: false,
  });

  addAlert('Screen sharing stopped.', 'info');
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
      }, 500);

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

    // Create peer WITHOUT stream initially
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

    // 🔥 FIX: If screen sharing is already active, attach screen to NEW peer
if (screenStreamRef.current && screenTrackRef.current) {
  try {
    const pc = peer._pc;

    const sender = pc.addTrack(
      screenTrackRef.current,
      screenStreamRef.current
    );

    screenSendersRef.current[userId] = sender;

    logDebug(`Attached ACTIVE screen track to late-joining peer ${userId}`);

    // 🔥 Force renegotiation so new peer receives screen
    setTimeout(() => {
      renegotiatePeer(peer, userId, 0, true);
    }, 1300);

  } catch (err) {
    logDebug(`Failed to attach screen to peer ${userId}: ${err.message}`);
  }
}


    // Manually add all tracks to the peer connection
    const addAllTracksToPeer = () => {
      if (!localStreamRef.current) return;

      try {
        // Add all video tracks from local stream
        const videoTracks = localStreamRef.current.getVideoTracks();
        videoTracks.forEach(track => {
          if (track.readyState === 'live') {
            peer._pc.addTrack(track, localStreamRef.current);
            logDebug(`Added video track to peer ${userId}: ${track._type || 'camera'} (${track.id})`);
          }
        });

        // Add all audio tracks from local stream
        const audioTracks = localStreamRef.current.getAudioTracks();
        audioTracks.forEach(track => {
          if (track.readyState === 'live') {
            peer._pc.addTrack(track, localStreamRef.current);
            logDebug(`Added audio track to peer ${userId}: ${track.id}`);
          }
        });

        logDebug(`Total tracks added to peer ${userId}: ${videoTracks.length} video, ${audioTracks.length} audio`);
      } catch (err) {
        logDebug(`Error adding tracks to peer ${userId}: ${err.message}`);
      }
    };

    // Add tracks after peer is created
    // setTimeout(addAllTracksToPeer, 100);

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

      // Store the stream for later use
      if (!peersRef.current[userId]._remoteStreams) {
        peersRef.current[userId]._remoteStreams = {};
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
            peersRef.current[userId]._remoteStreams.audio = audioStream;
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
          peersRef.current[userId]._remoteStreams[streamType] = singleTrackStream;
          setConnectionStatus((prev) => ({
            ...prev,
            [userId]: {
              ...prev[userId],
              streams: {
                ...prev[userId]?.streams,
                [streamType]: true,
              },
            },
          }));
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
      logDebug(`❌ Failed to  create peer for ${userId}, queuing...`);
      pendingPeerCreations.current[userId] = { userName, userEmail, isUserHost };
      return;
    }

    setPeers((prev) => ({ ...prev, [userId]: peer }));
    addAlert(`${userName} joined the meeting.`, 'info');

    // Notify new user about screen sharing status if we're sharing
    if (isScreenSharing) {
      setTimeout(() => {
        socketRef.current?.emit('screen-share-status', {
          roomId,
          userId: socketRef.current.id,
          userName,
          userEmail: email,
          isScreenSharing: true,
        });
        logDebug(`Notified new user ${userId} about screen sharing status`);
      }, 1000);
    }
  };

  // Add this function near your other helper functions
  const broadcastScreenShareToAll = useCallback(() => {
    if (!isScreenSharing || !screenShareTrackRef.current) return;

    Object.entries(peersRef.current).forEach(([userId, peer]) => {
      if (peer && peer._pc && peer._pc.signalingState !== 'closed') {
        try {
          const existingScreenSender = peer._pc.getSenders().find(
            (s) => s.track?._type === 'screen'
          );

          if (!existingScreenSender && screenShareTrackRef.current) {
            peer._pc.addTrack(screenShareTrackRef.current, screenStream || localStreamRef.current);
            logDebug(`Added screen track to peer ${userId} in broadcast`);

            setTimeout(() => {
              renegotiatePeer(peer, userId, 0, false);
            }, 300);
          }
        } catch (err) {
          logDebug(`Error broadcasting screen to peer ${userId}: ${err.message}`);
        }
      }
    });
  }, [isScreenSharing, screenStream, screenShareTrackRef.current]);

  // Add this useEffect to broadcast screen share when new users join
  useEffect(() => {
    if (isScreenSharing && Object.keys(peers).length > 0) {
      // When peers change (new user joins), broadcast screen share
      const timer = setTimeout(() => {
        broadcastScreenShareToAll();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [peers, isScreenSharing, broadcastScreenShareToAll]);

 const handleOffer = (data) => {
  logDebug(`Received offer from ${data.from}: ${JSON.stringify(data.signal).slice(0, 100)}...`);
  
  // CRITICAL FIX: Wait for local stream before processing offer
  const processOffer = async () => {
    // If local stream is not ready, wait for it
    if (!localStreamRef.current) {
      logDebug(`⏳ Local stream not ready for offer from ${data.from}, waiting...`);
      
      // Wait up to 5 seconds for local stream
      let attempts = 0;
      while (!localStreamRef.current && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 300));
        attempts++;
      }
      
      if (!localStreamRef.current) {
        logDebug(`❌ Local stream still not ready after 5 seconds, queuing offer...`);
        // Queue the offer for later processing
        if (!pendingCandidates.current[data.from]) {
          pendingCandidates.current[data.from] = [];
        }
        pendingCandidates.current[data.from].push(data.signal);
        return;
      }
    }
    
    // Now process the offer with local stream available
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
  
  processOffer();
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
    try {
      peer.signal({ candidate: data.candidate });
      logDebug(`Applied ICE candidate from ${data.from}`);
    } catch (err) {
      logDebug(`Error applying ICE candidate from ${data.from}: ${err.message}`);
      // Queue it for retry
      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }
      pendingCandidates.current[data.from].push({ candidate: data.candidate });
    }
  } else {
    logDebug(`Peer not ready for ICE candidate from ${data.from}, queuing...`);
    
    if (!pendingCandidates.current[data.from]) {
      pendingCandidates.current[data.from] = [];
    }
    
    pendingCandidates.current[data.from].push({ candidate: data.candidate });
    
    // Increase queue limit for production
    if (pendingCandidates.current[data.from].length > 50) {
      pendingCandidates.current[data.from] = pendingCandidates.current[data.from].slice(-30);
      logDebug(`Trimmed ICE candidate queue for ${data.from} to 30 items`);
    }
  }
};

  const handleUserLeft = (userId, serverName) => {
    console.log('server name', serverName)
    const displayName = serverName || connectionStatus[userId]?.userName ||
      participantControls[userId]?.userName ||
      shortId(userId);
    console.log('user left name', displayName)
    console.log("== DEBUG USER LEFT ==");
    console.log("connectionStatus:", connectionStatus[userId]);
    console.log("participantControls:", participantControls[userId]);
    console.log("shortId:", shortId(userId));
    console.log("Final Name:", displayName);
    console.log("================================");

    // logDebug(`User left: ${displayName}`);
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
    addAlert(`${displayName} left the meeting.`, 'info');
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

  const handleToggleMedia = useCallback((data) => {
    const { userId, video, audio } = data;

    logDebug(`Media state sync: ${shortId(userId)} → video=${video}, audio=${audio}`);

    // UPDATE UI FOR EVERYONE (this is the key!)
    setConnectionStatus(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        videoOn: video ?? prev[userId]?.videoOn ?? true,
        audioOn: audio ?? prev[userId]?.audioOn ?? true,
      }
    }));

    // ONLY IF this is for ME → apply to local tracks
    if (userId === socketRef.current?.id && localStreamRef.current) {
      if (video !== undefined) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = video;
          setIsVideoOn(video);
        }
      }
      if (audio !== undefined) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = audio;
          setIsAudioOn(audio);
        }
      }
    }
  }, [logDebug]);

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

    // Only allow host to TURN OFF (disable) video/audio — never turn ON
    const shouldDisable = type === 'video' || type === 'audio';

    // For video/audio: always force OFF. For proctor: toggle normally
    const newVal = type === 'proctor'
      ? !participantControls[userId]?.proctor
      : false; // always false = force off

    setParticipantControls((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        video: type === 'video' ? false : prev[userId]?.video ?? true,
        audio: type === 'audio' ? false : prev[userId]?.audio ?? true,
        proctor: type === 'proctor' ? newVal : prev[userId]?.proctor ?? false,
      },
    }));

    // Immediately update host UI to reflect forced-off state
    if (type === 'video' || type === 'audio') {
      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          videoOn: type === 'video' ? false : prev[userId]?.videoOn,
          audioOn: type === 'audio' ? false : prev[userId]?.audioOn,
        },
      }));
    }

    // Send command to participant
    socketRef.current.emit('toggle-media', {
      roomId,
      userId,
      video: type === 'video' ? false : undefined,
      audio: type === 'audio' ? false : undefined,
    });

    // For proctor mode,changes this dec17 for username and useremail
    if (type === 'proctor') {
      socketRef.current.emit('toggle-proctor', {
        roomId,
        userId,
        userName: connectionStatus[userId]?.userName,
        userEmail: connectionStatus[userId]?.userEmail,
        proctor: newVal,
      });
    }

    addAlert(
      type === 'proctor'
        ? `Proctor mode ${newVal ? 'enabled' : 'disabled'} for ${connectionStatus[userId]?.userName || shortId(userId)}`
        : `${type === 'video' ? 'Camera' : 'Microphone'} turned OFF for ${connectionStatus[userId]?.userName || shortId(userId)}`,
      'info'
    );
  };


  // Add this function near your other helper functions (around line ~300)
const cleanupAllPeers = useCallback(() => {
  logDebug('🧹 Starting comprehensive peer cleanup...');
  
  // 1. Destroy all peer connections
  Object.entries(peersRef.current).forEach(([userId, peer]) => {
    if (peer && typeof peer.destroy === 'function') {
      try {
        peer.destroy();
        logDebug(`Destroyed peer connection for ${userId}`);
      } catch (err) {
        logDebug(`Error destroying peer ${userId}: ${err.message}`);
      }
    }
  });
  
  // 2. Clear all peer refs
  peersRef.current = {};
  setPeers({});
  
  // 3. Clear peer video refs and stop their streams
  Object.keys(peerVideoRefs.current).forEach(userId => {
    if (peerVideoRefs.current[userId]) {
      if (peerVideoRefs.current[userId].camera) {
        const videoEl = peerVideoRefs.current[userId].camera;
        if (videoEl.srcObject) {
          videoEl.srcObject.getTracks().forEach(track => track.stop());
          videoEl.srcObject = null;
        }
      }
      if (peerVideoRefs.current[userId].screen) {
        const videoEl = peerVideoRefs.current[userId].screen;
        if (videoEl.srcObject) {
          videoEl.srcObject.getTracks().forEach(track => track.stop());
          videoEl.srcObject = null;
        }
      }
    }
  });
  peerVideoRefs.current = {};
  
  // 4. Clear all pending data
  pendingRemoteStreams.current = {};
  pendingCandidates.current = {};
  renegotiationQueue.current = {};
  videoStreamCount.current = {};
  pendingPeerCreations.current = {};
  
  // 5. Clear connection status for all remote users
  setConnectionStatus(prev => {
    // Keep only local user status if exists
    const localUserId = socketRef.current?.id;
    if (localUserId && prev[localUserId]) {
      return { [localUserId]: prev[localUserId] };
    }
    return {};
  });
  
  // 6. Clear participant controls for remote users
  setParticipantControls(prev => {
    const localUserId = socketRef.current?.id;
    if (localUserId && prev[localUserId]) {
      return { [localUserId]: prev[localUserId] };
    }
    return {};
  });
  
  logDebug('✅ Peer cleanup completed');
}, [logDebug]);

  const leaveRoom = () => {
    // window.location.reload();
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    cleanupAllPeers();

    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }

    // Destroy all peers
    Object.values(peersRef.current).forEach(peer => {
      if (peer && typeof peer.destroy === 'function') {
        peer.destroy();
      }
    });
    peersRef.current = {};
    setPeers({});

    // Clear pending streams & refs
    pendingRemoteStreams.current = {};
    pendingCandidates.current = {};
    renegotiationQueue.current = {};
    videoStreamCount.current = {};
    detectionIntervals.current = {};
    pendingPeerCreations.current = {};
    hasJoinedRef.current = false;
    isJoiningRef.current = false;
    screenShareActiveRef.current = false;
    screenShareTrackRef.current = null;

    // Properly disconnect socket
    if (socketRef.current) {
      socketRef.current.off(); // Remove all listeners
      socketRef.current.disconnect();
      console.log('Socket disconnected leaveroom');
      socketRef.current = null;
    }

    // Reset video refs
    if (userVideoRef.current.camera) userVideoRef.current.camera.srcObject = null;
    if (userVideoRef.current.screen) userVideoRef.current.screen.srcObject = null;
    Object.keys(peerVideoRefs.current).forEach(userId => {
      if (peerVideoRefs.current[userId]) {
        if (peerVideoRefs.current[userId].camera) {
          peerVideoRefs.current[userId].camera.srcObject = null;
        }
        if (peerVideoRefs.current[userId].screen) {
          peerVideoRefs.current[userId].screen.srcObject = null;
        }
      }
    });
    peerVideoRefs.current = {};

    // Reset all state
    setInRoom(false);
    setIsHost(false);
    setConnectionStatus({});
    setParticipantControls({});
    setMessages([]);
    setAlerts([]);
    setIsVideoOn(true);
    setIsAudioOn(true);
    setIsScreenSharing(false);
    setCurrentVideoPage(1);
    setTotalVideoPages(1);


    // Optional: Force re-render by resetting roomId temporarily
    // This clears the input field and forces fresh join
    setRoomId('');

    addAlert('You have left the meeting.', 'info');

    // navigate('/video'); 

    console.log('validity', validated);
    console.log('isExternal', isExternal);

    if (isExternal && validated) {
      window.location.reload();
      navigate(`/join/${meetingId}`, { replace: true });
    } else {
      
      navigate('/video', { replace: true });
    }

    // Alert.alert(
    //   'Left Meeting',
    //   'You have left the meeting.', 
    // );



    //  navigate(`/join/${meetingId}`, { replace: true ,validated: false});

    // if(validated){
    //    window.location.reload();
    //   console.log('meetingId', meetingId);
    //   navigate(`/join/${meetingId}`);
    //   window.location.reload();

    // }

    // else{
    //    window.location.reload();
    //   console.log('navigating to video');
    //   // navigate('/video');
    // }
    // window.location.reload();
    //    if (validated) {
    //   console.log('meetingId', meetingId);
    //   navigate(`/join/${meetingId}`, { replace: true });
    // } else {
    //   navigate('/video', { replace: true });
    // }
    // Critical: Navigate to clean state or force remount
    // if(!validated){
    //navigate('/video'); // This should trigger fresh JoinRoom
    // }
    // else{ 
    // console.log('meetingId', meetingId);
    // // navigate(`/join/${meetingId}`); // This should trigger fresh JoinRoom
    // window.location.reload();
    // }
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
          validated ? (
            <div className="redirecting-container">
              <div className="redirecting-message">
                <i className="fas fa-spinner fa-spin"></i>
                <p>Returning to join form...</p>
              </div>
            </div>
          ) : (
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
              addAlert={addAlert}
            />
          )
        ) : (
          <div className="conference-room">
            <MeetingHeader
              roomId={roomId}
              isHost={isHost}
              peers={peers}
              showChat={showChat}
              setShowChat={setShowChat}
              showDebug={showDebug}
              setShowDebug={setShowDebug}
              logout={logout}
              isExternal={isExternal}
              leaveRoom={leaveRoom}
            />

            <div className="main-content">
              <div className="video-container">
                <VideoLayout
                  isAnyScreenSharing={isAnyScreenSharing}
                  isScreenSharing={isScreenSharing}
                  peers={peers}
                  connectionStatus={connectionStatus}
                  participantControls={participantControls}
                  isHost={isHost}
                  toggleParticipantMedia={toggleParticipantMedia}
                  peerVideoRefs={peerVideoRefs}
                  pendingRemoteStreams={pendingRemoteStreams}
                  peersRef={peersRef}
                  shortId={shortId}
                  userName={userName}
                  isVideoOn={isVideoOn}
                  isAudioOn={isAudioOn}
                  currentVideoPage={currentVideoPage}
                  totalVideoPages={totalVideoPages}
                  navigateVideoPage={navigateVideoPage}
                  getCurrentPageCameraVideos={getCurrentPageCameraVideos}
                  localStreamRef={localStreamRef}
                  logDebug={logDebug}
                  userVideoRef={userVideoRef}
                />
              </div>

              <ChatPanel
                showChat={showChat}
                setShowChat={setShowChat}
                messages={messages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                sendChatMessage={sendChatMessage}
                socketRef={socketRef}
                userName={userName}
              />
            </div>

            <footer className="bottom-bar">
              <VideoControls
                toggleVideo={toggleVideo}
                toggleAudio={toggleAudio}
                toggleScreenShare={toggleScreenShare}
                leaveRoom={leaveRoom}
                isVideoOn={isVideoOn}
                isAudioOn={isAudioOn}
                isScreenSharing={isScreenSharing}
                logout={logout}
                isExternal={isExternal}
              />
            </footer>

            <DebugPanel
              showDebug={showDebug}
              debugLog={debugLog}
            />
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
    .text-danger { color: #ff4444 !important; }
.text-success { color: #00C851 !important; }

  /* Alert styles remain the same */
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
  .alert-close:hover { opacity: 1; }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Main Layout Container */
  .video-layout-container {
    display: flex;
    gap: 20px;
    height: 100%;
    padding: 20px;
  }

  /* Screen Share Section - Left Side */
  .screen-share-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 70%;
  }

  .screen-share-item {
    width: 100%;
    background: #000;
    border: 3px solid var(--accent-blue);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 183, 235, 0.4);
    overflow: hidden;
  }

  .screen-share-video {
    aspect-ratio: 16 / 9;
    width: 100%;
  }

  .screen-element {
    object-fit: contain;
    background: #000;
    border-radius: 8px;
    width: 100%;
    height: 100%;
  }

  .local-screen-share {
    border-color: var(--success);
  }

  .screen-share-item .video-overlay {
    background: linear-gradient(to top, rgba(0, 183, 235, 0.3), transparent);
    padding: 12px;
  }

  .screen-share-item .video-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--accent-blue);
  }

  .redirecting-container {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--primary-bg);
        }
        .redirecting-message {
          text-align: center;
          color: var(--text-color);
          font-size: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .redirecting-message i {
          font-size: 24px;
          color: var(--accent-blue);
        }
        .redirecting-message p {
          margin: 0;
          opacity: 0.8;
        }

  

  /* Camera Videos Section - Right Side */
  .camera-videos-section {
    flex: 1;
    display: grid;
    // grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    max-width: 25%;
   
    padding: 10px;
  }

  /* When NO screen sharing - Full screen camera layout */
  .video-gallery.no-screen-share .video-layout-container {
    display: block;
  }

  .video-gallery.no-screen-share .camera-videos-section {
    max-width: 100%;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    padding: 0;
  }

  /* When screen sharing IS active - Side by side layout */
.video-gallery.has-screen-share .camera-videos-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

  /* Video item common styles */
  .video-item {
    background: #1c1c38;
    border-radius: 10px;
    overflow: hidden;
    transition: transform 0.2s;
    position: relative;
  }

  .video-item:hover {
    transform: scale(1.02);
  }
.video-item.local-video .video-element {
  background: #000 !important;
}

 .video-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
}
  .video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
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
    z-index:5;
  }

  .video-name {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .video-status {
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .video-status span {
    color: #a0a0c0;
  }

  .proctor-controls {
    display: flex;
    gap: 4px;
    margin-right: auto;
  }

 .text-danger { color: #ff4444 !important; }
.text-success { color: #00c851 !important; }
.proctor-controls button {
  background: rgba(255,255,255,0.1);
  padding: 4px 6px;
  border-radius: 4px;
}
.proctor-controls button:hover {
  background: rgba(255,255,255,0.2);
}

  /* Chat panel - smaller width */
  .side-panel {
    width: 250px;
    background: var(--secondary-bg);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    height: 100%; /* Add this */
  }

  .side-panel.open {
    transform: translateX(0);
  }

  .chat-messages-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Important for flexbox scrolling */
  margin-bottom: 12px;
  overflow: hidden; /* Contain the scrolling */
}
  .chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
      height: 100%; /* Add this */
    padding: 12px;
      min-height: 0; 
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
      flex-shrink: 0;
  }

  .chat-header h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  .chat-header button {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-color);
    opacity: 0.7;
  }

  .chat-header button:hover { opacity: 1; }

 .chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background: #1c1c38;
  border-radius: 6px;
  /* Hide scrollbar for Chrome, Safari and Opera */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

  
 .chat-message {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #24244a;
  max-width: 90%;
  font-size: 12px;
  word-wrap: break-word;
}
  .chat-message.own-message {
  background: var(--accent-blue);
  margin-left: auto;
}

  .chat-meta {
  display: flex;
  gap: 4px;
  align-items: baseline;
  margin-bottom: 2px;
}

  .chat-sender {
    font-weight: 500;
    color: var(--accent-purple);
    font-size: 11px;
  }

  .chat-time {
    color: #a0a0c0;
    font-size: 10px;
  }

 .chat-text {
  font-size: 12px;
  word-wrap: break-word;
  line-height: 1.3;
}

.chat-input {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.chat-input input {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  background: #24244a;
  color: var(--text-color);
}
  .chat-input input:focus {
    border-color: var(--accent-blue);
    outline: none;
  }

  .chat-input button {
  padding: 8px 10px;
  background: var(--accent-blue);
  color: var(--text-color);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.chat-input button:hover {
  background: var(--accent-purple);
}

  /* Rest of your existing styles... */
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

  .join-buttons button:hover { opacity: 0.9; }

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

  .top-controls button:hover { background: #2e2e4b; }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .video-container {
    flex: 1;
    background: #000;
    overflow: auto;
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

  .controls button:hover { background: #2e2e4b; }
  .controls button.disabled { color: var(--error); border-color: var(--error); }
  .controls button.sharing { color: var(--success); border-color: var(--success); }

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

 .slides-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 20px;
  margin: 10px auto;
  max-width: 150px;
  order: 999; /* Ensure it appears at the bottom */
}


.initials-avatar {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-weight: 700;
  border-radius: 10px;
  z-index: 2;
  user-select: none;
}

.initials-text {
  font-size: 2.8rem;
  letter-spacing: 2px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

.avatar-status {
  font-size: 0.8rem;
  margin-top: 8px;
  opacity: 0.9;
  font-weight: 500;
}

/* Smaller when screen sharing */
.has-screen-share .initials-text {
  font-size: 2rem;
}
.has-screen-share .avatar-status {
  font-size: 0.7rem;
}

.slide-counter {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-blue);
  min-width: 60px;
  text-align: center;
}

.slide-nav-btn {
  background: var(--accent-blue);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  font-size: 12px;
  transition: background-color 0.2s;
}

.slide-nav-btn:hover {
  background: var(--accent-purple);
}

.slide-nav-btn:disabled {
  background: var(--border);
  cursor: not-allowed;
  opacity: 0.5;
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
    .video-layout-container {
      flex-direction: column;
      gap: 15px;
    }
    .screen-share-section {
      max-width: 100%;
    }
    .camera-videos-section {
      max-width: 100%;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
    .camera-videos-section {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .video-layout-container {
      padding: 10px;
      gap: 10px;
    }
  }
}`}
        </style>
      </div>
    </ErrorBoundary>
  );
};

export default Video;


// feb 10

//updated code of UI related

//jan9 4.45 working code for rejoin too in scheduling

import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';
import { AuthContext } from './AuthContext';
import SchedulePage from './SchedulePage';
import JoinRoom from './JoinRoom';

import axios from 'axios';
import { set } from 'date-fns';

// Import Components
import Alert from './Alert';
import VideoControls from './VideoControls';
import ChatPanel from './ChatPanel';
import MeetingHeader from './MeetingHeader';
import VideoLayout from './VideoLayout';
import DebugPanel from './DebugPanel';
import WaitingLobby from './lobby/WaitingLobby';
import LobbyPanel from './lobby/LobbyPanel';
import ConferenceNotification from './notifications/ConferenceNotification';



// const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';
// const API_URL = "https://livemeet-ribm.onrender.com";

const SIGNALING_SERVER_URL = 'http://localhost:3000';
const API_URL = "http://localhost:3000";



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

// const Alert = ({ message, type, onClose }) => {
//   useEffect(() => {
//     const timer = setTimeout(onClose, 5000);
//     return () => clearTimeout(timer);
//   }, [onClose]);

//   return (
//     <div className={`alert alert-${type}`}>
//       {message}
//       <button onClick={onClose} className="alert-close">×</button>
//     </div>
//   );
// };

const Video = ({ isExternal = false, meetingId, userEmail, userName: propUserName, isHostM, validated = false }) => {
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
  const [pendingPeerStreams, setPendingPeerStreams] = useState({});
  const [currentVideoPage, setCurrentVideoPage] = useState(1);
  const [totalVideoPages, setTotalVideoPages] = useState(1);
  const [conferenceNotification, setConferenceNotification] = useState(null);

  // Add these new states near your other useState declarations
  // New: All non-host users wait (except if already validated as host)
const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [sidePanelType, setSidePanelType] = useState('chat'); // 'chat' or 'lobby'

  const isAnyScreenSharing = isScreenSharing ||
    Object.values(connectionStatus).some(status => status?.streams?.screen === true);

  // Keep all the existing refs (they remain the same)
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
  const cameraSendersRef = useRef({});
  const cameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const screenSendersRef = useRef({});
  const videoSenderRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingPeerCreations = useRef({});
  const hasJoinedRef = useRef(false);
  const isJoiningRef = useRef(false);


  // const [currentVideoPage, setCurrentVideoPage] = useState(1);
  // const [totalVideoPages, setTotalVideoPages] = useState(1);



const safeJoinRoom = async () => {
  // If user is host OR validated as creator, allow direct join
  if (!isHost && waitingForApproval) {
    // Check if this is an instant meeting creator trying to rejoin
    if (!isExternal && !validated) {
      try {
        // Use the existing endpoint
        const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
          roomId: roomId.trim(),
          email: email,
        });
        
        if (res.data.isHost) {
          console.log("✅ Instant meeting creator detected - allowing direct join");
          setIsHost(true);
          setWaitingForApproval(false);
          await executeJoin(true);
          return;
        }
      } catch (err) {
        console.log("Not the creator:", err.message);
      }
    }
    
    console.log("Blocked direct join — user must wait for host approval");
    addAlert("Waiting for host approval. You cannot join directly.", "info");
    return;
  }
  
  // Only proceed if host or already approved
  await joinRoomLogic();
};


  // Initials helper
  const getInitials = (name = '') => {
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  };

  // Navigation functions for video pages
  const navigateVideoPage = (direction) => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) return;

    setCurrentVideoPage(prev => {
      if (direction === 'next') {
        return prev >= totalVideoPages ? 1 : prev + 1;
      } else {
        return prev <= 1 ? totalVideoPages : prev - 1;
      }
    });
  };

  useEffect(() => {
    // Check if we're joining from scheduled meetings
    const joiningData = sessionStorage.getItem('joiningMeeting');
    if (joiningData && isExternal) {
      const data = JSON.parse(joiningData);
      setRoomId(data.roomId);
      setUserName(data.userName);
      setEmail(data.userEmail);
      setIsHost(data.isHost);
      setInRoom(true);


      sessionStorage.removeItem('joiningMeeting');
    }
  }, [isExternal]);


  useEffect(() => {
    if (!isAnyScreenSharing) {
      setCurrentVideoPage(1);
      setTotalVideoPages(1);
      return;
    }

    // Count ALL camera videos including local user
    const cameraVideoCount = 1 + Object.keys(peers).length; // Local user + all peers

    // Fixed number of videos per page/column
    const VIDEOS_PER_PAGE = 3;

    // Calculate total pages needed
    const calculatedTotalPages = Math.ceil(cameraVideoCount / VIDEOS_PER_PAGE);
    setTotalVideoPages(calculatedTotalPages);

    // Ensure current page is within bounds
    if (currentVideoPage > calculatedTotalPages) {
      setCurrentVideoPage(calculatedTotalPages || 1);
    }
  }, [peers, isAnyScreenSharing, currentVideoPage]);

  // Update the function to get videos for current page - include local video
  const getCurrentPageCameraVideos = () => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) {
      // Return all videos when no screen sharing or only one page
      const allVideos = ['local', ...Object.keys(peers)];
      return allVideos;
    }

    const VIDEOS_PER_PAGE = 3;
    const startIndex = (currentVideoPage - 1) * VIDEOS_PER_PAGE;
    const endIndex = startIndex + VIDEOS_PER_PAGE;

    // Get ALL video IDs including local
    const allVideoIds = ['local', ...Object.keys(peers)];
    return allVideoIds.slice(startIndex, endIndex);
  };

  // Add this function to ensure all peer streams are properly managed
  const ensurePeerStreams = useCallback(() => {
    Object.keys(peersRef.current).forEach(userId => {
      if (userId === 'local') return;

      // Ensure peer video refs exist
      if (!peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId] = {};
      }

      // Check if there are pending streams for this peer
      if (pendingRemoteStreams.current[userId]) {
        Object.keys(pendingRemoteStreams.current[userId]).forEach(streamType => {
          const stream = pendingRemoteStreams.current[userId][streamType];
          if (stream && peerVideoRefs.current[userId]?.[streamType]) {
            assignPeerStream(userId, streamType, stream);
          }
        });
      }
    });
  }, []);

  // Call this function whenever the current page changes
  useEffect(() => {
    if (isAnyScreenSharing) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        ensurePeerStreams();
      }, 100);
    }
  }, [currentVideoPage, isAnyScreenSharing, ensurePeerStreams]);

  // Also call when peers change
  useEffect(() => {
    if (isAnyScreenSharing) {
      ensurePeerStreams();
    }
  }, [peers, isAnyScreenSharing, ensurePeerStreams]);

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

    // 🔥 FIX: Also remove screen track from local stream
    if (localStreamRef.current) {
      const screenTrack = localStreamRef.current.getVideoTracks().find(t => t._type === 'screen');
      if (screenTrack) {
        localStreamRef.current.removeTrack(screenTrack);
        screenTrack.stop();
        logDebug('Removed screen track from local stream');
      }
    }

    const cleanupPromises = Object.entries(peersRef.current).map(async ([peerId, peer]) => {
      if (peer && peer._pc) {
        try {
          // 🔥 FIX: Also look for _isScreen property
          const screenSender = peer._pc.getSenders().find((s) =>
            s.track?._type === 'screen' || s.track?._isScreen === true
          );
          if (screenSender) {
            // 🔥 FIX: Replace with null track to properly remove
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

  // First, update this useEffect where you set isHost for scheduled meetings
  useEffect(() => {
    if ((isExternal && isHostM !== undefined) || validated) {
      console.log('isHost set from isHostM1:', isHostM);
      setIsHost(!!isHostM);

      // CRITICAL: If user is host, they should NOT wait for approval
      if (isHostM) {
        setWaitingForApproval(false);
      }
    }
  }, [isHostM, isExternal, validated]);

  useEffect(() => {
    if ((isExternal && isHostM !== undefined) || validated) {
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


  // Add this useEffect to handle local video stream assignment
  useEffect(() => {
    if (isAnyScreenSharing && localStreamRef.current && userVideoRef.current.camera) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const videoElement = userVideoRef.current.camera;
        if (videoElement && !videoElement.srcObject && localStreamRef.current) {
          videoElement.srcObject = localStreamRef.current;
          videoElement.play().catch((err) => {
            logDebug(`Error playing local stream after page change: ${err.message}`);
          });
          logDebug(`Reassigned local stream after page change to page ${currentVideoPage}`);
        }
      }, 50);
    }
  }, [currentVideoPage, isAnyScreenSharing, logDebug]);


  // Replace the autoJoin useEffect with this:
  // In Video.js, update the auto-join logic
useEffect(() => {
  const autoJoin = async () => {
    if (isExternal && roomId && userName && email && validated && !inRoom) {
      console.log('✅ Auto-joining validated user:', { userName, email, isHost });

      // 🔥 FIX: For instant meetings, check host status first
      if (isHost) {
        console.log('🎯 User is HOST, joining directly');
        const hasPermissions = await checkPermissions();
        if (!hasPermissions) {
          addAlert('Camera/microphone permissions required for host', 'error');
          return;
        }
        await executeJoin(true);
      } else {
        // For instant meetings, we need to check if they're the creator
        try {
          const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
            roomId: roomId.trim(),
            email: email,
          });
          
          if (res.data.isHost) {
            console.log('🎯 Instant meeting creator detected, joining as host');
            setIsHost(true);
            setWaitingForApproval(false);
            await executeJoin(true);
            return;
          }
        } catch (err) {
          console.log('Not instant meeting creator:', err.message);
        }
        
        console.log('⏳ User is PARTICIPANT, going to waiting lobby');
        setWaitingForApproval(true);
        if (socketRef.current?.connected) {
          socketRef.current.emit('request-join', {
            roomId,
            userName,
            email,
            isHost: false
          });
        }
      }
    }
  };

  const timer = setTimeout(() => {
    autoJoin();
  }, 1000);

  return () => clearTimeout(timer);
}, [isExternal, roomId, userName, email, isHost, validated, inRoom]);


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


  // In the useEffect that handles auto-join / rejoin for scheduled meetings
  useEffect(() => {
    if (!isExternal || !validated || !inRoom || localStreamRef.current) return;

    const joinScheduledMeeting = async () => {
      try {
        // 1. First get media — very important order!
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        // Tag & prepare
        stream.getVideoTracks().forEach(t => { t._type = 'camera'; t.enabled = true; });
        stream.getAudioTracks().forEach(t => { t.enabled = true; });

        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(true);
        setIsAudioOn(true);

        logDebug("✓ Stream acquired before join");

        // 2. Now safely join
        if (socketRef.current?.connected) {
          //socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, isHost);
          await safeJoinRoom();
          logDebug("→ join-room emitted AFTER stream ready");
        }

        // 3. Then ask for current users (very important!)
        setTimeout(() => {
          socketRef.current?.emit('get-room-users', roomId, (users) => {
            // ... handle users, create connections
            createConnectionsToExistingUsers(users);
          });
        }, 800);

      } catch (err) {
        logDebug("Media error during scheduled join", err);
        addAlert("Cannot access camera/microphone", "error");
      }
    };

    joinScheduledMeeting();
  }, [isExternal, validated, inRoom, roomId, userName, email, isHost]);

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

     // Prevent duplicate connections
  if (socketRef.current?.connected) {
    logDebug('Socket already connected, skipping reconnection');
    return;
  }

  // Clean up existing socket if exists
  if (socketRef.current) {
    socketRef.current.disconnect();
    socketRef.current = null;
  }

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
      addAlert('Reconnected to server', 'success');

      if (inRoom && roomId) {
        // socketRef.current.emit('join-room', ...);  ← OLD
        safeJoinRoom();  // ← NEW
      }
    });

    // Add these socket listeners (add inside your main socket useEffect)
    socketRef.current.on('waiting-users', (users) => {
      console.log("Waiting users updated:", users);
      setWaitingUsers(users);
    });

    // Add this socket handler in your Video.js
    socketRef.current.on('host-verified', (data) => {
      console.log('Host verified, joining directly...');
      setWaitingForApproval(false);
      // Join as host
      setTimeout(() => executeJoin(true), 500);
    });

    socketRef.current.on('lobby-waiting', (data) => {
      addAlert(data.message || "Waiting for host approval...", 'info');
    });

    // Add this in your socket useEffect in Video.js
    socketRef.current.on('host-direct-join', (data) => {
      console.log('Host can join directly:', data);
      setWaitingForApproval(false);

      // Trigger join process
      setTimeout(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true,
          });

          stream.getVideoTracks().forEach(t => { t._type = 'camera'; t.enabled = true; });
          stream.getAudioTracks().forEach(t => t.enabled = true);

          localStreamRef.current = stream;
          setLocalStream(stream);
          setIsVideoOn(true);
          setIsAudioOn(true);

          // Join as host
          socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, true);
          setInRoom(true);
        } catch (err) {
          console.error('Error joining as host:', err);
          addAlert('Failed to access camera/microphone', 'error');
        }
      }, 500);
    });

    socketRef.current.on('join-approved', async (data) => {
      console.log('🎉 Join approved by host:', data);
      logDebug("Join approved by host");
      addAlert("Access granted! Joining meeting...", 'success');

      // Clear waiting state
      setWaitingForApproval(false);

      try {
        console.log('Requesting media after approval...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        stream.getVideoTracks().forEach(t => {
          t._type = 'camera';
          t.enabled = true;
        });
        stream.getAudioTracks().forEach(t => t.enabled = true);

        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(true);
        setIsAudioOn(true);

        console.log('Media acquired, emitting join-room as non-host');
        // Join as non-host participant
        socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, false);
        setInRoom(true);

      } catch (err) {
        console.error("Media error after approval:", err);
        logDebug("Media error after approval: " + err.message);
        addAlert("Cannot access camera/microphone", "error");
      }
    });

    socketRef.current.on('join-denied', (data) => {
      logDebug("Join denied by host");
      addAlert(data.message || "Access denied by host", "error");
      setWaitingForApproval(false);
      setTimeout(() => navigate('/video'), 1500);
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

    // Add this socket listener for when host status is determined
    socketRef.current.on('room-users', (users) => {
      logDebug(`room-users event: ${users.length} users`, users);
      const mySocketId = socketRef.current?.id;
      const newStatus = {};
      users.forEach((u) => {
        if (u.userId === mySocketId) {
          if (u.isHost && !isHost) {
            setIsHost(true);
            setWaitingForApproval(false); // Host should never wait
            addAlert('You are the Host!', 'success');
          }
          return;
        }
        newStatus[u.userId] = {
          userName: u.userName,
          userEmail: u.userEmail,
          isHost: u.isHost,
          status: 'connected',
          streams: { camera: false, screen: false },
          videoOn: u.videoOn ?? true,
          audioOn: u.audioOn ?? true,
        };
      });
      setConnectionStatus(newStatus);
    });
    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-left', ({ userId, userName }) => handleUserLeft(userId, userName));
    socketRef.current.on('chat-message', handleChatMessage);
    socketRef.current.on('toggle-media', handleToggleMedia);
    socketRef.current.on('media-state-change', (data) => {
      const { userId, userName, videoOn, audioOn } = data;

      logDebug(`${userName || shortId(userId)} media → video: ${videoOn}, audio: ${audioOn}`);

      setConnectionStatus(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          userName: prev[userId]?.userName || userName,
          videoOn: videoOn ?? true,
          audioOn: audioOn ?? true,
        }
      }));

      // Extra safety: sync local UI if it's me
      if (userId === socketRef.current?.id) {
        if (videoOn !== undefined) setIsVideoOn(videoOn);
        if (audioOn !== undefined) setIsAudioOn(audioOn);
      }
    });
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
      console.log('data:', connectionStatus);
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
      if (socketRef.current) {
        socketRef.current.disconnect();
        console.log('Socket disconnected on cleanup 9');
        socketRef.current = null;
      }
    };
  }, [roomId, inRoom, userName, email, isHost, logDebug, addAlert, validated]);

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
    if (inRoom && !localStreamRef.current && socketRef.current?.connected) {
      joinRoom(); // One clean call
    }
  }, [inRoom, socketRef.current?.connected]);

  // Add this useEffect to request join when external user arrives
  useEffect(() => {
    if (roomId && userName && email && socketRef.current?.connected && waitingForApproval) {
      if (!isHost) {
        console.log(`Requesting host approval for: ${userName} (${email}) in room ${roomId}`);
        socketRef.current.emit('request-join', { roomId, userName, email, isHost });
      } else {
        // Host can join directly
        safeJoinRoom();
      }
    }
  }, [roomId, userName, email, waitingForApproval, socketRef.current?.connected, isHost]);
  // Add these helper functions near your other helper functions
  const approveUser = (tempId) => {
    socketRef.current.emit('approve-join', { roomId, tempId });
    setWaitingUsers(prev => prev.filter(u => u.id !== tempId));
    addAlert('User approved', 'success');
  };

  const denyUser = (tempId) => {
    socketRef.current.emit('deny-join', { roomId, tempId });
    setWaitingUsers(prev => prev.filter(u => u.id !== tempId));
    addAlert('User denied', 'info');
  };

  // Add toggle function for side panel
  const toggleSidePanel = (type) => {
    if (showSidePanel && sidePanelType === type) {
      setShowSidePanel(false);
    } else {
      setShowSidePanel(true);
      setSidePanelType(type);

      // If opening lobby, refresh waiting list
      if (type === 'lobby' && isHost) {
        socketRef.current.emit('get-waiting-users', roomId);
      }
    }
  };



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

  // useEffect(() => {
  //   console.log('12 :  const interval = setInterval')
  //   const interval = setInterval(() => {
  //     Object.keys(pendingRemoteStreams.current).forEach((userId) => {
  //       const pending = Object.values(pendingRemoteStreams.current[userId] || {}).filter((s) => s);
  //       if (pending.length > 0) {
  //         logDebug(`Pending streams for ${userId}: ${pending.length}`);
  //         Object.keys(pendingRemoteStreams.current[userId]).forEach((type) => {
  //           if (pendingRemoteStreams.current[userId][type] && peerVideoRefs.current[userId]?.[type]) {
  //             assignPeerStream(userId, type, pendingRemoteStreams.current[userId][type]);
  //           }
  //         });
  //       }
  //     });
  //   }, 5000);
  //   return () => clearInterval(interval);
  // }, [logDebug]);

  // Add this function or logic inside your Video component
  // REPLACE THE BROKEN useEffect WITH THIS ONE
  // useEffect(() => {
  //   if (!isExternal || !meetingId || !email) return;

  //   const checkAndClaimHost = async () => {
  //     try {
  //       const res = await axios.post('http://localhost:3000/api/claim-host', {
  //         meetingId,
  //         email
  //       });



  //       console.log('check host',res.data)

  //       if (res.data.isHost) {
  //         setIsHost(true);

  //         socketRef.current?.emit('claim-host', { roomId: meetingId });
  //         addAlert('You are now the Host!', 'success');
  //         logDebug('Host role claimed successfully (late join)');
  //       }
  //     } catch (err) {
  //       console.log('Not the creator or server error');
  //     }
  //   };

  //   // Check immediately + every 3 seconds (in case participants joined first)
  //   checkAndClaimHost();
  //   const interval = setInterval(checkAndClaimHost, 3000);

  //   return () => clearInterval(interval);
  // }, []);

  const createConnectionsToExistingUsers = useCallback((providedUsers = null) => {
    if (!localStreamRef.current) {
      logDebug("Cannot create connections — no local stream yet");
      return;
    }

    const doCreate = (users) => {
      if (!Array.isArray(users)) return;

      const others = users.filter(u => u.userId !== socketRef.current?.id);

      logDebug(`Creating connections to ${others.length} existing users`);

      others.forEach(user => {
        if (peersRef.current[user.userId]) return; // already have

        // Small delay → helps a lot with signaling race
        setTimeout(() => {
          if (!peersRef.current[user.userId] && localStreamRef.current) {
            const peer = createPeer(user.userId, true); // YOU initiate
            if (peer) {
              peersRef.current[user.userId] = peer;
              setPeers(p => ({ ...p, [user.userId]: peer }));
            }
          }
        }, 300 + Math.random() * 400); // tiny jitter helps
      });
    };

    if (providedUsers) {
      doCreate(providedUsers);
    } else {
      // Fallback - ask server
      socketRef.current?.emit('get-room-users', roomId, doCreate);
    }
  }, [roomId]);

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      logDebug(`Permission che ck failed: ${err.name} - ${err.message}`);
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

    // addAlert('create user');
    console.log('user', user)


    // creatorId,creatorName,creatorEmail,meetingTitle
    // const {creatorId,creatorName,creatorEmail,meetingTitle}=req.body;
    const res = await axios.post(`${API_URL}/api/instant`, {
      meetingTitle: "Instant Meeting",
      creatorId: user.id,
      // creatorName: user.name,
      // creatorEmail: user.email, 
    })

    console.log('create meeting', res.data);
    const data = res.data;

    const newRoomId = data.roomId;
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
      socketRef.current.emit('join-room', newRoomId, user.id, userName, email, true);
      setInRoom(true);
      // After acquiring stream and joining
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };

  // Add this helper function
  const shouldGoToWaitingLobby = () => {
    // If user is host, never go to waiting lobby
    if (isHost) return false;

    // If user is external, go to waiting lobby
    if (isExternal) return true;

    // For internal users, check if it's a scheduled meeting
    // This would require additional logic based on your meeting type
    return false;
  };

  const joinRoom = async () => {
    console.log('joinRoom function called');
    await safeJoinRoom();
  };


  // Main join room logic - renamed to avoid recursion
const joinRoomLogic = async () => {
  console.log('joinRoomLogic called with:', { roomId, userName, email, isHost, isExternal, validated });

  // For scheduled meetings - existing logic is fine
  if (validated && isExternal) {
    console.log('Scheduled meeting join - isHost:', isHost);
    if (isHost) {
      await executeJoin(true);
      return;
    } else {
      setWaitingForApproval(true);
      if (socketRef.current?.connected) {
        socketRef.current.emit('request-join', {
          roomId,
          userName,
          email,
          isHost: false
        });
      }
      return;
    }
  }

  // 🔥 FIXED: For instant meetings, use the existing /claim-host-instant endpoint
  if (!isExternal && !validated) {
    try {
      console.log('Checking instant meeting host status...');
      
      // Use your EXISTING endpoint
      const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
        roomId: roomId.trim(),
        email: email,
      });

      console.log('Claim host instant response:', res.data);

      if (res.data.isHost) {
        console.log('✅ User is instant meeting host, joining directly');
        setIsHost(true);
        setWaitingForApproval(false);
        await executeJoin(true);
        return;
      } else {
        console.log('❌ User is NOT instant meeting host, going to waiting lobby');
        setWaitingForApproval(true);
        if (socketRef.current?.connected) {
          socketRef.current.emit('request-join', {
            roomId,
            userName,
            email,
            isHost: false
          });
        }
        return;
      }
    } catch (err) {
      console.error('Error checking instant host status:', err);
      // Fallback to regular join
      await executeJoin(isHost);
    }
  }

  // Default case
  await executeJoin(isHost);
};

  // Add this function near your other helper functions
const showConferenceNotification = (message, type = 'info') => {
  setConferenceNotification({ message, type });
};

// Update the approveUser and denyUser functions
const handleApproveUser = (tempId) => {
  approveUser(tempId);
  const user = waitingUsers.find(u => u.id === tempId);
  showConferenceNotification(`${user?.name || 'User'} joined the meeting`, 'success');
};

const handleDenyUser = (tempId) => {
  denyUser(tempId);
  const user = waitingUsers.find(u => u.id === tempId);
  showConferenceNotification(`${user?.name || 'User'} denied access`, 'error');
};


  // Execute the actual join process
const executeJoin = async (hostStatus) => {
  console.log('executeJoin called, hostStatus:', hostStatus);

  if (!(await checkPermissions())) {
    addAlert('Camera/microphone permissions denied.', 'error');
    return;
  }

  try {
    console.log('Requesting media permissions...');
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
    console.log('Local camera stream acquired successfully.');

    // Emit join with correct host status
    socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, hostStatus);
    setInRoom(true);

    // Broadcast initial media state
    setTimeout(() => {
      socketRef.current.emit('media-state-change', {
        roomId,
        userId: socketRef.current.id,
        userName,
        videoOn: true,
        audioOn: true,
      });
    }, 1000);

    console.log('Join process completed successfully');
  } catch (err) {
    console.error('Error accessing media:', err);
    addAlert('Failed to access camera/microphone. Check permissions.', 'error');
  }
};


  // Add this helper function
  const continueJoinRoom = async (hostStatus) => {
    if (!(await checkPermissions())) {
      addAlert('Camera/microphone permissions denied.', 'error');
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
      stream.getAudioTracks().forEach((track) => (track.enabled = true));

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      logDebug('Local camera stream acquired successfully.');

      // Emit join with correct host status
      socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, hostStatus);
      setInRoom(true);

      // Broadcast initial media state
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);
    } catch (err) {
      logDebug(`Error accessing media: ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };
  const toggleVideo = async () => {
    if (!localStreamRef.current) {
      logDebug("No local stream available");
      return;
    }

    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      // ——— CASE 1: Track exists → just toggle enabled state ———
      const willEnable = !videoTrack.enabled;
      videoTrack.enabled = willEnable;
      setIsVideoOn(willEnable);

      logDebug(`Video track ${willEnable ? 'enabled' : 'disabled'} locally`);
      addAlert(`Camera ${willEnable ? 'turned on' : 'turned off'}`, 'info');

      // Sync track state across all existing peers
      Object.values(peersRef.current).forEach((peer) => {
        if (!peer?._pc) return;
        const sender = peer._pc.getSenders().find(
          (s) => s.track?.kind === 'video' && s.track?._type === 'camera'
        );
        if (sender?.track) {
          sender.track.enabled = willEnable;
          logDebug(`Updated peer ${peer._id} video track enabled = ${willEnable}`);
        }
      });

      // ——— BROADCAST CURRENT STATE TO EVERYONE (THIS FIXES UI SYNC) ———
      socketRef.current?.emit('media-state-change', {
        roomId,
        userId: socketRef.current.id,
        userName,
        videoOn: willEnable,
        audioOn: isAudioOn,
      });
    }
    else if (!isVideoOn) {
      // ——— CASE 2: No video track but user wants to turn ON → reacquire camera ———
      try {
        logDebug("Re-acquiring camera because track was removed");
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        newVideoTrack._type = 'camera';
        newVideoTrack.enabled = true;

        // Add to existing local stream
        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(localStreamRef.current);
        setIsVideoOn(true);

        // Add track to all existing peers
        Object.values(peersRef.current).forEach((peer) => {
          if (peer?._pc) {
            peer._pc.addTrack(newVideoTrack, localStreamRef.current);
            logDebug(`Added new video track to peer ${peer._id}`);
          }
        });

        // Renegotiate all peers to send the new track
        setTimeout(() => {
          Object.entries(peersRef.current).forEach(([userId, peer]) => {
            renegotiatePeer(peer, userId);
          });
        }, 300);

        addAlert("Camera turned on", "success");

        // Broadcast new state
        socketRef.current?.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: isAudioOn,
        });
      } catch (err) {
        logDebug("Failed to reacquire camera: " + err.message);
        addAlert("Failed to turn on camera", "error");
      }
    }
  };


  const toggleAudio = () => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    const willEnable = !audioTrack.enabled;
    audioTrack.enabled = willEnable;
    setIsAudioOn(willEnable);

    // Sync across peers
    Object.values(peersRef.current).forEach((peer) => {
      const sender = peer._pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender?.track) sender.track.enabled = willEnable;
    });

    addAlert(`Microphone ${willEnable ? 'unmuted' : 'muted'}`, 'info');

    // Broadcast correct state
    socketRef.current?.emit('media-state-change', {
      roomId,
      userId: socketRef.current.id,
      userName,
      videoOn: isVideoOn,
      audioOn: willEnable,
    });
  };


  const toggleScreenShare = async () => {
    // STOP if already sharing
    if (screenStreamRef.current) {
      await stopScreenShare();
      return;
    }

    try {
      const isProctorEnabled =
        participantControls[socketRef.current?.id]?.proctor || false;

      addAlert(
        isProctorEnabled
          ? 'Proctor mode requires sharing your entire screen.'
          : 'Select a screen, window, or tab to share.',
        'info'
      );

      // 1️⃣ Get display media
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: isProctorEnabled
          ? { displaySurface: 'monitor', cursor: 'never' }
          : { frameRate: 30 },
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack._type = 'screen';

      // 2️⃣ Proctor validation
      if (
        isProctorEnabled &&
        screenTrack.getSettings().displaySurface !== 'monitor'
      ) {
        screenTrack.stop();
        screenStream.getTracks().forEach(t => t.stop());
        addAlert('Proctor mode requires sharing the entire screen.', 'error');
        return;
      }

      // 3️⃣ Store refs
      screenStreamRef.current = screenStream;
      screenTrackRef.current = screenTrack;

      setScreenStream(screenStream);
      setIsScreenSharing(true);

      // 4️⃣ Clear previous screen senders completely
      Object.keys(screenSendersRef.current).forEach(peerId => {
        delete screenSendersRef.current[peerId];
      });

      // 5️⃣ Create fresh senders for each peer
      const renegotiationPromises = [];
      let hasAnyScreenSender = false;

      Object.entries(peersRef.current).forEach(([peerId, peer]) => {
        const pc = peer?._pc;
        if (!pc) return;

        // Check if there's already a screen track in the connection
        const existingScreenSender = pc.getSenders().find(s =>
          s.track?._type === 'screen'
        );

        try {
          let newSender;

          if (existingScreenSender) {
            // Replace existing screen track
            newSender = existingScreenSender;
            existingScreenSender.replaceTrack(screenTrack)
              .then(() => {
                logDebug(`Replaced screen track for ${peerId}`);
              })
              .catch(err => {
                logDebug(`replaceTrack failed, creating new sender for ${peerId}: ${err.message}`);
                // Fallback to creating new sender
                const fallbackSender = pc.addTrack(screenTrack, screenStream);
                screenSendersRef.current[peerId] = fallbackSender;
                hasAnyScreenSender = true;
              });
          } else {
            // Create new sender
            newSender = pc.addTrack(screenTrack, screenStream);
            screenSendersRef.current[peerId] = newSender;
            hasAnyScreenSender = true;
            logDebug(`Created new screen sender for peer ${peerId}`);
          }

          // Store the sender
          if (newSender && newSender.track) {
            screenSendersRef.current[peerId] = newSender;
          }

        } catch (err) {
          logDebug(`Error adding screen track to peer ${peerId}: ${err.message}`);
        }

        // Queue renegotiation
        renegotiationPromises.push(
          new Promise((resolve) => {
            setTimeout(() => {
              if (hasAnyScreenSender) {
                renegotiatePeer(peer, peerId, 0, false);
              }
              resolve();
            }, 500);
          })
        );
      });

      // Wait for renegotiations
      Promise.allSettled(renegotiationPromises).then(() => {
        logDebug('All renegotiations completed');
      });

      // 6️⃣ Notify peers
      socketRef.current?.emit('screen-share-status', {
        roomId,
        userId: socketRef.current.id,
        userName,
        userEmail: email,
        isScreenSharing: true,
      });

      addAlert('Screen sharing started.', 'success');

      // 7️⃣ Handle browser stop
      screenTrack.onended = () => {
        logDebug('Screen share ended by browser');
        stopScreenShare();
      };

    } catch (err) {
      logDebug(`Screen share error: ${err.message}`);
      addAlert('Failed to start screen sharing.', 'error');
    }
  };


  const stopScreenShare = async () => {
    if (!screenStreamRef.current) return;

    // 1. Stop all tracks in the stream
    screenStreamRef.current.getTracks().forEach(track => {
      if (track.readyState === 'live') {
        track.stop();
      }
    });

    // 2. Clean up each peer connection properly
    Object.entries(peersRef.current).forEach(([peerId, peer]) => {
      if (!peer?._pc) return;

      try {
        // Find the screen sender
        const senders = peer._pc.getSenders();
        const screenSender = senders.find(s =>
          s.track?._type === 'screen' ||
          (s.track && s.track.id === screenTrackRef.current?.id)
        );

        if (screenSender) {
          // Important: Replace with null track FIRST
          screenSender.replaceTrack(null).catch(() => { });

          // Remove the sender from the peer connection
          peer._pc.removeTrack(screenSender);
          logDebug(`Removed screen sender for peer ${peerId}`);
        }

        // Also remove from our ref
        delete screenSendersRef.current[peerId];

        // Renegotiate to clean up
        setTimeout(() => {
          renegotiatePeer(peer, peerId, 0, true);
        }, 500);
      } catch (err) {
        logDebug(`Error cleaning up screen sender for ${peerId}: ${err.message}`);
      }
    });

    // 3. Clear refs
    screenStreamRef.current = null;
    screenTrackRef.current = null;
    screenSendersRef.current = {}; // Clear ALL, don't keep null references

    // 4. Update state
    setScreenStream(null);
    setIsScreenSharing(false);

    // 5. Notify peers
    socketRef.current?.emit('screen-share-status', {
      roomId,
      userId: socketRef.current?.id,
      userName,
      userEmail: email,
      isScreenSharing: false,
    });

    addAlert('Screen sharing stopped.', 'info');
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
      }, 500);

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

    // Create peer WITHOUT stream initially
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

      peer._candidateCache = new Set(); // Per-peer cache


    // 🔥 FIX: If screen sharing is already active, attach screen to NEW peer
    if (screenStreamRef.current && screenTrackRef.current) {
      try {
        const pc = peer._pc;

        const sender = pc.addTrack(
          screenTrackRef.current,
          screenStreamRef.current
        );

        screenSendersRef.current[userId] = sender;

        logDebug(`Attached ACTIVE screen track to late-joining peer ${userId}`);

        // 🔥 Force renegotiation so new peer receives screen
        setTimeout(() => {
          renegotiatePeer(peer, userId, 0, true);
        }, 1300);

      } catch (err) {
        logDebug(`Failed to attach screen to peer ${userId}: ${err.message}`);
      }
    }


    // Manually add all tracks to the peer connection
    const addAllTracksToPeer = () => {
      if (!localStreamRef.current) return;

      try {
        // Add all video tracks from local stream
        const videoTracks = localStreamRef.current.getVideoTracks();
        videoTracks.forEach(track => {
          if (track.readyState === 'live') {
            peer._pc.addTrack(track, localStreamRef.current);
            logDebug(`Added video track to peer ${userId}: ${track._type || 'camera'} (${track.id})`);
          }
        });

        // Add all audio tracks from local stream
        const audioTracks = localStreamRef.current.getAudioTracks();
        audioTracks.forEach(track => {
          if (track.readyState === 'live') {
            peer._pc.addTrack(track, localStreamRef.current);
            logDebug(`Added audio track to peer ${userId}: ${track.id}`);
          }
        });

        logDebug(`Total tracks added to peer ${userId}: ${videoTracks.length} video, ${audioTracks.length} audio`);
      } catch (err) {
        logDebug(`Error adding tracks to peer ${userId}: ${err.message}`);
      }
    };

    // Add tracks after peer is created
    // setTimeout(addAllTracksToPeer, 100);

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

      // Store the stream for later use
      if (!peersRef.current[userId]._remoteStreams) {
        peersRef.current[userId]._remoteStreams = {};
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
            peersRef.current[userId]._remoteStreams.audio = audioStream;
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
          peersRef.current[userId]._remoteStreams[streamType] = singleTrackStream;
          setConnectionStatus((prev) => ({
            ...prev,
            [userId]: {
              ...prev[userId],
              streams: {
                ...prev[userId]?.streams,
                [streamType]: true,
              },
            },
          }));
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
      logDebug(`❌ Failed to  create peer for ${userId}, queuing...`);
      pendingPeerCreations.current[userId] = { userName, userEmail, isUserHost };
      return;
    }

    setPeers((prev) => ({ ...prev, [userId]: peer }));
    addAlert(`${userName} joined the meeting.`, 'info');

    // Notify new user about screen sharing status if we're sharing
    if (isScreenSharing) {
      setTimeout(() => {
        socketRef.current?.emit('screen-share-status', {
          roomId,
          userId: socketRef.current.id,
          userName,
          userEmail: email,
          isScreenSharing: true,
        });
        logDebug(`Notified new user ${userId} about screen sharing status`);
      }, 1000);
    }
  };

  // Add this function near your other helper functions
  const broadcastScreenShareToAll = useCallback(() => {
    if (!isScreenSharing || !screenShareTrackRef.current) return;

    Object.entries(peersRef.current).forEach(([userId, peer]) => {
      if (peer && peer._pc && peer._pc.signalingState !== 'closed') {
        try {
          const existingScreenSender = peer._pc.getSenders().find(
            (s) => s.track?._type === 'screen'
          );

          if (!existingScreenSender && screenShareTrackRef.current) {
            peer._pc.addTrack(screenShareTrackRef.current, screenStream || localStreamRef.current);
            logDebug(`Added screen track to peer ${userId} in broadcast`);

            setTimeout(() => {
              renegotiatePeer(peer, userId, 0, false);
            }, 300);
          }
        } catch (err) {
          logDebug(`Error broadcasting screen to peer ${userId}: ${err.message}`);
        }
      }
    });
  }, [isScreenSharing, screenStream, screenShareTrackRef.current]);

  // Add this useEffect to broadcast screen share when new users join
  useEffect(() => {
    if (isScreenSharing && Object.keys(peers).length > 0) {
      // When peers change (new user joins), broadcast screen share
      const timer = setTimeout(() => {
        broadcastScreenShareToAll();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [peers, isScreenSharing, broadcastScreenShareToAll]);

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}: ${JSON.stringify(data.signal).slice(0, 100)}...`);

    // CRITICAL FIX: Wait for local stream before processing offer
    const processOffer = async () => {
      // If local stream is not ready, wait for it
      if (!localStreamRef.current) {
        logDebug(`⏳ Local stream not ready for offer from ${data.from}, waiting...`);

        // Wait up to 5 seconds for local stream
        let attempts = 0;
        while (!localStreamRef.current && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 300));
          attempts++;
        }

        if (!localStreamRef.current) {
          logDebug(`❌ Local stream still not ready after 5 seconds, queuing offer...`);
          // Queue the offer for later processing
          if (!pendingCandidates.current[data.from]) {
            pendingCandidates.current[data.from] = [];
          }
          pendingCandidates.current[data.from].push(data.signal);
          return;
        }
      }

      // Now process the offer with local stream available
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

    processOffer();
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
      try {
        peer.signal({ candidate: data.candidate });
        logDebug(`Applied ICE candidate from ${data.from}`);
      } catch (err) {
        logDebug(`Error applying ICE candidate from ${data.from}: ${err.message}`);
        // Queue it for retry
        if (!pendingCandidates.current[data.from]) {
          pendingCandidates.current[data.from] = [];
        }
        pendingCandidates.current[data.from].push({ candidate: data.candidate });
      }
    } else {
      logDebug(`Peer not ready for ICE candidate from ${data.from}, queuing...`);

      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }

      pendingCandidates.current[data.from].push({ candidate: data.candidate });

      // Increase queue limit for production
      if (pendingCandidates.current[data.from].length > 50) {
        pendingCandidates.current[data.from] = pendingCandidates.current[data.from].slice(-30);
        logDebug(`Trimmed ICE candidate queue for ${data.from} to 30 items`);
      }
    }
  };

  const handleUserLeft = (userId, serverName) => {
    console.log('server name', serverName)
    const displayName = serverName || connectionStatus[userId]?.userName ||
      participantControls[userId]?.userName ||
      shortId(userId);
    console.log('user left name', displayName)
    console.log("== DEBUG USER LEFT ==");
    console.log("connectionStatus:", connectionStatus[userId]);
    console.log("participantControls:", participantControls[userId]);
    console.log("shortId:", shortId(userId));
    console.log("Final Name:", displayName);
    console.log("================================");

    // logDebug(`User left: ${displayName}`);
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
    addAlert(`${displayName} left the meeting.`, 'info');
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

  const handleToggleMedia = useCallback((data) => {
    const { userId, video, audio } = data;

    logDebug(`Media state sync: ${shortId(userId)} → video=${video}, audio=${audio}`);

    // UPDATE UI FOR EVERYONE (this is the key!)
    setConnectionStatus(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        videoOn: video ?? prev[userId]?.videoOn ?? true,
        audioOn: audio ?? prev[userId]?.audioOn ?? true,
      }
    }));

    // ONLY IF this is for ME → apply to local tracks
    if (userId === socketRef.current?.id && localStreamRef.current) {
      if (video !== undefined) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = video;
          setIsVideoOn(video);
        }
      }
      if (audio !== undefined) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = audio;
          setIsAudioOn(audio);
        }
      }
    }
  }, [logDebug]);

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

    // Only allow host to TURN OFF (disable) video/audio — never turn ON
    const shouldDisable = type === 'video' || type === 'audio';

    // For video/audio: always force OFF. For proctor: toggle normally
    const newVal = type === 'proctor'
      ? !participantControls[userId]?.proctor
      : false; // always false = force off

    setParticipantControls((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        video: type === 'video' ? false : prev[userId]?.video ?? true,
        audio: type === 'audio' ? false : prev[userId]?.audio ?? true,
        proctor: type === 'proctor' ? newVal : prev[userId]?.proctor ?? false,
      },
    }));

    // Immediately update host UI to reflect forced-off state
    if (type === 'video' || type === 'audio') {
      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          videoOn: type === 'video' ? false : prev[userId]?.videoOn,
          audioOn: type === 'audio' ? false : prev[userId]?.audioOn,
        },
      }));
    }

    // Send command to participant
    socketRef.current.emit('toggle-media', {
      roomId,
      userId,
      video: type === 'video' ? false : undefined,
      audio: type === 'audio' ? false : undefined,
    });

    // For proctor mode,changes this dec17 for username and useremail
    if (type === 'proctor') {
      socketRef.current.emit('toggle-proctor', {
        roomId,
        userId,
        userName: connectionStatus[userId]?.userName,
        userEmail: connectionStatus[userId]?.userEmail,
        proctor: newVal,
      });
    }

    addAlert(
      type === 'proctor'
        ? `Proctor mode ${newVal ? 'enabled' : 'disabled'} for ${connectionStatus[userId]?.userName || shortId(userId)}`
        : `${type === 'video' ? 'Camera' : 'Microphone'} turned OFF for ${connectionStatus[userId]?.userName || shortId(userId)}`,
      'info'
    );
  };


  // Add this function near your other helper functions (around line ~300)
  const cleanupAllPeers = useCallback(() => {
    logDebug('🧹 Starting comprehensive peer cleanup...');

    // 1. Destroy all peer connections
    Object.entries(peersRef.current).forEach(([userId, peer]) => {
      if (peer && typeof peer.destroy === 'function') {
        try {
          peer.destroy();
          logDebug(`Destroyed peer connection for ${userId}`);
        } catch (err) {
          logDebug(`Error destroying peer ${userId}: ${err.message}`);
        }
      }
    });

    // 2. Clear all peer refs
    peersRef.current = {};
    setPeers({});

    // 3. Clear peer video refs and stop their streams
    Object.keys(peerVideoRefs.current).forEach(userId => {
      if (peerVideoRefs.current[userId]) {
        if (peerVideoRefs.current[userId].camera) {
          const videoEl = peerVideoRefs.current[userId].camera;
          if (videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(track => track.stop());
            videoEl.srcObject = null;
          }
        }
        if (peerVideoRefs.current[userId].screen) {
          const videoEl = peerVideoRefs.current[userId].screen;
          if (videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(track => track.stop());
            videoEl.srcObject = null;
          }
        }
      }
    });
    peerVideoRefs.current = {};

    // 4. Clear all pending data
    pendingRemoteStreams.current = {};
    pendingCandidates.current = {};
    renegotiationQueue.current = {};
    videoStreamCount.current = {};
    pendingPeerCreations.current = {};

    // 5. Clear connection status for all remote users
    setConnectionStatus(prev => {
      // Keep only local user status if exists
      const localUserId = socketRef.current?.id;
      if (localUserId && prev[localUserId]) {
        return { [localUserId]: prev[localUserId] };
      }
      return {};
    });

    // 6. Clear participant controls for remote users
    setParticipantControls(prev => {
      const localUserId = socketRef.current?.id;
      if (localUserId && prev[localUserId]) {
        return { [localUserId]: prev[localUserId] };
      }
      return {};
    });

    logDebug('✅ Peer cleanup completed');
  }, [logDebug]);

 const leaveRoom = () => {
    // window.location.reload();
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    cleanupAllPeers();

    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }

    // Destroy all peers
    Object.values(peersRef.current).forEach(peer => {
      if (peer && typeof peer.destroy === 'function') {
        peer.destroy();
      }
    });
    peersRef.current = {};
    setPeers({});

    // Clear pending streams & refs
    pendingRemoteStreams.current = {};
    pendingCandidates.current = {};
    renegotiationQueue.current = {};
    videoStreamCount.current = {};
    detectionIntervals.current = {};
    pendingPeerCreations.current = {};
    hasJoinedRef.current = false;
    isJoiningRef.current = false;
    screenShareActiveRef.current = false;
    screenShareTrackRef.current = null;

    // Properly disconnect socket
    if (socketRef.current) {
      socketRef.current.off(); // Remove all listeners
      socketRef.current.disconnect();
      console.log('Socket disconnected leaveroom');
      socketRef.current = null;
    }

    // Reset video refs
    if (userVideoRef.current.camera) userVideoRef.current.camera.srcObject = null;
    if (userVideoRef.current.screen) userVideoRef.current.screen.srcObject = null;
    Object.keys(peerVideoRefs.current).forEach(userId => {
      if (peerVideoRefs.current[userId]) {
        if (peerVideoRefs.current[userId].camera) {
          peerVideoRefs.current[userId].camera.srcObject = null;
        }
        if (peerVideoRefs.current[userId].screen) {
          peerVideoRefs.current[userId].screen.srcObject = null;
        }
      }
    });
    peerVideoRefs.current = {};

    // Reset all state
    setInRoom(false);
    setIsHost(false);
    setConnectionStatus({});
    setParticipantControls({});
    setMessages([]);
    setAlerts([]);
    setIsVideoOn(true);
    setIsAudioOn(true);
    setIsScreenSharing(false);
    setCurrentVideoPage(1);
    setTotalVideoPages(1);


    // Optional: Force re-render by resetting roomId temporarily
    // This clears the input field and forces fresh join
    setRoomId('');

    addAlert('You have left the meeting.', 'info');

    // navigate('/video'); 

    console.log('validity', validated);
    console.log('isExternal', isExternal);

    if (isExternal && validated) {
      window.location.reload();
      navigate(`/join/${meetingId}`, { replace: true });
    } else {
      
      navigate('/video', { replace: true });
    }

    // Alert.alert(
    //   'Left Meeting',
    //   'You have left the meeting.', 
    // );



    //  navigate(`/join/${meetingId}`, { replace: true ,validated: false});

    // if(validated){
    //    window.location.reload();
    //   console.log('meetingId', meetingId);
    //   navigate(`/join/${meetingId}`);
    //   window.location.reload();

    // }

    // else{
    //    window.location.reload();
    //   console.log('navigating to video');
    //   // navigate('/video');
    // }
    // window.location.reload();
    //    if (validated) {
    //   console.log('meetingId', meetingId);
    //   navigate(`/join/${meetingId}`, { replace: true });
    // } else {
    //   navigate('/video', { replace: true });
    // }
    // Critical: Navigate to clean state or force remount
    // if(!validated){
    //navigate('/video'); // This should trigger fresh JoinRoom
    // }
    // else{ 
    // console.log('meetingId', meetingId);
    // // navigate(`/join/${meetingId}`); // This should trigger fresh JoinRoom
    // window.location.reload();
    // }
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

      {waitingForApproval ? (
        <WaitingLobby
          userName={userName}
          roomId={roomId}
        />
      ) : !inRoom ? (
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
          addAlert={addAlert}
        />
      ) : (
        <div className="conference-room">
          {/* Conference Notification */}
          {conferenceNotification && (
            <ConferenceNotification
              message={conferenceNotification.message}
              type={conferenceNotification.type}
              onClose={() => setConferenceNotification(null)}
            />
          )}

          <MeetingHeader
            roomId={roomId}
            isHost={isHost}
            peers={peers}
            waitingUsers={waitingUsers}
            showSidePanel={showSidePanel}
            sidePanelType={sidePanelType}
            toggleSidePanel={toggleSidePanel}
            logout={logout}
            isExternal={isExternal}
            leaveRoom={leaveRoom}
          />

          <div className="main-content">
            <div className="video-container">
              <VideoLayout
                isAnyScreenSharing={isAnyScreenSharing}
                isScreenSharing={isScreenSharing}
                peers={peers}
                connectionStatus={connectionStatus}
                participantControls={participantControls}
                isHost={isHost}
                toggleParticipantMedia={toggleParticipantMedia}
                peerVideoRefs={peerVideoRefs}
                pendingRemoteStreams={pendingRemoteStreams}
                peersRef={peersRef}
                shortId={shortId}
                userName={userName}
                isVideoOn={isVideoOn}
                isAudioOn={isAudioOn}
                currentVideoPage={currentVideoPage}
                totalVideoPages={totalVideoPages}
                navigateVideoPage={navigateVideoPage}
                getCurrentPageCameraVideos={getCurrentPageCameraVideos}
                localStreamRef={localStreamRef}
                logDebug={logDebug}
                userVideoRef={userVideoRef}
              />
            </div>

            {/* Side Panel */}
            {showSidePanel && (
              sidePanelType === 'chat' ? (
                <ChatPanel
                  showChat={true}
                  setShowChat={() => setShowSidePanel(false)}
                  messages={messages}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  sendChatMessage={sendChatMessage}
                  socketRef={socketRef}
                  userName={userName}
                />
              ) : (
                <LobbyPanel
                  waitingUsers={waitingUsers}
                  approveUser={handleApproveUser}
                  denyUser={handleDenyUser}
                  setShowSidePanel={setShowSidePanel}
                />
              )
            )}
          </div>

          <footer className="bottom-bar">
            <VideoControls
              toggleVideo={toggleVideo}
              toggleAudio={toggleAudio}
              toggleScreenShare={toggleScreenShare}
              leaveRoom={leaveRoom}
              isVideoOn={isVideoOn}
              isAudioOn={isAudioOn}
              isScreenSharing={isScreenSharing}
              logout={logout}
              isExternal={isExternal}
            />
          </footer>

          <DebugPanel
            showDebug={showDebug}
            debugLog={debugLog}
          />
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

  /* Add to your existing CSS */
.lobby-button {
  position: relative;
}

/* Fix for the Lobby Panel User Row */
.chat-message {
  display: flex !important;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 100% !important; /* Overriding your 90% own-message rule */
  background: #24244a;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* Fix for initials icon compression */
.initials-avatar-lobby {
  width: 36px;
  height: 36px;
  flex-shrink: 0; /* CRITICAL: Prevents squashing */
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* Fix for long emails breaking the layout */
.user-info-text {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-left: 10px;
}

.user-info-text div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* Adds the "..." to long emails */
  max-width: 120px; /* Adjust based on your side panel width */
}

.notification-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ff4757;
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.side-panel {
  width: 320px;
  background: #2d2d40;
  border-left: 1px solid #3a3a52;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
}

/* For LobbyPanel specific styling */
.waiting-user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3a3a52;
  transition: background 0.2s;
}

.waiting-user-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-actions {
  display: flex;
  gap: 8px;
}

.approve-btn {
  background: #00b894 !important;
  color: white !important;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.deny-btn {
  background: #ff4757 !important;
  color: white !important;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
    .text-danger { color: #ff4444 !important; }
.text-success { color: #00C851 !important; }

  /* Alert styles remain the same */
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
  .alert-close:hover { opacity: 1; }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Main Layout Container */
  .video-layout-container {
    display: flex;
    gap: 20px;
    height: 100%;
    padding: 20px;
  }

  /* Screen Share Section - Left Side */
  .screen-share-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 70%;
  }

  .screen-share-item {
    width: 100%;
    background: #000;
    border: 3px solid var(--accent-blue);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 183, 235, 0.4);
    overflow: hidden;
  }

  .screen-share-video {
    aspect-ratio: 16 / 9;
    width: 100%;
  }

  .screen-element {
    object-fit: contain;
    background: #000;
    border-radius: 8px;
    width: 100%;
    height: 100%;
  }

  .local-screen-share {
    border-color: var(--success);
  }

  .screen-share-item .video-overlay {
    background: linear-gradient(to top, rgba(0, 183, 235, 0.3), transparent);
    padding: 12px;
  }

  .screen-share-item .video-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--accent-blue);
  }

  .redirecting-container {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--primary-bg);
        }
        .redirecting-message {
          text-align: center;
          color: var(--text-color);
          font-size: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .redirecting-message i {
          font-size: 24px;
          color: var(--accent-blue);
        }
        .redirecting-message p {
          margin: 0;
          opacity: 0.8;
        }

  

  /* Camera Videos Section - Right Side */
  .camera-videos-section {
    flex: 1;
    display: grid;
    // grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    max-width: 25%;
   
    padding: 10px;
  }

  /* When NO screen sharing - Full screen camera layout */
  .video-gallery.no-screen-share .video-layout-container {
    display: block;
  }

  .video-gallery.no-screen-share .camera-videos-section {
    max-width: 100%;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    padding: 0;
  }

  /* When screen sharing IS active - Side by side layout */
.video-gallery.has-screen-share .camera-videos-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

  /* Video item common styles */
  .video-item {
    background: #1c1c38;
    border-radius: 10px;
    overflow: hidden;
    transition: transform 0.2s;
    position: relative;
  }

  .video-item:hover {
    transform: scale(1.02);
  }
.video-item.local-video .video-element {
  background: #000 !important;
}

 .video-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
}
  .video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
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
    z-index:5;
  }

  .video-name {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .video-status {
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .video-status span {
    color: #a0a0c0;
  }

  .proctor-controls {
    display: flex;
    gap: 4px;
    margin-right: auto;
  }

 .text-danger { color: #ff4444 !important; }
.text-success { color: #00c851 !important; }
.proctor-controls button {
  background: rgba(255,255,255,0.1);
  padding: 4px 6px;
  border-radius: 4px;
}
.proctor-controls button:hover {
  background: rgba(255,255,255,0.2);
}

  /* Chat panel - smaller width */
  .side-panel {
    width: 250px;
    background: var(--secondary-bg);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    height: 100%; /* Add this */
  }

  .side-panel.open {
    transform: translateX(0);
  }

  .chat-messages-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Important for flexbox scrolling */
  margin-bottom: 12px;
  overflow: hidden; /* Contain the scrolling */
}
  .chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
      height: 100%; /* Add this */
    padding: 12px;
      min-height: 0; 
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
      flex-shrink: 0;
  }

  .chat-header h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  .chat-header button {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-color);
    opacity: 0.7;
  }

  .chat-header button:hover { opacity: 1; }

 .chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background: #1c1c38;
  border-radius: 6px;
  /* Hide scrollbar for Chrome, Safari and Opera */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

  
 .chat-message {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #24244a;
  max-width: 90%;
  font-size: 12px;
  word-wrap: break-word;
}
  .chat-message.own-message {
  background: var(--accent-blue);
  margin-left: auto;
}

  .chat-meta {
  display: flex;
  gap: 4px;
  align-items: baseline;
  margin-bottom: 2px;
}

  .chat-sender {
    font-weight: 500;
    color: var(--accent-purple);
    font-size: 11px;
  }

  .chat-time {
    color: #a0a0c0;
    font-size: 10px;
  }

 .chat-text {
  font-size: 12px;
  word-wrap: break-word;
  line-height: 1.3;
}

.chat-input {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.chat-input input {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  background: #24244a;
  color: var(--text-color);
}
  .chat-input input:focus {
    border-color: var(--accent-blue);
    outline: none;
  }

  .chat-input button {
  padding: 8px 10px;
  background: var(--accent-blue);
  color: var(--text-color);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.chat-input button:hover {
  background: var(--accent-purple);
}

  /* Rest of your existing styles... */
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

  .join-buttons button:hover { opacity: 0.9; }

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

  .top-controls button:hover { background: #2e2e4b; }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .video-container {
    flex: 1;
    background: #000;
    overflow: auto;
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

  .controls button:hover { background: #2e2e4b; }
  .controls button.disabled { color: var(--error); border-color: var(--error); }
  .controls button.sharing { color: var(--success); border-color: var(--success); }

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

 .slides-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 20px;
  margin: 10px auto;
  max-width: 150px;
  order: 999; /* Ensure it appears at the bottom */
}


.initials-avatar {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-weight: 700;
  border-radius: 10px;
  z-index: 2;
  user-select: none;
}

.initials-text {
  font-size: 2.8rem;
  letter-spacing: 2px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

.avatar-status {
  font-size: 0.8rem;
  margin-top: 8px;
  opacity: 0.9;
  font-weight: 500;
}

/* Smaller when screen sharing */
.has-screen-share .initials-text {
  font-size: 2rem;
}
.has-screen-share .avatar-status {
  font-size: 0.7rem;
}

.slide-counter {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-blue);
  min-width: 60px;
  text-align: center;
}

.slide-nav-btn {
  background: var(--accent-blue);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  font-size: 12px;
  transition: background-color 0.2s;
}

.slide-nav-btn:hover {
  background: var(--accent-purple);
}

.slide-nav-btn:disabled {
  background: var(--border);
  cursor: not-allowed;
  opacity: 0.5;
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
    .video-layout-container {
      flex-direction: column;
      gap: 15px;
    }
    .screen-share-section {
      max-width: 100%;
    }
    .camera-videos-section {
      max-width: 100%;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
    .camera-videos-section {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .video-layout-container {
      padding: 10px;
      gap: 10px;
    }
  }
     @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        /* Active state for header buttons */
        .top-controls button.active {
          background: var(--accent-blue);
          color: white;
        }

        /* Ensure buttons in header are properly sized */
        .top-controls button {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        
}`}
        </style>
      </div>
    </ErrorBoundary>
  );
};

export default Video;

// feb 12 2026

//updated code of UI related

//jan9 4.45 working code for rejoin too in scheduling

import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';
import { AuthContext } from './AuthContext';
import SchedulePage from './SchedulePage';
import JoinRoom from './JoinRoom';

import axios from 'axios';
import { set } from 'date-fns';

// Import Components
import Alert from './Alert';
import VideoControls from './VideoControls';
import ChatPanel from './ChatPanel';
import MeetingHeader from './MeetingHeader';
import VideoLayout from './VideoLayout';
import DebugPanel from './DebugPanel';
import WaitingLobby from './lobby/WaitingLobby';
import LobbyPanel from './lobby/LobbyPanel';
import ConferenceNotification from './notifications/ConferenceNotification';



// const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';
// const API_URL = "https://livemeet-ribm.onrender.com";

const SIGNALING_SERVER_URL = 'http://localhost:3000';
const API_URL = "http://localhost:3000";



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

// const Alert = ({ message, type, onClose }) => {
//   useEffect(() => {
//     const timer = setTimeout(onClose, 5000);
//     return () => clearTimeout(timer);
//   }, [onClose]);

//   return (
//     <div className={`alert alert-${type}`}>
//       {message}
//       <button onClick={onClose} className="alert-close">×</button>
//     </div>
//   );
// };

const Video = ({ isExternal = false, meetingId, userEmail, userName: propUserName, isHostM, validated = false }) => {
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
  const [pendingPeerStreams, setPendingPeerStreams] = useState({});
  const [currentVideoPage, setCurrentVideoPage] = useState(1);
  const [totalVideoPages, setTotalVideoPages] = useState(1);
  const [conferenceNotification, setConferenceNotification] = useState(null);

  // Add these new states near your other useState declarations
  // New: All non-host users wait (except if already validated as host)
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [sidePanelType, setSidePanelType] = useState('chat'); // 'chat' or 'lobby'

  const isAnyScreenSharing = isScreenSharing ||
    Object.values(connectionStatus).some(status => status?.streams?.screen === true);

  // Keep all the existing refs (they remain the same)
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
  const cameraSendersRef = useRef({});
  const cameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const screenSendersRef = useRef({});
  const videoSenderRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingPeerCreations = useRef({});
  const hasJoinedRef = useRef(false);
  const isJoiningRef = useRef(false);


  // const [currentVideoPage, setCurrentVideoPage] = useState(1);
  // const [totalVideoPages, setTotalVideoPages] = useState(1);



  const safeJoinRoom = async () => {
    // If user is host OR validated as creator, allow direct join
    if (!isHost && waitingForApproval) {
      // Check if this is an instant meeting creator trying to rejoin
      if (!isExternal && !validated) {
        try {
          // Use the existing endpoint
          const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
            roomId: roomId.trim(),
            email: email,
          });

          if (res.data.isHost) {
            console.log("✅ Instant meeting creator detected - allowing direct join");
            setIsHost(true);
            setWaitingForApproval(false);
            await executeJoin(true);
            return;
          }
        } catch (err) {
          console.log("Not the creator:", err.message);
        }
      }

      console.log("Blocked direct join — user must wait for host approval");
      addAlert("Waiting for host approval. You cannot join directly.", "info");
      return;
    }

    // Only proceed if host or already approved
    await joinRoomLogic();
  };


  // Initials helper
  const getInitials = (name = '') => {
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  };

  // Navigation functions for video pages
  const navigateVideoPage = (direction) => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) return;

    setCurrentVideoPage(prev => {
      if (direction === 'next') {
        return prev >= totalVideoPages ? 1 : prev + 1;
      } else {
        return prev <= 1 ? totalVideoPages : prev - 1;
      }
    });
  };

  useEffect(() => {
    // Check if we're joining from scheduled meetings
    const joiningData = sessionStorage.getItem('joiningMeeting');
    if (joiningData && isExternal) {
      const data = JSON.parse(joiningData);
      setRoomId(data.roomId);
      setUserName(data.userName);
      setEmail(data.userEmail);
      setIsHost(data.isHost);
      setInRoom(true);


      sessionStorage.removeItem('joiningMeeting');
    }
  }, [isExternal]);


  useEffect(() => {
    if (!isAnyScreenSharing) {
      setCurrentVideoPage(1);
      setTotalVideoPages(1);
      return;
    }

    // Count ALL camera videos including local user
    const cameraVideoCount = 1 + Object.keys(peers).length; // Local user + all peers

    // Fixed number of videos per page/column
    const VIDEOS_PER_PAGE = 3;

    // Calculate total pages needed
    const calculatedTotalPages = Math.ceil(cameraVideoCount / VIDEOS_PER_PAGE);
    setTotalVideoPages(calculatedTotalPages);

    // Ensure current page is within bounds
    if (currentVideoPage > calculatedTotalPages) {
      setCurrentVideoPage(calculatedTotalPages || 1);
    }
  }, [peers, isAnyScreenSharing, currentVideoPage]);

  // Update the function to get videos for current page - include local video
  const getCurrentPageCameraVideos = () => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) {
      // Return all videos when no screen sharing or only one page
      const allVideos = ['local', ...Object.keys(peers)];
      return allVideos;
    }

    const VIDEOS_PER_PAGE = 3;
    const startIndex = (currentVideoPage - 1) * VIDEOS_PER_PAGE;
    const endIndex = startIndex + VIDEOS_PER_PAGE;

    // Get ALL video IDs including local
    const allVideoIds = ['local', ...Object.keys(peers)];
    return allVideoIds.slice(startIndex, endIndex);
  };

  // Add this function to ensure all peer streams are properly managed
  const ensurePeerStreams = useCallback(() => {
    Object.keys(peersRef.current).forEach(userId => {
      if (userId === 'local') return;

      // Ensure peer video refs exist
      if (!peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId] = {};
      }

      // Check if there are pending streams for this peer
      if (pendingRemoteStreams.current[userId]) {
        Object.keys(pendingRemoteStreams.current[userId]).forEach(streamType => {
          const stream = pendingRemoteStreams.current[userId][streamType];
          if (stream && peerVideoRefs.current[userId]?.[streamType]) {
            assignPeerStream(userId, streamType, stream);
          }
        });
      }
    });
  }, []);

  // Call this function whenever the current page changes
  useEffect(() => {
    if (isAnyScreenSharing) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        ensurePeerStreams();
      }, 100);
    }
  }, [currentVideoPage, isAnyScreenSharing, ensurePeerStreams]);

  // Also call when peers change
  useEffect(() => {
    if (isAnyScreenSharing) {
      ensurePeerStreams();
    }
  }, [peers, isAnyScreenSharing, ensurePeerStreams]);

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

    // 🔥 FIX: Also remove screen track from local stream
    if (localStreamRef.current) {
      const screenTrack = localStreamRef.current.getVideoTracks().find(t => t._type === 'screen');
      if (screenTrack) {
        localStreamRef.current.removeTrack(screenTrack);
        screenTrack.stop();
        logDebug('Removed screen track from local stream');
      }
    }

    const cleanupPromises = Object.entries(peersRef.current).map(async ([peerId, peer]) => {
      if (peer && peer._pc) {
        try {
          // 🔥 FIX: Also look for _isScreen property
          const screenSender = peer._pc.getSenders().find((s) =>
            s.track?._type === 'screen' || s.track?._isScreen === true
          );
          if (screenSender) {
            // 🔥 FIX: Replace with null track to properly remove
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

  // First, update this useEffect where you set isHost for scheduled meetings
  useEffect(() => {
    if ((isExternal && isHostM !== undefined) || validated) {
      console.log('isHost set from isHostM1:', isHostM);
      setIsHost(!!isHostM);

      // CRITICAL: If user is host, they should NOT wait for approval
      if (isHostM) {
        setWaitingForApproval(false);
      }
    }
  }, [isHostM, isExternal, validated]);

  useEffect(() => {
    if ((isExternal && isHostM !== undefined) || validated) {
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


  // Add this useEffect to handle local video stream assignment
  useEffect(() => {
    if (isAnyScreenSharing && localStreamRef.current && userVideoRef.current.camera) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const videoElement = userVideoRef.current.camera;
        if (videoElement && !videoElement.srcObject && localStreamRef.current) {
          videoElement.srcObject = localStreamRef.current;
          videoElement.play().catch((err) => {
            logDebug(`Error playing local stream after page change: ${err.message}`);
          });
          logDebug(`Reassigned local stream after page change to page ${currentVideoPage}`);
        }
      }, 50);
    }
  }, [currentVideoPage, isAnyScreenSharing, logDebug]);


  // Replace the autoJoin useEffect with this:
  // In Video.js, update the auto-join logic
  useEffect(() => {
    const autoJoin = async () => {
      if (isExternal && roomId && userName && email && validated && !inRoom) {
        console.log('✅ Auto-joining validated user:', { userName, email, isHost });

        // 🔥 FIX: For instant meetings, check host status first
        if (isHost) {
          console.log('🎯 User is HOST, joining directly');
          const hasPermissions = await checkPermissions();
          if (!hasPermissions) {
            addAlert('Camera/microphone permissions required for host', 'error');
            return;
          }
          await executeJoin(true);
        } else {
          // For instant meetings, we need to check if they're the creator
          try {
            const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
              roomId: roomId.trim(),
              email: email,
            });

            if (res.data.isHost) {
              console.log('🎯 Instant meeting creator detected, joining as host');
              setIsHost(true);
              setWaitingForApproval(false);
              await executeJoin(true);
              return;
            }
          } catch (err) {
            console.log('Not instant meeting creator:', err.message);
          }

          console.log('⏳ User is PARTICIPANT, going to waiting lobby');
          setWaitingForApproval(true);
          if (socketRef.current?.connected) {
            socketRef.current.emit('request-join', {
              roomId,
              userName,
              email,
              isHost: false
            });
          }
        }
      }
    };

    const timer = setTimeout(() => {
      autoJoin();
    }, 1000);

    return () => clearTimeout(timer);
  }, [isExternal, roomId, userName, email, isHost, validated, inRoom]);


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


  // In the useEffect that handles auto-join / rejoin for scheduled meetings
  useEffect(() => {
    if (!isExternal || !validated || !inRoom || localStreamRef.current) return;

    const joinScheduledMeeting = async () => {
      try {
        // 1. First get media — very important order!
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        // Tag & prepare
        stream.getVideoTracks().forEach(t => { t._type = 'camera'; t.enabled = true; });
        stream.getAudioTracks().forEach(t => { t.enabled = true; });

        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(true);
        setIsAudioOn(true);

        logDebug("✓ Stream acquired before join");

        // 2. Now safely join
        if (socketRef.current?.connected) {
          //socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, isHost);
          await safeJoinRoom();
          logDebug("→ join-room emitted AFTER stream ready");
        }

        // 3. Then ask for current users (very important!)
        setTimeout(() => {
          socketRef.current?.emit('get-room-users', roomId, (users) => {
            // ... handle users, create connections
            createConnectionsToExistingUsers(users);
          });
        }, 800);

      } catch (err) {
        logDebug("Media error during scheduled join", err);
        addAlert("Cannot access camera/microphone", "error");
      }
    };

    joinScheduledMeeting();
  }, [isExternal, validated, inRoom, roomId, userName, email, isHost]);

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
  console.log('9 : socketRef.current = io(SIGNALING_SERVER_URL)');

  // ✅ CRITICAL FIX: Prevent multiple socket connections
  if (socketRef.current) {
    if (socketRef.current.connected) {
      console.log('✅ Socket already connected, skipping');
      return;
    }
    
    // Clean up existing socket if it exists but is disconnected
    console.log('🧹 Cleaning up existing socket');
    socketRef.current.off();
    socketRef.current.disconnect();
    socketRef.current = null;
  }

  // ✅ CRITICAL FIX: Prevent concurrent connection attempts
  if (window.socketConnecting) {
    console.log('⏭️ Socket connection already in progress, skipping');
    return;
  }
  window.socketConnecting = true;

  socketRef.current = io(SIGNALING_SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    autoConnect: false // Don't connect immediately
  });

  socketRef.current.connect();

  socketRef.current.on('connect', () => {
    console.log('✅ Connected to signaling server');
    window.socketConnecting = false;
    addAlert('Connected to server', 'success');

    // ✅ CRITICAL FIX: Only join if we have stream and are in room
    if (inRoom && roomId && localStreamRef.current && !hasJoinedRef.current) {
      console.log('🔵 Emitting join-room from connect handler');
      hasJoinedRef.current = true;
      socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, isHost);
    }
  });

  socketRef.current.on('waiting-users', (users) => {
    console.log("Waiting users updated:", users);
    setWaitingUsers(users);
  });

  socketRef.current.on('host-verified', (data) => {
    console.log('Host verified, joining directly...');
    setWaitingForApproval(false);
    setTimeout(() => executeJoin(true), 500);
  });

  socketRef.current.on('lobby-waiting', (data) => {
    addAlert(data.message || "Waiting for host approval...", 'info');
  });

  socketRef.current.on('host-direct-join', (data) => {
    console.log('Host can join directly:', data);
    setWaitingForApproval(false);
    
    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        stream.getVideoTracks().forEach(t => { t._type = 'camera'; t.enabled = true; });
        stream.getAudioTracks().forEach(t => t.enabled = true);

        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(true);
        setIsAudioOn(true);

        if (!hasJoinedRef.current) {
          hasJoinedRef.current = true;
          socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, true);
          setInRoom(true);
        }
      } catch (err) {
        console.error('Error joining as host:', err);
        addAlert('Failed to access camera/microphone', 'error');
      }
    }, 500);
  });

  socketRef.current.on('join-approved', async (data) => {
    console.log('🎉 Join approved by host:', data);
    logDebug("Join approved by host");
    addAlert("Access granted! Joining meeting...", 'success');

    setWaitingForApproval(false);

    try {
      console.log('Requesting media after approval...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      stream.getVideoTracks().forEach(track => {
        track._type = 'camera';
        track.enabled = true;
      });
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);

      console.log('Media acquired successfully');

      await new Promise(resolve => setTimeout(resolve, 200));

      if (!hasJoinedRef.current) {
        console.log('Emitting join-room as approved participant');
        hasJoinedRef.current = true;
        socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, false);
        setInRoom(true);
      }

      setTimeout(() => {
        if (socketRef.current && hasJoinedRef.current) {
          socketRef.current.emit('media-state-change', {
            roomId,
            userId: socketRef.current.id,
            userName,
            videoOn: true,
            audioOn: true,
          });
          logDebug('Media state broadcast after approval');
        }
      }, 500);

      setTimeout(() => {
        if (socketRef.current?.connected) {
          socketRef.current.emit('get-room-users', roomId, (users) => {
            logDebug(`Received ${users.length} existing users after approval`);
            if (users && users.length > 0) {
              createConnectionsToExistingUsers(users);
            }
          });
        }
      }, 1000);

    } catch (err) {
      console.error("Media error after approval:", err);
      logDebug("Media error after approval: " + err.message);
      addAlert("Cannot access camera/microphone. Please check permissions.", "error");
      setWaitingForApproval(true);
      hasJoinedRef.current = false;
    }
  });

  socketRef.current.on('join-denied', (data) => {
    logDebug("Join denied by host");
    addAlert(data.message || "Access denied by host", "error");
    setWaitingForApproval(false);
    hasJoinedRef.current = false;
    setTimeout(() => navigate('/video'), 1500);
  });

  socketRef.current.on('connect_error', (err) => {
    console.error(`Socket connection error: ${err.message}`);
    window.socketConnecting = false;
    addAlert('Connection error. Retrying...', 'error');
  });

  socketRef.current.on('reconnect', (attempt) => {
    console.log(`✅ Reconnected after attempt ${attempt}`);
    window.socketConnecting = false;
    addAlert(`Reconnected to server after ${attempt} attempts.`, 'success');
    
    if (inRoom && roomId && localStreamRef.current && !hasJoinedRef.current) {
      console.log('🔵 Re-joining room after reconnect');
      hasJoinedRef.current = true;
      socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, isHost);
    }
  });

  socketRef.current.on('reconnect_failed', () => {
    console.log('Reconnection failed. Retrying manually...');
    window.socketConnecting = false;
    addAlert('Reconnection failed. Retrying...', 'error');
    socketRef.current.connect();
  });

  socketRef.current.on('room-users', (users) => {
    logDebug(`room-users event: ${users.length} users`, users);
    const mySocketId = socketRef.current?.id;
    const newStatus = {};
    users.forEach((u) => {
      if (u.userId === mySocketId) {
        if (u.isHost && !isHost) {
          setIsHost(true);
          setWaitingForApproval(false);
          addAlert('You are the Host!', 'success');
        }
        return;
      }
      newStatus[u.userId] = {
        userName: u.userName,
        userEmail: u.userEmail,
        isHost: u.isHost,
        status: 'connected',
        streams: { camera: false, screen: false },
        videoOn: u.videoOn ?? true,
        audioOn: u.audioOn ?? true,
      };
    });
    setConnectionStatus(newStatus);
  });

  socketRef.current.on('user-joined', handleUserJoined);
  socketRef.current.on('offer', handleOffer);
  socketRef.current.on('answer', handleAnswer);
  socketRef.current.on('ice-candidate', handleIceCandidate);
  socketRef.current.on('user-left', ({ userId, userName }) => handleUserLeft(userId, userName));
  socketRef.current.on('chat-message', handleChatMessage);
  socketRef.current.on('toggle-media', handleToggleMedia);
  
  socketRef.current.on('media-state-change', (data) => {
    const { userId, userName, videoOn, audioOn } = data;
    logDebug(`${userName || shortId(userId)} media → video: ${videoOn}, audio: ${audioOn}`);
    setConnectionStatus(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        userName: prev[userId]?.userName || userName,
        videoOn: videoOn ?? true,
        audioOn: audioOn ?? true,
      }
    }));

    if (userId === socketRef.current?.id) {
      if (videoOn !== undefined) setIsVideoOn(videoOn);
      if (audioOn !== undefined) setIsAudioOn(audioOn);
    }
  });

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

  return () => {
    if (socketRef.current) {
      console.log('🧹 Socket cleanup in progress');
      socketRef.current.off(); // Remove all listeners
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    window.socketConnecting = false;
    hasJoinedRef.current = false;
    console.log('✅ Socket cleanup completed');
  };
}, [roomId, inRoom, userName, email, isHost, localStreamRef.current]); // ✅ Added localStreamRef.current as dependency

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
    if (inRoom && !localStreamRef.current && socketRef.current?.connected) {
      joinRoom(); // One clean call
    }
  }, [inRoom, socketRef.current?.connected]);

  // Add this useEffect to request join when external user arrives
  useEffect(() => {
    if (roomId && userName && email && socketRef.current?.connected && waitingForApproval) {
      if (!isHost) {
        console.log(`Requesting host approval for: ${userName} (${email}) in room ${roomId}`);
        socketRef.current.emit('request-join', { roomId, userName, email, isHost });
      } else {
        // Host can join directly
        safeJoinRoom();
      }
    }
  }, [roomId, userName, email, waitingForApproval, socketRef.current?.connected, isHost]);
  // Add these helper functions near your other helper functions
  const approveUser = (tempId) => {
    socketRef.current.emit('approve-join', { roomId, tempId });
    setWaitingUsers(prev => prev.filter(u => u.id !== tempId));
    addAlert('User approved', 'success');
  };

  const denyUser = (tempId) => {
    socketRef.current.emit('deny-join', { roomId, tempId });
    setWaitingUsers(prev => prev.filter(u => u.id !== tempId));
    addAlert('User denied', 'info');
  };

  // Add toggle function for side panel
  const toggleSidePanel = (type) => {
    if (showSidePanel && sidePanelType === type) {
      setShowSidePanel(false);
    } else {
      setShowSidePanel(true);
      setSidePanelType(type);

      // If opening lobby, refresh waiting list
      if (type === 'lobby' && isHost) {
        socketRef.current.emit('get-waiting-users', roomId);
      }
    }
  };



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

  // useEffect(() => {
  //   console.log('12 :  const interval = setInterval')
  //   const interval = setInterval(() => {
  //     Object.keys(pendingRemoteStreams.current).forEach((userId) => {
  //       const pending = Object.values(pendingRemoteStreams.current[userId] || {}).filter((s) => s);
  //       if (pending.length > 0) {
  //         logDebug(`Pending streams for ${userId}: ${pending.length}`);
  //         Object.keys(pendingRemoteStreams.current[userId]).forEach((type) => {
  //           if (pendingRemoteStreams.current[userId][type] && peerVideoRefs.current[userId]?.[type]) {
  //             assignPeerStream(userId, type, pendingRemoteStreams.current[userId][type]);
  //           }
  //         });
  //       }
  //     });
  //   }, 5000);
  //   return () => clearInterval(interval);
  // }, [logDebug]);

  // Add this function or logic inside your Video component
  // REPLACE THE BROKEN useEffect WITH THIS ONE
  // useEffect(() => {
  //   if (!isExternal || !meetingId || !email) return;

  //   const checkAndClaimHost = async () => {
  //     try {
  //       const res = await axios.post('http://localhost:3000/api/claim-host', {
  //         meetingId,
  //         email
  //       });



  //       console.log('check host',res.data)

  //       if (res.data.isHost) {
  //         setIsHost(true);

  //         socketRef.current?.emit('claim-host', { roomId: meetingId });
  //         addAlert('You are now the Host!', 'success');
  //         logDebug('Host role claimed successfully (late join)');
  //       }
  //     } catch (err) {
  //       console.log('Not the creator or server error');
  //     }
  //   };

  //   // Check immediately + every 3 seconds (in case participants joined first)
  //   checkAndClaimHost();
  //   const interval = setInterval(checkAndClaimHost, 3000);

  //   return () => clearInterval(interval);
  // }, []);

  const createConnectionsToExistingUsers = useCallback((providedUsers = null) => {
    if (!localStreamRef.current) {
      logDebug("Cannot create connections — no local stream yet");
      return;
    }

    const doCreate = (users) => {
      if (!Array.isArray(users)) return;

      const others = users.filter(u => u.userId !== socketRef.current?.id);

      logDebug(`Creating connections to ${others.length} existing users`);

      others.forEach(user => {
        if (peersRef.current[user.userId]) return; // already have

        // Small delay → helps a lot with signaling race
        setTimeout(() => {
          if (!peersRef.current[user.userId] && localStreamRef.current) {
            const peer = createPeer(user.userId, true); // YOU initiate
            if (peer) {
              peersRef.current[user.userId] = peer;
              setPeers(p => ({ ...p, [user.userId]: peer }));
            }
          }
        }, 300 + Math.random() * 400); // tiny jitter helps
      });
    };

    if (providedUsers) {
      doCreate(providedUsers);
    } else {
      // Fallback - ask server
      socketRef.current?.emit('get-room-users', roomId, doCreate);
    }
  }, [roomId]);

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      logDebug(`Permission che ck failed: ${err.name} - ${err.message}`);
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

    // addAlert('create user');
    console.log('user', user)


    // creatorId,creatorName,creatorEmail,meetingTitle
    // const {creatorId,creatorName,creatorEmail,meetingTitle}=req.body;
    const res = await axios.post(`${API_URL}/api/instant`, {
      meetingTitle: "Instant Meeting",
      creatorId: user.id,
      // creatorName: user.name,
      // creatorEmail: user.email, 
    })

    console.log('create meeting', res.data);
    const data = res.data;

    const newRoomId = data.roomId;
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
      socketRef.current.emit('join-room', newRoomId, user.id, userName, email, true);
      setInRoom(true);
      // After acquiring stream and joining
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };

  // Add this helper function
  const shouldGoToWaitingLobby = () => {
    // If user is host, never go to waiting lobby
    if (isHost) return false;

    // If user is external, go to waiting lobby
    if (isExternal) return true;

    // For internal users, check if it's a scheduled meeting
    // This would require additional logic based on your meeting type
    return false;
  };

  const joinRoom = async () => {
    console.log('joinRoom function called');
    await safeJoinRoom();
  };


  // Main join room logic - renamed to avoid recursion
const joinRoomLogic = async () => {
  console.log('joinRoomLogic called with:', { roomId, userName, email, isHost, isExternal, validated });
  
  // ✅ CRITICAL FIX: Prevent multiple simultaneous join attempts
  if (isJoiningRef.current) {
    console.log('⏭️ Join already in progress, skipping');
    return;
  }
  
  if (hasJoinedRef.current) {
    console.log('⏭️ Already joined, skipping joinRoomLogic');
    return;
  }
  
  isJoiningRef.current = true;

  try {
    // For scheduled meetings - existing logic is fine
    if (validated && isExternal) {
      console.log('Scheduled meeting join - isHost:', isHost);
      if (isHost) {
        await executeJoin(true);
        return;
      } else {
        setWaitingForApproval(true);
        if (socketRef.current?.connected) {
          socketRef.current.emit('request-join', {
            roomId,
            userName,
            email,
            isHost: false
          });
        }
        return;
      }
    }

    // For instant meetings, use the existing /claim-host-instant endpoint
    if (!isExternal && !validated) {
      try {
        console.log('Checking instant meeting host status...');

        const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
          roomId: roomId.trim(),
          email: email,
        });

        console.log('Claim host instant response:', res.data);

        if (res.data.isHost) {
          console.log('✅ User is instant meeting host, joining directly');
          setIsHost(true);
          setWaitingForApproval(false);
          await executeJoin(true);
          return;
        } else {
          console.log('❌ User is NOT instant meeting host, going to waiting lobby');
          setWaitingForApproval(true);
          if (socketRef.current?.connected) {
            socketRef.current.emit('request-join', {
              roomId,
              userName,
              email,
              isHost: false
            });
          }
          return;
        }
      } catch (err) {
        console.error('Error checking instant host status:', err);
        await executeJoin(isHost);
      }
    }

    // Default case
    await executeJoin(isHost);
  } finally {
    // Clear the flag after a delay
    setTimeout(() => {
      isJoiningRef.current = false;
    }, 2000);
  }
};

  // Add this function near your other helper functions
  const showConferenceNotification = (message, type = 'info') => {
    setConferenceNotification({ message, type });
  };

  // Update the approveUser and denyUser functions
  const handleApproveUser = (tempId) => {
    approveUser(tempId);
    const user = waitingUsers.find(u => u.id === tempId);
    showConferenceNotification(`${user?.name || 'User'} joined the meeting`, 'success');
  };

  const handleDenyUser = (tempId) => {
    denyUser(tempId);
    const user = waitingUsers.find(u => u.id === tempId);
    showConferenceNotification(`${user?.name || 'User'} denied access`, 'error');
  };


  // Execute the actual join process
  const executeJoin = async (hostStatus) => {
    console.log('executeJoin called, hostStatus:', hostStatus);

    // IMPORTANT: Reset waiting state when joining
    setWaitingForApproval(false);

    if (!(await checkPermissions())) {
      addAlert('Camera/microphone permissions denied.', 'error');
      return;
    }

    try {
      console.log('Requesting media permissions...');
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
      console.log('Local camera stream acquired successfully.');

      // Emit join with correct host status
      socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, hostStatus);
      setInRoom(true);

      // Broadcast initial media state
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);

      console.log('Join process completed successfully');
    } catch (err) {
      console.error('Error accessing media:', err);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };


  // Add this helper function
  const continueJoinRoom = async (hostStatus) => {
    if (!(await checkPermissions())) {
      addAlert('Camera/microphone permissions denied.', 'error');
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
      stream.getAudioTracks().forEach((track) => (track.enabled = true));

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      logDebug('Local camera stream acquired successfully.');

      // Emit join with correct host status
      socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, hostStatus);
      setInRoom(true);

      // Broadcast initial media state
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);
    } catch (err) {
      logDebug(`Error accessing media: ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };
  const toggleVideo = async () => {
    if (!localStreamRef.current) {
      logDebug("No local stream available");
      return;
    }

    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      // ——— CASE 1: Track exists → just toggle enabled state ———
      const willEnable = !videoTrack.enabled;
      videoTrack.enabled = willEnable;
      setIsVideoOn(willEnable);

      logDebug(`Video track ${willEnable ? 'enabled' : 'disabled'} locally`);
      addAlert(`Camera ${willEnable ? 'turned on' : 'turned off'}`, 'info');

      // Sync track state across all existing peers
      Object.values(peersRef.current).forEach((peer) => {
        if (!peer?._pc) return;
        const sender = peer._pc.getSenders().find(
          (s) => s.track?.kind === 'video' && s.track?._type === 'camera'
        );
        if (sender?.track) {
          sender.track.enabled = willEnable;
          logDebug(`Updated peer ${peer._id} video track enabled = ${willEnable}`);
        }
      });

      // ——— BROADCAST CURRENT STATE TO EVERYONE (THIS FIXES UI SYNC) ———
      socketRef.current?.emit('media-state-change', {
        roomId,
        userId: socketRef.current.id,
        userName,
        videoOn: willEnable,
        audioOn: isAudioOn,
      });
    }
    else if (!isVideoOn) {
      // ——— CASE 2: No video track but user wants to turn ON → reacquire camera ———
      try {
        logDebug("Re-acquiring camera because track was removed");
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        newVideoTrack._type = 'camera';
        newVideoTrack.enabled = true;

        // Add to existing local stream
        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(localStreamRef.current);
        setIsVideoOn(true);

        // Add track to all existing peers
        Object.values(peersRef.current).forEach((peer) => {
          if (peer?._pc) {
            peer._pc.addTrack(newVideoTrack, localStreamRef.current);
            logDebug(`Added new video track to peer ${peer._id}`);
          }
        });

        // Renegotiate all peers to send the new track
        setTimeout(() => {
          Object.entries(peersRef.current).forEach(([userId, peer]) => {
            renegotiatePeer(peer, userId);
          });
        }, 300);

        addAlert("Camera turned on", "success");

        // Broadcast new state
        socketRef.current?.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: isAudioOn,
        });
      } catch (err) {
        logDebug("Failed to reacquire camera: " + err.message);
        addAlert("Failed to turn on camera", "error");
      }
    }
  };


  const toggleAudio = () => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    const willEnable = !audioTrack.enabled;
    audioTrack.enabled = willEnable;
    setIsAudioOn(willEnable);

    // Sync across peers
    Object.values(peersRef.current).forEach((peer) => {
      const sender = peer._pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender?.track) sender.track.enabled = willEnable;
    });

    addAlert(`Microphone ${willEnable ? 'unmuted' : 'muted'}`, 'info');

    // Broadcast correct state
    socketRef.current?.emit('media-state-change', {
      roomId,
      userId: socketRef.current.id,
      userName,
      videoOn: isVideoOn,
      audioOn: willEnable,
    });
  };


  const toggleScreenShare = async () => {
    // STOP if already sharing
    if (screenStreamRef.current) {
      await stopScreenShare();
      return;
    }

    try {
      const isProctorEnabled =
        participantControls[socketRef.current?.id]?.proctor || false;

      addAlert(
        isProctorEnabled
          ? 'Proctor mode requires sharing your entire screen.'
          : 'Select a screen, window, or tab to share.',
        'info'
      );

      // 1️⃣ Get display media
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: isProctorEnabled
          ? { displaySurface: 'monitor', cursor: 'never' }
          : { frameRate: 30 },
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack._type = 'screen';

      // 2️⃣ Proctor validation
      if (
        isProctorEnabled &&
        screenTrack.getSettings().displaySurface !== 'monitor'
      ) {
        screenTrack.stop();
        screenStream.getTracks().forEach(t => t.stop());
        addAlert('Proctor mode requires sharing the entire screen.', 'error');
        return;
      }

      // 3️⃣ Store refs
      screenStreamRef.current = screenStream;
      screenTrackRef.current = screenTrack;

      setScreenStream(screenStream);
      setIsScreenSharing(true);

      // 4️⃣ Clear previous screen senders completely
      Object.keys(screenSendersRef.current).forEach(peerId => {
        delete screenSendersRef.current[peerId];
      });

      // 5️⃣ Create fresh senders for each peer
      const renegotiationPromises = [];
      let hasAnyScreenSender = false;

      Object.entries(peersRef.current).forEach(([peerId, peer]) => {
        const pc = peer?._pc;
        if (!pc) return;

        // Check if there's already a screen track in the connection
        const existingScreenSender = pc.getSenders().find(s =>
          s.track?._type === 'screen'
        );

        try {
          let newSender;

          if (existingScreenSender) {
            // Replace existing screen track
            newSender = existingScreenSender;
            existingScreenSender.replaceTrack(screenTrack)
              .then(() => {
                logDebug(`Replaced screen track for ${peerId}`);
              })
              .catch(err => {
                logDebug(`replaceTrack failed, creating new sender for ${peerId}: ${err.message}`);
                // Fallback to creating new sender
                const fallbackSender = pc.addTrack(screenTrack, screenStream);
                screenSendersRef.current[peerId] = fallbackSender;
                hasAnyScreenSender = true;
              });
          } else {
            // Create new sender
            newSender = pc.addTrack(screenTrack, screenStream);
            screenSendersRef.current[peerId] = newSender;
            hasAnyScreenSender = true;
            logDebug(`Created new screen sender for peer ${peerId}`);
          }

          // Store the sender
          if (newSender && newSender.track) {
            screenSendersRef.current[peerId] = newSender;
          }

        } catch (err) {
          logDebug(`Error adding screen track to peer ${peerId}: ${err.message}`);
        }

        // Queue renegotiation
        renegotiationPromises.push(
          new Promise((resolve) => {
            setTimeout(() => {
              if (hasAnyScreenSender) {
                renegotiatePeer(peer, peerId, 0, false);
              }
              resolve();
            }, 500);
          })
        );
      });

      // Wait for renegotiations
      Promise.allSettled(renegotiationPromises).then(() => {
        logDebug('All renegotiations completed');
      });

      // 6️⃣ Notify peers
      socketRef.current?.emit('screen-share-status', {
        roomId,
        userId: socketRef.current.id,
        userName,
        userEmail: email,
        isScreenSharing: true,
      });

      addAlert('Screen sharing started.', 'success');

      // 7️⃣ Handle browser stop
      screenTrack.onended = () => {
        logDebug('Screen share ended by browser');
        stopScreenShare();
      };

    } catch (err) {
      logDebug(`Screen share error: ${err.message}`);
      addAlert('Failed to start screen sharing.', 'error');
    }
  };


  const stopScreenShare = async () => {
    if (!screenStreamRef.current) return;

    // 1. Stop all tracks in the stream
    screenStreamRef.current.getTracks().forEach(track => {
      if (track.readyState === 'live') {
        track.stop();
      }
    });

    // 2. Clean up each peer connection properly
    Object.entries(peersRef.current).forEach(([peerId, peer]) => {
      if (!peer?._pc) return;

      try {
        // Find the screen sender
        const senders = peer._pc.getSenders();
        const screenSender = senders.find(s =>
          s.track?._type === 'screen' ||
          (s.track && s.track.id === screenTrackRef.current?.id)
        );

        if (screenSender) {
          // Important: Replace with null track FIRST
          screenSender.replaceTrack(null).catch(() => { });

          // Remove the sender from the peer connection
          peer._pc.removeTrack(screenSender);
          logDebug(`Removed screen sender for peer ${peerId}`);
        }

        // Also remove from our ref
        delete screenSendersRef.current[peerId];

        // Renegotiate to clean up
        setTimeout(() => {
          renegotiatePeer(peer, peerId, 0, true);
        }, 500);
      } catch (err) {
        logDebug(`Error cleaning up screen sender for ${peerId}: ${err.message}`);
      }
    });

    // 3. Clear refs
    screenStreamRef.current = null;
    screenTrackRef.current = null;
    screenSendersRef.current = {}; // Clear ALL, don't keep null references

    // 4. Update state
    setScreenStream(null);
    setIsScreenSharing(false);

    // 5. Notify peers
    socketRef.current?.emit('screen-share-status', {
      roomId,
      userId: socketRef.current?.id,
      userName,
      userEmail: email,
      isScreenSharing: false,
    });

    addAlert('Screen sharing stopped.', 'info');
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
      }, 500);

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

    // Create peer WITHOUT stream initially
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

    peer._candidateCache = new Set(); // Per-peer cache


    // 🔥 FIX: If screen sharing is already active, attach screen to NEW peer
    if (screenStreamRef.current && screenTrackRef.current) {
      try {
        const pc = peer._pc;

        const sender = pc.addTrack(
          screenTrackRef.current,
          screenStreamRef.current
        );

        screenSendersRef.current[userId] = sender;

        logDebug(`Attached ACTIVE screen track to late-joining peer ${userId}`);

        // 🔥 Force renegotiation so new peer receives screen
        setTimeout(() => {
          renegotiatePeer(peer, userId, 0, true);
        }, 1300);

      } catch (err) {
        logDebug(`Failed to attach screen to peer ${userId}: ${err.message}`);
      }
    }


    // Manually add all tracks to the peer connection
    const addAllTracksToPeer = () => {
      if (!localStreamRef.current) return;

      try {
        // Add all video tracks from local stream
        const videoTracks = localStreamRef.current.getVideoTracks();
        videoTracks.forEach(track => {
          if (track.readyState === 'live') {
            peer._pc.addTrack(track, localStreamRef.current);
            logDebug(`Added video track to peer ${userId}: ${track._type || 'camera'} (${track.id})`);
          }
        });

        // Add all audio tracks from local stream
        const audioTracks = localStreamRef.current.getAudioTracks();
        audioTracks.forEach(track => {
          if (track.readyState === 'live') {
            peer._pc.addTrack(track, localStreamRef.current);
            logDebug(`Added audio track to peer ${userId}: ${track.id}`);
          }
        });

        logDebug(`Total tracks added to peer ${userId}: ${videoTracks.length} video, ${audioTracks.length} audio`);
      } catch (err) {
        logDebug(`Error adding tracks to peer ${userId}: ${err.message}`);
      }
    };

    // Add tracks after peer is created
    // setTimeout(addAllTracksToPeer, 100);

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

      // Store the stream for later use
      if (!peersRef.current[userId]._remoteStreams) {
        peersRef.current[userId]._remoteStreams = {};
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
            peersRef.current[userId]._remoteStreams.audio = audioStream;
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
          peersRef.current[userId]._remoteStreams[streamType] = singleTrackStream;
          setConnectionStatus((prev) => ({
            ...prev,
            [userId]: {
              ...prev[userId],
              streams: {
                ...prev[userId]?.streams,
                [streamType]: true,
              },
            },
          }));
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


  const forceAssignPeerStreams = useCallback(() => {
    console.log('Force assigning peer streams...');

    // Assign local stream if not assigned
    if (localStreamRef.current && userVideoRef.current.camera && !userVideoRef.current.camera.srcObject) {
      userVideoRef.current.camera.srcObject = localStreamRef.current;
      userVideoRef.current.camera.play().catch(err => {
        console.log('Local video play error:', err);
      });
    }

    // Assign pending peer streams
    Object.keys(pendingRemoteStreams.current).forEach(userId => {
      if (userId === 'local') return;

      Object.keys(pendingRemoteStreams.current[userId] || {}).forEach(streamType => {
        const stream = pendingRemoteStreams.current[userId][streamType];
        if (stream && peerVideoRefs.current[userId]?.[streamType]) {
          assignPeerStream(userId, streamType, stream);
        }
      });
    });
  }, []);


const handleUserJoined = (userId, userName, userEmail, isUserHost) => {
  // Skip if it's ourselves
  if (userId === socketRef.current?.id) {
    logDebug(`Skipping self in handleUserJoined: ${userId}`);
    return;
  }

  if (!userId || userId === 'null' || userId === null) {
    logDebug(`Skipping invalid userId: ${userId} (${userName})`);
    return;
  }

  console.log(`👤 User joined: ${userId} (${userName}), isHost: ${isUserHost}`);

  // Check if peer already exists
  if (peersRef.current[userId]) {
    console.log(`⏭️ Skipping peer creation for ${userId}: already connected`);
    return;
  }
  
  if (pendingPeerCreations.current[userId]) {
    console.log(`⏭️ Skipping peer creation for ${userId}: already queued`);
    return;
  }

  // Update connection status
  setConnectionStatus((prev) => ({
    ...prev,
    [userId]: {
      status: 'connecting',
      userName,
      userEmail,
      isHost: isUserHost,
      streams: { camera: false, screen: false, audio: false },
      videoOn: true,
      audioOn: true,
    },
  }));

  // Create peer connection
  if (localStreamRef.current) {
    const peer = createPeer(userId, true);
    if (peer) {
      setPeers((prev) => ({ ...prev, [userId]: peer }));
      addAlert(`${userName} joined the meeting.`, 'info');
    } else {
      console.log(`❌ Failed to create peer for ${userId}, will retry...`);
      // Schedule retry
      setTimeout(() => {
        if (!peersRef.current[userId] && localStreamRef.current) {
          const retryPeer = createPeer(userId, true);
          if (retryPeer) {
            setPeers((prev) => ({ ...prev, [userId]: retryPeer }));
          }
        }
      }, 2000);
    }
  } else {
    console.log(`⏳ Local stream not ready for ${userId}, queuing...`);
    pendingPeerCreations.current[userId] = { userName, userEmail, isUserHost };
    
    // Schedule check for local stream
    const checkInterval = setInterval(() => {
      if (localStreamRef.current && !peersRef.current[userId]) {
        clearInterval(checkInterval);
        const peer = createPeer(userId, true);
        if (peer) {
          setPeers((prev) => ({ ...prev, [userId]: peer }));
          delete pendingPeerCreations.current[userId];
        }
      }
    }, 500);
  }
};

  // Add this function near your other helper functions
  const broadcastScreenShareToAll = useCallback(() => {
    if (!isScreenSharing || !screenShareTrackRef.current) return;

    Object.entries(peersRef.current).forEach(([userId, peer]) => {
      if (peer && peer._pc && peer._pc.signalingState !== 'closed') {
        try {
          const existingScreenSender = peer._pc.getSenders().find(
            (s) => s.track?._type === 'screen'
          );

          if (!existingScreenSender && screenShareTrackRef.current) {
            peer._pc.addTrack(screenShareTrackRef.current, screenStream || localStreamRef.current);
            logDebug(`Added screen track to peer ${userId} in broadcast`);

            setTimeout(() => {
              renegotiatePeer(peer, userId, 0, false);
            }, 300);
          }
        } catch (err) {
          logDebug(`Error broadcasting screen to peer ${userId}: ${err.message}`);
        }
      }
    });
  }, [isScreenSharing, screenStream, screenShareTrackRef.current]);

  // Add this useEffect to broadcast screen share when new users join
  useEffect(() => {
    if (isScreenSharing && Object.keys(peers).length > 0) {
      // When peers change (new user joins), broadcast screen share
      const timer = setTimeout(() => {
        broadcastScreenShareToAll();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [peers, isScreenSharing, broadcastScreenShareToAll]);

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}: ${JSON.stringify(data.signal).slice(0, 100)}...`);

    // CRITICAL FIX: Wait for local stream before processing offer
    const processOffer = async () => {
      // If local stream is not ready, wait for it
      if (!localStreamRef.current) {
        logDebug(`⏳ Local stream not ready for offer from ${data.from}, waiting...`);

        // Wait up to 5 seconds for local stream
        let attempts = 0;
        while (!localStreamRef.current && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 300));
          attempts++;
        }

        if (!localStreamRef.current) {
          logDebug(`❌ Local stream still not ready after 5 seconds, queuing offer...`);
          // Queue the offer for later processing
          if (!pendingCandidates.current[data.from]) {
            pendingCandidates.current[data.from] = [];
          }
          pendingCandidates.current[data.from].push(data.signal);
          return;
        }
      }

      // Now process the offer with local stream available
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

    processOffer();
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
      try {
        peer.signal({ candidate: data.candidate });
        logDebug(`Applied ICE candidate from ${data.from}`);
      } catch (err) {
        logDebug(`Error applying ICE candidate from ${data.from}: ${err.message}`);
        // Queue it for retry
        if (!pendingCandidates.current[data.from]) {
          pendingCandidates.current[data.from] = [];
        }
        pendingCandidates.current[data.from].push({ candidate: data.candidate });
      }
    } else {
      logDebug(`Peer not ready for ICE candidate from ${data.from}, queuing...`);

      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }

      pendingCandidates.current[data.from].push({ candidate: data.candidate });

      // Increase queue limit for production
      if (pendingCandidates.current[data.from].length > 50) {
        pendingCandidates.current[data.from] = pendingCandidates.current[data.from].slice(-30);
        logDebug(`Trimmed ICE candidate queue for ${data.from} to 30 items`);
      }
    }
  };

  const handleUserLeft = (userId, serverName) => {
    console.log('server name', serverName)
    const displayName = serverName || connectionStatus[userId]?.userName ||
      participantControls[userId]?.userName ||
      shortId(userId);
    console.log('user left name', displayName)
    console.log("== DEBUG USER LEFT ==");
    console.log("connectionStatus:", connectionStatus[userId]);
    console.log("participantControls:", participantControls[userId]);
    console.log("shortId:", shortId(userId));
    console.log("Final Name:", displayName);
    console.log("================================");

    // logDebug(`User left: ${displayName}`);
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
    addAlert(`${displayName} left the meeting.`, 'info');
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

  const handleToggleMedia = useCallback((data) => {
    const { userId, video, audio } = data;

    logDebug(`Media state sync: ${shortId(userId)} → video=${video}, audio=${audio}`);

    // UPDATE UI FOR EVERYONE (this is the key!)
    setConnectionStatus(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        videoOn: video ?? prev[userId]?.videoOn ?? true,
        audioOn: audio ?? prev[userId]?.audioOn ?? true,
      }
    }));

    // ONLY IF this is for ME → apply to local tracks
    if (userId === socketRef.current?.id && localStreamRef.current) {
      if (video !== undefined) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = video;
          setIsVideoOn(video);
        }
      }
      if (audio !== undefined) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = audio;
          setIsAudioOn(audio);
        }
      }
    }
  }, [logDebug]);

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

    // Only allow host to TURN OFF (disable) video/audio — never turn ON
    const shouldDisable = type === 'video' || type === 'audio';

    // For video/audio: always force OFF. For proctor: toggle normally
    const newVal = type === 'proctor'
      ? !participantControls[userId]?.proctor
      : false; // always false = force off

    setParticipantControls((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        video: type === 'video' ? false : prev[userId]?.video ?? true,
        audio: type === 'audio' ? false : prev[userId]?.audio ?? true,
        proctor: type === 'proctor' ? newVal : prev[userId]?.proctor ?? false,
      },
    }));

    // Immediately update host UI to reflect forced-off state
    if (type === 'video' || type === 'audio') {
      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          videoOn: type === 'video' ? false : prev[userId]?.videoOn,
          audioOn: type === 'audio' ? false : prev[userId]?.audioOn,
        },
      }));
    }

    // Send command to participant
    socketRef.current.emit('toggle-media', {
      roomId,
      userId,
      video: type === 'video' ? false : undefined,
      audio: type === 'audio' ? false : undefined,
    });

    // For proctor mode,changes this dec17 for username and useremail
    if (type === 'proctor') {
      socketRef.current.emit('toggle-proctor', {
        roomId,
        userId,
        userName: connectionStatus[userId]?.userName,
        userEmail: connectionStatus[userId]?.userEmail,
        proctor: newVal,
      });
    }

    addAlert(
      type === 'proctor'
        ? `Proctor mode ${newVal ? 'enabled' : 'disabled'} for ${connectionStatus[userId]?.userName || shortId(userId)}`
        : `${type === 'video' ? 'Camera' : 'Microphone'} turned OFF for ${connectionStatus[userId]?.userName || shortId(userId)}`,
      'info'
    );
  };


  // Add this function near your other helper functions (around line ~300)
const cleanupAllPeers = useCallback(() => {
  logDebug('🧹 Starting comprehensive peer cleanup...');

  // Stop all tracks from local stream
  if (localStreamRef.current) {
    localStreamRef.current.getTracks().forEach(track => {
      track.stop();
    });
    localStreamRef.current = null;
  }

  // Destroy all peer connections
  Object.entries(peersRef.current).forEach(([userId, peer]) => {
    if (peer && typeof peer.destroy === 'function') {
      try {
        peer.destroy();
        logDebug(`Destroyed peer connection for ${userId}`);
      } catch (err) {
        logDebug(`Error destroying peer ${userId}: ${err.message}`);
      }
    }
  });

  // Clear all refs
  peersRef.current = {};
  setPeers({});
  
  // Clear ICE candidate generation
  videoStreamCount.current = {};
  pendingCandidates.current = {};
  renegotiationQueue.current = {};

  logDebug('✅ Peer cleanup completed');
}, [logDebug]);

  const leaveRoom = () => {
    // window.location.reload();
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    cleanupAllPeers();

    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }

    // Destroy all peers
    Object.values(peersRef.current).forEach(peer => {
      if (peer && typeof peer.destroy === 'function') {
        peer.destroy();
      }
    });
    peersRef.current = {};
    setPeers({});

    // Clear pending streams & refs
    pendingRemoteStreams.current = {};
    pendingCandidates.current = {};
    renegotiationQueue.current = {};
    videoStreamCount.current = {};
    detectionIntervals.current = {};
    pendingPeerCreations.current = {};
    hasJoinedRef.current = false;
    isJoiningRef.current = false;
    screenShareActiveRef.current = false;
    screenShareTrackRef.current = null;

    // Properly disconnect socket
    if (socketRef.current) {
      socketRef.current.off(); // Remove all listeners
      socketRef.current.disconnect();
      console.log('Socket disconnected leaveroom');
      socketRef.current = null;
    }

    // Reset video refs
    if (userVideoRef.current.camera) userVideoRef.current.camera.srcObject = null;
    if (userVideoRef.current.screen) userVideoRef.current.screen.srcObject = null;
    Object.keys(peerVideoRefs.current).forEach(userId => {
      if (peerVideoRefs.current[userId]) {
        if (peerVideoRefs.current[userId].camera) {
          peerVideoRefs.current[userId].camera.srcObject = null;
        }
        if (peerVideoRefs.current[userId].screen) {
          peerVideoRefs.current[userId].screen.srcObject = null;
        }
      }
    });
    peerVideoRefs.current = {};

    // Reset all state
    setInRoom(false);
    setIsHost(false);
    setConnectionStatus({});
    setParticipantControls({});
    setMessages([]);
    setAlerts([]);
    setIsVideoOn(true);
    setIsAudioOn(true);
    setIsScreenSharing(false);
    setCurrentVideoPage(1);
    setTotalVideoPages(1);


    // Optional: Force re-render by resetting roomId temporarily
    // This clears the input field and forces fresh join
    setRoomId('');

    addAlert('You have left the meeting.', 'info');

    // navigate('/video'); 

    console.log('validity', validated);
    console.log('isExternal', isExternal);

    if (isExternal && validated) {
      window.location.reload();
      navigate(`/join/${meetingId}`, { replace: true });
    } else {

      navigate('/video', { replace: true });
    }

    // Alert.alert(
    //   'Left Meeting',
    //   'You have left the meeting.', 
    // );



    //  navigate(`/join/${meetingId}`, { replace: true ,validated: false});

    // if(validated){
    //    window.location.reload();
    //   console.log('meetingId', meetingId);
    //   navigate(`/join/${meetingId}`);
    //   window.location.reload();

    // }

    // else{
    //    window.location.reload();
    //   console.log('navigating to video');
    //   // navigate('/video');
    // }
    // window.location.reload();
    //    if (validated) {
    //   console.log('meetingId', meetingId);
    //   navigate(`/join/${meetingId}`, { replace: true });
    // } else {
    //   navigate('/video', { replace: true });
    // }
    // Critical: Navigate to clean state or force remount
    // if(!validated){
    //navigate('/video'); // This should trigger fresh JoinRoom
    // }
    // else{ 
    // console.log('meetingId', meetingId);
    // // navigate(`/join/${meetingId}`); // This should trigger fresh JoinRoom
    // window.location.reload();
    // }
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

        {waitingForApproval ? (
          <WaitingLobby
            userName={userName}
            roomId={roomId}
          />
        ) : !inRoom ? (
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
            addAlert={addAlert}
          />
        ) : (
          <div className="conference-room">
            {/* Conference Notification */}
            {conferenceNotification && (
              <ConferenceNotification
                message={conferenceNotification.message}
                type={conferenceNotification.type}
                onClose={() => setConferenceNotification(null)}
              />
            )}

            <MeetingHeader
              roomId={roomId}
              isHost={isHost}
              peers={peers}
              waitingUsers={waitingUsers}
              showSidePanel={showSidePanel}
              sidePanelType={sidePanelType}
              toggleSidePanel={toggleSidePanel}
              logout={logout}
              isExternal={isExternal}
              leaveRoom={leaveRoom}
            />

            <div className="main-content">
              <div className="video-container">
                <VideoLayout
                  isAnyScreenSharing={isAnyScreenSharing}
                  isScreenSharing={isScreenSharing}
                  peers={peers}
                  connectionStatus={connectionStatus}
                  participantControls={participantControls}
                  isHost={isHost}
                  toggleParticipantMedia={toggleParticipantMedia}
                  peerVideoRefs={peerVideoRefs}
                  pendingRemoteStreams={pendingRemoteStreams}
                  peersRef={peersRef}
                  shortId={shortId}
                  userName={userName}
                  isVideoOn={isVideoOn}
                  isAudioOn={isAudioOn}
                  currentVideoPage={currentVideoPage}
                  totalVideoPages={totalVideoPages}
                  navigateVideoPage={navigateVideoPage}
                  getCurrentPageCameraVideos={getCurrentPageCameraVideos}
                  localStreamRef={localStreamRef}
                  logDebug={logDebug}
                  userVideoRef={userVideoRef}
                />
              </div>

              {/* Side Panel */}
              {showSidePanel && (
                sidePanelType === 'chat' ? (
                  <ChatPanel
                    showChat={true}
                    setShowChat={() => setShowSidePanel(false)}
                    messages={messages}
                    chatInput={chatInput}
                    setChatInput={setChatInput}
                    sendChatMessage={sendChatMessage}
                    socketRef={socketRef}
                    userName={userName}
                  />
                ) : (
                  <LobbyPanel
                    waitingUsers={waitingUsers}
                    approveUser={handleApproveUser}
                    denyUser={handleDenyUser}
                    setShowSidePanel={setShowSidePanel}
                  />
                )
              )}
            </div>

            <footer className="bottom-bar">
              <VideoControls
                toggleVideo={toggleVideo}
                toggleAudio={toggleAudio}
                toggleScreenShare={toggleScreenShare}
                leaveRoom={leaveRoom}
                isVideoOn={isVideoOn}
                isAudioOn={isAudioOn}
                isScreenSharing={isScreenSharing}
                logout={logout}
                isExternal={isExternal}
              />
            </footer>

            <DebugPanel
              showDebug={showDebug}
              debugLog={debugLog}
            />
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

  /* Add to your existing CSS */
.lobby-button {
  position: relative;
}

/* Fix for the Lobby Panel User Row */
.chat-message {
  display: flex !important;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 100% !important; /* Overriding your 90% own-message rule */
  background: #24244a;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* Fix for initials icon compression */
.initials-avatar-lobby {
  width: 36px;
  height: 36px;
  flex-shrink: 0; /* CRITICAL: Prevents squashing */
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* Fix for long emails breaking the layout */
.user-info-text {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-left: 10px;
}

.user-info-text div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* Adds the "..." to long emails */
  max-width: 120px; /* Adjust based on your side panel width */
}

.notification-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ff4757;
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.side-panel {
  width: 320px;
  background: #2d2d40;
  border-left: 1px solid #3a3a52;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
}

/* For LobbyPanel specific styling */
.waiting-user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3a3a52;
  transition: background 0.2s;
}

.waiting-user-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-actions {
  display: flex;
  gap: 8px;
}

.approve-btn {
  background: #00b894 !important;
  color: white !important;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.deny-btn {
  background: #ff4757 !important;
  color: white !important;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
    .text-danger { color: #ff4444 !important; }
.text-success { color: #00C851 !important; }

  /* Alert styles remain the same */
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
  .alert-close:hover { opacity: 1; }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Main Layout Container */
  .video-layout-container {
    display: flex;
    gap: 20px;
    height: 100%;
    padding: 20px;
  }

  /* Screen Share Section - Left Side */
  .screen-share-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 70%;
  }

  .screen-share-item {
    width: 100%;
    background: #000;
    border: 3px solid var(--accent-blue);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 183, 235, 0.4);
    overflow: hidden;
  }

  .screen-share-video {
    aspect-ratio: 16 / 9;
    width: 100%;
  }

  .screen-element {
    object-fit: contain;
    background: #000;
    border-radius: 8px;
    width: 100%;
    height: 100%;
  }

  .local-screen-share {
    border-color: var(--success);
  }

  .screen-share-item .video-overlay {
    background: linear-gradient(to top, rgba(0, 183, 235, 0.3), transparent);
    padding: 12px;
  }

  .screen-share-item .video-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--accent-blue);
  }

  .redirecting-container {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--primary-bg);
        }
        .redirecting-message {
          text-align: center;
          color: var(--text-color);
          font-size: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .redirecting-message i {
          font-size: 24px;
          color: var(--accent-blue);
        }
        .redirecting-message p {
          margin: 0;
          opacity: 0.8;
        }

  

  /* Camera Videos Section - Right Side */
  .camera-videos-section {
    flex: 1;
    display: grid;
    // grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    max-width: 25%;
   
    padding: 10px;
  }

  /* When NO screen sharing - Full screen camera layout */
  .video-gallery.no-screen-share .video-layout-container {
    display: block;
  }

  .video-gallery.no-screen-share .camera-videos-section {
    max-width: 100%;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    padding: 0;
  }

  /* When screen sharing IS active - Side by side layout */
.video-gallery.has-screen-share .camera-videos-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

  /* Video item common styles */
  .video-item {
    background: #1c1c38;
    border-radius: 10px;
    overflow: hidden;
    transition: transform 0.2s;
    position: relative;
  }

  .video-item:hover {
    transform: scale(1.02);
  }
.video-item.local-video .video-element {
  background: #000 !important;
}

 .video-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
}
  .video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
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
    z-index:5;
  }

  .video-name {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .video-status {
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .video-status span {
    color: #a0a0c0;
  }

  .proctor-controls {
    display: flex;
    gap: 4px;
    margin-right: auto;
  }

 .text-danger { color: #ff4444 !important; }
.text-success { color: #00c851 !important; }
.proctor-controls button {
  background: rgba(255,255,255,0.1);
  padding: 4px 6px;
  border-radius: 4px;
}
.proctor-controls button:hover {
  background: rgba(255,255,255,0.2);
}

  /* Chat panel - smaller width */
  .side-panel {
    width: 250px;
    background: var(--secondary-bg);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    height: 100%; /* Add this */
  }

  .side-panel.open {
    transform: translateX(0);
  }

  .chat-messages-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Important for flexbox scrolling */
  margin-bottom: 12px;
  overflow: hidden; /* Contain the scrolling */
}
  .chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
      height: 100%; /* Add this */
    padding: 12px;
      min-height: 0; 
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
      flex-shrink: 0;
  }

  .chat-header h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  .chat-header button {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-color);
    opacity: 0.7;
  }

  .chat-header button:hover { opacity: 1; }

 .chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background: #1c1c38;
  border-radius: 6px;
  /* Hide scrollbar for Chrome, Safari and Opera */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

  
 .chat-message {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #24244a;
  max-width: 90%;
  font-size: 12px;
  word-wrap: break-word;
}
  .chat-message.own-message {
  background: var(--accent-blue);
  margin-left: auto;
}

  .chat-meta {
  display: flex;
  gap: 4px;
  align-items: baseline;
  margin-bottom: 2px;
}

  .chat-sender {
    font-weight: 500;
    color: var(--accent-purple);
    font-size: 11px;
  }

  .chat-time {
    color: #a0a0c0;
    font-size: 10px;
  }

 .chat-text {
  font-size: 12px;
  word-wrap: break-word;
  line-height: 1.3;
}

.chat-input {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.chat-input input {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  background: #24244a;
  color: var(--text-color);
}
  .chat-input input:focus {
    border-color: var(--accent-blue);
    outline: none;
  }

  .chat-input button {
  padding: 8px 10px;
  background: var(--accent-blue);
  color: var(--text-color);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.chat-input button:hover {
  background: var(--accent-purple);
}

  /* Rest of your existing styles... */
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

  .join-buttons button:hover { opacity: 0.9; }

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

  .top-controls button:hover { background: #2e2e4b; }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .video-container {
    flex: 1;
    background: #000;
    overflow: auto;
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

  .controls button:hover { background: #2e2e4b; }
  .controls button.disabled { color: var(--error); border-color: var(--error); }
  .controls button.sharing { color: var(--success); border-color: var(--success); }

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

 .slides-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 20px;
  margin: 10px auto;
  max-width: 150px;
  order: 999; /* Ensure it appears at the bottom */
}


.initials-avatar {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-weight: 700;
  border-radius: 10px;
  z-index: 2;
  user-select: none;
}

.initials-text {
  font-size: 2.8rem;
  letter-spacing: 2px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

.avatar-status {
  font-size: 0.8rem;
  margin-top: 8px;
  opacity: 0.9;
  font-weight: 500;
}

/* Smaller when screen sharing */
.has-screen-share .initials-text {
  font-size: 2rem;
}
.has-screen-share .avatar-status {
  font-size: 0.7rem;
}

.slide-counter {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-blue);
  min-width: 60px;
  text-align: center;
}

.slide-nav-btn {
  background: var(--accent-blue);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  font-size: 12px;
  transition: background-color 0.2s;
}

.slide-nav-btn:hover {
  background: var(--accent-purple);
}

.slide-nav-btn:disabled {
  background: var(--border);
  cursor: not-allowed;
  opacity: 0.5;
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
    .video-layout-container {
      flex-direction: column;
      gap: 15px;
    }
    .screen-share-section {
      max-width: 100%;
    }
    .camera-videos-section {
      max-width: 100%;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
    .camera-videos-section {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .video-layout-container {
      padding: 10px;
      gap: 10px;
    }
  }
     @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        /* Active state for header buttons */
        .top-controls button.active {
          background: var(--accent-blue);
          color: white;
        }

        /* Ensure buttons in header are properly sized */
        .top-controls button {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        
}`}
        </style>
      </div>
    </ErrorBoundary>
  );
};

export default Video;


//working code feb 17


import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as faceapi from 'face-api.js';
import { v4 as uuidv4 } from 'uuid';
import { AuthContext } from './AuthContext';
import SchedulePage from './SchedulePage';
import JoinRoom from './JoinRoom';

import axios from 'axios';
import { set } from 'date-fns';

// Import Components
import Alert from './Alert';
import VideoControls from './VideoControls';
import ChatPanel from './ChatPanel';
import MeetingHeader from './MeetingHeader';
import VideoLayout from './VideoLayout';
import DebugPanel from './DebugPanel';
import WaitingLobby from './lobby/WaitingLobby';
import LobbyPanel from './lobby/LobbyPanel';
import ConferenceNotification from './notifications/ConferenceNotification';



// const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';
// const API_URL = "https://livemeet-ribm.onrender.com";

const SIGNALING_SERVER_URL = 'http://localhost:3000';
const API_URL = "http://localhost:3000";



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

// const Alert = ({ message, type, onClose }) => {
//   useEffect(() => {
//     const timer = setTimeout(onClose, 5000);
//     return () => clearTimeout(timer);
//   }, [onClose]);

//   return (
//     <div className={`alert alert-${type}`}>
//       {message}
//       <button onClick={onClose} className="alert-close">×</button>
//     </div>
//   );
// };

const Video = ({ isExternal = false, meetingId, userEmail, userName: propUserName, isHostM, validated = false }) => {
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
  const [pendingPeerStreams, setPendingPeerStreams] = useState({});
  const [currentVideoPage, setCurrentVideoPage] = useState(1);
  const [totalVideoPages, setTotalVideoPages] = useState(1);
  const [socketSessionKey, setSocketSessionKey] = useState(0);
  const [conferenceNotification, setConferenceNotification] = useState(null);

  // Add these new states near your other useState declarations
  // New: All non-host users wait (except if already validated as host)
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [waitingUsers, setWaitingUsers] = useState([]);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [sidePanelType, setSidePanelType] = useState('chat'); // 'chat' or 'lobby'

  const isAnyScreenSharing = isScreenSharing ||
    Object.values(connectionStatus).some(status => status?.streams?.screen === true);

  // Keep all the existing refs (they remain the same)
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
  const cameraSendersRef = useRef({});
  const cameraTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const screenSendersRef = useRef({});
  const videoSenderRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingPeerCreations = useRef({});
  const hasJoinedRef = useRef(false);
  const isJoiningRef = useRef(false);
  const roomIdRef = useRef(roomId);
  const inRoomRef = useRef(inRoom);
  const userNameRef = useRef(userName);
  const emailRef = useRef(email);
  const isHostRef = useRef(isHost);


  // const [currentVideoPage, setCurrentVideoPage] = useState(1);
  // const [totalVideoPages, setTotalVideoPages] = useState(1);



  const safeJoinRoom = async () => {
    // If user is host OR validated as creator, allow direct join
    if (!isHost && waitingForApproval) {
      // Check if this is an instant meeting creator trying to rejoin
      if (!isExternal && !validated) {
        try {
          // Use the existing endpoint
          const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
            roomId: roomId.trim(),
            email: email,
          });

          if (res.data.isHost) {
            console.log("✅ Instant meeting creator detected - allowing direct join");
            setIsHost(true);
            setWaitingForApproval(false);
            await executeJoin(true);
            return;
          }
        } catch (err) {
          console.log("Not the creator:", err.message);
        }
      }

      console.log("Blocked direct join — user must wait for host approval");
      addAlert("Waiting for host approval. You cannot join directly.", "info");
      return;
    }

    // Only proceed if host or already approved
    await joinRoomLogic();
  };

  useEffect(() => {
    roomIdRef.current = roomId;
    inRoomRef.current = inRoom;
    userNameRef.current = userName;
    emailRef.current = email;
    isHostRef.current = isHost;
  }, [roomId, inRoom, userName, email, isHost]);


  // Initials helper
  const getInitials = (name = '') => {
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  };

  // Navigation functions for video pages
  const navigateVideoPage = (direction) => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) return;

    setCurrentVideoPage(prev => {
      if (direction === 'next') {
        return prev >= totalVideoPages ? 1 : prev + 1;
      } else {
        return prev <= 1 ? totalVideoPages : prev - 1;
      }
    });
  };

  useEffect(() => {
    // Check if we're joining from scheduled meetings
    const joiningData = sessionStorage.getItem('joiningMeeting');
    if (joiningData && isExternal) {
      const data = JSON.parse(joiningData);
      setRoomId(data.roomId);
      setUserName(data.userName);
      setEmail(data.userEmail);
      setIsHost(data.isHost);
      setInRoom(true);


      sessionStorage.removeItem('joiningMeeting');
    }
  }, [isExternal]);


  useEffect(() => {
    if (!isAnyScreenSharing) {
      setCurrentVideoPage(1);
      setTotalVideoPages(1);
      return;
    }

    // Count ALL camera videos including local user
    const cameraVideoCount = 1 + Object.keys(peers).length; // Local user + all peers

    // Fixed number of videos per page/column
    const VIDEOS_PER_PAGE = 3;

    // Calculate total pages needed
    const calculatedTotalPages = Math.ceil(cameraVideoCount / VIDEOS_PER_PAGE);
    setTotalVideoPages(calculatedTotalPages);

    // Ensure current page is within bounds
    if (currentVideoPage > calculatedTotalPages) {
      setCurrentVideoPage(calculatedTotalPages || 1);
    }
  }, [peers, isAnyScreenSharing, currentVideoPage]);

  // Update the function to get videos for current page - include local video
  const getCurrentPageCameraVideos = () => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) {
      // Return all videos when no screen sharing or only one page
      const allVideos = ['local', ...Object.keys(peers)];
      return allVideos;
    }

    const VIDEOS_PER_PAGE = 3;
    const startIndex = (currentVideoPage - 1) * VIDEOS_PER_PAGE;
    const endIndex = startIndex + VIDEOS_PER_PAGE;

    // Get ALL video IDs including local
    const allVideoIds = ['local', ...Object.keys(peers)];
    return allVideoIds.slice(startIndex, endIndex);
  };

  // Add this function to ensure all peer streams are properly managed
  const ensurePeerStreams = useCallback(() => {
    Object.keys(peersRef.current).forEach(userId => {
      if (userId === 'local') return;

      // Ensure peer video refs exist
      if (!peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId] = {};
      }

      // Check if there are pending streams for this peer
      if (pendingRemoteStreams.current[userId]) {
        Object.keys(pendingRemoteStreams.current[userId]).forEach(streamType => {
          const stream = pendingRemoteStreams.current[userId][streamType];
          if (stream && peerVideoRefs.current[userId]?.[streamType]) {
            assignPeerStream(userId, streamType, stream);
          }
        });
      }
    });
  }, []);

  // Call this function whenever the current page changes
  useEffect(() => {
    if (isAnyScreenSharing) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        ensurePeerStreams();
      }, 100);
    }
  }, [currentVideoPage, isAnyScreenSharing, ensurePeerStreams]);

  // Also call when peers change
  useEffect(() => {
    if (isAnyScreenSharing) {
      ensurePeerStreams();
    }
  }, [peers, isAnyScreenSharing, ensurePeerStreams]);

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

    // 🔥 FIX: Also remove screen track from local stream
    if (localStreamRef.current) {
      const screenTrack = localStreamRef.current.getVideoTracks().find(t => t._type === 'screen');
      if (screenTrack) {
        localStreamRef.current.removeTrack(screenTrack);
        screenTrack.stop();
        logDebug('Removed screen track from local stream');
      }
    }

    const cleanupPromises = Object.entries(peersRef.current).map(async ([peerId, peer]) => {
      if (peer && peer._pc) {
        try {
          // 🔥 FIX: Also look for _isScreen property
          const screenSender = peer._pc.getSenders().find((s) =>
            s.track?._type === 'screen' || s.track?._isScreen === true
          );
          if (screenSender) {
            // 🔥 FIX: Replace with null track to properly remove
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

  // First, update this useEffect where you set isHost for scheduled meetings
  useEffect(() => {
    if ((isExternal && isHostM !== undefined) || validated) {
      console.log('isHost set from isHostM1:', isHostM);
      setIsHost(!!isHostM);

      // CRITICAL: If user is host, they should NOT wait for approval
      if (isHostM) {
        setWaitingForApproval(false);
      }
    }
  }, [isHostM, isExternal, validated]);

  useEffect(() => {
    if ((isExternal && isHostM !== undefined) || validated) {
      setIsHost(!!isHostM);
    }
  }, [isExternal, isHostM, validated]);

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


  // Add this useEffect to handle local video stream assignment
  useEffect(() => {
    if (isAnyScreenSharing && localStreamRef.current && userVideoRef.current.camera) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const videoElement = userVideoRef.current.camera;
        if (videoElement && !videoElement.srcObject && localStreamRef.current) {
          videoElement.srcObject = localStreamRef.current;
          videoElement.play().catch((err) => {
            logDebug(`Error playing local stream after page change: ${err.message}`);
          });
          logDebug(`Reassigned local stream after page change to page ${currentVideoPage}`);
        }
      }, 50);
    }
  }, [currentVideoPage, isAnyScreenSharing, logDebug]);


  // Replace the autoJoin useEffect with this:
  // In Video.js, update the auto-join logic
  useEffect(() => {
    const autoJoin = async () => {
      if (isExternal && roomId && userName && email && validated && !inRoom) {
        console.log('✅ Auto-joining validated user:', { userName, email, isHost });

        // 🔥 FIX: For instant meetings, check host status first
        if (isHost) {
          console.log('🎯 User is HOST, joining directly');
          const hasPermissions = await checkPermissions();
          if (!hasPermissions) {
            addAlert('Camera/microphone permissions required for host', 'error');
            return;
          }
          await executeJoin(true);
        } else {
          // For instant meetings, we need to check if they're the creator
          try {
            const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
              roomId: roomId.trim(),
              email: email,
            });

            if (res.data.isHost) {
              console.log('🎯 Instant meeting creator detected, joining as host');
              setIsHost(true);
              setWaitingForApproval(false);
              await executeJoin(true);
              return;
            }
          } catch (err) {
            console.log('Not instant meeting creator:', err.message);
          }

          console.log('⏳ User is PARTICIPANT, going to waiting lobby');
          setWaitingForApproval(true);
          if (socketRef.current?.connected) {
            socketRef.current.emit('request-join', {
              roomId,
              userName,
              email,
              isHost: false
            });
          }
        }
      }
    };

    const timer = setTimeout(() => {
      autoJoin();
    }, 1000);

    return () => clearTimeout(timer);
  }, [isExternal, roomId, userName, email, isHost, validated, inRoom]);


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


  // In the useEffect that handles auto-join / rejoin for scheduled meetings
  useEffect(() => {
    if (!isExternal || !validated || !inRoom || localStreamRef.current) return;

    const joinScheduledMeeting = async () => {
      try {
        // 1. First get media — very important order!
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        // Tag & prepare
        stream.getVideoTracks().forEach(t => { t._type = 'camera'; t.enabled = true; });
        stream.getAudioTracks().forEach(t => { t.enabled = true; });

        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(true);
        setIsAudioOn(true);

        logDebug("✓ Stream acquired before join");

        // 2. Now safely join
        if (socketRef.current?.connected) {
          //socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, isHost);
          await safeJoinRoom();
          logDebug("→ join-room emitted AFTER stream ready");
        }

        // 3. Then ask for current users (very important!)
        setTimeout(() => {
          socketRef.current?.emit('get-room-users', roomId, (users) => {
            // ... handle users, create connections
            createConnectionsToExistingUsers(users);
          });
        }, 800);

      } catch (err) {
        logDebug("Media error during scheduled join", err);
        addAlert("Cannot access camera/microphone", "error");
      }
    };

    joinScheduledMeeting();
  }, [isExternal, validated, inRoom, roomId, userName, email, isHost]);

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
  console.log('9 : socketRef.current = io(SIGNALING_SERVER_URL)');

  // ✅ CRITICAL FIX: Prevent multiple socket connections
  if (socketRef.current) {
    if (socketRef.current.connected) {
      console.log('✅ Socket already connected, skipping');
      return;
    }
    
    // Clean up existing socket if it exists but is disconnected
    console.log('🧹 Cleaning up existing socket');
    socketRef.current.off();
    socketRef.current.disconnect();
    socketRef.current = null;
  }

  // ✅ CRITICAL FIX: Prevent concurrent connection attempts
  if (window.socketConnecting) {
    console.log('⏭️ Socket connection already in progress, skipping');
    return;
  }
  window.socketConnecting = true;

  socketRef.current = io(SIGNALING_SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    autoConnect: false // Don't connect immediately
  });

  socketRef.current.connect();

  socketRef.current.on('connect', () => {
    console.log('✅ Connected to signaling server');
    window.socketConnecting = false;
    addAlert('Connected to server', 'success');

    // ✅ CRITICAL FIX: Only join if we have stream and are in room
    if (inRoomRef.current && roomIdRef.current && localStreamRef.current && !hasJoinedRef.current) {
      console.log('🔵 Emitting join-room from connect handler');
      hasJoinedRef.current = true;
      socketRef.current.emit(
        'join-room',
        roomIdRef.current,
        socketRef.current.id,
        userNameRef.current,
        emailRef.current,
        isHostRef.current
      );
    }
  });

  socketRef.current.on('waiting-users', (users) => {
    console.log("Waiting users updated:", users);
    setWaitingUsers(users);
  });

  socketRef.current.on('host-verified', (data) => {
    console.log('Host verified, joining directly...');
    setWaitingForApproval(false);
    setTimeout(() => executeJoin(true), 500);
  });

  socketRef.current.on('lobby-waiting', (data) => {
    addAlert(data.message || "Waiting for host approval...", 'info');
  });

  socketRef.current.on('host-direct-join', (data) => {
    console.log('Host can join directly:', data);
    setWaitingForApproval(false);
    
    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        stream.getVideoTracks().forEach(t => { t._type = 'camera'; t.enabled = true; });
        stream.getAudioTracks().forEach(t => t.enabled = true);

        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsVideoOn(true);
        setIsAudioOn(true);

        if (!hasJoinedRef.current) {
          hasJoinedRef.current = true;
          socketRef.current.emit(
            'join-room',
            roomIdRef.current,
            socketRef.current.id,
            userNameRef.current,
            emailRef.current,
            true
          );
          setInRoom(true);
        }
      } catch (err) {
        console.error('Error joining as host:', err);
        addAlert('Failed to access camera/microphone', 'error');
      }
    }, 500);
  });

  socketRef.current.on('join-approved', async (data) => {
    console.log('🎉 Join approved by host:', data);
    logDebug("Join approved by host");
    addAlert("Access granted! Joining meeting...", 'success');

    setWaitingForApproval(false);

    try {
      console.log('Requesting media after approval...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });

      stream.getVideoTracks().forEach(track => {
        track._type = 'camera';
        track.enabled = true;
      });
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);

      console.log('Media acquired successfully');

      await new Promise(resolve => setTimeout(resolve, 200));

      if (!hasJoinedRef.current) {
        console.log('Emitting join-room as approved participant');
        hasJoinedRef.current = true;
        socketRef.current.emit(
          'join-room',
          roomIdRef.current,
          socketRef.current.id,
          userNameRef.current,
          emailRef.current,
          false
        );
        setInRoom(true);
      }

      setTimeout(() => {
        if (socketRef.current && hasJoinedRef.current) {
          socketRef.current.emit('media-state-change', {
            roomId: roomIdRef.current,
            userId: socketRef.current.id,
            userName: userNameRef.current,
            videoOn: true,
            audioOn: true,
          });
          logDebug('Media state broadcast after approval');
        }
      }, 500);

      setTimeout(() => {
        if (socketRef.current?.connected) {
          socketRef.current.emit('get-room-users', roomIdRef.current, (users) => {
            logDebug(`Received ${users.length} existing users after approval`);
            if (users && users.length > 0) {
              createConnectionsToExistingUsers(users);
            }
          });
        }
      }, 1000);

    } catch (err) {
      console.error("Media error after approval:", err);
      logDebug("Media error after approval: " + err.message);
      addAlert("Cannot access camera/microphone. Please check permissions.", "error");
      setWaitingForApproval(true);
      hasJoinedRef.current = false;
    }
  });

  socketRef.current.on('join-denied', (data) => {
    logDebug("Join denied by host");
    addAlert(data.message || "Access denied by host", "error");
    setWaitingForApproval(false);
    hasJoinedRef.current = false;
    setTimeout(() => navigate('/video'), 1500);
  });

  socketRef.current.on('connect_error', (err) => {
    console.error(`Socket connection error: ${err.message}`);
    window.socketConnecting = false;
    addAlert('Connection error. Retrying...', 'error');
  });

  socketRef.current.on('reconnect', (attempt) => {
    console.log(`✅ Reconnected after attempt ${attempt}`);
    window.socketConnecting = false;
    addAlert(`Reconnected to server after ${attempt} attempts.`, 'success');
    
    if (inRoomRef.current && roomIdRef.current && localStreamRef.current && !hasJoinedRef.current) {
      console.log('🔵 Re-joining room after reconnect');
      hasJoinedRef.current = true;
      socketRef.current.emit(
        'join-room',
        roomIdRef.current,
        socketRef.current.id,
        userNameRef.current,
        emailRef.current,
        isHostRef.current
      );
    }
  });

  socketRef.current.on('reconnect_failed', () => {
    console.log('Reconnection failed. Retrying manually...');
    window.socketConnecting = false;
    addAlert('Reconnection failed. Retrying...', 'error');
    socketRef.current.connect();
  });

  socketRef.current.on('room-users', (users) => {
    logDebug(`room-users event: ${users.length} users`, users);
    const mySocketId = socketRef.current?.id;
    const newStatus = {};
    users.forEach((u) => {
      if (u.userId === mySocketId) {
        if (u.isHost && !isHostRef.current) {
          setIsHost(true);
          setWaitingForApproval(false);
          addAlert('You are the Host!', 'success');
        }
        return;
      }
      newStatus[u.userId] = {
        userName: u.userName,
        userEmail: u.userEmail,
        isHost: u.isHost,
        status: 'connected',
        streams: { camera: false, screen: false },
        videoOn: u.videoOn ?? true,
        audioOn: u.audioOn ?? true,
      };
    });
    setConnectionStatus(newStatus);
  });

  socketRef.current.on('user-joined', handleUserJoined);
  socketRef.current.on('offer', handleOffer);
  socketRef.current.on('answer', handleAnswer);
  socketRef.current.on('ice-candidate', handleIceCandidate);
  socketRef.current.on('user-left', ({ userId, userName }) => handleUserLeft(userId, userName));
  socketRef.current.on('chat-message', handleChatMessage);
  socketRef.current.on('toggle-media', handleToggleMedia);
  
  socketRef.current.on('media-state-change', (data) => {
    const { userId, userName, videoOn, audioOn } = data;
    logDebug(`${userName || shortId(userId)} media → video: ${videoOn}, audio: ${audioOn}`);
    setConnectionStatus(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        userName: prev[userId]?.userName || userName,
        videoOn: videoOn ?? true,
        audioOn: audioOn ?? true,
      }
    }));

    if (userId === socketRef.current?.id) {
      if (videoOn !== undefined) setIsVideoOn(videoOn);
      if (audioOn !== undefined) setIsAudioOn(audioOn);
    }
  });

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

  return () => {
    if (socketRef.current) {
      console.log('🧹 Socket cleanup in progress');
      socketRef.current.off(); // Remove all listeners
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    window.socketConnecting = false;
    hasJoinedRef.current = false;
    console.log('✅ Socket cleanup completed');
  };
}, [socketSessionKey]);

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
    if (inRoom && !localStreamRef.current && socketRef.current?.connected) {
      joinRoom(); // One clean call
    }
  }, [inRoom, socketRef.current?.connected]);

  // Add this useEffect to request join when external user arrives
  useEffect(() => {
    if (roomId && userName && email && socketRef.current?.connected && waitingForApproval) {
      if (!isHost) {
        console.log(`Requesting host approval for: ${userName} (${email}) in room ${roomId}`);
        socketRef.current.emit('request-join', { roomId, userName, email, isHost });
      } else {
        // Host can join directly
        safeJoinRoom();
      }
    }
  }, [roomId, userName, email, waitingForApproval, socketRef.current?.connected, isHost]);

  useEffect(() => {
    if (isHost && inRoom && roomId && socketRef.current?.connected) {
      socketRef.current.emit('get-waiting-users', roomId);
    }
  }, [isHost, inRoom, roomId, socketSessionKey]);
  // Add these helper functions near your other helper functions
  const approveUser = (tempId) => {
    socketRef.current.emit('approve-join', { roomId, tempId });
    setWaitingUsers(prev => prev.filter(u => u.id !== tempId));
    addAlert('User approved', 'success');
  };

  const denyUser = (tempId) => {
    socketRef.current.emit('deny-join', { roomId, tempId });
    setWaitingUsers(prev => prev.filter(u => u.id !== tempId));
    addAlert('User denied', 'info');
  };

  // Add toggle function for side panel
  const toggleSidePanel = (type) => {
    if (showSidePanel && sidePanelType === type) {
      setShowSidePanel(false);
    } else {
      setShowSidePanel(true);
      setSidePanelType(type);

      // If opening lobby, refresh waiting list
      if (type === 'lobby' && isHost) {
        socketRef.current.emit('get-waiting-users', roomId);
      }
    }
  };



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

  // useEffect(() => {
  //   console.log('12 :  const interval = setInterval')
  //   const interval = setInterval(() => {
  //     Object.keys(pendingRemoteStreams.current).forEach((userId) => {
  //       const pending = Object.values(pendingRemoteStreams.current[userId] || {}).filter((s) => s);
  //       if (pending.length > 0) {
  //         logDebug(`Pending streams for ${userId}: ${pending.length}`);
  //         Object.keys(pendingRemoteStreams.current[userId]).forEach((type) => {
  //           if (pendingRemoteStreams.current[userId][type] && peerVideoRefs.current[userId]?.[type]) {
  //             assignPeerStream(userId, type, pendingRemoteStreams.current[userId][type]);
  //           }
  //         });
  //       }
  //     });
  //   }, 5000);
  //   return () => clearInterval(interval);
  // }, [logDebug]);

  // Add this function or logic inside your Video component
  // REPLACE THE BROKEN useEffect WITH THIS ONE
  // useEffect(() => {
  //   if (!isExternal || !meetingId || !email) return;

  //   const checkAndClaimHost = async () => {
  //     try {
  //       const res = await axios.post('http://localhost:3000/api/claim-host', {
  //         meetingId,
  //         email
  //       });



  //       console.log('check host',res.data)

  //       if (res.data.isHost) {
  //         setIsHost(true);

  //         socketRef.current?.emit('claim-host', { roomId: meetingId });
  //         addAlert('You are now the Host!', 'success');
  //         logDebug('Host role claimed successfully (late join)');
  //       }
  //     } catch (err) {
  //       console.log('Not the creator or server error');
  //     }
  //   };

  //   // Check immediately + every 3 seconds (in case participants joined first)
  //   checkAndClaimHost();
  //   const interval = setInterval(checkAndClaimHost, 3000);

  //   return () => clearInterval(interval);
  // }, []);

  const createConnectionsToExistingUsers = useCallback((providedUsers = null) => {
    if (!localStreamRef.current) {
      logDebug("Cannot create connections — no local stream yet");
      return;
    }

    const doCreate = (users) => {
      if (!Array.isArray(users)) return;

      const others = users.filter(u => u.userId !== socketRef.current?.id);

      logDebug(`Creating connections to ${others.length} existing users`);

      others.forEach(user => {
        if (peersRef.current[user.userId]) return; // already have

        // Small delay → helps a lot with signaling race
        setTimeout(() => {
          if (!peersRef.current[user.userId] && localStreamRef.current) {
            const peer = createPeer(user.userId, true); // YOU initiate
            if (peer) {
              peersRef.current[user.userId] = peer;
              setPeers(p => ({ ...p, [user.userId]: peer }));
            }
          }
        }, 300 + Math.random() * 400); // tiny jitter helps
      });
    };

    if (providedUsers) {
      doCreate(providedUsers);
    } else {
      // Fallback - ask server
      socketRef.current?.emit('get-room-users', roomId, doCreate);
    }
  }, [roomId]);

  const checkPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      logDebug(`Permission che ck failed: ${err.name} - ${err.message}`);
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

    // addAlert('create user');
    console.log('user', user)


    // creatorId,creatorName,creatorEmail,meetingTitle
    // const {creatorId,creatorName,creatorEmail,meetingTitle}=req.body;
    const res = await axios.post(`${API_URL}/api/instant`, {
      meetingTitle: "Instant Meeting",
      creatorId: user.id,
      // creatorName: user.name,
      // creatorEmail: user.email, 
    })

    console.log('create meeting', res.data);
    const data = res.data;

    const newRoomId = data.roomId;
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
      hasJoinedRef.current = true;
      socketRef.current.emit('join-room', newRoomId, socketRef.current.id, userName, email, true);
      setInRoom(true);
      // After acquiring stream and joining
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId: newRoomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);
    } catch (err) {
      logDebug(`Error accessing media: ${err.name} - ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };

  // Add this helper function
  const shouldGoToWaitingLobby = () => {
    // If user is host, never go to waiting lobby
    if (isHost) return false;

    // If user is external, go to waiting lobby
    if (isExternal) return true;

    // For internal users, check if it's a scheduled meeting
    // This would require additional logic based on your meeting type
    return false;
  };

  const joinRoom = async () => {
    console.log('joinRoom function called');
    await safeJoinRoom();
  };


  // Main join room logic - renamed to avoid recursion
const joinRoomLogic = async () => {
  console.log('joinRoomLogic called with:', { roomId, userName, email, isHost, isExternal, validated });
  
  // ✅ CRITICAL FIX: Prevent multiple simultaneous join attempts
  if (isJoiningRef.current) {
    console.log('⏭️ Join already in progress, skipping');
    return;
  }
  
  if (hasJoinedRef.current) {
    console.log('⏭️ Already joined, skipping joinRoomLogic');
    return;
  }
  
  isJoiningRef.current = true;

  try {
    if (!socketRef.current?.connected) {
      addAlert('Reconnecting to server. Please try again in a moment.', 'info');
      setSocketSessionKey((prev) => prev + 1);
      return;
    }

    // For scheduled meetings - existing logic is fine
    if (validated && isExternal) {
      console.log('Scheduled meeting join - isHost:', isHost);
      if (isHost) {
        await executeJoin(true);
        return;
      } else {
        setWaitingForApproval(true);
        if (socketRef.current?.connected) {
          socketRef.current.emit('request-join', {
            roomId,
            userName,
            email,
            isHost: false
          });
        }
        return;
      }
    }

    // For instant meetings, use the existing /claim-host-instant endpoint
    if (!isExternal && !validated) {
      try {
        console.log('Checking instant meeting host status...');

        const res = await axios.post(`${API_URL}/api/claim-host-instant`, {
          roomId: roomId.trim(),
          email: email,
        });

        console.log('Claim host instant response:', res.data);

        if (res.data.isHost) {
          console.log('✅ User is instant meeting host, joining directly');
          setIsHost(true);
          setWaitingForApproval(false);
          await executeJoin(true);
          return;
        } else {
          console.log('❌ User is NOT instant meeting host, going to waiting lobby');
          setWaitingForApproval(true);
          if (socketRef.current?.connected) {
            socketRef.current.emit('request-join', {
              roomId,
              userName,
              email,
              isHost: false
            });
          }
          return;
        }
      } catch (err) {
        console.error('Error checking instant host status:', err);
        await executeJoin(isHost);
      }
    }

    // Default case
    await executeJoin(isHost);
  } finally {
    // Clear the flag after a delay
    setTimeout(() => {
      isJoiningRef.current = false;
    }, 2000);
  }
};

  // Add this function near your other helper functions
  const showConferenceNotification = (message, type = 'info') => {
    setConferenceNotification({ message, type });
  };

  // Update the approveUser and denyUser functions
  const handleApproveUser = (tempId) => {
    approveUser(tempId);
    const user = waitingUsers.find(u => u.id === tempId);
    showConferenceNotification(`${user?.name || 'User'} joined the meeting`, 'success');
  };

  const handleDenyUser = (tempId) => {
    denyUser(tempId);
    const user = waitingUsers.find(u => u.id === tempId);
    showConferenceNotification(`${user?.name || 'User'} denied access`, 'error');
  };


  // Execute the actual join process
  const executeJoin = async (hostStatus) => {
    console.log('executeJoin called, hostStatus:', hostStatus);

    if (hasJoinedRef.current) {
      console.log('Already joined, skipping executeJoin');
      return;
    }

    if (!socketRef.current?.connected) {
      addAlert('Not connected to signaling server. Reconnecting...', 'error');
      setSocketSessionKey((prev) => prev + 1);
      return;
    }

    // IMPORTANT: Reset waiting state when joining
    setWaitingForApproval(false);

    if (!(await checkPermissions())) {
      addAlert('Camera/microphone permissions denied.', 'error');
      return;
    }

    try {
      console.log('Requesting media permissions...');
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
      console.log('Local camera stream acquired successfully.');

      // Emit join with correct host status
      hasJoinedRef.current = true;
      socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, hostStatus);
      setInRoom(true);

      // Broadcast initial media state
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);

      console.log('Join process completed successfully');
    } catch (err) {
      console.error('Error accessing media:', err);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };


  // Add this helper function
  const continueJoinRoom = async (hostStatus) => {
    if (hasJoinedRef.current) {
      console.log('Already joined, skipping continueJoinRoom');
      return;
    }

    if (!socketRef.current?.connected) {
      addAlert('Not connected to signaling server. Reconnecting...', 'error');
      setSocketSessionKey((prev) => prev + 1);
      return;
    }

    if (!(await checkPermissions())) {
      addAlert('Camera/microphone permissions denied.', 'error');
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
      stream.getAudioTracks().forEach((track) => (track.enabled = true));

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoOn(true);
      setIsAudioOn(true);
      logDebug('Local camera stream acquired successfully.');

      // Emit join with correct host status
      hasJoinedRef.current = true;
      socketRef.current.emit('join-room', roomId, socketRef.current.id, userName, email, hostStatus);
      setInRoom(true);

      // Broadcast initial media state
      setTimeout(() => {
        socketRef.current.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: true,
        });
      }, 1000);
    } catch (err) {
      logDebug(`Error accessing media: ${err.message}`);
      addAlert('Failed to access camera/microphone. Check permissions.', 'error');
    }
  };
  const toggleVideo = async () => {
    if (!localStreamRef.current) {
      logDebug("No local stream available");
      return;
    }

    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      // ——— CASE 1: Track exists → just toggle enabled state ———
      const willEnable = !videoTrack.enabled;
      videoTrack.enabled = willEnable;
      setIsVideoOn(willEnable);

      logDebug(`Video track ${willEnable ? 'enabled' : 'disabled'} locally`);
      addAlert(`Camera ${willEnable ? 'turned on' : 'turned off'}`, 'info');

      // Sync track state across all existing peers
      Object.values(peersRef.current).forEach((peer) => {
        if (!peer?._pc) return;
        const sender = peer._pc.getSenders().find(
          (s) => s.track?.kind === 'video' && s.track?._type === 'camera'
        );
        if (sender?.track) {
          sender.track.enabled = willEnable;
          logDebug(`Updated peer ${peer._id} video track enabled = ${willEnable}`);
        }
      });

      // ——— BROADCAST CURRENT STATE TO EVERYONE (THIS FIXES UI SYNC) ———
      socketRef.current?.emit('media-state-change', {
        roomId,
        userId: socketRef.current.id,
        userName,
        videoOn: willEnable,
        audioOn: isAudioOn,
      });
    }
    else if (!isVideoOn) {
      // ——— CASE 2: No video track but user wants to turn ON → reacquire camera ———
      try {
        logDebug("Re-acquiring camera because track was removed");
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        newVideoTrack._type = 'camera';
        newVideoTrack.enabled = true;

        // Add to existing local stream
        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(localStreamRef.current);
        setIsVideoOn(true);

        // Add track to all existing peers
        Object.values(peersRef.current).forEach((peer) => {
          if (peer?._pc) {
            peer._pc.addTrack(newVideoTrack, localStreamRef.current);
            logDebug(`Added new video track to peer ${peer._id}`);
          }
        });

        // Renegotiate all peers to send the new track
        setTimeout(() => {
          Object.entries(peersRef.current).forEach(([userId, peer]) => {
            renegotiatePeer(peer, userId);
          });
        }, 300);

        addAlert("Camera turned on", "success");

        // Broadcast new state
        socketRef.current?.emit('media-state-change', {
          roomId,
          userId: socketRef.current.id,
          userName,
          videoOn: true,
          audioOn: isAudioOn,
        });
      } catch (err) {
        logDebug("Failed to reacquire camera: " + err.message);
        addAlert("Failed to turn on camera", "error");
      }
    }
  };


  const toggleAudio = () => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    const willEnable = !audioTrack.enabled;
    audioTrack.enabled = willEnable;
    setIsAudioOn(willEnable);

    // Sync across peers
    Object.values(peersRef.current).forEach((peer) => {
      const sender = peer._pc.getSenders().find(s => s.track?.kind === 'audio');
      if (sender?.track) sender.track.enabled = willEnable;
    });

    addAlert(`Microphone ${willEnable ? 'unmuted' : 'muted'}`, 'info');

    // Broadcast correct state
    socketRef.current?.emit('media-state-change', {
      roomId,
      userId: socketRef.current.id,
      userName,
      videoOn: isVideoOn,
      audioOn: willEnable,
    });
  };


  const toggleScreenShare = async () => {
    // STOP if already sharing
    if (screenStreamRef.current) {
      await stopScreenShare();
      return;
    }

    try {
      const isProctorEnabled =
        participantControls[socketRef.current?.id]?.proctor || false;

      addAlert(
        isProctorEnabled
          ? 'Proctor mode requires sharing your entire screen.'
          : 'Select a screen, window, or tab to share.',
        'info'
      );

      // 1️⃣ Get display media
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: isProctorEnabled
          ? { displaySurface: 'monitor', cursor: 'never' }
          : { frameRate: 30 },
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack._type = 'screen';

      // 2️⃣ Proctor validation
      if (
        isProctorEnabled &&
        screenTrack.getSettings().displaySurface !== 'monitor'
      ) {
        screenTrack.stop();
        screenStream.getTracks().forEach(t => t.stop());
        addAlert('Proctor mode requires sharing the entire screen.', 'error');
        return;
      }

      // 3️⃣ Store refs
      screenStreamRef.current = screenStream;
      screenTrackRef.current = screenTrack;

      setScreenStream(screenStream);
      setIsScreenSharing(true);

      // 4️⃣ Clear previous screen senders completely
      Object.keys(screenSendersRef.current).forEach(peerId => {
        delete screenSendersRef.current[peerId];
      });

      // 5️⃣ Create fresh senders for each peer
      const renegotiationPromises = [];
      let hasAnyScreenSender = false;

      Object.entries(peersRef.current).forEach(([peerId, peer]) => {
        const pc = peer?._pc;
        if (!pc) return;

        // Check if there's already a screen track in the connection
        const existingScreenSender = pc.getSenders().find(s =>
          s.track?._type === 'screen'
        );

        try {
          let newSender;

          if (existingScreenSender) {
            // Replace existing screen track
            newSender = existingScreenSender;
            existingScreenSender.replaceTrack(screenTrack)
              .then(() => {
                logDebug(`Replaced screen track for ${peerId}`);
              })
              .catch(err => {
                logDebug(`replaceTrack failed, creating new sender for ${peerId}: ${err.message}`);
                // Fallback to creating new sender
                const fallbackSender = pc.addTrack(screenTrack, screenStream);
                screenSendersRef.current[peerId] = fallbackSender;
                hasAnyScreenSender = true;
              });
          } else {
            // Create new sender
            newSender = pc.addTrack(screenTrack, screenStream);
            screenSendersRef.current[peerId] = newSender;
            hasAnyScreenSender = true;
            logDebug(`Created new screen sender for peer ${peerId}`);
          }

          // Store the sender
          if (newSender && newSender.track) {
            screenSendersRef.current[peerId] = newSender;
          }

        } catch (err) {
          logDebug(`Error adding screen track to peer ${peerId}: ${err.message}`);
        }

        // Queue renegotiation
        renegotiationPromises.push(
          new Promise((resolve) => {
            setTimeout(() => {
              if (hasAnyScreenSender) {
                renegotiatePeer(peer, peerId, 0, false);
              }
              resolve();
            }, 500);
          })
        );
      });

      // Wait for renegotiations
      Promise.allSettled(renegotiationPromises).then(() => {
        logDebug('All renegotiations completed');
      });

      // 6️⃣ Notify peers
      socketRef.current?.emit('screen-share-status', {
        roomId,
        userId: socketRef.current.id,
        userName,
        userEmail: email,
        isScreenSharing: true,
      });

      addAlert('Screen sharing started.', 'success');

      // 7️⃣ Handle browser stop
      screenTrack.onended = () => {
        logDebug('Screen share ended by browser');
        stopScreenShare();
      };

    } catch (err) {
      logDebug(`Screen share error: ${err.message}`);
      addAlert('Failed to start screen sharing.', 'error');
    }
  };


  const stopScreenShare = async () => {
    if (!screenStreamRef.current) return;

    // 1. Stop all tracks in the stream
    screenStreamRef.current.getTracks().forEach(track => {
      if (track.readyState === 'live') {
        track.stop();
      }
    });

    // 2. Clean up each peer connection properly
    Object.entries(peersRef.current).forEach(([peerId, peer]) => {
      if (!peer?._pc) return;

      try {
        // Find the screen sender
        const senders = peer._pc.getSenders();
        const screenSender = senders.find(s =>
          s.track?._type === 'screen' ||
          (s.track && s.track.id === screenTrackRef.current?.id)
        );

        if (screenSender) {
          // Important: Replace with null track FIRST
          screenSender.replaceTrack(null).catch(() => { });

          // Remove the sender from the peer connection
          peer._pc.removeTrack(screenSender);
          logDebug(`Removed screen sender for peer ${peerId}`);
        }

        // Also remove from our ref
        delete screenSendersRef.current[peerId];

        // Renegotiate to clean up
        setTimeout(() => {
          renegotiatePeer(peer, peerId, 0, true);
        }, 500);
      } catch (err) {
        logDebug(`Error cleaning up screen sender for ${peerId}: ${err.message}`);
      }
    });

    // 3. Clear refs
    screenStreamRef.current = null;
    screenTrackRef.current = null;
    screenSendersRef.current = {}; // Clear ALL, don't keep null references

    // 4. Update state
    setScreenStream(null);
    setIsScreenSharing(false);

    // 5. Notify peers
    socketRef.current?.emit('screen-share-status', {
      roomId,
      userId: socketRef.current?.id,
      userName,
      userEmail: email,
      isScreenSharing: false,
    });

    addAlert('Screen sharing stopped.', 'info');
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
      }, 500);

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

    // Create peer WITHOUT stream initially
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

    peer._candidateCache = new Set(); // Per-peer cache


    // 🔥 FIX: If screen sharing is already active, attach screen to NEW peer
    if (screenStreamRef.current && screenTrackRef.current) {
      try {
        const pc = peer._pc;

        const sender = pc.addTrack(
          screenTrackRef.current,
          screenStreamRef.current
        );

        screenSendersRef.current[userId] = sender;

        logDebug(`Attached ACTIVE screen track to late-joining peer ${userId}`);

        // 🔥 Force renegotiation so new peer receives screen
        setTimeout(() => {
          renegotiatePeer(peer, userId, 0, true);
        }, 1300);

      } catch (err) {
        logDebug(`Failed to attach screen to peer ${userId}: ${err.message}`);
      }
    }


    // Manually add all tracks to the peer connection
    const addAllTracksToPeer = () => {
      if (!localStreamRef.current) return;

      try {
        // Add all video tracks from local stream
        const videoTracks = localStreamRef.current.getVideoTracks();
        videoTracks.forEach(track => {
          if (track.readyState === 'live') {
            peer._pc.addTrack(track, localStreamRef.current);
            logDebug(`Added video track to peer ${userId}: ${track._type || 'camera'} (${track.id})`);
          }
        });

        // Add all audio tracks from local stream
        const audioTracks = localStreamRef.current.getAudioTracks();
        audioTracks.forEach(track => {
          if (track.readyState === 'live') {
            peer._pc.addTrack(track, localStreamRef.current);
            logDebug(`Added audio track to peer ${userId}: ${track.id}`);
          }
        });

        logDebug(`Total tracks added to peer ${userId}: ${videoTracks.length} video, ${audioTracks.length} audio`);
      } catch (err) {
        logDebug(`Error adding tracks to peer ${userId}: ${err.message}`);
      }
    };

    // Add tracks after peer is created
    // setTimeout(addAllTracksToPeer, 100);

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

      // Store the stream for later use
      if (!peersRef.current[userId]._remoteStreams) {
        peersRef.current[userId]._remoteStreams = {};
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
            peersRef.current[userId]._remoteStreams.audio = audioStream;
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
          peersRef.current[userId]._remoteStreams[streamType] = singleTrackStream;
          setConnectionStatus((prev) => ({
            ...prev,
            [userId]: {
              ...prev[userId],
              streams: {
                ...prev[userId]?.streams,
                [streamType]: true,
              },
            },
          }));
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


  const forceAssignPeerStreams = useCallback(() => {
    console.log('Force assigning peer streams...');

    // Assign local stream if not assigned
    if (localStreamRef.current && userVideoRef.current.camera && !userVideoRef.current.camera.srcObject) {
      userVideoRef.current.camera.srcObject = localStreamRef.current;
      userVideoRef.current.camera.play().catch(err => {
        console.log('Local video play error:', err);
      });
    }

    // Assign pending peer streams
    Object.keys(pendingRemoteStreams.current).forEach(userId => {
      if (userId === 'local') return;

      Object.keys(pendingRemoteStreams.current[userId] || {}).forEach(streamType => {
        const stream = pendingRemoteStreams.current[userId][streamType];
        if (stream && peerVideoRefs.current[userId]?.[streamType]) {
          assignPeerStream(userId, streamType, stream);
        }
      });
    });
  }, []);


const handleUserJoined = (userId, userName, userEmail, isUserHost) => {
  // Skip if it's ourselves
  if (userId === socketRef.current?.id) {
    logDebug(`Skipping self in handleUserJoined: ${userId}`);
    return;
  }

  if (!userId || userId === 'null' || userId === null) {
    logDebug(`Skipping invalid userId: ${userId} (${userName})`);
    return;
  }

  console.log(`👤 User joined: ${userId} (${userName}), isHost: ${isUserHost}`);

  // Check if peer already exists
  if (peersRef.current[userId]) {
    console.log(`⏭️ Skipping peer creation for ${userId}: already connected`);
    return;
  }
  
  if (pendingPeerCreations.current[userId]) {
    console.log(`⏭️ Skipping peer creation for ${userId}: already queued`);
    return;
  }

  // Update connection status
  setConnectionStatus((prev) => ({
    ...prev,
    [userId]: {
      status: 'connecting',
      userName,
      userEmail,
      isHost: isUserHost,
      streams: { camera: false, screen: false, audio: false },
      videoOn: true,
      audioOn: true,
    },
  }));

  // Create peer connection
  if (localStreamRef.current) {
    const peer = createPeer(userId, true);
    if (peer) {
      setPeers((prev) => ({ ...prev, [userId]: peer }));
      addAlert(`${userName} joined the meeting.`, 'info');
    } else {
      console.log(`❌ Failed to create peer for ${userId}, will retry...`);
      // Schedule retry
      setTimeout(() => {
        if (!peersRef.current[userId] && localStreamRef.current) {
          const retryPeer = createPeer(userId, true);
          if (retryPeer) {
            setPeers((prev) => ({ ...prev, [userId]: retryPeer }));
          }
        }
      }, 2000);
    }
  } else {
    console.log(`⏳ Local stream not ready for ${userId}, queuing...`);
    pendingPeerCreations.current[userId] = { userName, userEmail, isUserHost };
    
    // Schedule check for local stream
    const checkInterval = setInterval(() => {
      if (localStreamRef.current && !peersRef.current[userId]) {
        clearInterval(checkInterval);
        const peer = createPeer(userId, true);
        if (peer) {
          setPeers((prev) => ({ ...prev, [userId]: peer }));
          delete pendingPeerCreations.current[userId];
        }
      }
    }, 500);
  }
};

  // Add this function near your other helper functions
  const broadcastScreenShareToAll = useCallback(() => {
    if (!isScreenSharing || !screenShareTrackRef.current) return;

    Object.entries(peersRef.current).forEach(([userId, peer]) => {
      if (peer && peer._pc && peer._pc.signalingState !== 'closed') {
        try {
          const existingScreenSender = peer._pc.getSenders().find(
            (s) => s.track?._type === 'screen'
          );

          if (!existingScreenSender && screenShareTrackRef.current) {
            peer._pc.addTrack(screenShareTrackRef.current, screenStream || localStreamRef.current);
            logDebug(`Added screen track to peer ${userId} in broadcast`);

            setTimeout(() => {
              renegotiatePeer(peer, userId, 0, false);
            }, 300);
          }
        } catch (err) {
          logDebug(`Error broadcasting screen to peer ${userId}: ${err.message}`);
        }
      }
    });
  }, [isScreenSharing, screenStream, screenShareTrackRef.current]);

  // Add this useEffect to broadcast screen share when new users join
  useEffect(() => {
    if (isScreenSharing && Object.keys(peers).length > 0) {
      // When peers change (new user joins), broadcast screen share
      const timer = setTimeout(() => {
        broadcastScreenShareToAll();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [peers, isScreenSharing, broadcastScreenShareToAll]);

  const handleOffer = (data) => {
    logDebug(`Received offer from ${data.from}: ${JSON.stringify(data.signal).slice(0, 100)}...`);

    // CRITICAL FIX: Wait for local stream before processing offer
    const processOffer = async () => {
      // If local stream is not ready, wait for it
      if (!localStreamRef.current) {
        logDebug(`⏳ Local stream not ready for offer from ${data.from}, waiting...`);

        // Wait up to 5 seconds for local stream
        let attempts = 0;
        while (!localStreamRef.current && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 300));
          attempts++;
        }

        if (!localStreamRef.current) {
          logDebug(`❌ Local stream still not ready after 5 seconds, queuing offer...`);
          // Queue the offer for later processing
          if (!pendingCandidates.current[data.from]) {
            pendingCandidates.current[data.from] = [];
          }
          pendingCandidates.current[data.from].push(data.signal);
          return;
        }
      }

      // Now process the offer with local stream available
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

    processOffer();
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
      try {
        peer.signal({ candidate: data.candidate });
        logDebug(`Applied ICE candidate from ${data.from}`);
      } catch (err) {
        logDebug(`Error applying ICE candidate from ${data.from}: ${err.message}`);
        // Queue it for retry
        if (!pendingCandidates.current[data.from]) {
          pendingCandidates.current[data.from] = [];
        }
        pendingCandidates.current[data.from].push({ candidate: data.candidate });
      }
    } else {
      logDebug(`Peer not ready for ICE candidate from ${data.from}, queuing...`);

      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }

      pendingCandidates.current[data.from].push({ candidate: data.candidate });

      // Increase queue limit for production
      if (pendingCandidates.current[data.from].length > 50) {
        pendingCandidates.current[data.from] = pendingCandidates.current[data.from].slice(-30);
        logDebug(`Trimmed ICE candidate queue for ${data.from} to 30 items`);
      }
    }
  };

  const handleUserLeft = (userId, serverName) => {
    console.log('server name', serverName)
    const displayName = serverName || connectionStatus[userId]?.userName ||
      participantControls[userId]?.userName ||
      shortId(userId);
    console.log('user left name', displayName)
    console.log("== DEBUG USER LEFT ==");
    console.log("connectionStatus:", connectionStatus[userId]);
    console.log("participantControls:", participantControls[userId]);
    console.log("shortId:", shortId(userId));
    console.log("Final Name:", displayName);
    console.log("================================");

    // logDebug(`User left: ${displayName}`);
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
    addAlert(`${displayName} left the meeting.`, 'info');
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

  const handleToggleMedia = useCallback((data) => {
    const { userId, video, audio } = data;

    logDebug(`Media state sync: ${shortId(userId)} → video=${video}, audio=${audio}`);

    // UPDATE UI FOR EVERYONE (this is the key!)
    setConnectionStatus(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        videoOn: video ?? prev[userId]?.videoOn ?? true,
        audioOn: audio ?? prev[userId]?.audioOn ?? true,
      }
    }));

    // ONLY IF this is for ME → apply to local tracks
    if (userId === socketRef.current?.id && localStreamRef.current) {
      if (video !== undefined) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = video;
          setIsVideoOn(video);
        }
      }
      if (audio !== undefined) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = audio;
          setIsAudioOn(audio);
        }
      }
    }
  }, [logDebug]);

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

    // Only allow host to TURN OFF (disable) video/audio — never turn ON
    const shouldDisable = type === 'video' || type === 'audio';

    // For video/audio: always force OFF. For proctor: toggle normally
    const newVal = type === 'proctor'
      ? !participantControls[userId]?.proctor
      : false; // always false = force off

    setParticipantControls((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        video: type === 'video' ? false : prev[userId]?.video ?? true,
        audio: type === 'audio' ? false : prev[userId]?.audio ?? true,
        proctor: type === 'proctor' ? newVal : prev[userId]?.proctor ?? false,
      },
    }));

    // Immediately update host UI to reflect forced-off state
    if (type === 'video' || type === 'audio') {
      setConnectionStatus((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          videoOn: type === 'video' ? false : prev[userId]?.videoOn,
          audioOn: type === 'audio' ? false : prev[userId]?.audioOn,
        },
      }));
    }

    // Send command to participant
    socketRef.current.emit('toggle-media', {
      roomId,
      userId,
      video: type === 'video' ? false : undefined,
      audio: type === 'audio' ? false : undefined,
    });

    // For proctor mode,changes this dec17 for username and useremail
    if (type === 'proctor') {
      socketRef.current.emit('toggle-proctor', {
        roomId,
        userId,
        userName: connectionStatus[userId]?.userName,
        userEmail: connectionStatus[userId]?.userEmail,
        proctor: newVal,
      });
    }

    addAlert(
      type === 'proctor'
        ? `Proctor mode ${newVal ? 'enabled' : 'disabled'} for ${connectionStatus[userId]?.userName || shortId(userId)}`
        : `${type === 'video' ? 'Camera' : 'Microphone'} turned OFF for ${connectionStatus[userId]?.userName || shortId(userId)}`,
      'info'
    );
  };


  // Add this function near your other helper functions (around line ~300)
const cleanupAllPeers = useCallback(() => {
  logDebug('🧹 Starting comprehensive peer cleanup...');

  // Stop all tracks from local stream
  if (localStreamRef.current) {
    localStreamRef.current.getTracks().forEach(track => {
      track.stop();
    });
    localStreamRef.current = null;
  }

  // Destroy all peer connections
  Object.entries(peersRef.current).forEach(([userId, peer]) => {
    if (peer && typeof peer.destroy === 'function') {
      try {
        peer.destroy();
        logDebug(`Destroyed peer connection for ${userId}`);
      } catch (err) {
        logDebug(`Error destroying peer ${userId}: ${err.message}`);
      }
    }
  });

  // Clear all refs
  peersRef.current = {};
  setPeers({});
  
  // Clear ICE candidate generation
  videoStreamCount.current = {};
  pendingCandidates.current = {};
  renegotiationQueue.current = {};

  logDebug('✅ Peer cleanup completed');
}, [logDebug]);

  const leaveRoom = () => {
    // window.location.reload();
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    cleanupAllPeers();

    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }

    // Destroy all peers
    Object.values(peersRef.current).forEach(peer => {
      if (peer && typeof peer.destroy === 'function') {
        peer.destroy();
      }
    });
    peersRef.current = {};
    setPeers({});

    // Clear pending streams & refs
    pendingRemoteStreams.current = {};
    pendingCandidates.current = {};
    renegotiationQueue.current = {};
    videoStreamCount.current = {};
    detectionIntervals.current = {};
    pendingPeerCreations.current = {};
    hasJoinedRef.current = false;
    isJoiningRef.current = false;
    screenShareActiveRef.current = false;
    screenShareTrackRef.current = null;

    // Properly disconnect socket
    if (socketRef.current) {
      socketRef.current.off(); // Remove all listeners
      socketRef.current.disconnect();
      console.log('Socket disconnected leaveroom');
      socketRef.current = null;
    }
    window.socketConnecting = false;

    // Reset video refs
    if (userVideoRef.current.camera) userVideoRef.current.camera.srcObject = null;
    if (userVideoRef.current.screen) userVideoRef.current.screen.srcObject = null;
    Object.keys(peerVideoRefs.current).forEach(userId => {
      if (peerVideoRefs.current[userId]) {
        if (peerVideoRefs.current[userId].camera) {
          peerVideoRefs.current[userId].camera.srcObject = null;
        }
        if (peerVideoRefs.current[userId].screen) {
          peerVideoRefs.current[userId].screen.srcObject = null;
        }
      }
    });
    peerVideoRefs.current = {};

    // Reset all state
    setInRoom(false);
    setIsHost(false);
    setConnectionStatus({});
    setParticipantControls({});
    setMessages([]);
    setAlerts([]);
    setWaitingUsers([]);
    setWaitingForApproval(false);
    setShowSidePanel(false);
    setSidePanelType('chat');
    setIsVideoOn(true);
    setIsAudioOn(true);
    setIsScreenSharing(false);
    setCurrentVideoPage(1);
    setTotalVideoPages(1);


    // Optional: Force re-render by resetting roomId temporarily
    // This clears the input field and forces fresh join
    setRoomId('');
    setSocketSessionKey((prev) => prev + 1);

    addAlert('You have left the meeting.', 'info');

    // navigate('/video'); 

    console.log('validity', validated);
    console.log('isExternal', isExternal);

    if (isExternal && validated) {
      window.location.reload();
      navigate(`/join/${meetingId}`, { replace: true });
    } else {

      navigate('/video', { replace: true });
    }

    // Alert.alert(
    //   'Left Meeting',
    //   'You have left the meeting.', 
    // );



    //  navigate(`/join/${meetingId}`, { replace: true ,validated: false});

    // if(validated){
    //    window.location.reload();
    //   console.log('meetingId', meetingId);
    //   navigate(`/join/${meetingId}`);
    //   window.location.reload();

    // }

    // else{
    //    window.location.reload();
    //   console.log('navigating to video');
    //   // navigate('/video');
    // }
    // window.location.reload();
    //    if (validated) {
    //   console.log('meetingId', meetingId);
    //   navigate(`/join/${meetingId}`, { replace: true });
    // } else {
    //   navigate('/video', { replace: true });
    // }
    // Critical: Navigate to clean state or force remount
    // if(!validated){
    //navigate('/video'); // This should trigger fresh JoinRoom
    // }
    // else{ 
    // console.log('meetingId', meetingId);
    // // navigate(`/join/${meetingId}`); // This should trigger fresh JoinRoom
    // window.location.reload();
    // }
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

        {waitingForApproval ? (
          <WaitingLobby
            userName={userName}
            roomId={roomId}
          />
        ) : !inRoom ? (
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
            addAlert={addAlert}
          />
        ) : (
          <div className="conference-room">
            {/* Conference Notification */}
            {conferenceNotification && (
              <ConferenceNotification
                message={conferenceNotification.message}
                type={conferenceNotification.type}
                onClose={() => setConferenceNotification(null)}
              />
            )}

            <MeetingHeader
              roomId={roomId}
              isHost={isHost}
              peers={peers}
              waitingUsers={waitingUsers}
              showSidePanel={showSidePanel}
              sidePanelType={sidePanelType}
              toggleSidePanel={toggleSidePanel}
              logout={logout}
              isExternal={isExternal}
              leaveRoom={leaveRoom}
            />

            <div className="main-content">
              <div className="video-container">
                <VideoLayout
                  isAnyScreenSharing={isAnyScreenSharing}
                  isScreenSharing={isScreenSharing}
                  peers={peers}
                  connectionStatus={connectionStatus}
                  participantControls={participantControls}
                  isHost={isHost}
                  toggleParticipantMedia={toggleParticipantMedia}
                  peerVideoRefs={peerVideoRefs}
                  pendingRemoteStreams={pendingRemoteStreams}
                  peersRef={peersRef}
                  shortId={shortId}
                  userName={userName}
                  isVideoOn={isVideoOn}
                  isAudioOn={isAudioOn}
                  currentVideoPage={currentVideoPage}
                  totalVideoPages={totalVideoPages}
                  navigateVideoPage={navigateVideoPage}
                  getCurrentPageCameraVideos={getCurrentPageCameraVideos}
                  localStreamRef={localStreamRef}
                  logDebug={logDebug}
                  userVideoRef={userVideoRef}
                />
              </div>

              {/* Side Panel */}
              {showSidePanel && (
                sidePanelType === 'chat' ? (
                  <ChatPanel
                    showChat={true}
                    setShowChat={() => setShowSidePanel(false)}
                    messages={messages}
                    chatInput={chatInput}
                    setChatInput={setChatInput}
                    sendChatMessage={sendChatMessage}
                    socketRef={socketRef}
                    userName={userName}
                  />
                ) : (
                  <LobbyPanel
                    waitingUsers={waitingUsers}
                    approveUser={handleApproveUser}
                    denyUser={handleDenyUser}
                    setShowSidePanel={setShowSidePanel}
                  />
                )
              )}
            </div>

            <footer className="bottom-bar">
              <VideoControls
                toggleVideo={toggleVideo}
                toggleAudio={toggleAudio}
                toggleScreenShare={toggleScreenShare}
                leaveRoom={leaveRoom}
                isVideoOn={isVideoOn}
                isAudioOn={isAudioOn}
                isScreenSharing={isScreenSharing}
                logout={logout}
                isExternal={isExternal}
              />
            </footer>

            <DebugPanel
              showDebug={showDebug}
              debugLog={debugLog}
            />
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

  /* Add to your existing CSS */
.lobby-button {
  position: relative;
}

/* Fix for the Lobby Panel User Row */
.chat-message {
  display: flex !important;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 100% !important; /* Overriding your 90% own-message rule */
  background: #24244a;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* Fix for initials icon compression */
.initials-avatar-lobby {
  width: 36px;
  height: 36px;
  flex-shrink: 0; /* CRITICAL: Prevents squashing */
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

/* Fix for long emails breaking the layout */
.user-info-text {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-left: 10px;
}

.user-info-text div {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* Adds the "..." to long emails */
  max-width: 120px; /* Adjust based on your side panel width */
}

.notification-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ff4757;
  color: white;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.side-panel {
  width: 320px;
  background: #2d2d40;
  border-left: 1px solid #3a3a52;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
}

/* For LobbyPanel specific styling */
.waiting-user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3a3a52;
  transition: background 0.2s;
}

.waiting-user-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-actions {
  display: flex;
  gap: 8px;
}

.approve-btn {
  background: #00b894 !important;
  color: white !important;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.deny-btn {
  background: #ff4757 !important;
  color: white !important;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
    .text-danger { color: #ff4444 !important; }
.text-success { color: #00C851 !important; }

  /* Alert styles remain the same */
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
  .alert-close:hover { opacity: 1; }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Main Layout Container */
  .video-layout-container {
    display: flex;
    gap: 20px;
    height: 100%;
    padding: 20px;
  }

  /* Screen Share Section - Left Side */
  .screen-share-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 70%;
  }

  .screen-share-item {
    width: 100%;
    background: #000;
    border: 3px solid var(--accent-blue);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 183, 235, 0.4);
    overflow: hidden;
  }

  .screen-share-video {
    aspect-ratio: 16 / 9;
    width: 100%;
  }

  .screen-element {
    object-fit: contain;
    background: #000;
    border-radius: 8px;
    width: 100%;
    height: 100%;
  }

  .local-screen-share {
    border-color: var(--success);
  }

  .screen-share-item .video-overlay {
    background: linear-gradient(to top, rgba(0, 183, 235, 0.3), transparent);
    padding: 12px;
  }

  .screen-share-item .video-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--accent-blue);
  }

  .redirecting-container {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--primary-bg);
        }
        .redirecting-message {
          text-align: center;
          color: var(--text-color);
          font-size: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .redirecting-message i {
          font-size: 24px;
          color: var(--accent-blue);
        }
        .redirecting-message p {
          margin: 0;
          opacity: 0.8;
        }

  

  /* Camera Videos Section - Right Side */
  .camera-videos-section {
    flex: 1;
    display: grid;
    // grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    max-width: 25%;
   
    padding: 10px;
  }

  /* When NO screen sharing - Full screen camera layout */
  .video-gallery.no-screen-share .video-layout-container {
    display: block;
  }

  .video-gallery.no-screen-share .camera-videos-section {
    max-width: 100%;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    padding: 0;
  }

  /* When screen sharing IS active - Side by side layout */
.video-gallery.has-screen-share .camera-videos-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

  /* Video item common styles */
  .video-item {
    background: #1c1c38;
    border-radius: 10px;
    overflow: hidden;
    transition: transform 0.2s;
    position: relative;
  }

  .video-item:hover {
    transform: scale(1.02);
  }
.video-item.local-video .video-element {
  background: #000 !important;
}

 .video-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
}
  .video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
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
    z-index:5;
  }

  .video-name {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .video-status {
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .video-status span {
    color: #a0a0c0;
  }

  .proctor-controls {
    display: flex;
    gap: 4px;
    margin-right: auto;
  }

 .text-danger { color: #ff4444 !important; }
.text-success { color: #00c851 !important; }
.proctor-controls button {
  background: rgba(255,255,255,0.1);
  padding: 4px 6px;
  border-radius: 4px;
}
.proctor-controls button:hover {
  background: rgba(255,255,255,0.2);
}

  /* Chat panel - smaller width */
  .side-panel {
    width: 250px;
    background: var(--secondary-bg);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    height: 100%; /* Add this */
  }

  .side-panel.open {
    transform: translateX(0);
  }

  .chat-messages-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Important for flexbox scrolling */
  margin-bottom: 12px;
  overflow: hidden; /* Contain the scrolling */
}
  .chat-container {
    flex: 1;
    display: flex;
    flex-direction: column;
      height: 100%; /* Add this */
    padding: 12px;
      min-height: 0; 
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
      flex-shrink: 0;
  }

  .chat-header h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  .chat-header button {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    color: var(--text-color);
    opacity: 0.7;
  }

  .chat-header button:hover { opacity: 1; }

 .chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background: #1c1c38;
  border-radius: 6px;
  /* Hide scrollbar for Chrome, Safari and Opera */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

  
 .chat-message {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 6px;
  background: #24244a;
  max-width: 90%;
  font-size: 12px;
  word-wrap: break-word;
}
  .chat-message.own-message {
  background: var(--accent-blue);
  margin-left: auto;
}

  .chat-meta {
  display: flex;
  gap: 4px;
  align-items: baseline;
  margin-bottom: 2px;
}

  .chat-sender {
    font-weight: 500;
    color: var(--accent-purple);
    font-size: 11px;
  }

  .chat-time {
    color: #a0a0c0;
    font-size: 10px;
  }

 .chat-text {
  font-size: 12px;
  word-wrap: break-word;
  line-height: 1.3;
}

.chat-input {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.chat-input input {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  background: #24244a;
  color: var(--text-color);
}
  .chat-input input:focus {
    border-color: var(--accent-blue);
    outline: none;
  }

  .chat-input button {
  padding: 8px 10px;
  background: var(--accent-blue);
  color: var(--text-color);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.chat-input button:hover {
  background: var(--accent-purple);
}

  /* Rest of your existing styles... */
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

  .join-buttons button:hover { opacity: 0.9; }

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

  .top-controls button:hover { background: #2e2e4b; }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .video-container {
    flex: 1;
    background: #000;
    overflow: auto;
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

  .controls button:hover { background: #2e2e4b; }
  .controls button.disabled { color: var(--error); border-color: var(--error); }
  .controls button.sharing { color: var(--success); border-color: var(--success); }

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

 .slides-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 20px;
  margin: 10px auto;
  max-width: 150px;
  order: 999; /* Ensure it appears at the bottom */
}


.initials-avatar {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-weight: 700;
  border-radius: 10px;
  z-index: 2;
  user-select: none;
}

.initials-text {
  font-size: 2.8rem;
  letter-spacing: 2px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.4);
}

.avatar-status {
  font-size: 0.8rem;
  margin-top: 8px;
  opacity: 0.9;
  font-weight: 500;
}

/* Smaller when screen sharing */
.has-screen-share .initials-text {
  font-size: 2rem;
}
.has-screen-share .avatar-status {
  font-size: 0.7rem;
}

.slide-counter {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-blue);
  min-width: 60px;
  text-align: center;
}

.slide-nav-btn {
  background: var(--accent-blue);
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  font-size: 12px;
  transition: background-color 0.2s;
}

.slide-nav-btn:hover {
  background: var(--accent-purple);
}

.slide-nav-btn:disabled {
  background: var(--border);
  cursor: not-allowed;
  opacity: 0.5;
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
    .video-layout-container {
      flex-direction: column;
      gap: 15px;
    }
    .screen-share-section {
      max-width: 100%;
    }
    .camera-videos-section {
      max-width: 100%;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
    .camera-videos-section {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .video-layout-container {
      padding: 10px;
      gap: 10px;
    }
  }
     @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        /* Active state for header buttons */
        .top-controls button.active {
          background: var(--accent-blue);
          color: white;
        }

        /* Ensure buttons in header are properly sized */
        .top-controls button {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        
}`}
        </style>
      </div>
    </ErrorBoundary>
  );
};

export default Video;
