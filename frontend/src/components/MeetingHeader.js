// src/components/MeetingHeader.jsx
import React from 'react';

const MeetingHeader = ({
  roomId,
  isHost,
  peers,
  waitingUsers = [], // Add this prop
  unreadChatCount = 0,
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
        <div className="lobby-button-container" style={{ position: 'relative' }}>
          <button
            onClick={() => toggleSidePanel('chat')}
            className={showSidePanel && sidePanelType === 'chat' ? 'active' : ''}
            title="Chat"
          >
            <i className="fas fa-comment"></i>
          </button>
          {unreadChatCount > 0 && (
            <span className="notification-badge">{unreadChatCount}</span>
          )}
        </div>

        {isHost && (
          <div className="lobby-button-container" style={{ position: 'relative' }}>
            <button 
              onClick={() => toggleSidePanel('lobby')} 
              className={showSidePanel && sidePanelType === 'lobby' ? 'active' : ''}
              title="Waiting Participants"
            >
              <i className="fas fa-users"></i>
            </button>
            {waitingUsers.length > 0 && (
              <span className="notification-badge">{waitingUsers.length}</span>
            )}
          </div>
        )}

        <button onClick={leaveRoom} title="Leave meeting">
          <i className="fas fa-sign-out-alt"></i>
        </button>
      </div>
    </header>
  );
};

export default MeetingHeader;
