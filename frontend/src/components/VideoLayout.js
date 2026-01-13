import React from 'react';
import ParticipantVideo from './ParticipantVIdeo';

const VideoLayout = ({
  isAnyScreenSharing,
  isScreenSharing,
  peers,
  connectionStatus,
  participantControls,
  isHost,
  toggleParticipantMedia,
  peerVideoRefs,
  pendingRemoteStreams,
  peersRef,
  shortId,
  userName,
  isVideoOn,
  isAudioOn,
  currentVideoPage,
  totalVideoPages,
  navigateVideoPage,
  getCurrentPageCameraVideos,
  localStreamRef,
  logDebug,
  userVideoRef
}) => {
  const getInitials = (name = '') => {
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  };

  const renderSlidesIndicator = () => {
    if (!isAnyScreenSharing || totalVideoPages <= 1) return null;

    return (
      <div className="slides-indicator">
        <button
          onClick={() => navigateVideoPage('prev')}
          className="slide-nav-btn"
          title="Previous page"
        >
          <i className="fas fa-chevron-left"></i>
        </button>
        <span className="slide-counter">
          &lt; {currentVideoPage} / {totalVideoPages} &gt;
        </span>
        <button
          onClick={() => navigateVideoPage('next')}
          className="slide-nav-btn"
          title="Next page"
        >
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>
    );
  };

  return (
    <div className={`video-gallery ${isAnyScreenSharing ? 'has-screen-share' : 'no-screen-share'}`}>
      <div className="video-layout-container">
        {isAnyScreenSharing && (
          <div className="screen-share-section">
            {/* Remote screen shares */}
            {Object.keys(peers).map((userId) => {
              const status = connectionStatus[userId];
              if (status?.streams?.screen) {
                return (
                  <ParticipantVideo
                    key={`${userId}-screen`}
                    userId={userId}
                    type="screen"
                    userName={status?.userName}
                    connectionStatus={connectionStatus}
                    participantControls={participantControls}
                    isHost={isHost}
                    toggleParticipantMedia={toggleParticipantMedia}
                    peerVideoRefs={peerVideoRefs}
                    pendingRemoteStreams={pendingRemoteStreams}
                    peersRef={peersRef}
                    shortId={shortId}
                    logDebug={logDebug}
                  />
                );
              }
              return null;
            })}

            {/* Local screen share */}
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
          </div>
        )}

        <div className="camera-videos-section">
          {getCurrentPageCameraVideos().map((videoId) => {
            if (videoId === 'local') {
              return (
                <div className="video-item local-video" key="local">
                  <div className="video-wrapper">
                    <video
                      ref={(el) => {
                        if (el && userVideoRef.current.camera !== el) {
                          userVideoRef.current.camera = el;
                          logDebug(`Local video element READY on page ${currentVideoPage}`);
                          if (localStreamRef.current && !el.srcObject) {
                            el.srcObject = localStreamRef.current;
                            el.play().catch((err) => {
                              logDebug(`Error playing local stream on page ${currentVideoPage}: ${err.message}`);
                            });
                            logDebug(`Assigned local stream to video element on page ${currentVideoPage}`);
                          }
                        }
                      }}
                      autoPlay
                      muted
                      playsInline
                      className="video-element"
                    />
                    {!isVideoOn && (
                      <div className="initials-avatar">
                        <div className="initials-text">{getInitials(userName)}</div>
                        <div className="avatar-status">Camera Off</div>
                      </div>
                    )}
                    <div className="video-overlay">
                      <span className="video-name">You ({userName})</span>
                      <div className="video-status">
                        {isVideoOn ? <i className="fas fa-video"></i> : <i className="fas fa-video-slash"></i>}
                        {isAudioOn ? <i className="fas fa-microphone"></i> : <i className="fas fa-microphone-slash"></i>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const userId = videoId;
            return (
              <ParticipantVideo
                key={`${userId}-camera`}
                userId={userId}
                type="camera"
                isLocal={false}
                connectionStatus={connectionStatus}
                participantControls={participantControls}
                isHost={isHost}
                toggleParticipantMedia={toggleParticipantMedia}
                peerVideoRefs={peerVideoRefs}
                pendingRemoteStreams={pendingRemoteStreams}
                peersRef={peersRef}
                shortId={shortId}
                logDebug={logDebug}
              />
            );
          })}
          {renderSlidesIndicator()}
        </div>
      </div>
    </div>
  );
};

export default VideoLayout;