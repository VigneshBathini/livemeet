// DebugPanel.jsx
import React from 'react';

const DebugPanel = ({ showDebug, debugLog }) => {
  if (!showDebug) return null;

  return (
    <div className="debug-panel">
      <h4>Debug Log</h4>
      <ul>
        {debugLog.map((log, index) => (
          <li key={index}>{log}</li>
        ))}
      </ul>
    </div>
  );
};

export default DebugPanel;