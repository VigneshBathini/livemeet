const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

app.use(cors({
  origin: ['https://livemeet-ribm.onrender.com', 'http://localhost:3000'],
  methods: ['GET', 'POST'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const io = new Server(server, {
  cors: {
    origin: ['https://livemeet-ribm.onrender.com', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  pingTimeout: 20000,
  pingInterval: 25000,
});

const rooms = {};

app.get('/test', (req, res) => res.send('Server is running'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`New user connected: ${socket.id}`);

  socket.on('create-room', (userId, userName) => {
    if (!userId || !userName) {
      socket.emit('error', { message: 'Invalid userId or userName' });
      console.log(`Invalid create-room attempt: userId=${userId}, userName=${userName}`);
      return;
    }
    const roomId = uuidv4();
    rooms[roomId] = {
      hostId: socket.id,
      users: { [socket.id]: { userName } },
    };
    socket.join(roomId);
    socket.emit('room-created', roomId);
    console.log(`Room ${roomId} created by ${socket.id} (${userName})`);
    io.in(roomId).allSockets().then(sockets => {
      console.log(`Users in room ${roomId}: ${[...sockets].join(', ')}`);
    });
  });

  socket.on('join-room', (roomId, userId, userName) => {
    if (!roomId || !userId || !userName) {
      socket.emit('error', { message: 'Invalid roomId, userId, or userName' });
      console.log(`Invalid join-room attempt: roomId=${roomId}, userId=${userId}, userName=${userName}`);
      return;
    }
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Room does not exist' });
      console.log(`User ${socket.id} attempted to join non-existent room ${roomId}`);
      return;
    }
    rooms[roomId].users[socket.id] = { userName };
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', userId || socket.id, userName);
    console.log(`${userId || socket.id} (${userName}) joined room ${roomId}`);
    io.in(roomId).allSockets().then(sockets => {
      console.log(`Users in room ${roomId}: ${[...sockets].join(', ')}`);
    });
  });

  socket.on('toggle-proctoring', (data) => {
    const { roomId, userId, enable } = data;
    if (!roomId || !userId || enable === undefined) {
      socket.emit('error', { message: 'Invalid toggle-proctoring data' });
      console.log(`Invalid toggle-proctoring data: ${JSON.stringify(data)}`);
      return;
    }
    if (!rooms[roomId] || rooms[roomId].hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can toggle proctoring' });
      console.log(`Non-host ${socket.id} attempted to toggle proctoring in room ${roomId}`);
      return;
    }
    if (!rooms[roomId].users[userId]) {
      socket.emit('error', { message: 'User not found in room' });
      console.log(`User ${userId} not found in room ${roomId}`);
      return;
    }
    socket.to(userId).emit('toggle-proctoring', { userId, enable });
    console.log(`Proctoring ${enable ? 'enabled' : 'disabled'} for ${userId} in room ${roomId} by host ${socket.id}`);
  });

  socket.on('cheat-detected', (data) => {
    const { roomId, userId, userName, cheatLog } = data;
    if (!roomId || !userId || !userName || !cheatLog) {
      console.log(`Invalid cheat-detected data: ${JSON.stringify(data)}`);
      return;
    }
    if (!rooms[roomId]) return;
    const hostId = rooms[roomId].hostId;
    if (hostId) {
      socket.to(hostId).emit('cheat-detected', { userId, userName, cheatLog });
      console.log(`Cheat detected from ${userId} (${userName}) in room ${roomId}: ${cheatLog.message}`);
    }
  });

  socket.on('offer', (data) => {
    if (!data.from || !data.to || !data.signal) {
      console.log(`Invalid offer data: ${JSON.stringify(data)}`);
      return;
    }
    console.log(`Relaying offer from ${data.from} to ${data.to}`);
    socket.to(data.to).emit('offer', { signal: data.signal, from: data.from });
  });

  socket.on('answer', (data) => {
    if (!data.from || !data.to || !data.signal) {
      console.log(`Invalid answer data: ${JSON.stringify(data)}`);
      return;
    }
    console.log(`Relaying answer from ${data.from} to ${data.to}`);
    socket.to(data.to).emit('answer', { signal: data.signal, from: data.from });
  });

  socket.on('ice-candidate', (data) => {
    if (!data.from || !data.to || !data.candidate) {
      console.log(`Invalid ICE candidate data: ${JSON.stringify(data)}`);
      return;
    }
    console.log(`Relaying ICE candidate from ${data.from} to ${data.to}`);
    socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: data.from });
  });

  socket.on('video-toggle', (data) => {
    if (!data.roomId || !data.userId || data.enabled === undefined) {
      console.log(`Invalid video-toggle data: ${JSON.stringify(data)}`);
      return;
    }
    console.log(`Video toggle from ${data.userId} in room ${data.roomId}: ${data.enabled}`);
    socket.to(data.roomId).emit('video-toggle', { userId: data.userId, enabled: data.enabled });
  });

  socket.on('chat-message', (data) => {
    if (!data.roomId || !data.message || !data.userName) {
      console.log(`Invalid chat-message data: ${JSON.stringify(data)}`);
      return;
    }
    console.log(`Chat message from ${socket.id} (${data.userName}) in room ${data.roomId}: ${data.message}`);
    socket.to(data.roomId).emit('chat-message', {
      message: data.message,
      from: socket.id,
      userName: data.userName,
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        const wasHost = rooms[roomId].hostId === socket.id;
        const userName = rooms[roomId].users[socket.id].userName;
        delete rooms[roomId].users[socket.id];
        socket.to(roomId).emit('user-left', socket.id);
        console.log(`User ${socket.id} (${userName}) left room ${roomId}`);
        if (wasHost) {
          socket.to(roomId).emit('room-closed');
          delete rooms[roomId];
          console.log(`Room ${roomId} closed as host ${socket.id} disconnected`);
        }
        io.in(roomId).allSockets().then(sockets => {
          console.log(`Users in room ${roomId}: ${[...sockets].join(', ')}`);
        });
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});