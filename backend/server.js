// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Join a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);

    // Notify others in the room
    socket.to(roomId).emit('user-joined', socket.id);
  });

  // Offer from initiator
  socket.on('offer', ({ signal, to }) => {
    console.log(`Offer from ${socket.id} to ${to}`);
    io.to(to).emit('offer', { signal, from: socket.id });
  });

  // Answer from non-initiator
  socket.on('answer', ({ signal, to }) => {
    console.log(`Answer from ${socket.id} to ${to}`);
    io.to(to).emit('answer', { signal, from: socket.id });
  });

  // ICE candidate relay
  socket.on('ice-candidate', ({ candidate, to }) => {
    console.log(`ICE candidate from ${socket.id} to ${to}`);
    io.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
    io.emit('user-left', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Signaling server running on port ${PORT}`));
