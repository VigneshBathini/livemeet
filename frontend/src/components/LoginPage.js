import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from './AuthContext';

const API_URL = "http://localhost:3000";

const LoginPage = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useContext(AuthContext);
  const navigate  = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_URL}/api/login`, { email, password });
      login(response.data.user, response.data.token);
      navigate('/video');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      {/* Animated background */}
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

          {/* Left — decorative info panel */}
          <aside className="left">
            <div className="panel-tag">Secure · Fast · Reliable</div>
            <h2 className="panel-heading">Interview smarter,<br />hire with confidence.</h2>
            <p className="panel-desc">
              AI-powered proctoring and seamless video meetings — built for fair, efficient remote hiring.
            </p>
            <div className="panel-stats">
              <div className="stat">
                <span className="stat-val">500+</span>
                <span className="stat-label">Companies</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-val">50k+</span>
                <span className="stat-label">Interviews</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-val">99.9%</span>
                <span className="stat-label">Uptime</span>
              </div>
            </div>
            <div className="panel-tips">
              {[
                'AI detects cheating in real time',
                'No downloads for candidates',
                'End-to-end encrypted sessions',
              ].map((tip, i) => (
                <div key={i} className="tip-item">
                  <span className="tip-dot" />
                  {tip}
                </div>
              ))}
            </div>
          </aside>

          {/* Right — login form */}
          <div className="right">
            <div className="card-header">
              <h3 className="form-title">Welcome back</h3>
              <p className="form-sub">Sign in to your account</p>
            </div>

            <form onSubmit={handleLogin} className="form" noValidate>
              <label className="field">
                <div className="label">Email address</div>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="field">
                <div className="label-row">
                  <span className="label">Password</span>
                  <button type="button" className="link-btn">Forgot password?</button>
                </div>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>

              {error && (
                <div className="alert error">
                  <div className="msg">{error}</div>
                </div>
              )}

              <div className="actions">
                <button className="btn primary" type="submit" disabled={loading}>
                  {loading ? <span className="spin-row"><span className="spinner" /> Signing in…</span> : 'Log In'}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={loading}
                  onClick={() => navigate('/signup')}
                >
                  Create account
                </button>
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
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: auto;
        }

        /* BG decor */
        .bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .bg-circle { position: absolute; border-radius: 50%; filter: blur(40px); opacity: 0.12; }
        .bg-circle.c1 { width: 420px; height: 420px; left: 6%;  top: 6%;    background: linear-gradient(180deg, rgba(78,167,255,0.25), transparent); }
        .bg-circle.c2 { width: 340px; height: 340px; right: 6%; bottom: 8%; background: linear-gradient(180deg, rgba(124,86,255,0.22), transparent); }
        .bg-circle.c3 { width: 220px; height: 220px; left: 30%; bottom: 20%;background: linear-gradient(180deg, rgba(255,78,140,0.12), transparent); }
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
        .brand-text .title { font-size: 20px; font-weight: 700; letter-spacing: 0.2px; }
        .brand-text .title span { color: var(--accent-b); }
        .brand-text .subtitle { font-size: 12px; color: var(--muted); margin-top: 4px; }

        /* Main */
        .main {
          position: relative; z-index: 5;
          flex: 1;
          display: flex; align-items: center; justify-content: center;
          padding: 20px 80px 80px;
        }

        /* Glass card — two column */
        .glass-card {
          display: flex;
          width: 100%;
          max-width: 1000px;
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 30px 80px rgba(2,6,23,0.6);
          overflow: hidden;
        }

        /* Left panel */
        .left {
          flex: 1;
          padding: 48px 40px;
          background: rgba(78,167,255,0.03);
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex; flex-direction: column; gap: 24px;
        }
        .panel-tag {
          display: inline-flex;
          background: rgba(78,167,255,0.1);
          border: 1px solid rgba(78,167,255,0.2);
          color: var(--accent-a);
          font-size: 11px; font-weight: 600;
          letter-spacing: 1.5px; text-transform: uppercase;
          padding: 6px 14px; border-radius: 100px;
          align-self: flex-start;
        }
        .panel-heading {
          font-size: 28px; font-weight: 800;
          line-height: 1.3; color: var(--text);
        }
        .panel-desc {
          font-size: 14px; color: var(--muted);
          line-height: 1.7;
        }
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
        .tip-item {
          display: flex; align-items: center; gap: 10px;
          font-size: 13px; color: var(--muted);
        }
        .tip-dot {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, var(--accent-a), var(--accent-b));
        }

        /* Right form */
        .right {
          flex: 0 0 420px;
          padding: 48px 40px;
          display: flex; flex-direction: column; gap: 28px;
        }
        .card-header { display: flex; flex-direction: column; gap: 6px; }
        .form-title { font-size: 22px; font-weight: 700; }
        .form-sub   { font-size: 13px; color: var(--muted); }

        /* Form */
        .form { display: flex; flex-direction: column; gap: 16px; }
        .field { display: flex; flex-direction: column; gap: 8px; }
        .label { font-size: 13px; color: var(--muted); }
        .label-row { display: flex; justify-content: space-between; align-items: center; }

        .link-btn {
          background: none; border: none; cursor: pointer;
          font-size: 12px; color: var(--accent-a);
          font-family: inherit; padding: 0;
        }
        .link-btn:hover { opacity: 0.8; }

        .input {
          padding: 14px 16px; border-radius: 10px;
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

        /* Alert */
        .alert {
          background: rgba(10,12,20,0.95); padding: 10px 14px;
          border-radius: 10px; border: 1px solid rgba(255,255,255,0.03);
          display: flex; align-items: center; gap: 12px; font-size: 13px;
        }
        .alert.error { border-color: rgba(255,80,80,0.2); color: #ff8080; background: rgba(255,80,80,0.07); }

        /* Buttons */
        .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
        .btn {
          padding: 13px 18px; border-radius: 12px; border: none;
          cursor: pointer; font-weight: 700; font-size: 15px;
          font-family: inherit; transition: opacity 0.2s;
          display: flex; align-items: center; justify-content: center;
        }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn.primary {
          background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
          color: #fff; box-shadow: 0 12px 30px rgba(124,86,255,0.14);
        }
        .btn.primary:hover:not(:disabled) { opacity: 0.88; }
        .btn.secondary {
          background: rgba(255,255,255,0.03); color: var(--muted);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .btn.secondary:hover:not(:disabled) { background: rgba(255,255,255,0.06); }

        .spin-row { display: flex; align-items: center; gap: 8px; }
        .spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
          border-radius: 50%; animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Responsive */
        @media (max-width: 900px) {
          .main { padding: 20px 24px 60px; }
          .glass-card { flex-direction: column; }
          .left { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 32px 28px; }
          .right { flex: none; padding: 32px 28px; }
          .header { padding: 20px 24px; }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;