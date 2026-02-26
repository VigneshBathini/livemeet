import React from 'react';
import PropTypes from 'prop-types';
import Lottie from 'lottie-react';
import liquidSand from './sand.json';

/**
 * Standardized Waiting Lobby Component
 */
const WaitingLobby = ({ userName, roomId, isLoading = true }) => {
  // Enhanced initials logic for standard handling of edge cases
  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <main style={styles.page} aria-label="Meeting Waiting Room">
      {/* Decorative Background Elements */}
      <div style={styles.glowEffects} aria-hidden="true">
        <div style={{ ...styles.glowBase, ...styles.glowIndigo }} />
        <div style={{ ...styles.glowBase, ...styles.glowAmber }} />
      </div>

      <section style={styles.contentGrid}>
        {/* User Presence Card */}
        <div style={styles.glassCard}>
          <header style={styles.header}>
            <h1 style={styles.title}>Waiting for approval</h1>
            <p style={styles.subtitle}>The host will let you in shortly</p>
          </header>

          <div style={styles.profileSection}>
            <div style={styles.avatar} aria-hidden="true">
              {getInitials(userName)}
            </div>
            <div style={styles.details}>
              <h2 style={styles.userNameText}>{userName}</h2>
              <code style={styles.roomBadge}>
                <span role="img" aria-label="locked">🔒</span> {roomId}
              </code>
            </div>
          </div>

          <footer style={styles.statusFooter}>
            <div style={styles.statusIndicator}>
              <span style={styles.pulsingDot} />
              <span style={styles.statusText}>
                {isLoading ? 'Connecting to session...' : 'Waiting for host...'}
              </span>
            </div>
          </footer>
        </div>

        {/* Visual Media Section */}
        <div style={styles.animationWrapper} aria-hidden="true">
          <Lottie 
            animationData={liquidSand} 
            loop={true} 
            style={styles.lottiePlayer} 
          />
        </div>
      </section>

      {/* Injecting keyframes for standardized animations */}
      <style>{`
        @keyframes glowPulse { 
          0%, 100% { opacity: 0.2; transform: scale(1); } 
          50% { opacity: 0.4; transform: scale(1.05); } 
        }
        @keyframes pulse { 
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}</style>
    </main>
  );
};

// Standardized Prop Definitions
WaitingLobby.propTypes = {
  userName: PropTypes.string.isRequired,
  roomId: PropTypes.string.isRequired,
  isLoading: PropTypes.bool
};

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    position: 'relative',
    overflow: 'hidden',
    padding: '20px'
  },
  contentGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '40px',
    maxWidth: '1200px',
    zIndex: 10
  },
  glassCard: {
    width: '100%',
    maxWidth: '420px',
    background: 'rgba(30, 41, 59, 0.6)',
    backdropFilter: 'blur(16px)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '40px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
  },
  header: { textAlign: 'center', marginBottom: '30px' },
  title: { 
    fontSize: '1.5rem', 
    fontWeight: '700', 
    color: '#fff', 
    marginBottom: '8px',
    letterSpacing: '-0.025em'
  },
  subtitle: { color: '#94a3b8', fontSize: '0.875rem' },
  profileSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '30px'
  },
  avatar: {
    width: '90px',
    height: '90px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '16px',
    boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)'
  },
  userNameText: { fontSize: '1.25rem', fontWeight: '600', color: '#f8fafc' },
  roomBadge: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    background: '#1e293b',
    padding: '6px 12px',
    borderRadius: '8px',
    marginTop: '8px',
    display: 'inline-block'
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '14px',
    background: 'rgba(15, 23, 42, 0.4)',
    borderRadius: '12px'
  },
  pulsingDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    animation: 'pulse 2s infinite'
  },
  statusText: { fontSize: '0.875rem', color: '#cbd5e1' },
  animationWrapper: { flex: '1', minWidth: '300px', maxWidth: '600px' },
  lottiePlayer: { width: '100%' },
  glowBase: {
    position: 'absolute',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    filter: 'blur(80px)',
    animation: 'glowPulse 10s infinite alternate'
  },
  glowIndigo: { top: '-10%', left: '-5%', background: 'rgba(99, 102, 241, 0.1)' },
  glowAmber: { bottom: '-10%', right: '-5%', background: 'rgba(245, 158, 11, 0.05)' }
};

export default WaitingLobby;