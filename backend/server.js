const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'https://livemeet-ribm.onrender.com',
    methods: ['GET', 'POST'],
  },
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', (roomId, userId, userName, isHost) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { users: {}, proctoredUserId: null };
    }
    rooms[roomId].users[userId] = { userName, isHost };
    socket.to(roomId).emit('user-joined', userId, userName, isHost);
    console.log(`User ${userName} (${userId}) joined room ${roomId}, isHost: ${isHost}`);
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
    socket.to(data.roomId).emit('chat-message', {
      from: socket.id,
      userName: data.userName,
      message: data.message,
    });
  });

  socket.on('set-proctored-user', (data) => {
    if (rooms[data.roomId]) {
      rooms[data.roomId].proctoredUserId = data.userId;
      io.to(data.roomId).emit('set-proctored-user', { userId: data.userId, userName: data.userName });
      console.log(`Proctored user set to ${data.userName} (${data.userId}) in room ${data.roomId}`);
    }
  });

  socket.on('proctoring-violation', (data) => {
    io.to(data.roomId).emit('proctoring-violation', data);
    console.log(`Violation from ${data.userName} in room ${data.roomId}: ${data.message}`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        const { userName } = rooms[roomId].users[socket.id];
        delete rooms[roomId].users[socket.id];
        if (rooms[roomId].proctoredUserId === socket.id) {
          rooms[roomId].proctoredUserId = null;
          io.to(roomId).emit('set-proctored-user', { userId: null, userName: null });
        }
        socket.to(roomId).emit('user-left', socket.id);
        if (Object.keys(rooms[roomId].users).length === 0) {
          delete rooms[roomId];
        }
        break;
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Signaling server running on port 3000');
});