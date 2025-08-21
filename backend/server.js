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
  origin: ['https://livemeet-ribm.onrender.com'],
  methods: ['GET', 'POST'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const io = new Server(server, {
  cors: {
    origin: ['https://livemeet-ribm.onrender.com'],
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }
});

// Test endpoints (place below static file serving)
app.get('/test', (req, res) => res.send('Server is running'));

// Handle all other routes with React's index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  socket.on('join-room', (roomId, userId, userName) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', userId || socket.id, userName);
    console.log(`${userId || socket.id} (${userName}) joined room ${roomId}`);
    // Debug: Log room members
    io.in(roomId).allSockets().then(sockets => {
      console.log(`Users in room ${roomId}: ${[...sockets].join(', ')}`);
    });
  });

  socket.on('offer', (data) => {
    socket.to(data.to).emit('offer', { signal: data.signal, from: socket.id });
  });

  socket.on('answer', (data) => {
    socket.to(data.to).emit('answer', { signal: data.signal, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
  });

  socket.on('chat-message', (data) => {
    console.log(`Chat message from ${socket.id} (${data.userName}) in room ${data.roomId}: ${data.message}`);
    socket.to(data.roomId).emit('chat-message', {
      message: data.message,
      from: socket.id,
      userName: data.userName
    });
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