// SchedulePage.jsx
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { AuthContext } from './AuthContext';

// const API_URL = process.env.API_URL || "http://localhost:3000";
const API_URL = "https://livemeet-ribm.onrender.com";

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
  const [successMsg, setSuccessMsg] = useState('');
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

  const validate = () => {
    if (
      !formData.meetingTitle.trim() ||
      !formData.creatorName.trim() ||
      !formData.creatorEmail.trim() ||
      !formData.scheduledTime.trim() ||
      !formData.invitees.trim() ||
      !formData.creatorId
    ) {
      setError('Please fill in all required fields.');
      return false;
    }

    // basic email sanity for invitees
    const inviteeList = formData.invitees
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const invalid = inviteeList.some((email) => !/^\S+@\S+\.\S+$/.test(email));
    if (invalid) {
      setError('One or more invitee emails look invalid.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setScheduledLink('');

    if (!validate()) return;

    setLoading(true);

    const inviteeList = formData.invitees
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p);

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

    try {
      const response = await axios.post(
        `${API_URL}/api/schedule`,
        payload,
        // { headers: { Authorization: `Bearer ${token}` } }
      );

      const link = response.data?.link || response.data?.meetingLink || '';
      setScheduledLink(link);
      setSuccessMsg('Meeting scheduled successfully!');
      // call parent callback so the parent UI can react (e.g., show alert)
      onScheduleComplete({ link, payload });

    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Unknown error';
      setError(`Failed to schedule meeting: ${errorMessage}`);
      console.error('Schedule error:', err.response || err);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!scheduledLink) return;
    try {
      await navigator.clipboard.writeText(scheduledLink);
      setSuccessMsg('Link copied to clipboard.');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch {
      setError('Unable to copy link to clipboard.');
    }
  };

  return (
    <div className="schedule-page-wrap">
      <div className="glass-container schedule-glass">
        <div className="container-header">
          <h2>Schedule a Meeting</h2>
        </div>

        <form className="schedule-form" onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="form-row full">
              <label>Meeting Title</label>
              <input
                type="text"
                value={formData.meetingTitle}
                onChange={(e) => setFormData({ ...formData, meetingTitle: e.target.value })}
                placeholder="Enter meeting title"
                aria-label="Meeting Title"
                required
              />
            </div>

            <div className="form-row half">
              <label>Your Name</label>
              <input
                type="text"
                value={formData.creatorName}
                onChange={(e) => setFormData({ ...formData, creatorName: e.target.value })}
                placeholder="Enter your name"
                aria-label="Your Name"
                required
              />
            </div>

            <div className="form-row half">
              <label>Your Email</label>
              <input
                type="email"
                value={formData.creatorEmail}
                disabled
                placeholder="Enter your email"
                aria-label="Your Email"
              />
            </div>

            <div className="form-row half">
              <label>Date</label>
              <DatePicker
                selected={formData.scheduledDate}
                onChange={(date) => setFormData({ ...formData, scheduledDate: date })}
                minDate={new Date()}
                dateFormat="yyyy-MM-dd"
                aria-label="Meeting Date"
              />
            </div>

            <div className="form-row half">
              <label>Time</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                aria-label="Meeting Time"
              />
            </div>

            <div className="form-row full">
              <label>Invitees (comma-separated emails)</label>
              <input
                type="text"
                value={formData.invitees}
                onChange={(e) => setFormData({ ...formData, invitees: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
                aria-label="Invitees"
              />
            </div>

            <div className="form-row full">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter meeting description"
                aria-label="Meeting Description"
              />
            </div>

            <div className="form-row half">
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

            {error && (
              <div className="form-row full feedback error-row">
                <span className="error-icon">⚠</span>
                <span className="msg">{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="form-row full feedback success-row">
                <span className="success-icon">✓</span>
                <span className="msg">{successMsg}</span>
              </div>
            )}

            {scheduledLink && (
              <div className="form-row full link-row">
                <label>Scheduled Link</label>
                <div className="link-box">
                  <input type="text" readOnly value={scheduledLink} />
                  <button type="button" className="btn-copy" onClick={copyLink}>
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn-ghost" onClick={onBack} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary btn-gradient" disabled={loading}>
              {loading ? 'Scheduling...' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        :root {
          --primary-bg: #0f0f1e;
          --secondary-bg: #1a1a2e;
          --glass-bg: rgba(255,255,255,0.04);
          --glass-border: rgba(255,255,255,0.08);
          --accent-blue: #00b7eb;
          --accent-purple: #6b48ff;
          --text-color: #e6e9ee;
          --text-secondary: rgba(230,233,238,0.7);
          --success: #00cc69;
          --error: #ff6b6b;
        }

        .page {
  width: 100%;
  display: block;
}


        .schedule-page-wrap {
          min-height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        /* Re-using glass container style so it matches JoinRoom layout */
        .schedule-glass {
          max-width: 880px;
          width: 100%;
          padding: 28px;
          border-radius: 18px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          box-shadow: 0 20px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.02);
        }

        .container-header h2 {
          margin: 0 0 8px 0;
          font-size: 24px;
          color: var(--text-color);
          text-align: left;
        }

        .schedule-form {
          margin-top: 12px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px 20px;
          align-items: start;
        }

        .form-row.full {
          grid-column: 1 / -1;
        }

        .form-row.half {
          grid-column: auto;
        }

        .form-row label {
          display: block;
          color: var(--text-secondary);
          margin-bottom: 8px;
          font-size: 13px;
        }

        .form-row input[type="text"],
        .form-row input[type="email"],
        .form-row input[type="time"],
        .form-row textarea,
        .form-row select,
        .form-row .react-datepicker__input-container input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          background: #121224;
          color: var(--text-color);
          font-size: 14px;
          transition: box-shadow 0.18s ease, border-color 0.18s ease;
        }

        .form-row textarea {
          min-height: 90px;
          resize: vertical;
          padding-top: 10px;
        }

        .form-row input:focus,
        .form-row textarea:focus,
        .form-row select:focus {
          outline: none;
          border-color: var(--accent-blue);
          box-shadow: 0 6px 20px rgba(0,183,235,0.08);
        }

        /* feedback rows */
        .feedback {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 8px;
        }

        .error-row {
          background: rgba(255,107,107,0.06);
          border: 1px solid rgba(255,107,107,0.12);
          color: var(--error);
          grid-column: 1 / -1;
        }

        .success-row {
          background: rgba(0,204,105,0.06);
          border: 1px solid rgba(0,204,105,0.12);
          color: var(--success);
          grid-column: 1 / -1;
        }

        .error-icon, .success-icon {
          font-weight: 700;
        }

        .link-row .link-box {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .link-row input[readonly] {
          background: #0d0d16;
          border: 1px solid rgba(255,255,255,0.04);
          padding: 10px;
        }

        .btn-copy {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          color: var(--text-color);
          cursor: pointer;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          margin-top: 18px;
          justify-content: flex-end;
        }

        .btn-ghost {
          padding: 12px 18px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          color: var(--text-color);
          cursor: pointer;
        }

        .btn-primary {
          padding: 12px 18px;
          border-radius: 10px;
          font-weight: 600;
          color: white;
          cursor: pointer;
          border: none;
        }

        .btn-gradient {
          background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
          box-shadow: 0 10px 30px rgba(107,72,255,0.12);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .btn-gradient:active { transform: translateY(1px); }

        /* Responsive */
        @media (max-width: 860px) {
          .form-grid {
            grid-template-columns: 1fr;
          }
          .form-actions {
            justify-content: space-between;
          }
        }

        @media (max-width: 480px) {
          .schedule-glass { padding: 18px; }
          .container-header h2 { font-size: 20px; }
          .form-row textarea { min-height: 72px; }
        }
      `}</style>
    </div>
  );
};

export default SchedulePage;
