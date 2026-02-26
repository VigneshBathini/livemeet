import React, { useState, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { useNavigate } from 'react-router-dom';

const JoinRoom = ({
  roomId,
  setRoomId,
  userName,
  setUserName,
  userEmail,
  setUserEmail,
  joinRoom,
  createRoom,
  isExternal,
  addAlert
}) => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [localAlerts, setLocalAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState('join'); // 'join' | 'create'

  const handleAddAlert = (message, type = 'error') => {
    if (addAlert) return addAlert(message, type);
    const id = Date.now();
    setLocalAlerts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setLocalAlerts(prev => prev.filter(a => a.id !== id)), 5000);
  };

  // Function to open schedule page
  const openSchedule = () => {
    navigate('/schedule');
  };

  return (
    <div className="app">
      {/* Animated bg */}
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

        <div className="header-actions">
          <button className="ghost" style={{ marginLeft: 500, borderWidth: 0.1, borderColor: '#4ea7ff' }} onClick={() => navigate('/scheduled-meetings')}>
            <span className="icon">📅</span>
            <span>Scheduled Meetings</span>
          </button>
        </div>
        <div className="header-actions">
          <button className="ghost" style={{ borderWidth: 0.1, borderColor: '#bdabffff' }} onClick={logout} title="Log Out">Log Out</button>
        </div>
      </header>

      {/* Alerts */}
      <div className="alerts">
        {localAlerts.map(a => (
          <div key={a.id} className={`alert ${a.type || 'info'}`}>
            <div className="msg">{a.message}</div>
            <button className="close" onClick={() => setLocalAlerts(prev => prev.filter(x => x.id !== a.id))}>×</button>
          </div>
        ))}
      </div>

      {/* Main glass card */}
      <main className="card-wrapper">
        <section className="glass-card">
          {/* left form + right panel layout */}
          <div className="glass-inner">
            <div className="left">
              <div className="card-header">
                <div className="tabs">

                  {!isExternal && (
                    <button
                      className={`tab ${activeTab === 'create' ? 'active' : ''}`}
                      onClick={() => setActiveTab('create')}
                    >
                      Create Meeting
                    </button>
                  )}

                  <button
                    className={`tab ${activeTab === 'join' ? 'active' : ''}`}
                    onClick={() => setActiveTab('join')}
                  >
                    Join Meeting
                  </button>
                </div>

                {!isExternal && (
                  <div className="user">
                    <div className="avatar">{user?.name?.charAt(0) || 'U'}</div>
                    <div className="uinfo">
                      <div className="uname">{user?.name || 'User'}</div>
                      <div className="uemail">{user?.email || 'guest@example.com'}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="form">

                {/* Only show Meeting ID when joining */}
                {activeTab === "join" && (
                  <label className="field">
                    <div className="label">Meeting ID / Code</div>
                    <input
                      className="input"
                      type="text"
                      value={roomId}
                      onChange={e => setRoomId(e.target.value)}
                      placeholder="123-456-789"
                      aria-label="Meeting ID"
                    />
                  </label>
                )}

                {/* Only show name/email when creating a meeting */}
                {!isExternal && activeTab === "create" && (
                  <>
                    <label className="field">
                      <div className="label">Your Name</div>
                      <input
                        className="input"
                        type="text"
                        readOnly
                        value={userName || user?.name || ""}
                        onChange={e => setUserName(e.target.value)}
                        placeholder="John Doe"
                      />
                    </label>

                    <label className="field">
                      <div className="label">Email</div>
                      <input
                        className="input"
                        type="email"
                        readOnly
                        value={userEmail || user?.email || ""}
                        onChange={e => setUserEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </label>
                  </>
                )}

                <div className="actions">
                  {activeTab === "create" && !isExternal && (
                    <button className="btn primary" onClick={createRoom}>
                      Create & Start
                    </button>
                  )}

                  {activeTab !== "create" && (
                    <button className="btn primary" onClick={joinRoom}>
                      Join Meeting
                    </button>
                  )}

                  {activeTab === "join" && (
                    <button className="btn secondary" onClick={openSchedule}>
                      Schedule
                    </button>
                  )}
                </div>
              </div>

            </div>

            <aside className="right">
              <div className="panel schedule-cta" role="region" aria-label="Schedule meeting">
                <div className="sc-left">
                  <div className="sc-icon">📆</div>
                </div>
                <div className="sc-right">
                  <h4>Schedule a meeting</h4>
                  <p>Plan for later, invite participants and sync with your calendar.</p>
                  <div className="sc-actions">
                    <button className="ghost small" onClick={openSchedule}>
                      Open Scheduler
                    </button>
                  </div>
                </div>
              </div>

              <div className="panel tips" role="region" aria-label="Quick tips">
                <h4>Quick Tips</h4>
                <ul>
                  <li>Share Meeting ID with participants</li>
                  <li>Use Create to start an instant meeting</li>
                  <li>Schedule for time-zone aware invites</li>
                </ul>
              </div>

              <div className="panel help" role="region" aria-label="Need help">
                <h4>Need help?</h4>
                <p>Contact support or check docs for troubleshooting audio / video.</p>
              </div>
            </aside>
          </div>
        </section>
      </main>

      <style>{`
        :root{
          --bg1: #0d1020;
          --bg2: #0b1528;
          --glass: rgba(255,255,255,0.04);
          --glass-2: rgba(255,255,255,0.02);
          --accent-a: #4ea7ff;
          --accent-b: #7c56ff;
          --muted: rgba(255,255,255,0.7);
          --text: #e9eef8;
          --success: #00cc69;
        }

        * { box-sizing: border-box; }
        body, html, #root { height: 100%; }

        .app {
          min-height: 100vh;
          background: radial-gradient(1200px 600px at 10% 10%, rgba(78,167,255,0.06), transparent),
                      radial-gradient(800px 400px at 90% 80%, rgba(124,86,255,0.05), transparent),
                      linear-gradient(180deg, var(--bg1) 0%, var(--bg2) 100%);
          color: var(--text);
          font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
          position: relative;
          overflow: auto;
        }

        .app::-webkit-scrollbar {
          width: 8px;
        }

        .app::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.02);
        }

        .app::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12);
          border-radius: 10px;
        }

        .app::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }

        /* background decor */
        .bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
        .bg-circle { position: absolute; border-radius: 50%; filter: blur(40px); opacity: 0.12; }
        .bg-circle.c1 { width: 420px; height: 420px; left: 6%; top: 6%; background: linear-gradient(180deg, rgba(78,167,255,0.25), transparent); }
        .bg-circle.c2 { width: 340px; height: 340px; right: 6%; bottom: 8%; background: linear-gradient(180deg, rgba(124,86,255,0.22), transparent); }
        .bg-circle.c3 { width: 220px; height: 220px; left: 30%; bottom: 20%; background: linear-gradient(180deg, rgba(255,78,140,0.12), transparent); }
        .bg-grid { position: absolute; inset: 0; background-image:
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 90px 90px; opacity: 0.03;
        }

        /* header */
        .header { position: relative; z-index: 5; display:flex; justify-content:space-between; align-items:center; padding:28px 80px; }
        .brand { display:flex; align-items:center; gap:14px; }
        .logo { width:56px; height:56px; border-radius:12px; display:flex; align-items:center; justify-content:center; background: linear-gradient(135deg,var(--accent-a),var(--accent-b)); font-size:22px; }
        .brand-text .title { font-size:20px; font-weight:700; letter-spacing:0.2px; }
        .brand-text .title span { color: var(--accent-b); }
        .brand-text .subtitle { font-size:12px; color:var(--muted); margin-top:4px; }

        .ghost { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.04); color:var(--text); padding:10px 14px; border-radius:10px; display:flex; align-items:center; gap:8px; cursor:pointer; }
        .ghost.small { padding:8px 10px; font-size:13px; }

        /* alerts */
        .alerts { position: fixed; top:18px; right:18px; z-index:9999; display:flex; flex-direction:column; gap:10px; }
        .alert { background: rgba(10,12,20,0.95); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.03); display:flex; align-items:center; gap:12px; min-width:220px; }
        .alert.success { border-color: rgba(0,204,105,0.16); }
        .alert .close { background:none; border:none; color:var(--muted); cursor:pointer; }

        /* card wrapper */
        .card-wrapper { position: relative; z-index: 5; display:flex; justify-content:center; padding:40px 80px 120px; }

        .glass-card {
          width: 1100px;
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 30px 80px rgba(2,6,23,0.6);
          padding: 28px;
          overflow: hidden;
        }

        .glass-inner { display:flex; gap:28px; align-items:flex-start; }

        /* left area (form) */
        .left { flex: 1 1 640px; min-width: 560px; display:flex; flex-direction:column; gap:18px; }
        .card-header { display:flex; justify-content:space-between; align-items:center; }
        .tabs { display:flex; gap:10px; background: rgba(255,255,255,0.02); padding:6px; border-radius:10px; }
        .tab { padding:10px 18px; border-radius:8px; background:transparent; border:none; color:var(--muted); cursor:pointer; font-weight:600; }
        .tab.active { background: rgba(255,255,255,0.03); color:var(--text); box-shadow: 0 6px 18px rgba(0,0,0,0.4); }

        .user { display:flex; align-items:center; gap:12px; background: rgba(255,255,255,0.02); padding:8px 12px; border-radius:10px; }
        .avatar { width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,var(--accent-a),var(--accent-b)); font-weight:700; }
        .uinfo .uname { font-weight:700; }
        .uinfo .uemail { font-size:13px; color:var(--muted); }

        .form { margin-top:6px; display:flex; flex-direction:column; gap:16px; }
        .field { display:flex; flex-direction:column; gap:8px; }
        .label { font-size:13px; color:var(--muted); }
        .input { padding:14px 16px; border-radius:10px; border:1px solid rgba(255,255,255,0.04); background: rgba(6,8,14,0.45); color:var(--text); font-size:15px; outline:none; transition: box-shadow 160ms, border-color 160ms; }
        .input:focus { border-color: rgba(78,167,255,0.6); box-shadow: 0 6px 18px rgba(78,167,255,0.08); }

        .actions { display:flex; gap:12px; margin-top:8px; align-items:center; }
        .btn { padding:12px 18px; border-radius:12px; border:none; cursor:pointer; font-weight:700; }
        .btn.primary { background: linear-gradient(90deg, var(--accent-a), var(--accent-b)); color:#fff; box-shadow: 0 12px 30px rgba(124,86,255,0.14); }
        .btn.secondary { background: rgba(255,255,255,0.03); color:var(--muted); border:1px solid rgba(255,255,255,0.03); }

        /* right panel */
        .right { width: 360px; display:flex; flex-direction:column; gap:14px; align-items:stretch; }
        .panel { background: rgba(255,255,255,0.02); border-radius:12px; padding:14px; border:1px solid rgba(255,255,255,0.03); }
        .schedule-cta { display:flex; gap:12px; align-items:center; }
        .sc-icon { width:56px; height:56px; border-radius:12px; background: linear-gradient(135deg,#ff7a9a,#ffb199); display:flex; align-items:center; justify-content:center; font-size:22px; }
        .sc-right h4 { margin:0 0 6px 0; font-size:15px; }
        .sc-right p { margin:0; color:var(--muted); font-size:13px; }

        .tips h4, .help h4 { margin:0 0 8px 0; font-size:14px; color:var(--accent-a); }
        .tips ul { margin:0; padding-left:18px; color:var(--muted); font-size:13px; }
        .help p { margin:0; color:var(--muted); font-size:13px; }

        /* responsive */
        @media (max-width: 1200px) {
          .glass-card { width: 92%; }
          .left { min-width: 480px; }
        }

        @media (max-width: 900px) {
          .glass-inner { flex-direction: column; }
          .left { min-width: auto; }
          .right { width:100%; }
        }
      `}</style>
    </div>
  );
};

export default JoinRoom;