// socket.js — FINAL WORKING VERSION (DEC 2025)
const { pool } = require('../config/database');

const rooms = {}; // Track users in each room
const roomHosts = {};
const userMediaState = {}; // Track everyone's video/audio state

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', async (roomId, userId, userName, userEmail, isHost) => {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.userData = { userId, userName, userEmail, isHost };

      if (isHost) roomHosts[roomId] = socket.id;

      // Default media state
      userMediaState[socket.id] = { videoOn: true, audioOn: true, userName };

      socket.to(roomId).emit('user-joined', userId, userName, userEmail, isHost);

      // Send full room state including media status
      const room = io.sockets.adapter.rooms.get(roomId);
      const usersInRoom = [];

      if (room) {
        for (const id of room) {
          const s = io.sockets.sockets.get(id);
          if (s?.userData) {
            usersInRoom.push({
              userId: s.userData.userId,
              userName: s.userData.userName,
              userEmail: s.userData.userEmail,
              isHost: s.userData.isHost,
              videoOn: userMediaState[id]?.videoOn ?? true,
              audioOn: userMediaState[id]?.audioOn ?? true,
            });
          }
        }
      }

      socket.emit('room-users', usersInRoom.map(s => ({
        userId: s.userId,
        userName: s.userName,
        userEmail: s.userEmail,
        isHost: s.isHost,
        videoOn: userMediaState[s.userId]?.videoOn ?? true,
        audioOn: userMediaState[s.userId]?.audioOn ?? true,
      })));
      console.log(`${userName} joined ${roomId}`);

      // DB log
      // DB log
      try {
        // Check scheduled meeting
        const [rows] = await pool.execute(
          'SELECT id, creator_email FROM meetings WHERE room_id = ?',
          [roomId]
        );

        if (rows.length > 0) {
          // Scheduled meeting: insert into participants table
          await pool.execute(
            `INSERT INTO participants (meeting_id, name, email, participant_type) 
       VALUES (?, ?, ?, ?)`,
            [rows[0].id, userName, userEmail, isHost ? 'internal' : 'external']
          );

          console.log("Participant inserted into scheduled meeting.");
        }
        else {
          // If not scheduled → check instant meeting
          const [inst_rows] = await pool.execute(
            'SELECT id, creator_email FROM instant_meeting WHERE room_id = ?',
            [roomId]
          );

          if (inst_rows.length > 0) {
            const instantId = inst_rows[0].id;
            const type = (inst_rows[0].creator_email === userEmail) ? 'internal' : 'external';

            console.log(`Instant meeting found. ID: ${instantId}, Type: ${type}`);

            // Insert into instant_participants
            await pool.execute(
              `INSERT INTO instant_participants 
         (instant_meeting_id, name, email, participant_type, joined_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE joined_at = NOW(),
         left_at = NULL`,
              [instantId, userName, userEmail, type]
            );

            console.log("Participant inserted into instant meeting.");
          }
          else {
            console.warn(`No scheduled/instant meeting found for room: ${roomId}`);
          }
        }

      } catch (e) {
        console.error("DB Error (join-room):", e);
      }

    });

    // THIS IS THE MISSING PIECE — ADD THIS
    socket.on('media-state-change', (data) => {
      const { roomId, userId, userName, videoOn, audioOn } = data;

      // Update server state
      userMediaState[userId] = { videoOn, audioOn, userName };

      // Broadcast to entire room
      io.to(roomId).emit('media-state-change', {
        userId,
        userName,
        videoOn,
        audioOn,
      });

      console.log(`Media state: ${userName} → video:${videoOn}, audio:${audioOn}`);
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
    // Keep all other events
    socket.on('offer', (data) => {
      socket.to(data.to).emit('offer', { signal: data.signal, from: socket.id });
    });

    socket.on('answer', (data) => {
      socket.to(data.to).emit('answer', { signal: data.signal, from: socket.id });
    });

    socket.on('ice-candidate', (data) => {
      socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
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
    
       // In your socket.io server
  socket.on('get-room-users', (roomId, callback) => {
      console.log(`get-room-users called for room: ${roomId}`);
      
      if (!rooms[roomId]) {
        console.log(`Room ${roomId} not found in rooms object`);
        callback([]);
        return;
      }

      const roomUsers = [];
      for (const [sockId, userData] of Object.entries(rooms[roomId])) {
        // Skip the requesting user themselves
        if (sockId === socket.id) continue;
        
        roomUsers.push({
          userId: userData.userId,
          socketId: sockId,
          userName: userData.userName,
          userEmail: userData.userEmail,
          isHost: userData.isHost,
          videoOn: userMediaState[userData.userId]?.videoOn ?? true,
          audioOn: userMediaState[userData.userId]?.audioOn ?? true,
        });
      }

      console.log(`Sending ${roomUsers.length} users to ${socket.id} for room ${roomId}`);
      callback(roomUsers);
    });

        // socket.on('screen-share-status', (data) => {
        //   try {
        //     console.log(
        //       `Screen share status from ${socket.id} (${data.userName}) in room ${data.roomId}: ${data.isScreenSharing}`,
        //     );
        //     socket.to(data.roomId).emit('screen-share-status', {
        //       userId: socket.id,
        //       userName: data.userName,
        //       isScreenSharing: data.isScreenSharing,
        //     });
        //   } catch (err) {
        //     console.error(`Error handling screen-share-status from ${socket.id}: ${err.message}`);
        //   }
        // });
    

        socket.on('screen-share-status', (data) => {
  try {
    const { roomId, userId, userName, isScreenSharing } = data;

    console.log(
      `Screen share status from ${userId} (${userName}) in room ${roomId}: ${isScreenSharing}`
    );

    // Broadcast using the correct userId from client
    io.to(roomId).emit('screen-share-status', {
      userId,
      userName: userName || 'Unknown',
      isScreenSharing,
    });
  } catch (err) {
    console.error(`Error handling screen-share-status: ${err.message}`);
  }
});
    

    // User left — show real name
    socket.on('disconnect', async () => {
  if (!socket.roomId) return;

  const userName = socket.userData?.userName || 'Unknown';
  const userEmail = socket.userData?.userEmail || '';
  const userId = socket.id;
  const roomId = socket.roomId;

  // Notify others
  socket.to(roomId).emit('user-left', { userId, userName });

  // Cleanup server state
  delete userMediaState[userId];
  if (roomHosts[roomId] === socket.id) {
    delete roomHosts[roomId];
  }

  console.log(`${userName} disconnected from room ${roomId}`);

  // === DB: Update left_at for instant or scheduled meeting ===
  try {
    let updated = false;

    //Instant meeting 
    const [inst_rows] = await pool.execute(
      'SELECT id FROM instant_meeting WHERE room_id = ?',
      [roomId]
    );

    if (inst_rows.length > 0) {
      const instantId = inst_rows[0].id;

      await pool.execute(
        `UPDATE instant_participants 
         SET left_at = NOW() 
         WHERE instant_meeting_id = ? AND email = ?`,
        [instantId, userEmail]
      );

      console.log(`Updated left_at for instant meeting participant: ${userEmail}`);
      updated = true;
    }

    // 2. If not instant → scheduled meeting
    if (!updated) {
      const [sched_rows] = await pool.execute(
        `SELECT m.id AS meeting_id 
         FROM meetings m 
         JOIN participants p ON p.meeting_id = m.id 
         WHERE m.room_id = ? AND p.email = ?`,
        [roomId, userEmail]
      );

      if (sched_rows.length > 0) {
        const meetingId = sched_rows[0].meeting_id;

        await pool.execute(
          `UPDATE participants 
           SET left_at = NOW() 
           WHERE meeting_id = ? AND email = ?`,
          [meetingId, userEmail]
        );

        console.log(`Updated left_at for scheduled meeting participant: ${userEmail}`);
      }
    }
  } catch (err) {
    console.error('Error updating left_at on disconnect:', err);
  }
});
  });
};

module.exports = setupSocketHandlers;