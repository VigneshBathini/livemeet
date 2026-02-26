import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import Video from './Video';

const API_URL = process.env.API_URL || "http://localhost:3000";

const JoinMeetingPage = ({
  addAlert = (msg, type) => console.log(`${type}: ${msg}`),
}) => {
  const { meetingId } = useParams();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validated, setValidated] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [meetingDetails, setMeetingDetails] = useState(null);
  
  // For scheduled joins
  const [isScheduledJoin, setIsScheduledJoin] = useState(!!location.state?.fromScheduled);
  const [fromLoggedInSchedule, setFromLoggedInSchedule] = useState(!!location.state?.fromLogin);

  // Check for scheduled meeting join
  useEffect(() => {
    if (location.state?.fromScheduled) {
      setIsScheduledJoin(true);
    }
    if (location.state?.fromLogin) {
      setFromLoggedInSchedule(true);
    }

    const stored = sessionStorage.getItem('joiningMeeting');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.roomId === meetingId) {
          console.log('📅 Scheduled meeting join detected:', data);
          setIsScheduledJoin(true);
          setFromLoggedInSchedule(!!data.fromLogin);
          
          // Auto-fill form for validation
          setEmail(data.userEmail);
          setName(data.userName);
          
          // Auto-validate if possible
          if (data.userEmail && data.userName) {
            handleAutoValidate(data.userEmail, data.userName);
          }
          
          sessionStorage.removeItem('joiningMeeting');
        }
      } catch (e) {
        console.error('Invalid joiningMeeting data', e);
        sessionStorage.removeItem('joiningMeeting');
      }
    }
  }, [meetingId, location.state]);

  const handleLeaveMeeting = () => {
    setValidated(false);
  };

  const handleAutoValidate = async (userEmail, userName) => {
    try {
      setLoading(true);
      const { data } = await axios.post(
        `${API_URL}/api/validate-invitee`,
        { meetingId, email: userEmail }
      );

      if (data.valid) {
        setValidated(true);
        setIsHost(!!data.isHost);
        addAlert(
          `Welcome ${userName}! You're joining as ${data.isHost ? 'HOST' : 'participant'}`,
          'success'
        );
      } else {
        addAlert('You are not authorized to join this meeting', 'error');
      }
    } catch (err) {
      console.error('Auto-validation error:', err);
    } finally {
      setLoading(false);
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

      console.log('Validation response:', data); // Debug log

      if (data.valid) {
        setValidated(true);
        setIsHost(!!data.isHost);
        setMeetingDetails(data);
        
        // CRITICAL: Add a more specific alert
        addAlert(
          `Welcome ${name}! You are ${data.isHost ? 'the HOST' : 'a participant'}`,
          'success'
        );
        
        // Log for debugging
        console.log(`User ${name} (${email}) is host: ${data.isHost}`);
        console.log(`Meeting creator: ${data.creatorEmail}`);
      } else {
        setError(data.error || 'You are not invited to this meeting');
        addAlert('Invalid invite', 'error');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to validate email';
      setError(msg);
      addAlert(msg, 'error');
      console.error('Validation error:', err);
    } finally {
      setLoading(false);
    }
  };

  // If validated, show Video component
  if (validated) {
    return (
      <Video
        key={`${meetingId}-${email}-${Date.now()}`} // Force re-render
        isExternal={true} // Always true for this page (external/guest users)
        meetingId={meetingId}
        userEmail={email}
        userName={name}
        isHostM={isHost} // Pass the isHost value correctly
        validated={true}
        joinSource={fromLoggedInSchedule ? 'scheduled' : (isScheduledJoin ? 'scheduled-link' : 'invite')}
        leaveRedirectPath={fromLoggedInSchedule ? '/scheduled-meetings' : null}
        onLeaveMeeting={!fromLoggedInSchedule ? handleLeaveMeeting : null}
        addAlert={addAlert}
      />
    );
  }

  // Show join form
  return (
    <div className="join-meeting-page min-h-screen flex flex-col items-center justify-center py-6 overflow-auto bg-gray-900 text-white">
      <div className="w-full max-w-md p-8 rounded-xl bg-gray-800 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Join Meeting</h1>
          <p className="text-gray-400">Meeting ID: {meetingId}</p>
          
          {isScheduledJoin && (
            <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
              <p className="text-sm text-blue-300">
                <i className="fas fa-calendar-check mr-2"></i>
                Scheduled Meeting Join
              </p>
            </div>
          )}
        </div>

        <form onSubmit={handleValidate} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Your Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Validating...
              </span>
            ) : (
              'Join Meeting'
            )}
          </button>

          <div className="text-center text-sm text-gray-400 mt-4">
            <p>You'll need to be approved by the host to join</p>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold mb-3">Meeting Info</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p><span className="text-gray-500">Meeting ID:</span> {meetingId}</p>
            <p className="text-gray-400 italic">
              Enter your email to check if you're invited
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinMeetingPage;
