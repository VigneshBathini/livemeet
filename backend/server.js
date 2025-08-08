const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  },
});

app.use(express.static('frontend/build'));

const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    rooms[roomId] = rooms[roomId] || new Set();
    rooms[roomId].add(userId);

    socket.to(roomId).emit('user-joined', userId);

    const usersInRoom = Array.from(rooms[roomId]);
    usersInRoom.forEach((u) => {
      if (u !== userId) {
        socket.emit('user-joined', u);
      }
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
    console.log(`Chat message from ${data.from} in room ${data.roomId}: ${data.message}`);
    io.to(data.roomId).emit('chat-message', { from: data.from, message: data.message });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      if (rooms[roomId].has(socket.id)) {
        rooms[roomId].delete(socket.id);
        socket.to(roomId).emit('user-left', socket.id);
        if (rooms[roomId].size === 0) {
          delete rooms[roomId];
        }
        break;
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});