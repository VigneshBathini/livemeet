const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = [
  'https://livemeet-ribm.onrender.com',
  'http://localhost:3000',
];

app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));

app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e7,
  transports: ['websocket', 'polling'],
});

const rooms = new Map();

app.get('/test', (req, res) => res.send('Server is running'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`[${new Date().toLocaleTimeString()}] New user connected: ${socket.id}`);

  socket.on('create-room', (userId, userName) => {
    const roomId = uuidv4();
    rooms.set(roomId, {
      hostId: socket.id,
      users: new Map([[socket.id, { userName }]]),
      createdAt: Date.now(),
    });
    socket.join(roomId);
    console.log(`[${new Date().toLocaleTimeString()}] Emitting room-created with ID: ${roomId} to socket ${socket.id}`);
    socket.emit('room-created', roomId);
    console.log(`[${new Date().toLocaleTimeString()}] Room ${roomId} created by ${socket.id} (${userName})`);
    io.in(roomId).allSockets().then(sockets => {
      console.log(`[${new Date().toLocaleTimeString()}] Users in room ${roomId}: ${[...sockets].join(', ')}`);
    });
  });

  socket.on('join-room', (roomId, userId, userName) => {
    if (!rooms.has(roomId)) {
      socket.emit('error', { message: 'Room does not exist' });
      console.log(`[${new Date().toLocaleTimeString()}] User ${socket.id} attempted to join non-existent room ${roomId}`);
      return;
    }
    rooms.get(roomId).users.set(socket.id, { userName });
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', userId || socket.id, userName);
    console.log(`[${new Date().toLocaleTimeString()}] ${userId || socket.id} (${userName}) joined room ${roomId}`);
    io.in(roomId).allSockets().then(sockets => {
      console.log(`[${new Date().toLocaleTimeString()}] Users in room ${roomId}: ${[...sockets].join(', ')}`);
    });
  });

  socket.on('toggle-proctoring', (data) => {
    const { roomId, userId, enable } = data;
    if (!rooms.has(roomId) || rooms.get(roomId).hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can toggle proctoring' });
      console.log(`[${new Date().toLocaleTimeString()}] Non-host ${socket.id} attempted to toggle proctoring in room ${roomId}`);
      return;
    }
    if (!rooms.get(roomId).users.has(userId)) {
      socket.emit('error', { message: 'User not found in room' });
      console.log(`[${new Date().toLocaleTimeString()}] User ${userId} not found in room ${roomId}`);
      return;
    }
    socket.to(userId).emit('toggle-proctoring', { userId, enable });
    console.log(`[${new Date().toLocaleTimeString()}] Proctoring ${enable ? 'enabled' : 'disabled'} for ${userId} in room ${roomId} by host ${socket.id}`);
  });

  socket.on('cheat-detected', (data) => {
    const { roomId, userId, userName, cheatLog } = data;
    if (!rooms.has(roomId)) return;
    const hostId = rooms.get(roomId).hostId;
    if (hostId) {
      socket.to(hostId).emit('cheat-detected', { userId, userName, cheatLog });
      console.log(`[${new Date().toLocaleTimeString()}] Cheat detected from ${userId} (${userName}) in room ${roomId}: ${cheatLog.message}`);
    }
  });

  socket.on('offer', (data) => {
    console.log(`[${new Date().toLocaleTimeString()}] Forwarding offer from ${socket.id} to ${data.to}`);
    socket.to(data.to).emit('offer', { signal: data.signal, from: socket.id });
  });

  socket.on('answer', (data) => {
    console.log(`[${new Date().toLocaleTimeString()}] Forwarding answer from ${socket.id} to ${data.to}`);
    socket.to(data.to).emit('answer', { signal: data.signal, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    console.log(`[${new Date().toLocaleTimeString()}] Forwarding ICE candidate from ${socket.id} to ${data.to}`);
    socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
  });

  socket.on('chat-message', (data) => {
    console.log(`[${new Date().toLocaleTimeString()}] Chat message from ${socket.id} (${data.userName}) in room ${data.roomId}: ${data.message}`);
    socket.to(data.roomId).emit('chat-message', {
      message: data.message,
      from: socket.id,
      userName: data.userName,
    });
  });

  socket.on('restart-peer', (data) => {
    const { roomId, userId } = data;
    if (rooms.has(roomId) && rooms.get(roomId).users.has(userId)) {
      socket.to(userId).emit('restart-peer', { from: socket.id });
      console.log(`[${new Date().toLocaleTimeString()}] Forwarding restart-peer from ${socket.id} to ${userId} in room ${roomId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[${new Date().toLocaleTimeString()}] User disconnected: ${socket.id}`);
    for (const [roomId, room] of rooms) {
      if (room.users.has(socket.id)) {
        const wasHost = room.hostId === socket.id;
        room.users.delete(socket.id);
        socket.to(roomId).emit('user-left', socket.id);
        console.log(`[${new Date().toLocaleTimeString()}] User ${socket.id} left room ${roomId}`);
        if (wasHost) {
          socket.to(roomId).emit('room-closed');
          rooms.delete(roomId);
          console.log(`[${new Date().toLocaleTimeString()}] Room ${roomId} closed as host ${socket.id} disconnected`);
        }
        io.in(roomId).allSockets().then(sockets => {
          console.log(`[${new Date().toLocaleTimeString()}] Users in room ${roomId}: ${[...sockets].join(', ')}`);
        });
        break;
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toLocaleTimeString()}] Server running on port ${PORT}`);
});