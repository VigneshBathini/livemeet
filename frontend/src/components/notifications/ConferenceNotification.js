// src/components/ConferenceNotification.jsx
import React, { useEffect, useState } from 'react';

const ConferenceNotification = ({ message, type, duration = 4000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  const getIcon = () => {
    switch(type) {
      case 'success': return 'fas fa-check-circle';
      case 'error': return 'fas fa-times-circle';
      case 'warning': return 'fas fa-exclamation-triangle';
      default: return 'fas fa-info-circle';
    }
  };

  const getColor = () => {
    switch(type) {
      case 'success': return '#00cc69';
      case 'error': return '#ff4d4d';
      case 'warning': return '#ffaa00';
      default: return '#00b7eb';
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: getColor(),
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        animation: 'slideDown 0.3s ease-out'
      }}
    >
      <i className={getIcon()}></i>
      <span style={{ fontWeight: '500', fontSize: '14px' }}>{message}</span>
    </div>
  );
};

export default ConferenceNotification;