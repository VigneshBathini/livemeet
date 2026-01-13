// ChatPanel.jsx
import React, { useEffect, useRef } from 'react';

const ChatPanel = ({
  showChat,
  setShowChat,
  messages,
  chatInput,
  setChatInput,
  sendChatMessage,
  socketRef,
  userName
}) => {
  const chatRef = useRef();

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const getInitials = (name = '') => {
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  };

  return (
    <div className={`side-panel ${showChat ? 'open' : ''}`}>
      <div className="chat-container">
        <div className="chat-header">
          <h3>Chat</h3>
          <button onClick={() => setShowChat(false)} title="Close chat">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="chat-messages-wrapper">
          <div className="chat-messages" ref={chatRef}>
            {messages.map((msg, index) => (
              <div key={index} className={`chat-message ${msg.from === (socketRef?.current?.id || '') ? 'own-message' : ''}`}>
                <div className="chat-meta">
                  <span className="chat-sender">
                    {msg.from === (socketRef?.current?.id || '') ? 'You' : msg.userName || getInitials(msg.userName)}
                  </span>
                  <span className="chat-time">{msg.time}</span>
                </div>
                <div className="chat-text">{msg.message}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="chat-input">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type a message..."
            onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
          />
          <button onClick={sendChatMessage} title="Send message">
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;