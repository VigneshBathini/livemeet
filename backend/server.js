const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid'); // Added for generating unique room IDs

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
  },
  pingTimeout: 20000,
  pingInterval: 25000
});

// Store room data: { roomId: { hostId: string, users: { [socketId]: { userName: string } } } }
const rooms = {};

// Test endpoint
app.get('/test', (req, res) => res.send('Server is running'));

// Handle all other routes with React's index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Handle room creation
  socket.on('create-room', (userId, userName) => {
    const roomId = uuidv4(); // Generate unique room ID
    rooms[roomId] = {
      hostId: socket.id,
      users: { [socket.id]: { userName } }
    };
    socket.join(roomId);
    socket.emit('room-created', roomId);
    console.log(`Room ${roomId} created by ${socket.id} (${userName})`);
    // Debug: Log room members
    io.in(roomId).allSockets().then(sockets => {
      console.log(`Users in room ${roomId}: ${[...sockets].join(', ')}`);
    });
  });

  // Handle room joining
  socket.on('join-room', (roomId, userId, userName) => {
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Room does not exist' });
      console.log(`User ${socket.id} attempted to join non-existent room ${roomId}`);
      return;
    }
    rooms[roomId].users[socket.id] = { userName };
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', userId || socket.id, userName);
    console.log(`${userId || socket.id} (${userName}) joined room ${roomId}`);
    // Debug: Log room members
    io.in(roomId).allSockets().then(sockets => {
      console.log(`Users in room ${roomId}: ${[...sockets].join(', ')}`);
    });
  });

  // Handle proctoring toggle (only host can trigger)
  socket.on('toggle-proctoring', (data) => {
    const { roomId, userId, enable } = data;
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

  // Handle cheat detection
  socket.on('cheat-detected', (data) => {
    const { roomId, userId, userName, cheatLog } = data;
    if (!rooms[roomId]) return;
    const hostId = rooms[roomId].hostId;
    if (hostId) {
      socket.to(hostId).emit('cheat-detected', { userId, userName, cheatLog });
      console.log(`Cheat detected from ${userId} (${userName}) in room ${roomId}: ${cheatLog.message}`);
    }
  });

  // WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.to).emit('offer', { signal: data.signal, from: socket.id });
  });

  socket.on('answer', (data) => {
    socket.to(data.to).emit('answer', { signal: data.signal, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
  });

  // Handle chat messages
  socket.on('chat-message', (data) => {
    console.log(`Chat message from ${socket.id} (${data.userName}) in room ${data.roomId}: ${data.message}`);
    socket.to(data.roomId).emit('chat-message', {
      message: data.message,
      from: socket.id,
      userName: data.userName
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        const wasHost = rooms[roomId].hostId === socket.id;
        delete rooms[roomId].users[socket.id];
        socket.to(roomId).emit('user-left', socket.id);
        console.log(`User ${socket.id} left room ${roomId}`);
        // If host disconnects, clear the room
        if (wasHost) {
          socket.to(roomId).emit('room-closed');
          delete rooms[roomId];
          console.log(`Room ${roomId} closed as host ${socket.id} disconnected`);
        }
        // Debug: Log remaining room members
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