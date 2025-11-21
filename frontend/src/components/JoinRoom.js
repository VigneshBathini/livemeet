import React, { useState, useContext } from 'react';
import { AuthContext } from './AuthContext';
import SchedulePage from './SchedulePage';

const JoinRoom = ({ roomId, setRoomId, userName, setUserName, userEmail, setUserEmail, joinRoom, createRoom, isExternal, addAlert }) => {
  const { user } = useContext(AuthContext);
  const [showSchedulePage, setShowSchedulePage] = useState(false);
  const [localAlerts, setLocalAlerts] = useState([]);

  const handleAddAlert = (message, type = 'error') => {
    if (addAlert) {
      addAlert(message, type);
    } else {
      const id = Date.now();
      setLocalAlerts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setLocalAlerts((prev) => prev.filter((alert) => alert.id !== id));
      }, 5000);
    }
  };

  return (
    <div className="app-container">
      <div className="alert-container">
        {localAlerts.map((alert) => (
          <div key={alert.id} className={`alert alert-${alert.type}`}>
            {alert.message}
            <button
              onClick={() => setLocalAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
              className="alert-close"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {showSchedulePage ? (
        <div className="schedule-page-container">
          <SchedulePage
            onScheduleComplete={() => {
              setShowSchedulePage(false);
              handleAddAlert('Meeting scheduled successfully.', 'success');
            }}
            onBack={() => setShowSchedulePage(false)} 
          />
        </div>
      ) : (
        <div className="join-room">
          <h2>{isExternal ? 'Join Meeting' : 'Create or Join Meeting'}</h2>
          {!isExternal && (
            <input
              type="text"
              placeholder="Your Name"
              disabled
              value={userName || user?.name || ''}
              onChange={(e) => setUserName(e.target.value)}
              aria-label="Your Name"
            />
          )}
          {!isExternal && (
            <input
              type="email"
              placeholder="Your Email"
              value={userEmail || user?.email || ''}
              disabled
              onChange={(e) => setUserEmail(e.target.value)}
              aria-label="Your Email"
            />
          )}
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={isExternal}
            aria-label="Room ID"
          />
          <div className="join-buttons">
            {!isExternal && <button onClick={createRoom}>Create Room</button>}
            <button onClick={joinRoom}>Join Room</button>
            {!isExternal && (
              <button
                onClick={() => setShowSchedulePage(true)}
                title="Schedule meeting"
                aria-label="Schedule a new meeting"
              >
                <i className="fas fa-calendar-alt"></i> Schedule Meeting
              </button>
            )}
          </div>
        </div>
      )}
      <style>
        {`
          :root {
            --primary-bg: #1a1a2e;
            --secondary-bg: #16213e;
            --accent-blue: #00b7eb;
            --accent-purple: #6b48ff;
            --text-color: #e0e0e0;
            --border: #2e2e4b;
            --error: #ff4d4d;
            --success: #00cc69;
            --warning: #ffaa00;
            --info: #00b7eb;
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

          .schedule-page-container {
            width: 100%;
            max-width: 800px;
            margin: auto;
            padding: 24px;
            background: var(--secondary-bg);
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            max-height: calc(100vh - 80px);
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }

          .schedule-page-container::-webkit-scrollbar {
            width: 8px;
          }

          .schedule-page-container::-webkit-scrollbar-track {
            background: var(--primary-bg);
            border-radius: 4px;
          }

          .schedule-page-container::-webkit-scrollbar-thumb {
            background: var(--accent-blue);
            border-radius: 4px;
          }

          .schedule-page-container::-webkit-scrollbar-thumb:hover {
            background: var(--accent-purple);
          }

          @media (max-width: 768px) {
            .join-room {
              padding: 16px;
              max-width: 90%;
            }
            .schedule-page-container {
              padding: 16px;
              max-width: 90%;
              max-height: calc(100vh - 60px);
            }
            .join-buttons {
              flex-direction: column;
            }
            .join-buttons button {
              width: 100%;
            }
            .alert-container {
              top: 8px;
              right: 8px;
              max-width: 90%;
            }
          }
        `}
      </style>
    </div>
  );
};

export default JoinRoom;