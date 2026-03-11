
// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const corsConfig = require('./config/cors');
const { pool, checkDatabaseConnection } = require('./config/database');
const apiRoutes = require('./routes/api');
const setupSocketHandlers = require('./sockets');

const app = express();
const server = http.createServer(app);


const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: corsConfig.origin,
    methods: corsConfig.methods,
    credentials: corsConfig.credentials
  }
});


//for render uncomment this line and comment the below line
// Middleware setup
// app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));
app.use(express.json());
app.use(corsConfig.middleware);


// app.use('/proctormeet/api', apiRoutes);
app.use('/api', apiRoutes);


// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
// });


setupSocketHandlers(io);


checkDatabaseConnection();


// const PORT = 3090;
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});