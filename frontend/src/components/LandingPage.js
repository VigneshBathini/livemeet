import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleGetStarted = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => navigate('/signup', { state: { prefillEmail: email } }), 1500);
    }, 1000);
  };

  const features = [
    {
      icon: (
        <svg viewBox="0 0 24 24" className="feat-icon-svg" role="img" aria-label="AI Proctoring icon">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" />
          <path d="M12 4v-2M12 22v-2M4 12H2M22 12h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      title: 'AI Proctoring',
      desc: 'Detect cheating, multiple faces, and tab switching in real-time during every interview.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="feat-icon-svg" role="img" aria-label="One-Click Join icon">
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" />
        </svg>
      ),
      title: 'One-Click Join',
      desc: 'No downloads for candidates. Works on any browser, any device, instantly.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="feat-icon-svg" role="img" aria-label="Smart Analytics icon">
          <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="6" y="10" width="3" height="7" rx="1" fill="currentColor" />
          <rect x="11" y="6" width="3" height="11" rx="1" fill="currentColor" opacity="0.85" />
          <rect x="16" y="8" width="3" height="9" rx="1" fill="currentColor" opacity="0.7" />
        </svg>
      ),
      title: 'Smart Analytics',
      desc: 'Coming soon: Talking time ratios, engagement scores, and structured scorecards — ready when the call ends.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="feat-icon-svg" role="img" aria-label="Panel Interviews icon">
          <circle cx="9" cy="10" r="3" fill="currentColor" />
          <circle cx="16" cy="11" r="2.5" fill="currentColor" opacity="0.8" />
          <path d="M4 19c1.5-3 8.5-3 10 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M13 18c1-2 5-2 6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      ),
      title: 'Panel Interviews',
      desc: 'Invite multiple interviewers, share live notes, and collect structured feedback together.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="feat-icon-svg" role="img" aria-label="Enterprise Security icon">
          <path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: 'Enterprise Security',
      desc: 'End-to-end encryption, GDPR compliant, SSO ready out of the box.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="feat-icon-svg" role="img" aria-label="ATS Integration icon">
          <path d="M8.5 12a3.5 3.5 0 013.5-3.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M15.5 12a3.5 3.5 0 01-3.5 3.5H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <circle cx="6.5" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.5" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      ),
      title: 'ATS Integration',
      desc: 'Syncs natively with Greenhouse, Lever, and Workday. Your pipeline, uninterrupted.'
    },
  ];

  const steps = [
    { n: '01', title: 'Schedule',        desc: 'Pick a time and add the candidate email. Calendar sync auto-creates a private meeting room.' },
    { n: '02', title: 'Candidate Joins', desc: 'One link, any browser, any device. AI verifies identity and monitors the session live.' },
    { n: '03', title: 'Evaluate',        desc: 'Coming soon: Built-in scorecards, collaborative notes, and instant analytics land in your inbox.' },
  ];

  const testimonials = [
    { quote: 'Cut our interview process from 3 weeks to 5 days. The proctoring features are game-changing!', name: 'Sarah Chen',      role: 'Head of Talent, TechStart Inc',      initials: 'SC' },
    { quote: 'Candidates love the seamless experience. No downloads, just click and join.',                  name: 'David Rodriguez', role: 'Recruitment Manager, ScaleUp Co',     initials: 'DR' },
    { quote: 'The AI-powered cheating detection saved us from a bad hire. Worth every penny.',               name: 'Michael Park',    role: 'Engineering Director, CloudFirst',    initials: 'MP' },
  ];

  const plans = [
    {
      name: 'Free Trial', price: '$0',   period: 'forever',
      features: ['10 interviews / month', 'Basic proctoring', '30-min limit', 'Up to 3 participants-proctor mode'],
      cta: 'Start Free', primary: false,
    },
    {
      name: 'Professional', price: '$29', period: 'per user / month',
      features: ['Unlimited interviews', 'Full AI proctoring', 'Up to 5 participants proctor mode', 'Custom branding'],
      cta: 'Start Free Trial', primary: true,
    },
    {
      name: 'Enterprise', price: 'Custom', period: 'tailored pricing',
      features: ['Unlimited everything', 'SSO & API access', 'Dedicated support', 'Compliance reporting', 'Custom workflows'],
      cta: 'Contact Us', primary: false,
    },
  ];

  return (
    <div className="app">
      {/* BG */}
      <div className="bg">
        <div className="bg-circle c1" />
        <div className="bg-circle c2" />
        <div className="bg-circle c3" />
        <div className="bg-grid" />
      </div>

      {/* ── NAV ── */}
      <header className="header">
        <div className="brand">
          <div className="logo">📹</div>
          <div className="brand-text">
            <div className="title">Proctor<span>Meet</span></div>
            <div className="subtitle">Video meetings, simplified</div>
          </div>
        </div>
        <nav className="nav-links">
          <a href="#features"     className="nav-link">Features</a>
          <a href="#how-it-works" className="nav-link">How it works</a>
          <a href="#pricing"      className="nav-link">Pricing</a>
        </nav>
        <div className="header-actions">
          <button className="ghost" onClick={() => navigate('/login')}>Sign in</button>
          <button className="btn primary small" onClick={() => navigate('/signup')}>Get started</button>
        </div>
      </header>

  
      <section className="section hero-section">
        <div className="container hero-container">

      
          <div className="hero-left">
            <div className="badge-pill">
              <span className="badge-dot" />
              Trusted by 500+ companies for remote hiring
            </div>
            <h1 className="hero-title">
              The interview platform that <span className="accent">actually</span> prevents cheating
            </h1>
            <p className="hero-sub">
              AI-powered proctoring, seamless candidate experience, and everything you need for fair, efficient remote interviews.
            </p>

            {!success ? (
              <form onSubmit={handleGetStarted} className="hero-form" noValidate>
                <div className="hero-input-row">
                  <input
                    className="input"
                    type="email"
                    placeholder="Enter your work email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                  <button className="btn primary" type="submit" disabled={loading}>
                    {loading
                      ? <span className="spin-row"><span className="spinner" />Starting…</span>
                      : 'Start free trial →'}
                  </button>
                </div>
                <p className="form-note">No credit card required · 14-day free trial</p>
              </form>
            ) : (
              <div className="alert success">
                <div className="msg">🎉 Welcome aboard! Setting up your account…</div>
              </div>
            )}

            <div className="hero-stats">
              {[['500+', 'Companies'], ['50k+', 'Interviews'], ['99.9%', 'Uptime']].map(([val, lbl], i) => (
                <React.Fragment key={i}>
                  {i > 0 && <div className="stat-divider" />}
                  <div className="stat">
                    <span className="stat-val">{val}</span>
                    <span className="stat-label">{lbl}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

      
          <div className="hero-right">
            <div className="mock-ui">
              <div className="mock-bar">
                <div className="mock-dots">
                  <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
                </div>
                <span className="mock-bar-title">Interview Room · AI Proctoring Active</span>
                <span className="mock-live">● Live</span>
              </div>
              <div className="mock-body">
                <div className="mock-video">
                  <div className="mock-avatar">SC</div>
                  <span className="mock-name">Sarah Chen — Candidate</span>
                  <span className="mock-chip verified">✓ Identity Verified</span>
                </div>
                <div className="mock-stats">
                  <div className="mock-stat">
                    <span className="mock-stat-label">Talking ratio</span>
                    <span className="mock-stat-val">42 / 58%</span>
                    <div className="mock-bar-track"><div className="mock-bar-fill" /></div>
                  </div>
                  <div className="mock-stat">
                    <span className="mock-stat-label">Proctoring</span>
                    <span className="mock-stat-val success-color">No issues</span>
                  </div>
                  <div className="mock-stat">
                    <span className="mock-stat-label">Duration</span>
                    <span className="mock-stat-val">24:13</span>
                  </div>
                  <div className="mock-note">
                    <span className="mock-note-label">Live notes</span>
                    <p>Strong systems design. Ask more about distributed tracing…</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

     
      <div className="logo-bar">
        <div className="container">
          <p className="logo-bar-label">Trusted by innovative teams</p>
          <div className="logos">
            {['TechCorp', 'StartupHub', 'InnovateCo', 'NextGen', 'FutureWorks', 'CloudScale'].map(l => (
              <span key={l} className="logo-name">{l}</span>
            ))}
          </div>
        </div>
      </div>

   
      <section id="features" className="section">
        <div className="container">
          <div className="section-head">
            <p className="eye">Capabilities</p>
            <h2 className="section-title">Everything remote hiring needs</h2>
            <p className="section-sub">One platform — from scheduling to scorecard.</p>
          </div>
          <div className="grid-3">
            {features.map((f, i) => (
              <div key={i} className="panel feature-card">
                <div className="feat-icon">{f.icon}</div>
                <h3 className="feat-title">{f.title}</h3>
                <p className="feat-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section tinted">
        <div className="container">
          <div className="section-head">
            <p className="eye">Process</p>
            <h2 className="section-title">Simple as 1-2-3</h2>
            <p className="section-sub">From scheduling to scorecard in minutes.</p>
          </div>
          <div className="steps-row">
            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <div className="panel step-card">
                  <span className="step-num">{s.n}</span>
                  <h3 className="feat-title">{s.title}</h3>
                  <p className="feat-desc">{s.desc}</p>
                </div>
                {i < steps.length - 1 && <div className="step-arrow">→</div>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <p className="eye">What teams say</p>
            <h2 className="section-title">Hiring leaders love it</h2>
          </div>
          <div className="grid-3">
            {testimonials.map((t, i) => (
              <div key={i} className="panel test-card">
                <div className="stars">★★★★★</div>
                <p className="test-quote">"{t.quote}"</p>
                <div className="test-author">
                  <div className="t-avatar">{t.initials}</div>
                  <div>
                    <p className="t-name">{t.name}</p>
                    <p className="t-role">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

   
      <section id="pricing" className="section tinted">
        <div className="container">
          <div className="section-head">
            <p className="eye">Pricing</p>
            <h2 className="section-title">Simple, transparent pricing</h2>
            <p className="section-sub">Start free. Upgrade when you're ready.</p>
          </div>
          <div className="pricing-grid">
            {plans.map((plan, i) => (
              <div key={i} className={`panel pricing-card ${plan.primary ? 'highlighted' : ''}`}>
                {plan.primary && <div className="popular-badge">MOST POPULAR</div>}
                <p className="plan-name">{plan.name}</p>
                <div className="plan-price-row">
                  <span className="plan-price">{plan.price}</span>
                  <span className="plan-period">{plan.period}</span>
                </div>
                <ul className="plan-features">
                  {plan.features.map((f, fi) => (
                    <li key={fi}><span className="check">✓</span>{f}</li>
                  ))}
                </ul>
                <button
                  className={`btn ${plan.primary ? 'primary' : 'secondary'} full`}
                  onClick={() => navigate('/signup')}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="section final-cta">
        <div className="container">
          <div className="cta-box">
            <div className="bg-circle c1" style={{opacity:0.08, width:300, height:300, top:-80, left:-80}} />
            <div className="bg-circle c2" style={{opacity:0.06, width:250, height:250, bottom:-60, right:-60}} />
            <p className="eye">Get started</p>
            <h2 className="section-title">Start hiring fairly today</h2>
            <p className="section-sub" style={{marginBottom:32}}>
              Join 500+ companies who trust ProcterMeet for critical hiring decisions.
            </p>
            <button className="btn primary large" onClick={() => navigate('/signup')}>
              Get started free →
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="container footer-inner">
          <div className="brand">
            <div className="logo small">📹</div>
            <div className="brand-text">
              <div className="title" style={{fontSize:16}}>Proctor<span>Meet</span></div>
            </div>
          </div>
          <div className="footer-links">
            <button className="ghost small" onClick={() => navigate('/login')}>Sign in</button>
            <span className="sep">·</span>
            <a className="footer-a" href="#features">Features</a>
            <span className="sep">·</span>
            <a className="footer-a" href="#pricing">Pricing</a>
            <span className="sep">·</span>
            <a className="footer-a" href="#privacy">Privacy</a>
          </div>
          <p className="copyright">© 2026 ProcterMeet. All rights reserved.</p>
        </div>
      </footer>

      <style>{`
        :root {
          --bg1: #0d1020;
          --bg2: #0b1528;
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
          position: relative;
          overflow-x: hidden;
        }

        /* BG decor */
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

        /* ── NAV ── */
        .header {
          position: sticky; top: 0; z-index: 100;
          display: flex; justify-content: space-between; align-items: center;
          padding: 0 80px; height: 70px;
          background: rgba(13,16,32,0.85);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .brand { display: flex; align-items: center; gap: 14px; }
        .logo {
          width: 56px; height: 56px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, var(--accent-a), var(--accent-b));
          font-size: 22px;
        }
        .logo.small { width: 38px; height: 38px; font-size: 16px; border-radius: 8px; }
        .brand-text .title { font-size: 20px; font-weight: 700; letter-spacing: 0.2px; }
        .brand-text .title span { color: var(--accent-b); }
        .brand-text .subtitle { font-size: 12px; color: var(--muted); margin-top: 4px; }

        .nav-links { display: flex; align-items: center; gap: 32px; }
        .nav-link {
          font-size: 14px; color: var(--muted); text-decoration: none;
          transition: color 0.2s;
        }
        .nav-link:hover { color: var(--text); }

        .header-actions { display: flex; align-items: center; gap: 10px; }

        .ghost {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          color: var(--text); padding: 10px 16px;
          border-radius: 10px; display: flex; align-items: center; gap: 8px;
          cursor: pointer; font-family: inherit; font-size: 14px;
        }
        .ghost.small { padding: 8px 12px; font-size: 13px; }
        .ghost:hover { background: rgba(255,255,255,0.07); }

        /* ── LAYOUT ── */
        .container { max-width: 1200px; margin: 0 auto; padding: 0 40px; position: relative; z-index: 1; }
        .section { padding: 96px 0; position: relative; z-index: 1; }
        .section.tinted { background: rgba(255,255,255,0.015); }

        /* ── BUTTONS ── */
        .btn {
          padding: 12px 20px; border-radius: 12px; border: none;
          cursor: pointer; font-weight: 700; font-size: 14px;
          font-family: inherit; transition: opacity 0.2s;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          white-space: nowrap;
        }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn.primary {
          background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
          color: #fff; box-shadow: 0 12px 30px rgba(124,86,255,0.14);
        }
        .btn.primary:hover:not(:disabled) { opacity: 0.88; }
        .btn.primary.small { padding: 10px 16px; font-size: 13px; border-radius: 10px; }
        .btn.primary.large { padding: 15px 36px; font-size: 16px; }
        .btn.secondary {
          background: rgba(255,255,255,0.03); color: var(--muted);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .btn.secondary:hover { background: rgba(255,255,255,0.06); }
        .btn.full { width: 100%; }

        .spin-row { display: flex; align-items: center; gap: 8px; }
        .spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
          border-radius: 50%; animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

        /* ── INPUTS ── */
        .input {
          padding: 14px 16px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.04);
          background: rgba(6,8,14,0.45);
          color: var(--text); font-size: 15px;
          font-family: inherit; outline: none;
          transition: box-shadow 160ms, border-color 160ms;
          width: 100%;
        }
        .input::placeholder { color: rgba(255,255,255,0.2); }
        .input:focus {
          border-color: rgba(78,167,255,0.6);
          box-shadow: 0 6px 18px rgba(78,167,255,0.08);
        }

        /* ── ALERTS ── */
        .alert {
          padding: 12px 16px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.04);
          display: flex; align-items: center; gap: 10px; font-size: 14px;
        }
        .alert.success {
          background: rgba(0,204,105,0.08); border-color: rgba(0,204,105,0.2); color: #6dffc0;
        }
        .alert.error {
          background: rgba(255,80,80,0.07); border-color: rgba(255,80,80,0.2); color: #ff8080;
        }

        /* ── HERO ── */
        .hero-section { padding: 80px 0 60px; }
        .hero-container {
          display: flex; gap: 56px; align-items: center;
        }
        .hero-left { flex: 1; display: flex; flex-direction: column; gap: 24px; }

        .badge-pill {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(78,167,255,0.08);
          border: 1px solid rgba(78,167,255,0.2);
          color: var(--accent-a);
          font-size: 12px; font-weight: 600;
          padding: 7px 16px; border-radius: 100px;
          align-self: flex-start;
        }
        .badge-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--success); display: inline-block;
          animation: blink 2s ease-in-out infinite;
        }
        .hero-title {
          font-size: 48px; font-weight: 800; line-height: 1.18;
          color: var(--text); letter-spacing: -1px;
        }
        .accent { color: var(--accent-a); }
        .hero-sub { font-size: 16px; color: var(--muted); line-height: 1.7; max-width: 500px; }

        .hero-form { display: flex; flex-direction: column; gap: 10px; }
        .hero-input-row { display: flex; gap: 10px; }
        .hero-input-row .input { flex: 1; }
        .form-note { font-size: 12px; color: rgba(255,255,255,0.25); }

        .hero-stats {
          display: flex; align-items: center; gap: 20px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px; padding: 16px 20px;
          align-self: flex-start;
        }
        .stat { display: flex; flex-direction: column; gap: 3px; }
        .stat-val { font-size: 20px; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 11px; color: var(--muted); }
        .stat-divider { width: 1px; height: 32px; background: rgba(255,255,255,0.07); }

        /* ── MOCK UI ── */
        .hero-right { flex: 1; }
        .mock-ui {
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px; overflow: hidden;
          box-shadow: 0 30px 80px rgba(2,6,23,0.6);
        }
        .mock-bar {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 18px;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .mock-dots { display: flex; gap: 6px; }
        .mock-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.1); }
        .mock-bar-title { flex: 1; text-align: center; font-size: 11px; color: var(--muted); opacity: 0.5; }
        .mock-live {
          font-size: 11px; font-weight: 600; color: var(--success);
          background: rgba(0,204,105,0.1); border: 1px solid rgba(0,204,105,0.2);
          padding: 3px 10px; border-radius: 100px;
        }
        .mock-body { display: flex; min-height: 200px; }
        .mock-video {
          flex: 1; padding: 28px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
          background: rgba(0,0,0,0.2);
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .mock-avatar {
          width: 68px; height: 68px; border-radius: 50%;
          background: linear-gradient(135deg, rgba(78,167,255,0.15), rgba(124,86,255,0.15));
          border: 2px solid rgba(78,167,255,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; font-weight: 700; color: var(--accent-a);
        }
        .mock-name { font-size: 12px; color: var(--muted); opacity: 0.6; }
        .mock-chip {
          font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 100px;
        }
        .mock-chip.verified {
          color: var(--accent-a);
          background: rgba(78,167,255,0.1); border: 1px solid rgba(78,167,255,0.2);
        }
        .mock-stats { width: 200px; padding: 18px 16px; display: flex; flex-direction: column; gap: 14px; }
        .mock-stat { display: flex; flex-direction: column; gap: 4px; }
        .mock-stat-label { font-size: 10px; color: var(--muted); opacity: 0.4; text-transform: uppercase; letter-spacing: 0.5px; }
        .mock-stat-val { font-size: 13px; font-weight: 700; color: var(--text); }
        .mock-stat-val.success-color { color: var(--success); }
        .mock-bar-track { height: 4px; background: rgba(255,255,255,0.06); border-radius: 4px; }
        .mock-bar-fill { height: 4px; width: 42%; background: linear-gradient(90deg, var(--accent-a), var(--accent-b)); border-radius: 4px; }
        .mock-note {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 8px; padding: 10px;
        }
        .mock-note-label { font-size: 9px; color: var(--muted); opacity: 0.4; text-transform: uppercase; letter-spacing: 0.5px; }
        .mock-note p { font-size: 11px; color: var(--muted); opacity: 0.5; margin-top: 4px; line-height: 1.5; }

        /* ── LOGO BAR ── */
        .logo-bar {
          padding: 40px 0; position: relative; z-index: 1;
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .logo-bar-label { font-size: 11px; color: rgba(255,255,255,0.2); text-transform: uppercase; letter-spacing: 2px; text-align: center; margin-bottom: 20px; }
        .logos { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px 48px; }
        .logo-name { font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.12); }

        /* ── SECTION HEAD ── */
        .section-head { text-align: center; margin-bottom: 56px; }
        .eye { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: var(--accent-a); margin-bottom: 12px; }
        .section-title { font-size: 36px; font-weight: 800; color: var(--text); margin-bottom: 12px; letter-spacing: -0.5px; }
        .section-sub { font-size: 15px; color: var(--muted); max-width: 420px; margin: 0 auto; line-height: 1.6; }

        /* ── PANEL (shared card style from JoinRoom) ── */
        .panel {
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 24px;
          box-shadow: 0 8px 24px rgba(2,6,23,0.3);
        }

        /* ── FEATURES ── */
        .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .feature-card { display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s; }
        .feature-card:hover { border-color: rgba(78,167,255,0.25); }
        .feat-icon {
          width: 44px; height: 44px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 12px 24px rgba(2,6,23,0.35);
          color: var(--accent-a);
        }
        .feat-icon-svg { width: 24px; height: 24px; display: block; }
        .feat-title { font-size: 16px; font-weight: 700; color: var(--text); }
        .feat-desc { font-size: 13.5px; color: var(--muted); line-height: 1.65; }

        /* ── HOW IT WORKS ── */
        .steps-row {
          display: flex; align-items: flex-start; gap: 0;
          max-width: 960px; margin: 0 auto;
        }
        .step-card { flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .step-arrow {
          flex-shrink: 0; font-size: 24px; color: rgba(78,167,255,0.3);
          padding: 0 16px; margin-top: 32px;
        }
        .step-num {
          font-size: 42px; font-weight: 800; line-height: 1;
          background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }

        /* ── TESTIMONIALS ── */
        .test-card { display: flex; flex-direction: column; gap: 16px; }
        .stars { color: #f5c842; font-size: 14px; letter-spacing: 2px; }
        .test-quote { font-size: 14px; color: var(--muted); line-height: 1.7; font-style: italic; }
        .test-author { display: flex; align-items: center; gap: 12px; }
        .t-avatar {
          width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, rgba(78,167,255,0.15), rgba(124,86,255,0.15));
          border: 1.5px solid rgba(78,167,255,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: var(--accent-a);
        }
        .t-name { font-size: 13.5px; font-weight: 700; color: var(--text); }
        .t-role { font-size: 12px; color: var(--muted); margin-top: 2px; }

        /* ── PRICING ── */
        .pricing-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px; max-width: 960px; margin: 0 auto; align-items: start;
        }
        .pricing-card { display: flex; flex-direction: column; gap: 20px; padding: 32px 28px; position: relative; }
        .pricing-card.highlighted {
          border-color: rgba(78,167,255,0.4);
          box-shadow: 0 0 48px rgba(78,167,255,0.07);
        }
        .popular-badge {
          position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
          background: linear-gradient(90deg, var(--accent-a), var(--accent-b));
          color: #fff; font-size: 10px; font-weight: 700;
          letter-spacing: 1.5px; padding: 5px 14px; border-radius: 100px;
          white-space: nowrap;
        }
        .plan-name { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.35); }
        .plan-price-row { display: flex; align-items: baseline; gap: 8px; }
        .plan-price { font-size: 40px; font-weight: 800; color: var(--text); letter-spacing: -1px; }
        .plan-period { font-size: 13px; color: var(--muted); }
        .plan-features { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .plan-features li { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--muted); }
        .check { color: var(--accent-a); font-weight: 700; font-size: 13px; flex-shrink: 0; }

        /* ── FINAL CTA ── */
        .final-cta { padding: 80px 0; }
        .cta-box {
          position: relative; overflow: hidden;
          background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px; padding: 72px 48px;
          text-align: center;
          box-shadow: 0 30px 80px rgba(2,6,23,0.5);
          display: flex; flex-direction: column; align-items: center; gap: 16px;
        }

        /* ── FOOTER ── */
        .footer {
          position: relative; z-index: 1;
          border-top: 1px solid rgba(255,255,255,0.05);
          padding: 32px 0;
        }
        .footer-inner {
          display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;
        }
        .footer-links { display: flex; align-items: center; gap: 12px; }
        .footer-a { font-size: 13px; color: rgba(255,255,255,0.25); text-decoration: none; }
        .footer-a:hover { color: var(--muted); }
        .sep { color: rgba(255,255,255,0.15); }
        .copyright { font-size: 12px; color: rgba(255,255,255,0.18); }

        /* ── RESPONSIVE ── */
        @media (max-width: 1024px) {
          .hero-container { flex-direction: column; }
          .hero-right { width: 100%; }
          .header { padding: 0 32px; }
          .nav-links { display: none; }
        }
        @media (max-width: 640px) {
          .hero-title { font-size: 34px; }
          .hero-input-row { flex-direction: column; }
          .steps-row { flex-direction: column; }
          .step-arrow { display: none; }
          .section { padding: 64px 0; }
          .container { padding: 0 20px; }
          .cta-box { padding: 48px 24px; }
          .footer-inner { flex-direction: column; text-align: center; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
