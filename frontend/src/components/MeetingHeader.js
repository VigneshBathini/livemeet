// MeetingHeader.jsx
import React from 'react';

const MeetingHeader = ({
  roomId,
  isHost,
  peers,
  showChat,
  setShowChat,
  showDebug,
  setShowDebug,
  logout,
  isExternal,
  leaveRoom
}) => {
  return (
    <header className="top-bar">
      <div className="meeting-info">
        <h2>Meeting ID: {roomId} {isHost ? '(Host)' : ''}</h2>
        <span>{Object.keys(peers).length + 1} participant(s)</span>
      </div>
      <div className="top-controls">
        <button onClick={() => setShowChat(!showChat)} title={showChat ? 'Hide Chat' : 'Show Chat'}>
          <i className="fas fa-comment"></i>
        </button>
        <button onClick={() => setShowDebug(!showDebug)} title={showDebug ? 'Hide Debug' : 'Show Debug'}>
          <i className="fas fa-bug"></i>
        </button>
       {!isExternal &&   <button onClick={leaveRoom} title="Leave meeting">
        <i className="fas fa-sign-out-alt"></i>
      </button>}
        {/* {!isExternal && <button onClick={logout} title="Log Out">Log Out</button>} */}
      </div>
    </header>
  );
};

export default MeetingHeader;