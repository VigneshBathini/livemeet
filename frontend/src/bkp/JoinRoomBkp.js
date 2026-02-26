import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import SchedulePage from './SchedulePage';
import { useNavigate } from 'react-router-dom';
import './JoinRoom.css';

const JoinRoom = ({
  roomId,
  setRoomId,
  userName,
  setUserName,
  userEmail,
  setUserEmail,
  joinRoom,
  createRoom,
  isExternal,
  addAlert
}) => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [showSchedulePage, setShowSchedulePage] = useState(false);
  const [localAlerts, setLocalAlerts] = useState([]);
  const [showReadinessCheck, setShowReadinessCheck] = useState(true);
  const [deviceReadiness, setDeviceReadiness] = useState({
    camera: false,
    microphone: false,
    screenShare: false
  });

  // Check device readiness
  useEffect(() => {
    const checkDevices = async () => {
      try {
        // Check camera
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        setDeviceReadiness(prev => ({ ...prev, camera: true }));
        cameraStream.getTracks().forEach(track => track.stop());

        // Check microphone
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setDeviceReadiness(prev => ({ ...prev, microphone: true }));
        micStream.getTracks().forEach(track => track.stop());

        // Check screen sharing (optional)
        if (navigator.mediaDevices.getDisplayMedia) {
          setDeviceReadiness(prev => ({ ...prev, screenShare: true }));
        }
      } catch (error) {
        console.log('Device check error:', error);
      }
    };

    checkDevices();
  }, []);

  const handleAddAlert = (message, type = 'error') => {
    if (addAlert) return addAlert(message, type);
    const id = Date.now();
    setLocalAlerts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setLocalAlerts(prev => prev.filter(a => a.id !== id)), 5000);
  };

  const handleJoinMeeting = () => {
    if (!roomId.trim()) {
      handleAddAlert('Please enter a meeting code', 'error');
      return;
    }
    joinRoom();
  };

  return (
    <div className="join-room-container">
      {/* Animated background */}
      <div className="join-room-bg">
        <div className="join-room-bg-circle circle-1" />
        <div className="join-room-bg-circle circle-2" />
        <div className="join-room-bg-circle circle-3" />
        <div className="join-room-bg-grid" />
      </div>

      {/* Header */}
      <header className="join-room-header">
        <div className="join-room-brand">
          <div className="join-room-logo">
            <i className="fas fa-shield-alt"></i>
          </div>
          <div className="join-room-brand-text">
            <h1 className="join-room-title">Proctor<span className="join-room-title-accent">Meet</span></h1>
            <p className="join-room-subtitle">Professional Proctoring Platform</p>
          </div>
        </div>
           
        <div className="join-room-header-actions">
          <button 
            className="join-room-ghost-btn"
            onClick={() => navigate('/scheduled-meetings')}
          >
            <i className="fas fa-calendar-alt"></i>
            <span>Scheduled Meetings</span>
          </button>
          <button 
            className="join-room-ghost-btn"
            onClick={logout}
          >
            <i className="fas fa-sign-out-alt"></i>
            <span>Log Out</span>
          </button>
        </div>
      </header>

      {/* Alerts */}
      <div className="join-room-alerts">
        {localAlerts.map(a => (
          <div key={a.id} className={`join-room-alert alert-${a.type}`}>
            <div className="join-room-alert-message">{a.message}</div>
            <button 
              className="join-room-alert-close"
              onClick={() => setLocalAlerts(prev => prev.filter(x => x.id !== a.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Main content */}
      <main className="join-room-main">
        {showSchedulePage ? (
          <div className="join-room-schedule-wrapper">
            <SchedulePage
              onScheduleComplete={() => {
                setShowSchedulePage(false);
                handleAddAlert('Meeting scheduled successfully.', 'success');
              }}
              onBack={() => setShowSchedulePage(false)}
            />
          </div>
        ) : (
          <div className="join-room-card">
            <div className="join-room-card-inner">
              
              {/* Left section - Primary actions */}
              <div className="join-room-left-section">
                
                {/* Role indicator */}
                <div className="join-room-role-indicator">
                  <i className="fas fa-user-tie"></i>
                  <span>Logged in as: <strong>Host/Examiner</strong></span>
                </div>

                {/* Hero section */}
                <div className="join-room-hero">
                  <h2 className="join-room-hero-title">Start a Proctoring Session</h2>
                  <p className="join-room-hero-subtitle">
                    Create an instant proctored exam session or schedule one for later
                  </p>

                  {/* DOMINANT PRIMARY ACTION */}
                  <div className="join-room-primary-action">
                    <button
                      onClick={createRoom}
                      className="join-room-primary-button"
                      title="Create and start a new proctoring session"
                    >
                      <div className="join-room-primary-button-icon">
                        <i className="fas fa-play"></i>
                      </div>
                      <div className="join-room-primary-button-content">
                        <h3 className="join-room-primary-button-title">
                          Create & Start Proctoring Session
                        </h3>
                        <p className="join-room-primary-button-desc">
                          Launch a new proctored meeting instantly
                        </p>
                      </div>
                      <div className="join-room-primary-button-arrow">
                        <i className="fas fa-arrow-right"></i>
                      </div>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="join-room-divider">
                    <span className="join-room-divider-text">or</span>
                  </div>

                  {/* Secondary action - Join (ENHANCED) */}
                  <div className="join-room-secondary-section">
                    <h3 className="join-room-secondary-title">
                      <i className="fas fa-sign-in-alt"></i>
                      Join Existing Session
                    </h3>
                    <div className="join-room-join-form">
                      <div className="join-room-input-group">
                        <label className="join-room-input-label">
                          Meeting ID / Code
                          <span className="join-room-input-example">Example: 123-456-789</span>
                        </label>
                        <div className="join-room-input-wrapper">
                          <i className="fas fa-hashtag join-room-input-icon"></i>
                          <input
                            type="text"
                            value={roomId}
                            onChange={e => setRoomId(e.target.value)}
                            placeholder="Enter meeting code"
                            className="join-room-input"
                            onKeyDown={(e) => e.key === 'Enter' && handleJoinMeeting()}
                          />
                          {roomId && (
                            <button 
                              className="join-room-input-clear"
                              onClick={() => setRoomId('')}
                              title="Clear"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          )}
                        </div>
                      </div>
                      <button 
                        className="join-room-secondary-button"
                        onClick={handleJoinMeeting}
                      >
                        <i className="fas fa-sign-in-alt"></i>
                        Join Meeting Now
                      </button>
                    </div>
                  </div>

                  {/* Exam Readiness Check (NEW) */}
                  <div className={`join-room-readiness-check ${showReadinessCheck ? 'expanded' : 'collapsed'}`}>
                    <div 
                      className="join-room-readiness-header"
                      onClick={() => setShowReadinessCheck(!showReadinessCheck)}
                    >
                      <i className="fas fa-clipboard-check"></i>
                      <span>Exam Readiness Check</span>
                      <i className={`fas fa-chevron-${showReadinessCheck ? 'up' : 'down'}`}></i>
                    </div>
                    {showReadinessCheck && (
                      <div className="join-room-readiness-content">
                        <p className="join-room-readiness-text">
                          Ensure your devices are ready for proctoring:
                        </p>
                        <div className="join-room-readiness-items">
                          <div className={`join-room-readiness-item ${deviceReadiness.camera ? 'ready' : 'not-ready'}`}>
                            <i className={`fas ${deviceReadiness.camera ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                            <span>Camera Access</span>
                            {!deviceReadiness.camera && (
                              <button 
                                className="join-room-readiness-fix"
                                onClick={() => handleAddAlert('Allow camera access in browser settings', 'warning')}
                              >
                                Fix
                              </button>
                            )}
                          </div>
                          <div className={`join-room-readiness-item ${deviceReadiness.microphone ? 'ready' : 'not-ready'}`}>
                            <i className={`fas ${deviceReadiness.microphone ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                            <span>Microphone Access</span>
                            {!deviceReadiness.microphone && (
                              <button 
                                className="join-room-readiness-fix"
                                onClick={() => handleAddAlert('Allow microphone access in browser settings', 'warning')}
                              >
                                Fix
                              </button>
                            )}
                          </div>
                          <div className={`join-room-readiness-item ${deviceReadiness.screenShare ? 'ready' : 'not-ready'}`}>
                            <i className={`fas ${deviceReadiness.screenShare ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                            <span>Screen Share Permissions</span>
                            {!deviceReadiness.screenShare && (
                              <button 
                                className="join-room-readiness-fix"
                                onClick={() => handleAddAlert('Enable screen sharing permissions', 'warning')}
                              >
                                Fix
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tertiary actions (ENHANCED) */}
                  <div className="join-room-tertiary-actions">
                    <button 
                      className="join-room-tertiary-button"
                      onClick={() => setShowSchedulePage(true)}
                    >
                      <div className="join-room-tertiary-icon">
                        <i className="fas fa-calendar-plus"></i>
                      </div>
                      <span className="join-room-tertiary-text">Schedule Meeting</span>
                    </button>
                    <button 
                      className="join-room-tertiary-button"
                      onClick={() => navigate('/profile')}
                    >
                      <div className="join-room-tertiary-icon">
                        <i className="fas fa-user-cog"></i>
                      </div>
                      <span className="join-room-tertiary-text">Profile Settings</span>
                    </button>
                    <button 
                      className="join-room-tertiary-button"
                      onClick={() => navigate('/guide')}
                    >
                      <div className="join-room-tertiary-icon">
                        <i className="fas fa-question-circle"></i>
                      </div>
                      <span className="join-room-tertiary-text">Quick Guide</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right section - User info and tips */}
              <div className="join-room-right-section">
                
                {/* User info panel */}
                <div className="join-room-user-panel">
                  <div className="join-room-user-header">
                    <div className="join-room-user-avatar">
                      {user?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="join-room-user-info">
                      <h4 className="join-room-user-name">{user?.name || 'Host User'}</h4>
                      <p className="join-room-user-email">{user?.email || 'host@proctormeet.com'}</p>
                    </div>
                  </div>
                  <div className="join-room-user-stats">
                    <div className="join-room-user-stat">
                      <div className="join-room-stat-value">12</div>
                      <div className="join-room-stat-label">Sessions Hosted</div>
                    </div>
                    <div className="join-room-user-stat">
                      <div className="join-room-stat-value">98%</div>
                      <div className="join-room-stat-label">Success Rate</div>
                    </div>
                  </div>
                </div>

                {/* Tips panel */}
                <div className="join-room-tips-panel">
                  <h4 className="join-room-tips-title">
                    <i className="fas fa-lightbulb"></i>
                    Proctoring Best Practices
                  </h4>
                  <ul className="join-room-tips-list">
                    <li>Test your devices before starting a session</li>
                    <li>Share meeting code with candidates in advance</li>
                    <li>Enable recording for audit trails</li>
                    <li>Use violation logging for suspicious activity</li>
                    <li>Keep browser and app updated</li>
                  </ul>
                </div>

                {/* Help panel */}
                <div className="join-room-help-panel">
                  <h4 className="join-room-help-title">
                    <i className="fas fa-life-ring"></i>
                    Need Assistance?
                  </h4>
                  <p className="join-room-help-text">
                    Check our proctoring guide or contact support for technical issues.
                  </p>
                  <div className="join-room-help-actions">
                    <button className="join-room-help-button">
                      <i className="fas fa-book"></i>
                      Documentation
                    </button>
                    <button className="join-room-help-button">
                      <i className="fas fa-headset"></i>
                      Contact Support
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JoinRoom;