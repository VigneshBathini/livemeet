const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: '*', // Same backend+frontend deployment → '*' is fine
    methods: ['GET', 'POST']
  }
});

// Serve React build
const buildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(buildPath));

// Catch-all route for React (avoids path-to-regexp errors in Express 5+)
app.get('/*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', userId);
    console.log(`${userId} joined room ${roomId}`);
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

  socket.on('disconnect', () => {
    socket.broadcast.emit('user-left', socket.id);
    console.log('User disconnected:', socket.id);
  });
});

// Port for Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
