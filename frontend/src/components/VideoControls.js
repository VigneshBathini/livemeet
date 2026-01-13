// VideoControls.jsx
import React from 'react';

const VideoControls = ({
  toggleVideo,
  toggleAudio,
  toggleScreenShare,
  leaveRoom,
  isVideoOn,
  isAudioOn,
  isScreenSharing,
  logout,
  isExternal
}) => {
  return (
    <div className="controls">
      <button
        onClick={toggleVideo}
        className={isVideoOn ? '' : 'disabled'}
        title={isVideoOn ? 'Turn off camera' : 'Turn on camera'}
      >
        <i className={isVideoOn ? 'fas fa-video' : 'fas fa-video-slash'}></i>
      </button>
      <button
        onClick={toggleAudio}
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
      {/* {!isExternal && (
        <button onClick={logout} title="Log Out">
          <i className="fas fa-sign-out-alt"></i>
        </button>
      )} */}
      <button onClick={leaveRoom} title="Leave meeting">
        <i className="fas fa-sign-out-alt"></i>
      </button>
    </div>
  );
};

export default VideoControls;