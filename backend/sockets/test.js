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

//jan27 existing

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
          'SELECT id, creator_email FROM pmx_scheduled_meetings WHERE room_id = ?',
          [roomId]
        );

        if (rows.length > 0) {
          // Scheduled meeting: insert into pmx_scheduled_participants table
          await pool.execute(
            `INSERT INTO pmx_scheduled_participants (meeting_id, name, email, participant_type) 
       VALUES (?, ?, ?, ?)`,
            [rows[0].id, userName, userEmail, isHost ? 'internal' : 'external']
          );

          console.log("Participant inserted into scheduled meeting.");
        }
        else {
          // If not scheduled → check instant meeting
          const [inst_rows] = await pool.execute(
            'SELECT id, creator_email FROM pmx_instant_meeting WHERE room_id = ?',
            [roomId]
          );

          if (inst_rows.length > 0) {
            const instantId = inst_rows[0].id;
            const type = (inst_rows[0].creator_email === userEmail) ? 'internal' : 'external';

            console.log(`Instant meeting found. ID: ${instantId}, Type: ${type}`);

            // Insert into instant_participants
            await pool.execute(
              `INSERT INTO pmx_instant_participants 
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


        const [rows] = await pool.execute('SELECT id FROM pmx_scheduled_meetings WHERE room_id = ?', [data.roomId]);
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


        const [rows] = await pool.execute('SELECT id FROM pmx_scheduled_meetings WHERE room_id = ?', [data.roomId]);
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
          'SELECT id FROM pmx_instant_meeting WHERE room_id = ?',
          [roomId]
        );

        if (inst_rows.length > 0) {
          const instantId = inst_rows[0].id;

          await pool.execute(
            `UPDATE pmx_instant_participants 
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
         FROM pmx_scheduled_meetings m 
         JOIN pmx_scheduled_participants p ON p.meeting_id = m.id 
         WHERE m.room_id = ? AND p.email = ?`,
            [roomId, userEmail]
          );

          if (sched_rows.length > 0) {
            const meetingId = sched_rows[0].meeting_id;

            await pool.execute(
              `UPDATE pmx_scheduled_participants 
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

// working code until jan 28

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
            'SELECT id, creator_email FROM pmx_scheduled_meetings WHERE room_id = ?',
            [roomId]
          );

          if (rows.length > 0) {
            // Scheduled meeting: insert into pmx_scheduled_participants table
            await pool.execute(
              `INSERT INTO pmx_scheduled_participants (meeting_id, name, email, participant_type) 
        VALUES (?, ?, ?, ?)`,
              [rows[0].id, userName, userEmail, isHost ? 'internal' : 'external']
            );

            console.log("Participant inserted into scheduled meeting.");
          }
          else {
            // If not scheduled → check instant meeting
            const [inst_rows] = await pool.execute(
              'SELECT id, creator_email FROM pmx_instant_meeting WHERE room_id = ?',
              [roomId]
            );

            if (inst_rows.length > 0) {
              const instantId = inst_rows[0].id;
              const type = (inst_rows[0].creator_email === userEmail) ? 'internal' : 'external';

              console.log(`Instant meeting found. ID: ${instantId}, Type: ${type}`);

              // Insert into instant_participants
              await pool.execute(
                `INSERT INTO pmx_instant_participants 
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


          const [rows] = await pool.execute('SELECT id FROM pmx_scheduled_meetings WHERE room_id = ?', [data.roomId]);
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


          const [rows] = await pool.execute('SELECT id FROM pmx_scheduled_meetings WHERE room_id = ?', [data.roomId]);
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
            'SELECT id FROM pmx_instant_meeting WHERE room_id = ?',
            [roomId]
          );

          if (inst_rows.length > 0) {
            const instantId = inst_rows[0].id;

            await pool.execute(
              `UPDATE pmx_instant_participants 
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
          FROM pmx_scheduled_meetings m 
          JOIN pmx_scheduled_participants p ON p.meeting_id = m.id 
          WHERE m.room_id = ? AND p.email = ?`,
              [roomId, userEmail]
            );

            if (sched_rows.length > 0) {
              const meetingId = sched_rows[0].meeting_id;

              await pool.execute(
                `UPDATE pmx_scheduled_participants 
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

  //feb10 existing

  // socket.js — FINAL WORKING VERSION with Lobby/Waiting Room (January 2026)
// All existing features preserved + added lobby/waiting room for external users

const { pool } = require('../config/database');

const rooms = {};           // Active participants: { roomId: { socketId: { userId, userName, userEmail, isHost } } }
const roomHosts = {};       // { roomId: hostSocketId }
const waitingUsers = {};    // Pending users: { roomId: [ { id: socket.id, name, email, timestamp } ] }
const userMediaState = {};  // { socketId: { videoOn, audioOn, userName } }

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ───────────────────────────────────────────────────────────────
    // 1. External user requests to join → goes into waiting lobby
    // ───────────────────────────────────────────────────────────────
   // In socket.js, update the request-join handler
socket.on('request-join', async ({ roomId, userName, email, isHost }) => {
  console.log(`[LOBBY REQUEST] ${userName} (${email}) wants to join ${roomId}, claims to be host: ${isHost}`);
  
  // 🔥 FIRST: Check if this is an instant meeting creator
  try {
    const [instantRows] = await pool.execute(
      'SELECT creator_email FROM pmx_instant_meeting WHERE room_id = ?',
      [roomId]
    );

    if (instantRows.length > 0) {
      const creatorEmail = instantRows[0].creator_email;
      
      if (email === creatorEmail) {
        console.log(`🎯 [INSTANT CREATOR DETECTED] ${userName} is creator, NOT adding to waiting list`);
        
        // Send special event to frontend to join directly
        socket.emit('host-verified', { 
          roomId, 
          message: 'You are the instant meeting creator. Joining directly...' 
        });
        return; // Don't add to waiting list
      }
    }
  } catch (err) {
    console.error('[INSTANT CREATOR CHECK ERROR]', err);
  }
  
  // Only non-creators go to waiting list
  if (!waitingUsers[roomId]) waitingUsers[roomId] = [];
  
  // Prevent duplicate entries
  if (waitingUsers[roomId].some(u => u.email === email)) {
    socket.emit('lobby-waiting', { 
      message: 'You are already in the waiting list.' 
    });
    return;
  }
  
  const waitingEntry = {
    id: socket.id,
    name: userName,
    email: email,
    timestamp: Date.now()
  };
  
  waitingUsers[roomId].push(waitingEntry);
  
  // Notify host
  io.to(roomId).emit('waiting-users', waitingUsers[roomId]);
  
  socket.emit('lobby-waiting', { 
    message: 'Waiting for host approval...' 
  });
  
  console.log(`[LOBBY] Added to waiting: ${userName} → ${waitingUsers[roomId].length} waiting`);
});


// Add this handler - it helps frontend know immediately if user is instant creator
socket.on('check-instant-creator', async ({ roomId, email }, callback) => {
  try {
    const [instantRows] = await pool.execute(
      'SELECT creator_email FROM pmx_instant_meeting WHERE room_id = ?',
      [roomId]
    );
    
    if (instantRows.length === 0) {
      return callback({ isCreator: false, isInstantMeeting: false });
    }
    
    const isCreator = instantRows[0].creator_email === email;
    
    callback({ 
      isCreator, 
      isInstantMeeting: true,
      creatorEmail: instantRows[0].creator_email
    });
    
  } catch (err) {
    console.error('[CHECK INSTANT CREATOR ERROR]', err);
    callback({ isCreator: false, error: err.message });
  }
});
    // ───────────────────────────────────────────────────────────────
    // 2. Host requests current waiting list
    // ───────────────────────────────────────────────────────────────
    socket.on('get-waiting-users', (roomId) => {
      const list = waitingUsers[roomId] || [];
      socket.emit('waiting-users', list);
      console.log(`[LOBBY] Host requested waiting list for ${roomId} → ${list.length} users`);
    });

    // ───────────────────────────────────────────────────────────────
    // 3. Host approves a waiting user
    // ───────────────────────────────────────────────────────────────
    socket.on('approve-join', ({ roomId, tempId }) => {
      if (!roomHosts[roomId] || socket.id !== roomHosts[roomId]) {
        return socket.emit('error', { message: 'Only the host can approve users' });
      }

      if (!waitingUsers[roomId]) return;

      const index = waitingUsers[roomId].findIndex(u => u.id === tempId);
      if (index === -1) return;

      const approved = waitingUsers[roomId][index];
      waitingUsers[roomId].splice(index, 1);

      // Update host UI
      io.to(roomId).emit('waiting-users', waitingUsers[roomId] || []);

      // Tell the approved user they can now join
      io.to(tempId).emit('join-approved', {
        roomId,
        message: 'You have been approved! Joining meeting...'
      });

      console.log(`[LOBBY APPROVED] ${approved.name} (${approved.email}) into ${roomId}`);
    });

    // ───────────────────────────────────────────────────────────────
    // 4. Host denies a waiting user
    // ───────────────────────────────────────────────────────────────
    socket.on('deny-join', ({ roomId, tempId }) => {
      if (!roomHosts[roomId] || socket.id !== roomHosts[roomId]) {
        return socket.emit('error', { message: 'Only the host can deny users' });
      }

      if (!waitingUsers[roomId]) return;

      const index = waitingUsers[roomId].findIndex(u => u.id === tempId);
      if (index === -1) return;

      const denied = waitingUsers[roomId][index];
      waitingUsers[roomId].splice(index, 1);

      io.to(roomId).emit('waiting-users', waitingUsers[roomId] || []);

      io.to(tempId).emit('join-denied', {
        message: 'Your request to join was denied by the host.'
      });

      console.log(`[LOBBY DENIED] ${denied.name} (${denied.email}) for ${roomId}`);
    });

      let shouldAllowDirectJoin = false;
    // ───────────────────────────────────────────────────────────────
    // 5. Normal join-room (only allowed after approval or for host/instant)
    // ───────────────────────────────────────────────────────────────
    socket.on('join-room', async (roomId, userId, userName, userEmail, isHost) => {
  // 🔥 CRITICAL FIX: Move this logic to the top
  let isInstantCreator = false;
  
  try {
    // Check if this is an instant meeting
    const [instantRows] = await pool.execute(
      'SELECT creator_email FROM pmx_instant_meeting WHERE room_id = ?',
      [roomId]
    );
    
    if (instantRows.length > 0) {
      const creatorEmail = instantRows[0].creator_email;
      
      // If user is the instant meeting creator, ALWAYS allow direct join
      if (userEmail === creatorEmail) {
        console.log(`✅ [INSTANT CREATOR] ${userName} is creator of instant meeting, allowing direct join`);
        isInstantCreator = true;
        isHost = true; // Force host status
      }
    }
  } catch (err) {
    console.error('[INSTANT CREATOR CHECK ERROR]', err);
  }

  // 🔥 FIXED: Check should use UPDATED isHost value (which is now true for instant creators)
  if (!isHost && waitingUsers[roomId]?.some(u => u.email === userEmail)) {
    console.log(`[BLOCKED] ${userName} (${userEmail}) tried to join without approval`);
    return socket.emit('join-denied', { 
      message: 'Waiting for host approval.' 
    });
  }

  // Remove from waiting list if they were there
  if (waitingUsers[roomId]) {
    waitingUsers[roomId] = waitingUsers[roomId].filter(u => u.email !== userEmail);
    io.to(roomId).emit('waiting-users', waitingUsers[roomId]);
  }

      socket.join(roomId);
      socket.roomId = roomId;
      socket.userData = { userId, userName, userEmail, isHost };

      if (isHost) roomHosts[roomId] = socket.id;

      userMediaState[socket.id] = { videoOn: true, audioOn: true, userName };

      socket.to(roomId).emit('user-joined', userId, userName, userEmail, isHost);

      // Send current room users + media states
      const usersInRoom = [];
      const room = io.sockets.adapter.rooms.get(roomId);
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

      socket.emit('room-users', usersInRoom);

      console.log(`${userName} (${isHost ? 'Host' : 'Participant'}) joined ${roomId}`);

      // ─── Your existing DB logging (completely unchanged) ───
      try {
        // Check scheduled meeting
        const [rows] = await pool.execute(
          'SELECT id, creator_email FROM pmx_scheduled_meetings WHERE room_id = ?',
          [roomId]
        );

        if (rows.length > 0) {
          // Scheduled meeting: insert into pmx_scheduled_participants table
          await pool.execute(
            `INSERT INTO pmx_scheduled_participants (meeting_id, name, email, participant_type) 
             VALUES (?, ?, ?, ?)`,
            [rows[0].id, userName, userEmail, isHost ? 'internal' : 'external']
          );

          console.log("Participant inserted into scheduled meeting.");
        } else {
          // If not scheduled → check instant meeting
          const [inst_rows] = await pool.execute(
            'SELECT id, creator_email FROM pmx_instant_meeting WHERE room_id = ?',
            [roomId]
          );

          if (inst_rows.length > 0) {
            const instantId = inst_rows[0].id;
            const type = (inst_rows[0].creator_email === userEmail) ? 'internal' : 'external';

            console.log(`Instant meeting found. ID: ${instantId}, Type: ${type}`);

            // Insert into instant_participants
            await pool.execute(
              `INSERT INTO pmx_instant_participants 
               (instant_meeting_id, name, email, participant_type, joined_at)
               VALUES (?, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE joined_at = NOW(),
               left_at = NULL`,
              [instantId, userName, userEmail, type]
            );

            console.log("Participant inserted into instant meeting.");
          } else {
            console.warn(`No scheduled/instant meeting found for room: ${roomId}`);
          }
        }
      } catch (e) {
        console.error("DB Error (join-room):", e);
      }
    });

    // ───────────────────────────────────────────────────────────────
    // All your existing handlers (completely unchanged)
    // ───────────────────────────────────────────────────────────────

    socket.on('media-state-change', (data) => {
      const { roomId, userId, userName, videoOn, audioOn } = data;

      userMediaState[userId] = { videoOn, audioOn, userName };

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

        const [rows] = await pool.execute('SELECT id FROM pmx_scheduled_meetings WHERE room_id = ?', [data.roomId]);
        if (rows.length > 0) {
          const meetingId = rows[0].id;
          await pool.execute(
            'INSERT INTO pmx_chat_messages (room_id, meeting_id, sender_name, sender_email, message) VALUES (?, ?, ?, ?, ?)',
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

    socket.on('toggle-proctor', async (data) => {
      try {
        console.log(
          `Toggle proctor for ${data.userId} in room ${data.roomId}: proctor=${data.proctor}`,
        );

        const [rows] = await pool.execute('SELECT id FROM pmx_scheduled_meetings WHERE room_id = ?', [data.roomId]);
        if (rows.length > 0) {
          const meetingId = rows[0].id;
          await pool.execute(
            'INSERT INTO pmx_proctor_logs (room_id, meeting_id, user_id, user_name, user_email, event_type) VALUES (?, ?, ?, ?, ?, ?)',
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

    socket.on('get-room-users', (roomId, callback) => {
      console.log(`get-room-users called for room: ${roomId}`);

      if (!rooms[roomId]) {
        console.log(`Room ${roomId} not found in rooms object`);
        callback([]);
        return;
      }

      const roomUsers = [];
      for (const [sockId, userData] of Object.entries(rooms[roomId])) {
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

    socket.on('screen-share-status', (data) => {
      try {
        const { roomId, userId, userName, isScreenSharing } = data;

        console.log(
          `Screen share status from ${userId} (${userName}) in room ${roomId}: ${isScreenSharing}`
        );

        io.to(roomId).emit('screen-share-status', {
          userId,
          userName: userName || 'Unknown',
          isScreenSharing,
        });
      } catch (err) {
        console.error(`Error handling screen-share-status: ${err.message}`);
      }
    });

    // ───────────────────────────────────────────────────────────────
    // Disconnect — clean up waiting list + existing logic
    // ───────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      if (!socket.roomId) return;

      const userName = socket.userData?.userName || 'Unknown';
      const userEmail = socket.userData?.userEmail || '';
      const userId = socket.id;
      const roomId = socket.roomId;

      socket.to(roomId).emit('user-left', { userId, userName });

      // Clean up waiting list if they were waiting
      if (waitingUsers[roomId]) {
        waitingUsers[roomId] = waitingUsers[roomId].filter(u => u.id !== socket.id);
        io.to(roomId).emit('waiting-users', waitingUsers[roomId]);
      }

      delete userMediaState[userId];
      if (roomHosts[roomId] === socket.id) {
        delete roomHosts[roomId];
      }

      console.log(`${userName} disconnected from room ${roomId}`);

      // === Your existing DB: Update left_at for instant or scheduled meeting ===
      try {
        let updated = false;

        // Instant meeting
        const [inst_rows] = await pool.execute(
          'SELECT id FROM pmx_instant_meeting WHERE room_id = ?',
          [roomId]
        );

        if (inst_rows.length > 0) {
          const instantId = inst_rows[0].id;

          await pool.execute(
            `UPDATE pmx_instant_participants 
             SET left_at = NOW() 
             WHERE instant_meeting_id = ? AND email = ?`,
            [instantId, userEmail]
          );

          console.log(`Updated left_at for instant meeting participant: ${userEmail}`);
          updated = true;
        }

        // If not instant → scheduled meeting
        if (!updated) {
          const [sched_rows] = await pool.execute(
            `SELECT m.id AS meeting_id 
             FROM pmx_scheduled_meetings m 
             JOIN pmx_scheduled_participants p ON p.meeting_id = m.id 
             WHERE m.room_id = ? AND p.email = ?`,
            [roomId, userEmail]
          );

          if (sched_rows.length > 0) {
            const meetingId = sched_rows[0].meeting_id;

            await pool.execute(
              `UPDATE pmx_scheduled_participants 
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

// feb17 existing

// socket.js — FINAL WORKING VERSION with Lobby/Waiting Room (January 2026)
// All existing features preserved + added lobby/waiting room for external users

const { pool } = require('../config/database');

const rooms = {};           // Active participants: { roomId: { socketId: { userId, userName, userEmail, isHost } } }
const roomHosts = {};       // { roomId: hostSocketId }
const waitingUsers = {};    // Pending users: { roomId: [ { id: socket.id, name, email, timestamp } ] }
const approvedUsers = {};   // Approved pending users: { roomId: Set<email> }
const userMediaState = {};  // { socketId: { videoOn, audioOn, userName } }

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ───────────────────────────────────────────────────────────────
    // 1. External user requests to join → goes into waiting lobby
    // ───────────────────────────────────────────────────────────────
    // In socket.js, update the request-join handler
    socket.on('request-join', async ({ roomId, userName, email, isHost }) => {
      console.log(`[LOBBY REQUEST] ${userName} (${email}) wants to join ${roomId}, claims to be host: ${isHost}`);
      socket.waitingRoomId = roomId;
      socket.waitingEmail = email;

      // 🔥 FIRST: Check if this is an instant meeting creator
      try {
        const [instantRows] = await pool.execute(
          'SELECT creator_email FROM pmx_instant_meeting WHERE room_id = ?',
          [roomId]
        );

        if (instantRows.length > 0) {
          const creatorEmail = instantRows[0].creator_email;

          if (email === creatorEmail) {
            console.log(`🎯 [INSTANT CREATOR DETECTED] ${userName} is creator, NOT adding to waiting list`);

            // Send special event to frontend to join directly
            socket.emit('host-verified', {
              roomId,
              message: 'You are the instant meeting creator. Joining directly...'
            });
            return; // Don't add to waiting list
          }
        }
      } catch (err) {
        console.error('[INSTANT CREATOR CHECK ERROR]', err);
      }

      // Only non-creators go to waiting list
      if (!waitingUsers[roomId]) waitingUsers[roomId] = [];
      const existingIndex = waitingUsers[roomId].findIndex(u => u.email === email);

      // If same email is already waiting, refresh socket id to latest attempt
      if (existingIndex !== -1) {
        waitingUsers[roomId][existingIndex] = {
          id: socket.id,
          name: userName,
          email,
          timestamp: Date.now(),
        };
        io.to(roomId).emit('waiting-users', waitingUsers[roomId]);
        socket.emit('lobby-waiting', {
          message: 'Waiting for host approval...'
        });
        return;
      }

      const waitingEntry = {
        id: socket.id,
        name: userName,
        email: email,
        timestamp: Date.now()
      };

      waitingUsers[roomId].push(waitingEntry);

      // Notify host
      io.to(roomId).emit('waiting-users', waitingUsers[roomId]);

      socket.emit('lobby-waiting', {
        message: 'Waiting for host approval...'
      });

      console.log(`[LOBBY] Added to waiting: ${userName} → ${waitingUsers[roomId].length} waiting`);
    });


    // Add this handler - it helps frontend know immediately if user is instant creator
    socket.on('check-instant-creator', async ({ roomId, email }, callback) => {
      try {
        const [instantRows] = await pool.execute(
          'SELECT creator_email FROM pmx_instant_meeting WHERE room_id = ?',
          [roomId]
        );

        if (instantRows.length === 0) {
          return callback({ isCreator: false, isInstantMeeting: false });
        }

        const isCreator = instantRows[0].creator_email === email;

        callback({
          isCreator,
          isInstantMeeting: true,
          creatorEmail: instantRows[0].creator_email
        });

      } catch (err) {
        console.error('[CHECK INSTANT CREATOR ERROR]', err);
        callback({ isCreator: false, error: err.message });
      }
    });
    // ───────────────────────────────────────────────────────────────
    // 2. Host requests current waiting list
    // ───────────────────────────────────────────────────────────────
    socket.on('get-waiting-users', (roomId) => {
      const list = waitingUsers[roomId] || [];
      socket.emit('waiting-users', list);
      console.log(`[LOBBY] Host requested waiting list for ${roomId} → ${list.length} users`);
    });

    // ───────────────────────────────────────────────────────────────
    // 3. Host approves a waiting user
    // ───────────────────────────────────────────────────────────────
    socket.on('approve-join', ({ roomId, tempId }) => {
      if (!roomHosts[roomId] || socket.id !== roomHosts[roomId]) {
        return socket.emit('error', { message: 'Only the host can approve users' });
      }

      if (!waitingUsers[roomId]) return;

      const index = waitingUsers[roomId].findIndex(u => u.id === tempId);
      if (index === -1) return;

      const approved = waitingUsers[roomId][index];
      waitingUsers[roomId].splice(index, 1);
      if (!approvedUsers[roomId]) approvedUsers[roomId] = new Set();
      approvedUsers[roomId].add(approved.email);

      // Update host UI
      io.to(roomId).emit('waiting-users', waitingUsers[roomId] || []);

      // Tell the approved user they can now join
      io.to(tempId).emit('join-approved', {
        roomId,
        message: 'You have been approved! Joining meeting...'
      });

      console.log(`[LOBBY APPROVED] ${approved.name} (${approved.email}) into ${roomId}`);
    });

    // ───────────────────────────────────────────────────────────────
    // 4. Host denies a waiting user
    // ───────────────────────────────────────────────────────────────
    socket.on('deny-join', ({ roomId, tempId }) => {
      if (!roomHosts[roomId] || socket.id !== roomHosts[roomId]) {
        return socket.emit('error', { message: 'Only the host can deny users' });
      }

      if (!waitingUsers[roomId]) return;

      const index = waitingUsers[roomId].findIndex(u => u.id === tempId);
      if (index === -1) return;

      const denied = waitingUsers[roomId][index];
      waitingUsers[roomId].splice(index, 1);
      if (approvedUsers[roomId]) {
        approvedUsers[roomId].delete(denied.email);
      }

      io.to(roomId).emit('waiting-users', waitingUsers[roomId] || []);

      io.to(tempId).emit('join-denied', {
        message: 'Your request to join was denied by the host.'
      });

      console.log(`[LOBBY DENIED] ${denied.name} (${denied.email}) for ${roomId}`);
    });

    let shouldAllowDirectJoin = false;
    // ───────────────────────────────────────────────────────────────
    // 5. Normal join-room (only allowed after approval or for host/instant)
    // ───────────────────────────────────────────────────────────────
    socket.on('join-room', async (roomId, userId, userName, userEmail, isHost) => {
      // 🔥 CRITICAL FIX: Move this logic to the top
      let isInstantCreator = false;

      try {
        // Check if this is an instant meeting
        const [instantRows] = await pool.execute(
          'SELECT creator_email FROM pmx_instant_meeting WHERE room_id = ?',
          [roomId]
        );

        if (instantRows.length > 0) {
          const creatorEmail = instantRows[0].creator_email;

          // If user is the instant meeting creator, ALWAYS allow direct join
          if (userEmail === creatorEmail) {
            console.log(`✅ [INSTANT CREATOR] ${userName} is creator of instant meeting, allowing direct join`);
            isInstantCreator = true;
            isHost = true; // Force host status
          }
        }
      } catch (err) {
        console.error('[INSTANT CREATOR CHECK ERROR]', err);
      }

      // Non-host users must be explicitly approved before join
      const isApproved = approvedUsers[roomId]?.has(userEmail) === true;
      if (!isHost && !isApproved) {
        console.log(`[BLOCKED] ${userName} (${userEmail}) tried to join without approval`);
        return socket.emit('join-denied', {
          message: 'Waiting for host approval.'
        });
      }

      // Remove from waiting list if they were there
      if (waitingUsers[roomId]) {
        waitingUsers[roomId] = waitingUsers[roomId].filter(u => u.email !== userEmail);
        io.to(roomId).emit('waiting-users', waitingUsers[roomId]);
      }
      if (approvedUsers[roomId]) {
        approvedUsers[roomId].delete(userEmail);
      }

      socket.join(roomId);
      socket.roomId = roomId;
      const canonicalUserId = socket.id;
      socket.userData = { userId: canonicalUserId, userName, userEmail, isHost };
      if (!rooms[roomId]) rooms[roomId] = {};
      rooms[roomId][socket.id] = socket.userData;

      if (isHost) roomHosts[roomId] = socket.id;

      userMediaState[socket.id] = { videoOn: true, audioOn: true, userName };

      socket.to(roomId).emit('user-joined', canonicalUserId, userName, userEmail, isHost);

      // Send current room users + media states
      const usersInRoom = [];
      const room = io.sockets.adapter.rooms.get(roomId);
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

      socket.emit('room-users', usersInRoom);

      console.log(`${userName} (${isHost ? 'Host' : 'Participant'}) joined ${roomId}`);

      // ─── Your existing DB logging (completely unchanged) ───
      try {
        // Check scheduled meeting
        const [rows] = await pool.execute(
          'SELECT id, creator_email FROM pmx_scheduled_meetings WHERE room_id = ?',
          [roomId]
        );

        if (rows.length > 0) {
          // Scheduled meeting: insert into pmx_scheduled_participants table
          await pool.execute(
            `INSERT INTO pmx_scheduled_participants (meeting_id, name, email, participant_type) 
             VALUES (?, ?, ?, ?)`,
            [rows[0].id, userName, userEmail, isHost ? 'internal' : 'external']
          );

          console.log("Participant inserted into scheduled meeting.");
        } else {
          // If not scheduled → check instant meeting
          const [inst_rows] = await pool.execute(
            'SELECT id, creator_email FROM pmx_instant_meeting WHERE room_id = ?',
            [roomId]
          );

          if (inst_rows.length > 0) {
            const instantId = inst_rows[0].id;
            const type = (inst_rows[0].creator_email === userEmail) ? 'internal' : 'external';

            console.log(`Instant meeting found. ID: ${instantId}, Type: ${type}`);

            // Insert into instant_participants
            await pool.execute(
              `INSERT INTO pmx_instant_participants 
               (instant_meeting_id, name, email, participant_type, joined_at)
               VALUES (?, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE joined_at = NOW(),
               left_at = NULL`,
              [instantId, userName, userEmail, type]
            );

            console.log("Participant inserted into instant meeting.");
          } else {
            console.warn(`No scheduled/instant meeting found for room: ${roomId}`);
          }
        }
      } catch (e) {
        console.error("DB Error (join-room):", e);
      }
    });

    // ───────────────────────────────────────────────────────────────
    // All your existing handlers (completely unchanged)
    // ───────────────────────────────────────────────────────────────

    socket.on('media-state-change', (data) => {
      const { roomId, userId, userName, videoOn, audioOn } = data;

      userMediaState[userId] = { videoOn, audioOn, userName };

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

        const [rows] = await pool.execute('SELECT id FROM pmx_scheduled_meetings WHERE room_id = ?', [data.roomId]);
        if (rows.length > 0) {
          const meetingId = rows[0].id;
          await pool.execute(
            'INSERT INTO pmx_chat_messages (room_id, meeting_id, sender_name, sender_email, message) VALUES (?, ?, ?, ?, ?)',
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

    socket.on('toggle-proctor', async (data) => {
      try {
        console.log(
          `Toggle proctor for ${data.userId} in room ${data.roomId}: proctor=${data.proctor}`,
        );

        const [rows] = await pool.execute('SELECT id FROM pmx_scheduled_meetings WHERE room_id = ?', [data.roomId]);
        if (rows.length > 0) {
          const meetingId = rows[0].id;
          await pool.execute(
            'INSERT INTO pmx_proctor_logs (room_id, meeting_id, user_id, user_name, user_email, event_type) VALUES (?, ?, ?, ?, ?, ?)',
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

    socket.on('get-room-users', (roomId, callback) => {
      console.log(`get-room-users called for room: ${roomId}`);

      if (!rooms[roomId]) {
        console.log(`Room ${roomId} not found in rooms object`);
        callback([]);
        return;
      }

      const roomUsers = [];
      for (const [sockId, userData] of Object.entries(rooms[roomId])) {
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

    socket.on('screen-share-status', (data) => {
      try {
        const { roomId, userId, userName, isScreenSharing } = data;

        console.log(
          `Screen share status from ${userId} (${userName}) in room ${roomId}: ${isScreenSharing}`
        );

        io.to(roomId).emit('screen-share-status', {
          userId,
          userName: userName || 'Unknown',
          isScreenSharing,
        });
      } catch (err) {
        console.error(`Error handling screen-share-status: ${err.message}`);
      }
    });

    // ───────────────────────────────────────────────────────────────
    // Disconnect — clean up waiting list + existing logic
    // ───────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      if (socket.waitingRoomId && waitingUsers[socket.waitingRoomId]) {
        waitingUsers[socket.waitingRoomId] = waitingUsers[socket.waitingRoomId].filter(u => u.id !== socket.id);
        io.to(socket.waitingRoomId).emit('waiting-users', waitingUsers[socket.waitingRoomId]);
      }

      if (!socket.roomId) return;

      const userName = socket.userData?.userName || 'Unknown';
      const userEmail = socket.userData?.userEmail || '';
      const userId = socket.id;
      const roomId = socket.roomId;

      socket.to(roomId).emit('user-left', { userId, userName });

      // Clean up waiting list if they were waiting
      if (waitingUsers[roomId]) {
        waitingUsers[roomId] = waitingUsers[roomId].filter(u => u.id !== socket.id);
        io.to(roomId).emit('waiting-users', waitingUsers[roomId]);
      }
      if (approvedUsers[roomId] && userEmail) {
        approvedUsers[roomId].delete(userEmail);
      }
      if (rooms[roomId]) {
        delete rooms[roomId][socket.id];
        if (Object.keys(rooms[roomId]).length === 0) {
          delete rooms[roomId];
          delete approvedUsers[roomId];
        }
      }

      delete userMediaState[userId];
      if (roomHosts[roomId] === socket.id) {
        delete roomHosts[roomId];
      }

      console.log(`${userName} disconnected from room ${roomId}`);

      // === Your existing DB: Update left_at for instant or scheduled meeting ===
      try {
        let updated = false;

        // Instant meeting
        const [inst_rows] = await pool.execute(
          'SELECT id FROM pmx_instant_meeting WHERE room_id = ?',
          [roomId]
        );

        if (inst_rows.length > 0) {
          const instantId = inst_rows[0].id;

          await pool.execute(
            `UPDATE pmx_instant_participants 
             SET left_at = NOW() 
             WHERE instant_meeting_id = ? AND email = ?`,
            [instantId, userEmail]
          );

          console.log(`Updated left_at for instant meeting participant: ${userEmail}`);
          updated = true;
        }

        // If not instant → scheduled meeting
        if (!updated) {
          const [sched_rows] = await pool.execute(
            `SELECT m.id AS meeting_id 
             FROM pmx_scheduled_meetings m 
             JOIN pmx_scheduled_participants p ON p.meeting_id = m.id 
             WHERE m.room_id = ? AND p.email = ?`,
            [roomId, userEmail]
          );

          if (sched_rows.length > 0) {
            const meetingId = sched_rows[0].meeting_id;

            await pool.execute(
              `UPDATE pmx_scheduled_participants 
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
