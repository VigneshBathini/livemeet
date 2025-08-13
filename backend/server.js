const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve static files from the React frontend build folder
app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

// CORS configuration
app.use(cors({
  origin: ['https://livemeet-ribm.onrender.com', 'http://localhost:3001'],
  methods: ['GET', 'POST'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const io = new Server(server, {
  cors: {
    origin: ['https://livemeet-ribm.onrender.com', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

// Test endpoints
app.get('/test', (req, res) => res.send('Server is running'));

// Handle all other routes with React's index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  socket.on('join-room', (roomId, userId) => {
    if (!roomId || !userId) {
      console.log('Invalid join-room data:', { roomId, userId });
      return;
    }
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', userId);
    console.log(`${userId} joined room ${roomId}`);
  });

  socket.on('chat-message', (messageData, callback) => {
    if (!messageData?.roomId || !messageData?.userId || !messageData?.message) {
      console.log('Invalid chat-message data:', messageData);
      if (callback) callback({ error: 'Invalid message data' });
      return;
    }
    console.log(`Received chat message from ${messageData.userId} in room ${messageData.roomId}: ${messageData.message}`);
    // Broadcast to entire room (including sender) for debugging
    io.to(messageData.roomId).emit('chat-message', messageData);
    if (callback) callback({ success: true });
  });

  socket.on('offer', (data) => {
    if (!data?.to || !data?.signal) return;
    socket.to(data.to).emit('offer', { signal: data.signal, from: socket.id });
  });

  socket.on('answer', (data) => {
    if (!data?.to || !data?.signal) return;
    socket.to(data.to).emit('answer', { signal: data.signal, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    if (!data?.to || !data?.candidate) return;
    socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('user-left', socket.id);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});