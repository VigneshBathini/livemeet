
const { pool } = require('../config/database');

const roomHosts = {};

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`New user connected: ${socket.id}`);


    socket.on('join-room', async (roomId, userId, userName, userEmail, isHost) => {
  socket.join(roomId);


  socket.userData = { userId, userName, userEmail, isHost };
  if (isHost) roomHosts[roomId] = socket.id;

  socket.to(roomId).emit('user-joined', userId, userName, userEmail, isHost);


  const room = io.sockets.adapter.rooms.get(roomId);
  const usersInRoom = [];

  if (room) {
    for (const id of room) {
      const s = io.sockets.sockets.get(id);
      if (s?.userData && s.userData.userId !== userId) {
        usersInRoom.push(s.userData);
      }
    }
  }


  // socket.emit('all-users', usersInRoom);
  socket.emit('room-users', usersInRoom.map(s => ({
  userId: s.userId,
  userName: s.userName,
  userEmail: s.userEmail,
  isHost: s.isHost
})));
  console.log(`Sent ${usersInRoom.length} existing users to ${userName}`);


  try {
    const [rows] = await pool.execute('SELECT id FROM meetings WHERE room_id = ?', [roomId]);
    if (rows.length > 0) {
      await pool.execute(
        'INSERT INTO participants (meeting_id, name, email, participant_type) VALUES (?, ?, ?, ?)',
        [rows[0].id, userName, userEmail, isHost ? 'internal' : 'external']
      );
    }
  } catch (e) { console.error(e); }
});


    socket.on('offer', (data) => {
      try {
        socket.to(data.to).emit('offer', { signal: data.signal, from: socket.id });
      } catch (err) {
        console.error(`Error handling offer from ${socket.id}: ${err.message}`);
      }
    });

    
    socket.on('answer', (data) => {
      try {
        socket.to(data.to).emit('answer', { signal: data.signal, from: socket.id });
      } catch (err) {
        console.error(`Error handling answer from ${socket.id}: ${err.message}`);
      }
    });

    
    socket.on('ice-candidate', (data) => {
      try {
        socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
      } catch (err) {
        console.error(`Error handling ICE candidate from ${socket.id}: ${err.message}`);
      }
    });

    socket.on('chat-message', async (data) => {
      try {
        console.log(
          `Chat message from ${socket.id} (${data.userName}) in room ${data.roomId}: ${data.message}`,
        );

     
        const [rows] = await pool.execute('SELECT id FROM meetings WHERE room_id = ?', [data.roomId]);
        if (rows.length > 0) {
          const meetingId = rows[0].id;
          await pool.execute(
            'INSERT INTO chat_messages (room_id, meeting_id, sender_name, sender_email, message) VALUES (?, ?, ?, ?, ?)',
            [data.roomId, meetingId, data.userName, data.userEmail || 'unknown', data.message],
          );
        }

        socket.to(data.roomId).emit('chat-message', {
          message: data.message,
          from: socket.id,
          userName: data.userName,
        });
      } catch (err) {
        console.error(`Error handling chat message from ${socket.id}: ${err.message}`);
      }
    });

    

   
    socket.on('toggle-media', (data) => {
      try {
        console.log(
          `Toggle media for ${data.userId} in room ${data.roomId}: video=${data.video}, audio=${data.audio}`,
        );
        socket.to(data.roomId).to(data.userId).emit('toggle-media', {
          userId: data.userId,
          video: data.video,
          audio: data.audio,
        });
      } catch (err) {
        console.error(`Error handling toggle-media from ${socket.id}: ${err.message}`);
      }
    });

    socket.on('toggle-proctor', async (data) => {
      try {
        console.log(
          `Toggle proctor for ${data.userId} in room ${data.roomId}: proctor=${data.proctor}`,
        );

      
        const [rows] = await pool.execute('SELECT id FROM meetings WHERE room_id = ?', [data.roomId]);
        if (rows.length > 0) {
          const meetingId = rows[0].id;
          await pool.execute(
            'INSERT INTO proctor_logs (room_id, meeting_id, user_id, user_name, user_email, event_type) VALUES (?, ?, ?, ?, ?, ?)',
            [
              data.roomId,
              meetingId,
              data.userId,
              data.userName || 'unknown',
              data.userEmail || 'unknown',
              data.proctor ? 'proctor_enabled' : 'proctor_disabled',
            ],
          );
        }

        socket.to(data.roomId).to(data.userId).emit('toggle-proctor', {
          userId: data.userId,
          proctor: data.proctor,
        });
      } catch (err) {
        console.error(`Error handling toggle-proctor from ${socket.id}: ${err.message}`);
      }
    });

   
    socket.on('face-detection-alert', (data) => {
      try {
        console.log(
          `Face detection alert for ${data.userId} in room ${data.roomId}: ${data.message}`,
        );
        socket.to(data.roomId).to(data.userId).emit('face-detection-alert', {
          userId: data.userId,
          message: data.message,
        });
      } catch (err) {
        console.error(`Error handling face-detection-alert from ${socket.id}: ${err.message}`);
      }
    });

  
    socket.on('tab-switch-alert', (data) => {
      try {
        console.log(
          `Tab switch alert from ${data.userId} (${data.userName}) in room ${data.roomId}: ${data.message}`,
        );
        if (roomHosts[data.roomId]) {
          socket.to(roomHosts[data.roomId]).emit('tab-switch-alert', {
            userId: data.userId,
            userName: data.userName,
            message: data.message,
          });
        }
      } catch (err) {
        console.error(`Error handling tab-switch-alert from ${socket.id}: ${err.message}`);
      }
    });

   
    socket.on('screen-share-status', (data) => {
      try {
        console.log(
          `Screen share status from ${socket.id} (${data.userName}) in room ${data.roomId}: ${data.isScreenSharing}`,
        );
        socket.to(data.roomId).emit('screen-share-status', {
          userId: socket.id,
          userName: data.userName,
          isScreenSharing: data.isScreenSharing,
        });
      } catch (err) {
        console.error(`Error handling screen-share-status from ${socket.id}: ${err.message}`);
      }
    });

    // Handle user disconnect
    socket.on('disconnect', async () => {
      try {
        socket.broadcast.emit('user-left', socket.id);
        for (const roomId in roomHosts) {
          if (roomHosts[roomId] === socket.id) {
            delete roomHosts[roomId];
          }
        }
        console.log(`User disconnected: ${socket.id}`);
      } catch (err) {
        console.error(`Error handling disconnect for ${socket.id}: ${err.message}`);
      }
    });
  });
};

module.exports = setupSocketHandlers;
