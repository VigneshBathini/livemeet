const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const roomId = `room-test-${Date.now()}`;
const url = 'http://localhost:3000';

function waitForEvent(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (...args) => {
      clearTimeout(t);
      resolve(args);
    });
  });
}

async function connectClient(name, email) {
  const s = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 10000 });
  await waitForEvent(s, 'connect', 10000);
  s.emit('join-room', roomId, s.id, name, email, true);
  await waitForEvent(s, 'room-users', 10000);
  return s;
}

(async () => {
  const results = { roomId, ok: false, receivedHistory: null, error: null };
  let s1, s2;
  try {
    s1 = await connectClient('Host One', 'host1@example.com');

    // Send one message from client1
    s1.emit('chat-message', {
      roomId,
      message: 'Hello from host1',
      userName: 'Host One',
      userEmail: 'host1@example.com',
    });

    // Small delay to ensure server stores/queues history
    await new Promise(r => setTimeout(r, 800));

    s2 = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, timeout: 10000 });
    await waitForEvent(s2, 'connect', 10000);

    const historyPromise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 12000);
      s2.on('chat-history', (history) => {
        clearTimeout(timer);
        resolve(history);
      });
    });

    s2.emit('join-room', roomId, s2.id, 'Host Two', 'host2@example.com', true);
    await waitForEvent(s2, 'room-users', 10000);

    // Explicit request fallback path
    s2.emit('request-chat-history', { roomId });

    const history = await historyPromise;
    results.receivedHistory = history;
    results.ok = Array.isArray(history) && history.some((m) => (m?.message || '').includes('Hello from host1'));

    if (!results.ok) {
      throw new Error('Second client did not receive expected chat history message');
    }
  } catch (e) {
    results.error = e.message;
  } finally {
    if (s1) s1.disconnect();
    if (s2) s2.disconnect();
  }

  const out = path.join(process.cwd(), 'chat-history-test-result.json');
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  if (!results.ok) process.exit(1);
})();
