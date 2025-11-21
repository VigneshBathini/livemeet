import React, { useEffect } from 'react';

const Alert = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);
  

  return (
    <div className={`alert alert-${type}`}>
      {message}
      <button onClick={onClose} className="alert-close">×</button>
    </div>
  );
};

export default Alert;