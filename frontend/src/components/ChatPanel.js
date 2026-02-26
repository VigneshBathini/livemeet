import React, { useEffect, useRef, useCallback, useMemo } from 'react';

const THROTTLE_DELAY = 1000;

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
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const lastSentTimeRef = useRef(0);

  const socketId = socketRef?.current?.id || '';

  /* Auto-scroll on new messages */
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  /* Autofocus input when chat opens */
  useEffect(() => {
    if (showChat) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showChat]);

  const getInitials = useCallback((name = '') => {
    return (
      name
        .trim()
        .split(/\s+/)
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || '??'
    );
  }, []);

  const canSend = useMemo(() => {
    return (
      chatInput.trim().length > 0 &&
      Date.now() - lastSentTimeRef.current >= THROTTLE_DELAY
    );
  }, [chatInput]);

  const handleSendMessage = useCallback(() => {
    const now = Date.now();

    if (!chatInput.trim()) return;
    if (now - lastSentTimeRef.current < THROTTLE_DELAY) return;

    lastSentTimeRef.current = now;
    sendChatMessage();
  }, [chatInput, sendChatMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={`side-panel ${showChat ? 'open' : ''}`} role="dialog" aria-label="Chat panel">
      <div className="chat-container">
        <div className="chat-header">
          <h3>Chat</h3>
          <button
            onClick={() => setShowChat(false)}
            title="Close chat"
            aria-label="Close chat"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="chat-messages-wrapper">
          <div className="chat-messages" ref={chatRef}>
            {messages.map((msg) => {
              const isOwn = msg.from === socketId;

              return (
                <div
                  key={msg.id || `${msg.from}-${msg.time}`}
                  className={`chat-message ${isOwn ? 'own-message' : ''}`}
                >
                  <div className="chat-meta">
                    <span className="chat-sender">
                      {isOwn ? 'You' : msg.userName || getInitials(msg.userName)}
                    </span>
                    <span className="chat-time">{msg.time}</span>
                  </div>
                  <div className="chat-text">{msg.message}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="chat-input">
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={handleKeyDown}
            aria-label="Chat message input"
          />
          <button
            onClick={handleSendMessage}
            disabled={!canSend}
            title={canSend ? 'Send message' : 'Please wait'}
            aria-disabled={!canSend}
          >
            <i className="fas fa-paper-plane" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
