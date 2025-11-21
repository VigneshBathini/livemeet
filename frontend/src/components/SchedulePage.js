import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { AuthContext } from './AuthContext';

const SchedulePage = ({ onScheduleComplete = () => {}, onBack = () => {} }) => {
  const { user, token } = useContext(AuthContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    meetingTitle: '',
    creatorName: user?.name || '',
    creatorEmail: user?.email || '',
    creatorId: user?.id || '',
    scheduledDate: new Date(),
    scheduledTime: '',
    invitees: '',
    description: '',
    meetingType: 'regular',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scheduledLink, setScheduledLink] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      setFormData((prev) => ({
        ...prev,
        creatorName: user.name,
        creatorEmail: user.email,
        creatorId: user.id,
      }));
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    console.log('Form data:', formData);

    if (!formData.meetingTitle || !formData.creatorName || !formData.creatorEmail || !formData.scheduledTime || !formData.invitees || !formData.creatorId) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    const inviteeList = formData.invitees.split(',').map((p) => p.trim()).filter((p) => p);
    const scheduledDate = formData.scheduledDate.toISOString().split('T')[0];
    const payload = {
      meetingTitle: formData.meetingTitle,
      creatorId: formData.creatorId,
      creatorName: formData.creatorName,
      creatorEmail: formData.creatorEmail,
      scheduledDate,
      scheduledTime: formData.scheduledTime,
      invitees: inviteeList,
      description: formData.description,
      meetingType: formData.meetingType,
    };
    console.log('Payload:', payload);

    try {
      const response = await axios.post('http://localhost:3000/api/schedule', payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Response:', response.data);
      setScheduledLink(response.data.link);
      setSuccess(`Meeting scheduled successfully! Share this link: ${response.data.link}`);
      setTimeout(() => {
        console.log('Calling onScheduleComplete');
        // onScheduleComplete();
        // navigate('/video');
      }, 3000);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setError(`Failed to schedule meeting: ${errorMessage}`);
      console.error('Error scheduling meeting:', err.response?.data || err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="schedule-page">
      <h2>Schedule a Meeting</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Meeting Title</label>
          <input
            type="text"
            value={formData.meetingTitle}
            onChange={(e) => setFormData({ ...formData, meetingTitle: e.target.value })}
            placeholder="Enter meeting title"
            required
            aria-label="Meeting Title"
          />
        </div>
        <div className="form-group">
          <label>Your Name</label>
          <input
            type="text"
            value={formData.creatorName}
            onChange={(e) => setFormData({ ...formData, creatorName: e.target.value })}
            placeholder="Enter your name"
            required
            aria-label="Your Name"
          />
        </div>
        <div className="form-group">
          <label>Your Email</label>
          <input
            type="email"
            value={formData.creatorEmail}
            disabled
            placeholder="Enter your email"
            aria-label="Your Email"
          />
        </div>
        <div className="form-group">
          <label>Date</label>
          <DatePicker
            selected={formData.scheduledDate}
            onChange={(date) => setFormData({ ...formData, scheduledDate: date })}
            minDate={new Date()}
            dateFormat="yyyy-MM-dd"
            required
            aria-label="Meeting Date"
          />
        </div>
        <div className="form-group">
          <label>Time</label>
          <input
            type="time"
            value={formData.scheduledTime}
            onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
            required
            aria-label="Meeting Time"
          />
        </div>
        <div className="form-group">
          <label>Invitees (comma-separated emails)</label>
          <input
            type="text"
            value={formData.invitees}
            onChange={(e) => setFormData({ ...formData, invitees: e.target.value })}
            placeholder="email1@example.com, email2@example.com"
            required
            aria-label="Invitees"
          />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Enter meeting description"
            aria-label="Meeting Description"
          />
        </div>
        <div className="form-group">
          <label>Meeting Type</label>
          <select
            value={formData.meetingType}
            onChange={(e) => setFormData({ ...formData, meetingType: e.target.value })}
            aria-label="Meeting Type"
          >
            <option value="regular">Regular</option>
            <option value="proctor">Proctor</option>
          </select>
        </div>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        <div className="button-group">
          <button type="submit" disabled={loading}>
            {loading ? 'Scheduling...' : 'Schedule Meeting'}
          </button>
          <button type="button" onClick={onBack} disabled={loading}>
            Back
          </button>
        </div>
      </form>
      <style>
        {`
          .schedule-page {
            padding: 24px;
            background: var(--secondary-bg);
            border-radius: 12px;
            width: 100%;
          }
          .schedule-page h2 {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 20px;
            text-align: center;
            color: var(--text-color);
          }
          .form-group {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            gap: 16px;
          }
          .form-group label {
            flex: 0 0 150px;
            font-size: 14px;
            text-align: right;
            color: var(--text-color);
          }
          .form-group input,
          .form-group textarea,
          .form-group select {
            flex: 1;
            padding: 12px;
            border: 1px solid var(--border);
            border-radius: 6px;
            font-size: 14px;
            background: #24244a;
            color: var(--text-color);
          }
          .form-group input:disabled {
            background: #1c1c38;
            cursor: not-allowed;
          }
          .form-group input:focus,
          .form-group textarea:focus,
          .form-group select:focus {
            border-color: var(--accent-blue);
            outline: none;
          }
          .form-group textarea {
            resize: vertical;
            min-height: 100px;
          }
          .error,
          .success {
            margin: 8px 0 0 166px;
            font-size: 13px;
          }
          .error {
            color: var(--error);
          }
          .success {
            color: var(--success);
          }
          .button-group {
            display: flex;
            gap: 12px;
            margin-left: 166px;
          }
          .button-group button {
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
          .button-group button:last-child {
            background: #2e2e4b;
          }
          .button-group button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .button-group button:hover:not(:disabled) {
            opacity: 0.9;
          }
          @media (max-width: 640px) {
            .schedule-page {
              padding: 16px;
            }
            .schedule-page h2 {
              font-size: 18px;
              margin-bottom: 16px;
            }
            .form-group {
              flex-direction: column;
              align-items: flex-start;
              gap: 6px;
              margin-bottom: 12px;
            }
            .form-group label {
              flex: none;
              text-align: left;
              font-size: 12px;
            }
            .form-group input,
            .form-group textarea,
            .form-group select {
              width: 100%;
              padding: 8px;
              font-size: 12px;
            }
            .form-group textarea {
              min-height: 80px;
            }
            .error,
            .success {
              margin: 6px 0 0 0;
              font-size: 11px;
            }
            .button-group {
              margin-left: 0;
              flex-direction: column;
            }
            .button-group button {
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

export default SchedulePage;