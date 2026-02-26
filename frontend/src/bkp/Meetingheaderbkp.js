// src/components/MeetingHeader.jsx
import React from 'react';

const MeetingHeader = ({
  roomId,
  isHost,
  peers,
  showSidePanel,
  sidePanelType,
  toggleSidePanel,
  logout,
  isExternal,
  leaveRoom
}) => {
  return (
    <header className="top-bar">
      <div className="meeting-info">
        <h2>Meeting ID: {roomId} {isHost ? '(Host)' : ''}</h2>
        <span>{Object.keys(peers).length + 1} participant{Object.keys(peers).length !== 1 ? 's' : ''}</span>
      </div>
      <div className="top-controls">
        <button 
          onClick={() => toggleSidePanel('chat')} 
          className={showSidePanel && sidePanelType === 'chat' ? 'active' : ''}
          title="Chat"
        >
          <i className="fas fa-comment"></i>
        </button>

        {isHost && (
          <button 
            onClick={() => toggleSidePanel('lobby')} 
            className={showSidePanel && sidePanelType === 'lobby' ? 'active' : ''}
            title="Waiting Participants"
          >
            <i className="fas fa-users"></i>
            {/* Optional: show badge when people waiting */}
            {/* {waitingUsers.length > 0 && <span className="badge">{waitingUsers.length}</span>} */}
          </button>
        )}

        {/* <button onClick={() => setShowDebug(!showDebug)} title="Debug">
          <i className="fas fa-bug"></i>
        </button> */}

        <button onClick={leaveRoom} title="Leave meeting">
          <i className="fas fa-sign-out-alt"></i>
        </button>
      </div>
    </header>
  );
};

export default MeetingHeader;