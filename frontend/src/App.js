import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Video from './components/Video';
import LoginPage from './components/LoginPage';
import JoinMeetingPage from './components/JoinMeetingPage';
import SchedulePage from './components/SchedulePage';
import { AuthContext } from './components/AuthContext';
import SignupPage from './components/SignupPage';
import ScheduledMeetings from './components/ScheduledMeetings';

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
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} /> 
            <Route
              path="/video"
              element={user ? <Video /> : <Navigate to="/login" replace />}
            />
            <Route path="/join/:meetingId" element={<JoinMeetingPage />} />
            <Route
              path="/schedule"
              element={user ? <SchedulePage /> : <Navigate to="/login" replace />}
            />
            <Route path="/" element={<Navigate to="/video" replace />} />
            <Route path="*" element={<Navigate to="/video" replace />} />
            <Route path="/meeting/:roomId" element={
  <Video isExternal={true} />
} />
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
          `}
        </style>
      </Router>
    </AuthContext.Provider>
  );
};

export default App;