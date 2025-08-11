// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import io from 'socket.io-client';
// import SimplePeer from 'simple-peer';

// const SIGNALING_SERVER_URL = 'https://livemeet-ribm.onrender.com';

// class ErrorBoundary extends React.Component {
//   state = { hasError: false };

//   static getDerivedStateFromError(error) {
//     return { hasError: true };
//   }

//   render() {
//     if (this.state.hasError) {
//       return <h1>Something went wrong. Please refresh the page.</h1>;
//     }
//     return this.props.children;
//   }
// }

// const Video = () => {
//   const [roomId, setRoomId] = useState('');
//   const [localStream, setLocalStream] = useState(null);
//   const [inRoom, setInRoom] = useState(false);
//   const [peers, setPeers] = useState({});
//   const [debugLog, setDebugLog] = useState([]);
//   const [isVideoOn, setIsVideoOn] = useState(true);
//   const [isAudioOn, setIsAudioOn] = useState(true);
//   const [isScreenSharing, setIsScreenSharing] = useState(false);

//   const socketRef = useRef();
//   const userVideoRef = useRef();
//   const peerVideoRefs = useRef({});
//   const pendingCandidates = useRef({});
//   const peersRef = useRef({});

//   const logDebug = useCallback((msg) => {
//     console.log(msg);
//     setDebugLog((prev) => [...prev, msg].slice(-50));
//   }, []);

//   useEffect(() => {
//     const isSupportedBrowser = !!window.RTCPeerConnection && !!navigator.mediaDevices.getUserMedia;
//     if (!isSupportedBrowser) {
//       logDebug('Warning: Your browser may not fully support WebRTC.');
//       alert('Please use a modern browser like Chrome or Firefox for video calls.');
//     }
//   }, [logDebug]);

//   useEffect(() => {
//     socketRef.current = io(SIGNALING_SERVER_URL, {
//       transports: ['websocket', 'polling'],
//       reconnection: true,
//       reconnectionAttempts: 10,
//       reconnectionDelay: 2000,
//       reconnectionDelayMax: 5000,
//     });

//     socketRef.current.on('connect', () => logDebug('Connected to signaling server'));
//     socketRef.current.on('connect_error', (err) => {
//       logDebug(`Socket connection error: ${err.message}, type: ${err.type}, code: ${err.code}, description: ${err.description || 'N/A'}`);
//       console.error('Socket connect error:', err);
//     });
//     socketRef.current.on('reconnect', (attempt) => logDebug(`Reconnected after attempt ${attempt}`));
//     socketRef.current.on('reconnect_failed', () => logDebug('Reconnection failed after maximum attempts'));

//     socketRef.current.on('user-joined', handleUserJoined);
//     socketRef.current.on('offer', handleOffer);
//     socketRef.current.on('answer', handleAnswer);
//     socketRef.current.on('ice-candidate', handleIceCandidate);
//     socketRef.current.on('user-left', handleUserLeft);

//     return () => {
//       socketRef.current.disconnect();
//     };
//   }, [logDebug]);

//   useEffect(() => {
//     if (!localStream || !inRoom) return;

//     const assignStream = () => {
//       if (userVideoRef.current) {
//         userVideoRef.current.srcObject = localStream;
//         userVideoRef.current.play().catch((err) => {
//           logDebug(`Error playing local video: ${err.message}`);
//         });
//         logDebug('Local stream assigned to video element.');
//       } else {
//         logDebug('Retrying local stream assignment...');
//         setTimeout(assignStream, 100);
//       }
//     };
//     assignStream();
//   }, [localStream, inRoom, logDebug]);

//   const joinRoom = async () => {
//     if (!roomId.trim()) {
//       logDebug('Please enter a Room ID.');
//       return;
//     }
//     logDebug(`Joining room: ${roomId}`);

//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//       setLocalStream(stream);
//       setIsVideoOn(true);
//       setIsAudioOn(true);
//       logDebug('Local stream acquired successfully.');
//       logDebug(`Local stream tracks: ${stream.getTracks().map(t => `${t.kind}:${t.enabled}`).join(', ')}`);
//     } catch (err) {
//       logDebug(`Error accessing media: ${err.name} - ${err.message}`);
//       if (err.name === 'NotAllowedError') {
//         alert('Please grant camera and microphone permissions.');
//       } else if (err.name === 'NotFoundError') {
//         alert('No camera or microphone found. Please check your device.');
//       }
//       return;
//     }

//     socketRef.current.emit('join-room', roomId, socketRef.current.id);
//     setInRoom(true);
//   };

//   const toggleVideo = () => {
//     if (localStream) {
//       const videoTrack = localStream.getVideoTracks()[0];
//       if (videoTrack) {
//         videoTrack.enabled = !videoTrack.enabled;
//         setIsVideoOn(videoTrack.enabled);
//         logDebug(`Video track ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
//         // Renegotiate peer connections
//         Object.keys(peersRef.current).forEach((userId) => {
//           renegotiatePeer(userId);
//         });
//       }
//     }
//   };

//   const toggleAudio = () => {
//     if (localStream) {
//       const audioTrack = localStream.getAudioTracks()[0];
//       if (audioTrack) {
//         audioTrack.enabled = !audioTrack.enabled;
//         setIsAudioOn(audioTrack.enabled);
//         logDebug(`Audio track ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
//         // Renegotiate peer connections
//         Object.keys(peersRef.current).forEach((userId) => {
//           renegotiatePeer(userId);
//         });
//       }
//     }
//   };

//   const toggleScreenShare = async () => {
//     if (isScreenSharing) {
//       // Stop screen sharing, revert to camera
//       localStream.getTracks().forEach(track => track.stop());
//       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//       setLocalStream(stream);
//       setIsScreenSharing(false);
//       logDebug('Switched back to camera stream.');
//       logDebug(`Local stream tracks: ${stream.getTracks().map(t => `${t.kind}:${t.enabled}`).join(', ')}`);
//     } else {
//       // Start screen sharing
//       try {
//         const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
//         setLocalStream(stream);
//         setIsScreenSharing(true);
//         logDebug('Screen sharing started.');
//         logDebug(`Local stream tracks: ${stream.getTracks().map(t => `${t.kind}:${t.enabled}`).join(', ')}`);
//         // Handle screen share ending (e.g., user stops sharing)
//         stream.getVideoTracks()[0].onended = () => {
//           toggleScreenShare(); // Revert to camera
//         };
//       } catch (err) {
//         logDebug(`Error starting screen share: ${err.message}`);
//         return;
//       }
//     }
//     // Renegotiate peer connections
//     Object.keys(peersRef.current).forEach((userId) => {
//       renegotiatePeer(userId);
//     });
//   };

//   const renegotiatePeer = (userId) => {
//     const peer = peersRef.current[userId];
//     if (!peer) return;

//     // Destroy existing peer and create a new one
//     peer.destroy();
//     delete peersRef.current[userId];
//     setPeers((prev) => {
//       const newPeers = { ...prev };
//       delete newPeers[userId];
//       return newPeers;
//     });

//     const newPeer = createPeer(userId, true);
//     peersRef.current[userId] = newPeer;
//     setPeers((prev) => ({ ...prev, [userId]: newPeer }));
//   };

//   const createPeer = (userId, initiator) => {
//     logDebug(`Creating peer for ${userId}, initiator: ${initiator}`);
//     const peer = new SimplePeer({
//       initiator,
//       trickle: true,
//       stream: localStream,
//       config: {
//         iceServers: [
//           { urls: 'stun:stun.l.google.com:19302' },
//           { urls: 'stun:stun1.l.google.com:19302' },
//           {
//             urls: 'turn:openrelay.metered.ca:80',
//             username: 'openrelayproject',
//             credential: 'openrelayproject',
//           },
//           {
//             urls: 'turn:openrelay.metered.ca:443?transport=tcp',
//             username: 'openrelayproject',
//             credential: 'openrelayproject',
//           },
//         ],
//       },
//     });

//     peer.on('signal', (signal) => {
//       if (signal.type === 'offer') {
//         socketRef.current.emit('offer', { signal, to: userId });
//       } else if (signal.type === 'answer') {
//         socketRef.current.emit('answer', { signal, to: userId });
//       } else if (signal.candidate) {
//         socketRef.current.emit('ice-candidate', { candidate: signal.candidate, to: userId });
//       }
//     });

//     peer.on('stream', (stream) => {
//       logDebug(`Received stream from ${userId}, tracks: ${stream.getTracks().map(t => `${t.kind}:${t.enabled}`).join(', ')}`);
//       peersRef.current[userId].remoteStream = stream; // Store stream
//       const assignPeerStream = (attempt = 1) => {
//         if (peerVideoRefs.current[userId]) {
//           peerVideoRefs.current[userId].srcObject = stream;
//           peerVideoRefs.current[userId].play().catch((err) => {
//             logDebug(`Error playing video for ${userId}: ${err.message}`);
//           });
//           logDebug(`Stream assigned to video element for ${userId}`);
//         } else if (attempt <= 5) {
//           logDebug(`Video element for ${userId} not ready, retrying (${attempt}/5)...`);
//           setTimeout(() => assignPeerStream(attempt + 1), 500);
//         } else {
//           logDebug(`Failed to assign stream for ${userId}: video element not found after 5 attempts`);
//         }
//       };
//       assignPeerStream();
//     });

//     peer.on('connect', () => logDebug(`Peer connection established with ${userId}`));
//     peer.on('error', (err) => logDebug(`Peer error (${userId}): ${err.message}`));
//     peer.on('close', () => logDebug(`Peer connection closed for ${userId}`));
//     peer.on('iceconnectionstatechange', () => {
//       logDebug(`ICE connection state for ${userId}: ${peer._pc.iceConnectionState}`);
//       if (peer._pc.iceConnectionState === 'disconnected' || peer._pc.iceConnectionState === 'failed') {
//         renegotiatePeer(userId);
//       }
//     });

//     peersRef.current[userId] = peer;
//     if (pendingCandidates.current[userId]) {
//       pendingCandidates.current[userId].forEach((signal) => {
//         peer.signal(signal);
//       });
//       delete pendingCandidates.current[userId];
//     }

//     return peer;
//   };

//   const handleUserJoined = (userId) => {
//     logDebug(`User joined: ${userId}, current peers: ${Object.keys(peersRef.current)}`);
//     const peer = createPeer(userId, true);
//     setPeers((prev) => ({ ...prev, [userId]: peer }));
//   };

//   const handleOffer = (data) => {
//     logDebug(`Received offer from ${data.from}`);
//     let peer = peersRef.current[data.from];
//     if (!peer) {
//       peer = createPeer(data.from, false);
//       peersRef.current[data.from] = peer;
//       setPeers((prev) => ({ ...prev, [data.from]: peer }));
//     }
//     peer.signal(data.signal);
//   };

//   const handleAnswer = (data) => {
//     logDebug(`Received answer from ${data.from}`);
//     const peer = peersRef.current[data.from];
//     if (peer) {
//       peer.signal(data.signal);
//     } else {
//       logDebug(`No peer for ${data.from}, queuing answer...`);
//       if (!pendingCandidates.current[data.from]) {
//         pendingCandidates.current[data.from] = [];
//       }
//       pendingCandidates.current[data.from].push(data.signal);
//     }
//   };

//   const handleIceCandidate = (data) => {
//     logDebug(`Received ICE candidate from ${data.from}`);
//     const peer = peersRef.current[data.from];
//     if (peer) {
//       peer.signal({ candidate: data.candidate });
//     } else {
//       logDebug(`Peer not ready for ICE candidate from ${data.from}, queuing...`);
//       if (!pendingCandidates.current[data.from]) {
//         pendingCandidates.current[data.from] = [];
//       }
//       pendingCandidates.current[data.from].push({ candidate: data.candidate });
//     }
//   };

//   const handleUserLeft = (userId) => {
//     logDebug(`User left: ${userId}`);
//     if (peersRef.current[userId]) {
//       peersRef.current[userId].destroy();
//       delete peersRef.current[userId];
//       setPeers((prev) => {
//         const newPeers = { ...prev };
//         delete newPeers[userId];
//         return newPeers;
//       });
//       if (peerVideoRefs.current[userId]) {
//         peerVideoRefs.current[userId].srcObject = null;
//         delete peerVideoRefs.current[userId];
//       }
//     }
//   };

//   return (
//     <ErrorBoundary>
//       <div>
//         {!inRoom ? (
//           <div className="join-room">
//             <input
//               type="text"
//               value={roomId}
//               onChange={(e) => setRoomId(e.target.value)}
//               placeholder="Enter Room ID"
//             />
//             <button onClick={joinRoom}>Join Room</button>
//           </div>
//         ) : (
//           <div>
//             <div className="controls">
//               <button onClick={toggleVideo}>
//                 {isVideoOn ? 'Turn Video Off' : 'Turn Video On'}
//               </button>
//               <button onClick={toggleAudio}>
//                 {isAudioOn ? 'Mute Audio' : 'Unmute Audio'}
//               </button>
//               <button onClick={toggleScreenShare}>
//                 {isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
//               </button>
//             </div>
//             <div className="video-container">
//               <div className="video-item">
//                 <video
//                   ref={userVideoRef}
//                   autoPlay
//                   muted
//                   playsInline
//                   style={{ width: '320px', height: '240px', border: '1px solid #000', background: '#000' }}
//                 />
//                 <div>Your Video</div>
//               </div>
//               {Object.keys(peers).map((userId) => (
//                 <div className="video-item" key={userId}>
//                   <video
//                     ref={(el) => {
//                       if (el && !peerVideoRefs.current[userId]) {
//                         peerVideoRefs.current[userId] = el;
//                         logDebug(`Peer video ref assigned for ${userId}: ${!!el}`);
//                         if (peersRef.current[userId]?.remoteStream) {
//                           el.srcObject = peersRef.current[userId].remoteStream;
//                           el.play().catch((err) => {
//                             logDebug(`Error playing video for ${userId}: ${err.message}`);
//                           });
//                         }
//                       }
//                     }}
//                     autoPlay
//                     playsInline
//                     style={{ width: '320px', height: '240px', border: '1px solid #000', background: '#000' }}
//                   />
//                   <div>Peer: {userId}</div>
//                 </div>
//               ))}
//             </div>
//             <div className="debug">
//               <h4>Debug Log:</h4>
//               <ul>
//                 {debugLog.map((log, index) => (
//                   <li key={index}>{log}</li>
//                 ))}
//               </ul>
//             </div>
//           </div>
//         )}
//         <style>
//           {`
//             .video-container {
//               display: flex;
//               flex-wrap: wrap;
//               gap: 10px;
//             }
//             .video-item {
//               display: flex;
//               flex-direction: column;
//               align-items: center;
//             }
//             .controls {
//               margin-bottom: 10px;
//               display: flex;
//               gap: 10px;
//             }
//             .controls button {
//               padding: 8px 16px;
//               cursor: pointer;
//             }
//           `}
//         </style>
//       </div>
//     </ErrorBoundary>
//   );
// };

// export default Video;



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

  const socketRef = useRef();
  const userVideoRef = useRef();
  const peerVideoRefs = useRef({});
  const pendingCandidates = useRef({});
  const peersRef = useRef({});

  const logDebug = useCallback((msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
    setDebugLog((prev) => [...prev, `[${timestamp}] ${msg}`].slice(-50));
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
    socketRef.current.on('reconnect', (attempt) => {
      logDebug(`Reconnected after attempt ${attempt}`);
      if (inRoom) {
        logDebug('Socket reconnected, rejoining room...');
        socketRef.current.emit('join-room', roomId, socketRef.current.id);
      }
    });
    socketRef.current.on('reconnect_failed', () => logDebug('Reconnection failed after maximum attempts'));

    socketRef.current.on('user-joined', handleUserJoined);
    socketRef.current.on('offer', handleOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleIceCandidate);
    socketRef.current.on('user-left', handleUserLeft);

    return () => {
      socketRef.current.disconnect();
      Object.keys(peersRef.current).forEach((userId) => {
        peersRef.current[userId].destroy();
        delete peersRef.current[userId];
      });
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      setPeers({});
      setLocalStream(null);
      peerVideoRefs.current = {};
      pendingCandidates.current = {};
      logDebug('Component unmounted, cleaned up resources.');
    };
  }, [logDebug, inRoom, roomId]);

  useEffect(() => {
    if (!localStream || !inRoom || !userVideoRef.current) return;

    userVideoRef.current.srcObject = localStream;
    userVideoRef.current.play().catch((err) => {
      logDebug(`Error playing local video: ${err.message}`);
    });
    logDebug('Local stream assigned to video element.');
  }, [localStream, inRoom, logDebug]);

  const joinRoom = async () => {
    if (!roomId.trim()) {
      alert('Please enter a Room ID.');
      logDebug('Please enter a Room ID.');
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
      if (err.name === 'NotAllowedError') {
        alert('Please grant camera and microphone permissions to join the room.');
      } else if (err.name === 'NotFoundError') {
        alert('No camera or microphone found. Please check your device and try again.');
      } else {
        alert(`Failed to access media: ${err.message}. Please try again.`);
      }
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
        // Update tracks in all peer connections
        Object.keys(peersRef.current).forEach((userId) => {
          const peer = peersRef.current[userId];
          const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack.enabled ? videoTrack : null).catch((err) => {
              logDebug(`Error replacing video track for ${userId}: ${err.message}`);
            });
          }
        });
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
        // Update tracks in all peer connections
        Object.keys(peersRef.current).forEach((userId) => {
          const peer = peersRef.current[userId];
          const sender = peer._pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) {
            sender.replaceTrack(audioTrack.enabled ? audioTrack : null).catch((err) => {
              logDebug(`Error replacing audio track for ${userId}: ${err.message}`);
            });
          }
        });
      }
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing, revert to camera
      localStream.getTracks().forEach((track) => track.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        setIsScreenSharing(false);
        logDebug('Switched back to camera stream.');
        logDebug(`Local stream tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.enabled}`).join(', ')}`);
        // Update tracks in all peer connections
        Object.keys(peersRef.current).forEach((userId) => {
          const peer = peersRef.current[userId];
          const videoTrack = stream.getVideoTracks()[0];
          const audioTrack = stream.getAudioTracks()[0];
          const videoSender = peer._pc.getSenders().find((s) => s.track?.kind === 'video');
          const audioSender = peer._pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (videoSender && videoTrack) {
            videoSender.replaceTrack(videoTrack).catch((err) => {
              logDebug(`Error replacing video track for ${userId}: ${err.message}`);
            });
          }
          if (audioSender && audioTrack) {
            audioSender.replaceTrack(audioTrack).catch((err) => {
              logDebug(`Error replacing audio track for ${userId}: ${err.message}`);
            });
          }
        });
      } catch (err) {
        logDebug(`Error reverting to camera stream: ${err.message}`);
        alert('Failed to revert to camera stream. Please check permissions.');
        return;
      }
    } else {
      // Start screen sharing
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setLocalStream(stream);
        setIsScreenSharing(true);
        logDebug('Screen sharing started.');
        logDebug(`Local stream tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.enabled}`).join(', ')}`);
        stream.getVideoTracks()[0].onended = () => {
          toggleScreenShare(); // Revert to camera when screen sharing stops
        };
        // Update tracks in all peer connections
        Object.keys(peersRef.current).forEach((userId) => {
          const peer = peersRef.current[userId];
          const videoTrack = stream.getVideoTracks()[0];
          const videoSender = peer._pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender && videoTrack) {
            videoSender.replaceTrack(videoTrack).catch((err) => {
              logDebug(`Error replacing video track for ${userId}: ${err.message}`);
            });
          }
        });
      } catch (err) {
        logDebug(`Error starting screen share: ${err.message}`);
        alert('Failed to start screen sharing. Please try again.');
        return;
      }
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
      if (signal.type === 'offer') {
        socketRef.current.emit('offer', { signal, to: userId });
      } else if (signal.type === 'answer') {
        socketRef.current.emit('answer', { signal, to: userId });
      } else if (signal.candidate) {
        socketRef.current.emit('ice-candidate', { candidate: signal.candidate, to: userId });
      }
    });

    peer.on('stream', (stream) => {
      logDebug(`Received stream from ${userId}, tracks: ${stream.getTracks().map((t) => `${t.kind}:${t.enabled}`).join(', ')}`);
      peersRef.current[userId].remoteStream = stream;
      if (peerVideoRefs.current[userId]) {
        peerVideoRefs.current[userId].srcObject = stream;
        peerVideoRefs.current[userId].play().catch((err) => {
          logDebug(`Error playing video for ${userId}: ${err.message}`);
        });
        logDebug(`Stream assigned to video element for ${userId}`);
      }
    });

    peer.on('connect', () => logDebug(`Peer connection established with ${userId}`));
    peer.on('error', (err) => logDebug(`Peer error (${userId}): ${err.message}`));
    peer.on('close', () => {
      logDebug(`Peer connection closed for ${userId}`);
      handleUserLeft(userId);
    });
    peer.on('iceconnectionstatechange', () => {
      logDebug(`ICE connection state for ${userId}: ${peer._pc.iceConnectionState}`);
      if (peer._pc.iceConnectionState === 'disconnected' || peer._pc.iceConnectionState === 'failed') {
        handleUserLeft(userId);
      }
    });

    peersRef.current[userId] = peer;
    // Process queued signals
    if (pendingCandidates.current[userId]) {
      pendingCandidates.current[userId].forEach((signal) => {
        if ((signal.type === 'offer' && peer._pc.signalingState === 'stable') ||
            (signal.type === 'answer' && peer._pc.signalingState === 'have-local-offer') ||
            (signal.candidate && peer._pc.remoteDescription)) {
          peer.signal(signal);
        }
      });
      delete pendingCandidates.current[userId];
    }

    return peer;
  };

  const handleUserJoined = (userId) => {
    logDebug(`User joined: ${userId}, current peers: ${Object.keys(peersRef.current)}`);
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
    if (peer._pc.signalingState === 'stable' || peer._pc.signalingState === 'have-local-offer') {
      peer.signal(data.signal);
    } else {
      logDebug(`Queuing offer from ${data.from} due to signaling state: ${peer._pc.signalingState}`);
      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }
      pendingCandidates.current[data.from].push(data.signal);
    }
  };

  const handleAnswer = (data) => {
    logDebug(`Received answer from ${data.from}`);
    const peer = peersRef.current[data.from];
    if (peer && peer._pc.signalingState === 'have-local-offer') {
      peer.signal(data.signal);
    } else {
      logDebug(`No peer or invalid signaling state for answer from ${data.from}: ${peer?._pc.signalingState || 'no peer'}`);
      if (!pendingCandidates.current[data.from]) {
        pendingCandidates.current[data.from] = [];
      }
      pendingCandidates.current[data.from].push(data.signal);
    }
  };

  const handleIceCandidate = (data) => {
    logDebug(`Received ICE candidate from ${data.from}`);
    const peer = peersRef.current[data.from];
    if (peer && peer._pc.remoteDescription) {
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
                      peerVideoRefs.current[userId] = el;
                      if (el && peersRef.current[userId]?.remoteStream) {
                        el.srcObject = peersRef.current[userId].remoteStream;
                        el.play().catch((err) => {
                          logDebug(`Error playing video for ${userId}: ${err.message}`);
                        });
                        logDebug(`Stream assigned to video element for ${userId}`);
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
            .controls {
              margin-bottom: 10px;
              display: flex;
              gap: 10px;
            }
            .controls button {
              padding: 8px 16px;
              cursor: pointer;
            }
          `}
        </style>
      </div>
    </ErrorBoundary>
  );
};

export default Video;