// src/components/lobby/LobbyPanel.jsx
import React from 'react';

const LobbyPanel = ({
  waitingUsers,
  approveUser,
  denyUser,
  setShowSidePanel
}) => {
  const getInitials = (name = '') => {
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  };

  const formatEmail = (email) => {
    if (!email) return '';
    if (email.length > 24) {
      return email.substring(0, 21) + '...';
    }
    return email;
  };

  return (
    <div className="side-panel open">
      <div className="chat-container">
        <div className="chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#ffaa00',
              borderRadius: '50%',
              animation: 'pulse 2s infinite'
            }}></div>
            <h3>Waiting in Lobby ({waitingUsers.length})</h3>
          </div>
          <button onClick={() => setShowSidePanel(false)} title="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="chat-messages-wrapper">
          <div className="chat-messages" style={{ padding: '8px', backgroundColor: '#1c1c38', borderRadius: '6px' }}>
            {waitingUsers.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px 20px', 
                color: '#a0a0c0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                <i className="fas fa-users" style={{ fontSize: '32px', opacity: '0.5' }}></i>
                <p>No participants waiting</p>
              </div>
            ) : (
              waitingUsers.map((user) => (
                <div key={user.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: '#24244a',
                  borderRadius: '6px',
                  marginBottom: '8px',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      flexShrink: 0
                    }}>
                      {getInitials(user.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ 
                        fontWeight: '500', 
                        color: '#fff',
                        fontSize: '13px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {user.name}
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#a0a0c0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {formatEmail(user.email)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => approveUser(user.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        background: '#00cc69',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px'
                      }}
                      title="Approve"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => denyUser(user.id)}
                      style={{
                        width: '32px',
                        height: '32px',
                        background: '#ff4d4d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px'
                      }}
                      title="Deny"
                    >
                      ✗
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyPanel;