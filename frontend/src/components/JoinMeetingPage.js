import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Video from './Video';

// const API_URL = process.env.API_URL || "http://localhost:3000";

const API_URL = "https://livemeet-ribm.onrender.com";

const JoinMeetingPage = ({
  addAlert = (msg, type) => console.log(`${type}: ${msg}`),
}) => {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validated, setValidated] = useState(false);
  const [isHost, setIsHost] = useState(false);
  
  // NEW: Track if we're joining from scheduled meetings
  const [isScheduledJoin, setIsScheduledJoin] = useState(false);
  const [scheduledJoinData, setScheduledJoinData] = useState(null);

  // Check if we're joining from scheduled meetings (via sessionStorage or location state)
  useEffect(() => {
    // Method 1: Check sessionStorage (from ScheduledMeetings)
    const stored = sessionStorage.getItem('joiningMeeting');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        
        // Verify it's for the current meeting
        if (data.roomId === meetingId) {
          console.log('📅 Scheduled meeting join detected:', data);
          setIsScheduledJoin(true);
          setScheduledJoinData(data);
          
          // Auto-validate for logged-in users joining their scheduled meetings
          validateScheduledJoin(data);
          
          // Clear storage after processing
          sessionStorage.removeItem('joiningMeeting');
        } else {
          console.log('Meeting ID mismatch, clearing stored data');
          sessionStorage.removeItem('joiningMeeting');
        }
      } catch (e) {
        console.error('Invalid joiningMeeting data', e);
        sessionStorage.removeItem('joiningMeeting');
      }
    }
    
    // Method 2: Check location state (direct navigation)
    if (location.state?.fromScheduled) {
      console.log('📅 Scheduled meeting join via location state:', location.state);
      setIsScheduledJoin(true);
      setScheduledJoinData(location.state);
      
      // Auto-validate
      validateScheduledJoin(location.state);
    }
  }, [meetingId, location.state]);

  const validateScheduledJoin = async (data) => {
    try {
      console.log('🔐 Validating scheduled meeting access for:', data.userEmail);
      
      const res = await axios.post(
        `${API_URL}/api/validate-invitee`,
        {
          meetingId,
          email: data.userEmail,
        }
      );

      if (res.data.valid) {
        console.log('✅ Scheduled join validated successfully');
        setValidated(true);
        setIsHost(!!res.data.isHost);
        
        // Update data with validation results
        setScheduledJoinData(prev => ({
          ...prev,
          ...data,
          validated: true,
          isHost: !!res.data.isHost
        }));
        
        addAlert(
          `Welcome ${data.userName}! Joining as ${res.data.isHost ? 'HOST' : 'Participant'}...`,
          'success'
        );
      } else {
        console.log('❌ Scheduled join validation failed');
        addAlert('You are not authorized to join this meeting', 'error');
        setIsScheduledJoin(false);
        setScheduledJoinData(null);
      }
    } catch (err) {
      console.error('Validation error:', err);
      addAlert('Failed to validate meeting access', 'error');
      setIsScheduledJoin(false);
      setScheduledJoinData(null);
    }
  };

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

  // RENDER LOGIC:
  // 1. If scheduled join AND validated → Show Video directly
  // 2. If normal validation succeeded → Show Video
  // 3. Otherwise → Show join form

  // Case 1: Scheduled join (logged-in user from ScheduledMeetings)
  if (isScheduledJoin && scheduledJoinData?.validated) {
    return (
      <Video
        key={`scheduled-${meetingId}-${Date.now()}`}
        isExternal={false} // Important: logged-in user
        meetingId={meetingId}
        userEmail={scheduledJoinData.userEmail}
        userName={scheduledJoinData.userName}
        isHostM={scheduledJoinData.isHost}
        addAlert={addAlert}
        validated={true}
      />
    );
  }

  // Case 2: Normal guest validation succeeded
  if (validated) {
    return (
      <Video
        key={`guest-${meetingId}-${email}-${Date.now()}`}
        isExternal={true} // External guest
        meetingId={meetingId}
        userEmail={email}
        userName={name}
        isHostM={isHost}
        addAlert={addAlert}
        validated={true}
      />
    );
  }

  // Case 3: Show join form (for both scheduled joins that failed validation AND new guests)
  return (
    <div className="join-meeting-page min-h-screen flex flex-col items-center justify-center py-6 overflow-auto">
      <div className="form-container">
        <h2>
          {isScheduledJoin ? 'Joining Scheduled Meeting' : 'Join Meeting'}
        </h2>
        
        {isScheduledJoin && scheduledJoinData && (
          <div className="scheduled-info">
            <p><strong>Meeting:</strong> {scheduledJoinData.meetingTitle || 'Scheduled Meeting'}</p>
            <p><strong>User:</strong> {scheduledJoinData.userName}</p>
            <p className="validating">Validating access...</p>
          </div>
        )}

        <form onSubmit={handleValidate} className="space-y-4">
          {!isScheduledJoin && (
            <>
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
            </>
          )}

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading || isScheduledJoin}>
            {loading ? 'Validating...' : 
             isScheduledJoin ? 'Auto-joining...' : 'Validate and Join'}
          </button>
          
          {isScheduledJoin && (
            <button 
              type="button" 
              className="cancel-btn"
              onClick={() => {
                setIsScheduledJoin(false);
                setScheduledJoinData(null);
              }}
            >
              Cancel Auto-join
            </button>
          )}
        </form>
      </div>

      <style>
        {`
          .join-meeting-page{background:#16213e;color:#e0e0e0}
          .form-container{padding:24px;background:#16213e;border-radius:12px;
            box-shadow:0 4px 20px rgba(0,0,0,.4);width:100%;max-width:500px}
          .join-meeting-page h2{font-size:22px;font-weight:600;margin-bottom:20px;text-align:center}
          
          .scheduled-info {
            background: rgba(0, 183, 235, 0.1);
            border-left: 4px solid #00b7eb;
            padding: 12px;
            margin-bottom: 20px;
            border-radius: 4px;
          }
          
          .scheduled-info p {
            margin: 5px 0;
            font-size: 14px;
          }
          
          .scheduled-info .validating {
            color: #00b7eb;
            font-style: italic;
          }
          
          .form-group{display:flex;align-items:center;margin-bottom:16px;gap:16px}
          .form-group label{flex:0 0 100px;font-size:14px;text-align:right}
          .form-group input{flex:1;padding:12px;border:1px solid #2e2e4b;
            border-radius:6px;font-size:14px;background:#24244a;color:#e0e0e0}
          .form-group input:focus{border-color:#00b7eb;outline:none}
          .error{margin:8px 0 0 116px;font-size:13px;color:#ff4d4d}
          
          button {
            margin-left: 116px;
            width: calc(100% - 116px);
            padding: 12px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            color: #e0e0e0;
            background: linear-gradient(135deg, #00b7eb, #6b48ff);
            transition: opacity .2s;
          }
          
          button:disabled {
            opacity: .6;
            cursor: not-allowed;
          }
          
          button:hover:not(:disabled) {
            opacity: .9;
          }
          
          .cancel-btn {
            margin-top: 10px;
            background: #2e2e4b !important;
          }
          
          .cancel-btn:hover:not(:disabled) {
            background: #3e3e5b !important;
          }
          
          @media(max-width:640px){
            .form-container{padding:16px;max-width:100%}
            .join-meeting-page h2{font-size:18px;margin-bottom:16px}
            .form-group{flex-direction:column;align-items:flex-start;gap:6px;margin-bottom:12px}
            .form-group label{flex:none;text-align:left;font-size:12px}
            .form-group input{width:100%;padding:8px;font-size:12px}
            .error{margin:6px 0 0 0;font-size:11px}
            button, .cancel-btn {
              margin-left: 0;
              width: 100%;
              padding: 10px;
              font-size: 12px;
            }
          }
        `}
      </style>
    </div>
  );
};

export default JoinMeetingPage;