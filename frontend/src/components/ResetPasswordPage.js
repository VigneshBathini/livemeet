import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = "http://localhost:3000";

const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => (params.get('token') || '').trim(), [params]);
  const email = useMemo(() => (params.get('email') || '').trim().toLowerCase(), [params]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !email) {
      setStatus({ type: 'error', message: 'Reset link is invalid or incomplete.' });
      return;
    }
    if (newPassword.length < 6) {
      setStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const response = await axios.post(`${API_URL}/api/reset-password`, {
        email,
        token,
        newPassword,
      });
      setStatus({
        type: 'success',
        message: response.data?.message || 'Password reset successful. You can now sign in.',
      });
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.error || 'Failed to reset password.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reset-wrap">
      <div className="card">
        <h1>Reset Password</h1>
        <p className="sub">Account: <strong>{email || 'Unknown'}</strong></p>
        <form onSubmit={handleSubmit}>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
            />
          </label>
          {status.message && (
            <div className={`status ${status.type}`}>{status.message}</div>
          )}
          <button type="submit" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
        <Link to="/login" className="back">Back to Login</Link>
      </div>
      <style>{`
        .reset-wrap {
          min-height: 100vh;
          background: linear-gradient(180deg, #0d1020, #0b1528);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          color: #e9eef8;
          font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial;
        }
        .card {
          width: 100%;
          max-width: 440px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.03);
          padding: 24px;
          box-shadow: 0 22px 50px rgba(0,0,0,0.45);
        }
        h1 { margin: 0 0 8px 0; font-size: 24px; }
        .sub { margin: 0 0 16px 0; color: rgba(233,238,248,0.7); font-size: 13px; }
        form { display: flex; flex-direction: column; gap: 12px; }
        label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: rgba(233,238,248,0.8); }
        input {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.25);
          color: #fff;
          outline: none;
        }
        input:focus { border-color: rgba(78,167,255,0.7); }
        button {
          margin-top: 8px;
          border: none;
          border-radius: 10px;
          padding: 12px;
          background: linear-gradient(90deg, #4ea7ff, #7c56ff);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        button:disabled { opacity: 0.65; cursor: not-allowed; }
        .status {
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13px;
          border: 1px solid transparent;
        }
        .status.error {
          color: #ff9da0;
          background: rgba(255, 80, 80, 0.1);
          border-color: rgba(255, 80, 80, 0.25);
        }
        .status.success {
          color: #8cf0bb;
          background: rgba(0, 204, 105, 0.12);
          border-color: rgba(0, 204, 105, 0.3);
        }
        .back {
          display: inline-block;
          margin-top: 14px;
          color: #7cb9ff;
          text-decoration: none;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
};

export default ResetPasswordPage;

