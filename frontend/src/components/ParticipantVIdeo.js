// components/ParticipantVideo.jsx
import React, { useEffect, useRef } from 'react';


const ParticipantVideo = ({
  userId,
  type,
  isLocal = false,
  userName,
  connectionStatus,
  participantControls,
  isHost,
  toggleParticipantMedia,
  peerVideoRefs,
  pendingRemoteStreams,
  peersRef,
  shortId,
  isVideoOn: localVideoOn,
  isAudioOn: localAudioOn,
  logDebug
}) => {
  const videoRef = useRef(null);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Clean up when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        videoRef.current.srcObject = null;
        videoRef.current.pause();
      }
    };
  }, []);
  
  const getInitials = (name = '') => {
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  };

  const isScreenShare = type === 'screen';
  const isCamera = type === 'camera';
  const status = connectionStatus?.[userId];
  
  // If user has left, don't render the video
  if (status?.status === 'left' || !status) {
    return null;
  }  
  const controls = participantControls?.[userId];
  const displayName = status?.userName || userName || `Participant (${shortId(userId)})`;
  const videoOn = isLocal ? localVideoOn : status?.videoOn;
  const audioOn = isLocal ? localAudioOn : status?.audioOn;

  // FIX: Safe access to peerVideoRefs
  const getVideoRefs = () => {
    if (!peerVideoRefs?.current) {
      peerVideoRefs.current = {};
    }
    if (!peerVideoRefs.current[userId]) {
      peerVideoRefs.current[userId] = {};
    }
    return peerVideoRefs.current[userId];
  };

  if (isScreenShare) {
    const videoRefs = getVideoRefs();
    
    return (
      <div className="video-item screen-share-item">
        <div className="video-wrapper screen-share-video">
          <video
            ref={(el) => {
              if (el) {
                const refs = getVideoRefs();
                refs.screen = el;
                if (pendingRemoteStreams?.current?.[userId]?.screen) {
                  el.srcObject = pendingRemoteStreams.current[userId].screen;
                  el.play().catch(() => { });
                  pendingRemoteStreams.current[userId].screen = null;
                }
              }
            }}
            autoPlay
            playsInline
            muted={isLocal}
            className="video-element screen-element"
          />
          <div className="video-overlay">
            <span className="video-name">
              {displayName} - Screen Share
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

  if (isCamera) {
    return (
      <div className="video-item">
        <div className="video-wrapper">
          <video
            ref={(el) => {
              if (el) {
                const refs = getVideoRefs();
                if (refs.camera !== el) {
                  refs.camera = el;
                  logDebug(`Video element READY for ${shortId(userId)}`);
                  
                  // Check for pending streams
                  const stream = pendingRemoteStreams?.current?.[userId]?.camera ||
                    peersRef?.current?.[userId]?._remoteStreams?.camera;
                  
                  if (stream) {
                    el.srcObject = stream;
                    el.play().catch(() => { });
                    if (pendingRemoteStreams?.current?.[userId]) {
                      pendingRemoteStreams.current[userId].camera = null;
                    }
                  }
                }
              }
            }}
            autoPlay
            playsInline
            muted={isLocal}
            className="video-element"
            style={{
              opacity: !isLocal && videoOn === false ? 0 : 1,
              transition: 'opacity 0.4s ease',
            }}
          />
          {!isLocal && videoOn === false && (
            <div className="initials-avatar">
              <div className="initials-text">
                {getInitials(displayName)}
              </div>
              <div className="avatar-status">Camera Off</div>
            </div>
          )}
          <div className="video-overlay">
            <span className="video-name">
              {isLocal ? `You (${userName})` : displayName}
              {status?.streams?.screen && " (sharing)"}
            </span>
            <div className="video-status">
              {isHost && !isLocal ? (
                <div className="proctor-controls">
                  <button
                    onClick={() => toggleParticipantMedia(userId, 'video')}
                    disabled={videoOn === false}
                  >
                    {videoOn !== false
                      ? <i className="fas fa-video"></i>
                      : <i className="fas fa-video-slash text-danger"></i>
                    }
                  </button>
                  <button
                    onClick={() => toggleParticipantMedia(userId, 'audio')}
                    disabled={audioOn === false}
                  >
                    {audioOn !== false
                      ? <i className="fas fa-microphone"></i>
                      : <i className="fas fa-microphone-slash text-danger"></i>
                    }
                  </button>
                  <button onClick={() => toggleParticipantMedia(userId, 'proctor')}>
                    {controls?.proctor ? <i className="fas fa-user-check text-success"></i> : <i className="fas fa-user"></i>}
                  </button>
                </div>
              ) : (
                <>
                  {videoOn !== false ? <i className="fas fa-video"></i> : <i className="fas fa-video-slash text-danger"></i>}
                  {audioOn !== false ? <i className="fas fa-microphone"></i> : <i className="fas fa-microphone-slash text-danger"></i>}
                  {controls?.proctor && <i className="fas fa-eye text-warning"></i>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ParticipantVideo;