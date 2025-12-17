// src/components/JoinMeetingPage.js
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Video from './Video';

// const API_URL = process.env.API_URL || "http://localhost:3000";

const API_URL = "https://livemeet-ribm.onrender.com";


const JoinMeetingPage = ({
  addAlert = (msg, type) => console.log(`${type}: ${msg}`),
}) => {
  const { meetingId } = useParams();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validated, setValidated] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const handleValidate = async (e) => {
    e.preventDefault();
    if (!email || !name) {
      setError('Email and name are required');
      addAlert('Email and name are required', 'error');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data } = await axios.post(
        `${API_URL}/api/validate-invitee`,
        { meetingId, email }
      );

      if (data.valid) {
        setValidated(true);
        setIsHost(!!data.isHost);
        console.log('Validation successful:', validated + ' isHost: ' + isHost);
        addAlert(
          `Welcome ${name}! Starting as ${data.isHost ? 'HOST' : 'Participant'}...`,
          'success'
        );
      } else {
        setError('You are not invited to this meeting');
        addAlert('Invalid invite', 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to validate email';
      setError(msg);
      addAlert(msg, 'error');
    } finally {
      setLoading(false);
    }
  };
 console.log('rendering JoinMeetingPage, validated:', validated);
  if (validated) {
    console.log('Rendering Video component with props:', {isHost,validated});
    return (
      <Video
        isExternal={true}
        meetingId={meetingId}
        userEmail={email}
        userName={name}
        isHostM={isHost}
        addAlert={addAlert}
        validated={true}
      />
    );
  }

  return (
    <div className="join-meeting-page min-h-screen flex flex-col items-center justify-center py-6 overflow-auto">
      <div className="form-container">
        <h2>Join Meeting</h2>

        <form onSubmit={handleValidate} className="space-y-4">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Validating...' : 'Validate and Join'}
          </button>
        </form>
      </div>

      <style>
        {`
          .join-meeting-page{background:#16213e;color:#e0e0e0}
          .form-container{padding:24px;background:#16213e;border-radius:12px;
            box-shadow:0 4px 20px rgba(0,0,0,.4);width:100%;max-width:500px}
          .join-meeting-page h2{font-size:22px;font-weight:600;margin-bottom:20px;text-align:center}
          .form-group{display:flex;align-items:center;margin-bottom:16px;gap:16px}
          .form-group label{flex:0 0 100px;font-size:14px;text-align:right}
          .form-group input{flex:1;padding:12px;border:1px solid #2e2e4b;
            border-radius:6px;font-size:14px;background:#24244a;color:#e0e0e0}
          .form-group input:focus{border-color:#00b7eb;outline:none}
          .error{margin:8px 0 0 116px;font-size:13px;color:#ff4d4d}
          button{margin-left:116px;width:calc(100% - 116px);padding:12px;
            border:none;border-radius:6px;cursor:pointer;font-size:14px;
            color:#e0e0e0;background:linear-gradient(135deg,#00b7eb,#6b48ff);
            transition:opacity .2s}
          button:disabled{opacity:.6;cursor:not-allowed}
          button:hover:not(:disabled){opacity:.9}
          @media(max-width:640px){
            .form-container{padding:16px;max-width:100%}
            .join-meeting-page h2{font-size:18px;margin-bottom:16px}
            .form-group{flex-direction:column;align-items:flex-start;gap:6px;margin-bottom:12px}
            .form-group label{flex:none;text-align:left;font-size:12px}
            .form-group input{width:100%;padding:8px;font-size:12px}
            .error{margin:6px 0 0 0;font-size:11px}
            button{margin-left:0;width:100%;padding:10px;font-size:12px}
          }
        `}
      </style>
    </div>
  );
};

export default JoinMeetingPage;