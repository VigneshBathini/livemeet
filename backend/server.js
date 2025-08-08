const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3001"|| "https://livemeet-ribm.onrender.com", // Allow both localhost and network IP
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.static('public'));

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

server.listen(3001, '0.0.0.0', () => console.log('Server running on port 3000')); // Listen on all interfaces