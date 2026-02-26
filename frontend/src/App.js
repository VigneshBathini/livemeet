// In App.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Video from './components/Video';
import LoginPage from './components/LoginPage';
import JoinMeetingPage from './components/JoinMeetingPage';
import SchedulePage from './components/SchedulePage';
import { AuthContext } from './components/AuthContext';
import SignupPage from './components/SignupPage';
import ScheduledMeetings from './components/ScheduledMeetings';
import LandingPage from './components/LandingPage';

// Create a ModalWrapper component
const ModalWrapper = ({ children }) => {
  const navigate = useNavigate();
  
  const handleClose = () => {
    navigate(-1); // Go back in history
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };
  

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content">
        {/* <button className="modal-close" onClick={handleClose}>
          ×
        </button> */}
        {children}
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (err) {
        console.error('Error parsing stored user:', err);
        localStorage.removeItem('user');
      }
    }
  }, []);

  const login = (user, token) => {
    setUser(user);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token); 
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <Router>
        <div className="app min-h-screen">
          <Routes>
            <Route path='/' element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} /> 
            <Route
              path="/video"
              element={user ? <Video /> : <Navigate to="/login" replace />}
            />
            <Route path="/join/:meetingId" element={<JoinMeetingPage />} />
            <Route
              path="/schedule"
              element={user ? (
                <ModalWrapper>
                  <SchedulePage />
                </ModalWrapper>
              ) : <Navigate to="/login" replace />}
            />
            <Route path="/" element={<Navigate to="/video" replace />} />
            <Route path="*" element={<Navigate to="/video" replace />} />
            <Route path="/meeting/:roomId" element={<Navigate to="/join/:roomId" replace />} />
            <Route path="/scheduled-meetings"
              element={user ? <ScheduledMeetings /> : <Navigate to="/login" replace />}
            />
          </Routes>
        </div>
        <style>
          {`
            .app {
              background: #16213e;
              color: #e0e0e0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              background: #16213e;
            }
            
            /* Modal Styles */
            .modal-overlay {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(13, 16, 32, 0.95);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 10000;
              backdrop-filter: blur(10px);
              animation: fadeIn 0.3s ease;
            }
            
            .modal-content {
              background: #0d1020;
              border-radius: 20px;
              width: 95%;
              max-width: 900px;
              height: 90%;
              max-height: 700px;
              position: relative;
              border: 1px solid rgba(255, 255, 255, 0.1);
              box-shadow: 0 30px 80px rgba(0, 0, 0, 0.8);
              overflow: hidden;
              animation: slideUp 0.4s ease;
            }
            
            .modal-close {
              position: absolute;
              top: 15px;
              right: 15px;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: #e9eef8;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 20px;
              cursor: pointer;
              z-index: 10001;
              transition: all 0.2s;
            }
            
            .modal-close:hover {
              background: rgba(255, 255, 255, 0.2);
              transform: scale(1.1);
            }
            
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            
            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(50px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}
        </style>
      </Router>
    </AuthContext.Provider>
  );
};

export default App;