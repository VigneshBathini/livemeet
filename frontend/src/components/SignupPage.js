import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from './AuthContext';

// const API_URL = "/proctormeet";

const API_URL = "http://localhost:3000";

const SignupPage = () => {
  const [name, setName]                       = useState('');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError]                     = useState('');
  const [loading, setLoading]                 = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, message: '', color: '' });

  const { login } = useContext(AuthContext);
  const navigate  = useNavigate();

  const isValidEmail = (email) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  const isValidName  = (name)  => name && name.trim().length >= 2 && /^[a-zA-Z\s'-]+$/.test(name.trim());

  const checkPasswordStrength = (pwd) => {
    if (!pwd) { setPasswordStrength({ score: 0, message: '', color: '' }); return; }
    let score = 0;
    if (pwd.length >= 8)            score++;
    if (pwd.length >= 12)           score++;
    if (/[a-z]/.test(pwd))          score++;
    if (/[A-Z]/.test(pwd))          score++;
    if (/[0-9]/.test(pwd))          score++;
    if (/[^a-zA-Z0-9]/.test(pwd))   score++;
    const map = [
      { max: 2, message: 'Weak',        color: '#ff4d4d' },
      { max: 4, message: 'Medium',      color: '#ffa64d' },
      { max: 5, message: 'Strong',      color: '#4ea7ff' },
      { max: 6, message: 'Very Strong', color: '#00cc69' },
    ];
    const { message, color } = map.find(m => score <= m.max) || map[3];
    setPasswordStrength({ score, message, color });
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    checkPasswordStrength(e.target.value);
  };

  const validateForm = () => {
    if (!isValidEmail(email))  { setError('Please enter a valid email address'); return false; }
    if (!isValidName(name))    { setError('Name must be at least 2 characters (letters only)'); return false; }
    if (password.length < 6)   { setError('Password must be at least 6 characters'); return false; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return false; }
    if (passwordStrength.score < 3) {
      if (!window.confirm('Your password is weak. Continue anyway?')) return false;
    }
    return true;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_URL}/api/signup`, { email, password, name: name.trim() });
      login(response.data.user, response.data.token);
      navigate('/video');
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Email already registered. Please log in instead.');
      } else {
        setError(err.response?.data?.error || 'Failed to sign up. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const requirements = [
    { label: 'At least 6 characters',              met: password.length >= 6 },
    { label: 'Contains uppercase & lowercase',      met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'Contains at least one number',        met: /[0-9]/.test(password) },
    { label: 'Contains a special character',        met: /[^a-zA-Z0-9]/.test(password) },
  ];

  const strengthPct = (passwordStrength.score / 6) * 100;

  return (
    <div className="app">
      {/* BG */}
      <div className="bg">
        <div className="bg-circle c1" />
        <div className="bg-circle c2" />
        <div className="bg-circle c3" />
        <div className="bg-grid" />
      </div>

      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="logo">📹</div>
          <div className="brand-text">
            <div className="title">Proctor<span>Meet</span></div>
            <div className="subtitle">Video meetings, simplified</div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        <section className="glass-card">

          {/* Left — info panel */}
          <aside className="left">
            <div className="panel-tag">Secure · Fast · Reliable</div>
            <h2 className="panel-heading">Join thousands of teams hiring smarter.</h2>
            <p className="panel-desc">
              Set up your account in under a minute and start running AI-proctored interviews today.
            </p>

            <div className="panel-stats">
              {[['500+', 'Companies'], ['50k+', 'Interviews'], ['99.9%', 'Uptime']].map(([val, lbl], i, arr) => (
                <React.Fragment key={i}>
                  <div className="stat">
                    <span className="stat-val">{val}</span>
                    <span className="stat-label">{lbl}</span>
                  </div>
                  {i < arr.length - 1 && <div className="stat-divider" />}
                </React.Fragment>
              ))}
            </div>

            <div className="panel-tips">
              {[
                'AI detects cheating in real time',
                'No downloads for candidates',
                'End-to-end encrypted sessions',
                'Calendar-aware scheduling',
              ].map((tip, i) => (
                <div key={i} className="tip-item">
                  <span className="tip-dot" />
                  {tip}
                </div>
              ))}
            </div>
          </aside>

          {/* Right — signup form */}
          <div className="right">
            <div className="card-header">
              <h3 className="form-title">Create your account</h3>
              <p className="form-sub">Free for 14 days · No credit card required</p>
            </div>

            <form onSubmit={handleSignup} className="form" noValidate>

              {/* Full Name */}
              <label className="field">
                <div className="label">Full Name</div>
                <input
                  className="input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                  disabled={loading}
                  maxLength="50"
                />
              </label>

              {/* Email */}
              <label className="field">
                <div className="label">Email address</div>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                />
              </label>

              {/* Password */}
              <label className="field">
                <div className="label">Password</div>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Create a password"
                  required
                  disabled={loading}
                  minLength="6"
                />
              </label>

              {/* Strength bar */}
              {password && (
                <div className="strength-wrap">
                  <div className="strength-track">
                    <div
                      className="strength-bar"
                      style={{ width: `${strengthPct}%`, background: passwordStrength.color }}
                    />
                  </div>
                  <span className="strength-label" style={{ color: passwordStrength.color }}>
                    {passwordStrength.message}
                  </span>
                </div>
              )}

              {/* Confirm Password */}
              <label className="field">
                <div className="label">Confirm Password</div>
                <input
                  className={`input ${confirmPassword && password !== confirmPassword ? 'input-error' : ''}`}
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  required
                  disabled={loading}
                />
                {confirmPassword && password !== confirmPassword && (
                  <span className="field-error">Passwords do not match</span>
                )}
              </label>

              {/* Requirements */}
              {password && (
                <div className="requirements">
                  {requirements.map((r, i) => (
                    <div key={i} className={`req-item ${r.met ? 'met' : ''}`}>
                      <span className="req-icon">{r.met ? '✓' : '○'}</span>
                      {r.label}
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="alert error">
                  <div className="msg">{error}</div>
                </div>
              )}

              {/* Submit */}
              <div className="actions">
                <button
                  className="btn primary"
                  type="submit"
                  disabled={loading || (confirmPassword && password !== confirmPassword)}
                >
                  {loading
                    ? <span className="spin-row"><span className="spinner" /> Creating account…</span>
                    : 'Create Account'}
                </button>
              </div>

              {/* Footer links */}
              <div className="form-footer">
                <p className="form-footer-text">
                  Already have an account?{' '}
                  <Link to="/login" className={`link-btn ${loading ? 'disabled-link' : ''}`}>
                    Log in
                  </Link>
                </p>
                <p className="terms">
                  By signing up you agree to our{' '}
                  <a href="/terms" target="_blank" rel="noreferrer" className="link-btn">Terms</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="link-btn">Privacy Policy</a>
                </p>
              </div>

            </form>
          </div>

        </section>
      </main>

      <style>{`
        :root {
          --bg1: #0d1020;
          --bg2: #0b1528;
          --glass: rgba(255,255,255,0.03);
          --accent-a: #4ea7ff;
          --accent-b: #7c56ff;
          --muted: rgba(255,255,255,0.55);
          --text: #e9eef8;
          --success: #00cc69;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html, #root { height: 100%; }

        .app {
          min-height: 100vh;
          background:
            radial-gradient(1200px 600px at 10% 10%, rgba(78,167,255,0.06), transparent),
            radial-gradient(800px 400px at 90% 80%, rgba(124,86,255,0.05), transparent),
            linear-gradient(180deg, var(--bg1) 0%, var(--bg2) 100%);
          color: var(--text);
          font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial;
          display: flex; flex-direction: column;
          position: relative; overflow: auto;
        }

        /* BG */
        .bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
        .bg-circle { position: absolute; border-radius: 50%; filter: blur(40px); opacity: 0.12; }
        .bg-circle.c1 { width: 420px; height: 420px; left: 6%;  top: 6%;     background: linear-gradient(180deg, rgba(78,167,255,0.25), transparent); }
        .bg-circle.c2 { width: 340px; height: 340px; right: 6%; bottom: 8%;  background: linear-gradient(180deg, rgba(124,86,255,0.22), transparent); }
        .bg-circle.c3 { width: 220px; height: 220px; left: 30%; bottom: 20%; background: linear-gradient(180deg, rgba(255,78,140,0.12), transparent); }
        .bg-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 90px 90px;
        }

        /* Header */
        .header {
          position: relative; z-index: 5;
          display: flex; align-items: center;
          padding: 28px 80px;
        }
        .brand { display: flex; align-items: center; gap: 14px; }
        .logo {
          width: 56px; height: 56px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, var(--accent-a), var(--accent-b));
          font-size: 22px;
        }
        .brand-text .title { font-size: 20px; font-weight: 700; }
        .brand-text .title span { color: var(--accent-b); }
        .brand-text .subtitle { font-size: 12px; color: var(--muted); margin-top: 4px; }

        /* Main */
        .main {
          position: relative; z-index: 5;
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 20px 80px 80px;
        }

        /* Glass card — two col */
        .glass-card {
          display: flex; width: 100%; max-width: 1000px;
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 30px 80px rgba(2,6,23,0.6);
          overflow: hidden;
        }

        /* Left */
        .left {
          flex: 1; padding: 48px 40px;
          background: rgba(78,167,255,0.03);
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex; flex-direction: column; gap: 24px;
        }
        .panel-tag {
          display: inline-flex;
          background: rgba(78,167,255,0.1); border: 1px solid rgba(78,167,255,0.2);
          color: var(--accent-a); font-size: 11px; font-weight: 600;
          letter-spacing: 1.5px; text-transform: uppercase;
          padding: 6px 14px; border-radius: 100px; align-self: flex-start;
        }
        .panel-heading { font-size: 26px; font-weight: 800; line-height: 1.35; color: var(--text); }
        .panel-desc { font-size: 14px; color: var(--muted); line-height: 1.7; }
        .panel-stats {
          display: flex; align-items: center; gap: 20px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px; padding: 16px 20px;
        }
        .stat { display: flex; flex-direction: column; gap: 3px; }
        .stat-val { font-size: 20px; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 11px; color: var(--muted); }
        .stat-divider { width: 1px; height: 32px; background: rgba(255,255,255,0.07); }
        .panel-tips { display: flex; flex-direction: column; gap: 12px; }
        .tip-item { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
        .tip-dot {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, var(--accent-a), var(--accent-b));
        }

        /* Right */
        .right {
          flex: 0 0 460px; padding: 40px 40px;
          display: flex; flex-direction: column; gap: 24px;
          overflow-y: auto; max-height: 90vh;
        }
        .right::-webkit-scrollbar { width: 6px; }
        .right::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
        .right::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

        .card-header { display: flex; flex-direction: column; gap: 6px; }
        .form-title { font-size: 22px; font-weight: 700; }
        .form-sub   { font-size: 13px; color: var(--muted); }

        /* Form */
        .form { display: flex; flex-direction: column; gap: 14px; }
        .field { display: flex; flex-direction: column; gap: 7px; }
        .label { font-size: 13px; color: var(--muted); }

        .input {
          padding: 13px 16px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.04);
          background: rgba(6,8,14,0.45);
          color: var(--text); font-size: 15px;
          font-family: inherit; outline: none;
          transition: box-shadow 160ms, border-color 160ms;
        }
        .input::placeholder { color: rgba(255,255,255,0.2); }
        .input:focus {
          border-color: rgba(78,167,255,0.6);
          box-shadow: 0 6px 18px rgba(78,167,255,0.08);
        }
        .input:disabled { opacity: 0.5; cursor: not-allowed; }
        .input.input-error { border-color: rgba(255,77,77,0.6); }
        .field-error { font-size: 12px; color: #ff6b6b; padding-left: 2px; }

        /* Strength */
        .strength-wrap {
          display: flex; align-items: center; gap: 10px; margin-top: -4px;
        }
        .strength-track {
          flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden;
        }
        .strength-bar { height: 4px; border-radius: 4px; transition: width 0.3s, background 0.3s; }
        .strength-label { font-size: 12px; font-weight: 600; white-space: nowrap; }

        /* Requirements */
        .requirements {
          background: rgba(6,8,14,0.45);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px; padding: 12px 16px;
          display: flex; flex-direction: column; gap: 7px;
        }
        .req-item {
          display: flex; align-items: center; gap: 8px;
          font-size: 12.5px; color: rgba(255,255,255,0.3);
          transition: color 0.2s;
        }
        .req-item.met { color: var(--success); }
        .req-icon { font-size: 12px; width: 14px; text-align: center; flex-shrink: 0; }

        /* Alert */
        .alert {
          padding: 11px 14px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.04);
          display: flex; align-items: center; gap: 10px; font-size: 13px;
        }
        .alert.error {
          background: rgba(255,80,80,0.07); border-color: rgba(255,80,80,0.2); color: #ff8080;
        }

        /* Actions */
        .actions { margin-top: 4px; }
        .btn {
          padding: 13px 18px; border-radius: 12px; border: none;
          cursor: pointer; font-weight: 700; font-size: 15px;
          font-family: inherit; transition: opacity 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%;
        }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn.primary {
          background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
          color: #fff; box-shadow: 0 12px 30px rgba(124,86,255,0.14);
        }
        .btn.primary:hover:not(:disabled) { opacity: 0.88; }

        .spin-row { display: flex; align-items: center; gap: 8px; }
        .spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
          border-radius: 50%; animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Footer */
        .form-footer { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
        .form-footer-text { font-size: 13px; color: var(--muted); text-align: center; }
        .link-btn {
          background: none; border: none; cursor: pointer;
          color: var(--accent-a); font-size: inherit;
          font-family: inherit; text-decoration: none; font-weight: 500;
          transition: opacity 0.2s; padding: 0;
        }
        .link-btn:hover { opacity: 0.75; }
        .disabled-link { opacity: 0.5; pointer-events: none; }
        .terms { font-size: 12px; color: rgba(255,255,255,0.25); text-align: center; line-height: 1.6; }

        /* Responsive */
        @media (max-width: 960px) {
          .main { padding: 20px 24px 60px; }
          .glass-card { flex-direction: column; }
          .left { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 32px 28px; }
          .right { flex: none; padding: 32px 28px; max-height: none; }
          .header { padding: 20px 24px; }
        }
      `}</style>
    </div>
  );
};

export default SignupPage;