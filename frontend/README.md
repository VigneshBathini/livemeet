# Dec 15

Status:

D- its working fine 

On create room it should store to table and when join the room it should validate from table

Here for instant meeting new table has been created named as instant_meeeting
and for storing and validating the participants or host 
created the instant_participants table

On creating the room the details are storing in instant_meeting table as well 
instant_participants for joinees are revalidating. Need to include left_at functionality


Schedule meeting need to check the workflow which has been disturbed due to above functionalities.
Need to verify the meetings table and particpant table.


# Tasks

A-icon toggle needs to appear and dont provide alerts toggles for icon mute or video- done
 
B-when camera is off show user name  or icon with name- inital join not working properly when by default video - done
 
C-shorten the key

D-On create room it should store to table and when join the room it should validate from table
- working
 
E- need to add throtling or debouncing in chatbox
 
F- need to test with 10 members
 
G- test the application through using testing tools

H- Proctor logs and chatbox need to store recheck the functionalities

 


-----------------------------------
Once again Need to test below:

Join room through key : Need to check when user leave meeting .If user want to re-join than from login its working but not 
working from join room page need to check
 
From Schedule meeting: when users join more than 2 than 3rd user only showing sef camera but other existing participants
showing all  streaming
 
When user left the meeting than keys are showing not partticpants and also from other rooms left meeting also displaying


# Working files:
Alert
Authcontext
Video
Signup
JoinRoom
JoinMeetingPage
Login
Signup
SchedulePage


# New file in  Progress
frontend:
ScheduledMeetings

backend:
utils/email
routes/api


# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

### Overview of the Application

This codebase implements a **real-time video conferencing application** called "LiveMeet" using **WebRTC** for peer-to-peer video/audio streaming, **Socket.io** for signaling and real-time communication, and **face-api.js** for face detection (used in proctor mode). The app supports features like room creation/joining, video/audio toggling, screen sharing, chat, host controls (e.g., muting participants, enabling proctor mode), and debugging/alerts.

- **Frontend**: A single React component (`Video.js`) handles the UI, state, WebRTC peers, and media streams.
- **Backend**: A Node.js/Express server (`server.js`) with Socket.io manages signaling, room tracking, and event broadcasting.
- **Key Dependencies**: React, Socket.io-client, SimplePeer (WebRTC wrapper), face-api.js (ML for face detection), UUID (for room IDs).

The app is designed for meetings with proctoring (e.g., for exams), enforcing rules like full-screen sharing and face detection.

---

### Frontend: React Component (`Video.js`)

The component is a functional React app wrapped in an `ErrorBoundary` class for error handling. It uses hooks for state management, side effects, and callbacks. Below, I break it down by sections.

#### 1. **Imports and Constants**
- **React Hooks**: `useState` (state), `useRef` (refs for DOM/video elements/peers), `useEffect` (side effects like socket setup), `useCallback` (memoized functions).
- **Libraries**:
  - `io` from 'socket.io-client': For real-time server communication.
  - `SimplePeer`: Wraps WebRTC for easier peer connections (handles offers/answers/ICE candidates).
  - `faceapi`: Loads ML models for face detection (SSD MobileNet for detection, landmarks for positioning).
  - `uuidv4`: Generates unique room IDs.
- **Constants**:
  - `SIGNALING_SERVER_URL`: Points to the backend (localhost:3000 for dev, Render for prod).
  - `ErrorBoundary`: Class component that catches errors and shows a fallback UI.

#### 2. **State and Refs**
The app manages a lot of state for a multi-user video call. Here's a table summarizing key states/refs:

| Name | Type | Purpose |
|------|------|---------|
| `roomId` | string | Unique ID for the meeting room. |
| `localStream` | MediaStream | User's camera/microphone stream. |
| `screenStream` | MediaStream | User's screen share stream (null if not sharing). |
| `inRoom` | bool | Whether user is in a meeting (toggles UI). |
| `peers` | object | Map of peer connections (userId → SimplePeer instance). |
| `debugLog` | array | Logs for debugging (last 50 entries). |
| `isVideoOn`/`isAudioOn` | bool | Tracks if user's camera/mic is enabled. |
| `isScreenSharing` | bool | Tracks if user is screen sharing. |
| `connectionStatus` | object | Per-user status (userId → {status, userName, streams: {camera, screen}}). |
| `messages` | array | Chat history [{from, userName, message, time}]. |
| `chatInput` | string | Current chat message being typed. |
| `showDebug`/`showChat` | bool | Toggles debug panel and chat sidebar. |
| `userName` | string | User's display name. |
| `isHost` | bool | If user is the room creator (host). |
| `participantControls` | object | Host-only: Per-user controls (userId → {video, audio, proctor}). |
| `alerts` | array | Temporary notifications [{id, message, type}]. |
| `lastTabSwitch` | ref(number) | Timestamp for tab switches (for proctoring). |
| `renegotiationQueue` | ref(object) | Queues peer renegotiations to avoid duplicates. |
| `pendingRemoteStreams` | ref(object) | Buffers incoming streams until video elements are ready. |
| `videoStreamCount` | ref(object) | Counts video tracks per user (helps classify camera vs. screen). |
| `socketRef` | ref(Socket) | Socket.io connection. |
| `userVideoRef` | ref(object) | Refs for local video elements {camera, screen}. |
| `peerVideoRefs` | ref(object) | Refs for remote video elements (userId → {camera, screen}). |
| `pendingCandidates` | ref(object) | Queues ICE candidates if peer not ready. |
| `peersRef` | ref(object) | Mutable peers map (avoids re-renders). |
| `chatRef` | ref(DOM) | Auto-scrolls chat. |
| `detectionIntervals` | ref(object) | Intervals for face detection per user. |

- **Callbacks**:
  - `addAlert`/`removeAlert`: Manages timed alerts (auto-dismiss after 5s).
  - `logDebug`: Logs to console and state (keeps last 50).

#### 3. **useEffect Hooks (Side Effects)**
These run on mount/update. Key ones:

- **Screen Share Assignment**: When `screenStream` changes, assigns it to local screen video element and plays it.
- **Clear Screen on Stop**: Resets local screen video when not sharing.
- **Tab Switch Detection (Proctor Mode)**: Listens to `visibilitychange`. If tab hidden during proctor + no screen share, alerts user and notifies host.
- **Browser Support & Face-API Load**: Checks WebRTC support; loads face detection models from `/weights` (assumes static files).
- **Socket Setup** (Core Communication):
  - Connects to server with reconnection logic.
  - Listens for events: `connect`/`connect_error`/`reconnect` (logs/alerts).
  - Binds handlers: `user-joined`, `offer`/`answer`/`ice-candidate` (WebRTC signaling), `user-left`, `chat-message`, `toggle-media`, `face-detection-alert`, `tab-switch-alert`, `toggle-proctor`, `screen-share-status`.
  - Tests ICE servers (STUN/TURN) on connect for NAT traversal.
  - Cleanup: Disconnects socket.
- **Tag Camera Track**: Marks local video track as 'camera' for classification.
- **Local Stream Assignment**: Plays local camera stream in user's video element when in room.
- **Auto-Scroll Chat**: Scrolls to bottom on new messages.
- **Face Detection (Host-Only, Proctor Mode)**: For each proctored user, runs interval (every 5s) on their camera video: Detects faces. Alerts if 0 or >1 faces (sends to participant). Clears on disable/cleanup.
- **Pending Streams Debug**: Logs pending remote streams every 5s.

#### 4. **Core Functions**
These handle user interactions and WebRTC logic.

- **Utility**:
  - `shortId(id)`: Truncates IDs to 8 chars.
  - `checkPermissions()`: Tests getUserMedia for camera/mic access.

- **Room Management**:
  - `createRoom()`: Validates name/permissions, generates UUID roomId, sets host=true, gets local stream, joins socket room, sets inRoom=true.
  - `joinRoom()`: Validates roomId/name/permissions, gets local stream, joins socket room, sets inRoom=true.

- **Media Controls**:
  - `toggleVideo()`: Toggles local camera track enabled/disabled. If off→on, reacquires stream. Updates peers via replaceTrack + renegotiate. Emits to server if not host.
  - `toggleAudio()`: Toggles local audio track. Emits if not host.
  - `toggleScreenShare()`: 
    - Start: Checks proctor (forces full-screen share), gets displayMedia stream, tags track as 'screen', adds/replaces track in peers, renegotiates, emits status.
    - Stop: Stops tracks, removes from peers, renegotiates, emits status.
    - Handles errors (e.g., permission denied, non-full-screen in proctor).
  - `stopScreenShare()`: Internal helper for stopping share.
  - `renegotiatePeer(peer, userId)`: Creates new offer after track changes (e.g., mute/share), sends via socket, waits for answer (10s timeout). Retries up to 5x if not 'stable'.

- **Peer Management**:
  - `createPeer(userId, initiator)`: Creates SimplePeer with local stream + ICE config (STUN/TURN). Adds screen track if sharing.
    - `on('signal')`: Emits offer/answer/candidate via socket (delayed 100ms).
    - `on('stream')`: Receives remote stream. Classifies video tracks (screen if displaySurface, label, high-res, or >1 track). Creates single-track streams, assigns to video refs with retry (20x, 500ms delay). Updates status/streams.
    - `on('connect'/'error'/'close')`: Updates status, alerts.
    - Applies pending candidates.
  - Event Handlers (bound to socket):
    - `handleUserJoined(userId, userName, isHost)`: Creates initiator peer, updates status/controls, alerts. Re-sends screen status if sharing.
    - `handleOffer(data)`: Creates non-initiator peer if needed, signals it.
    - `handleAnswer(data)`: Signals peer or queues if not ready.
    - `handleIceCandidate(data)`: Signals peer or queues.
    - `handleUserLeft(userId)`: Destroys peer, clears refs/streams/intervals/status/controls, alerts.
    - `handleChatMessage(data)`: Adds to messages (dedupes by content/time).
    - `handleToggleMedia(data)`: If for self, toggles tracks (reacquires if needed), updates peers/UI.
    - `sendChatMessage()`: Emits to server, adds to local messages.

- **Host Controls**:
  - `toggleParticipantMedia(userId, type)`: Toggles video/audio/proctor for participant. Emits to server. Only for host.

#### 5. **Render (JSX)**
- **ErrorBoundary**: Wraps everything; shows error message on crash.
- **Alerts**: Renders stack of timed alerts.
- **Pre-Room UI**: Inputs for name/roomId, buttons for join/create.
- **In-Room UI**:
  - **Header**: Room info, participant count, toggles for chat/debug.
  - **Main Content**:
    - **Video Gallery**: Grid of videos. Local (camera + optional screen). Remotes: Per-user camera + optional screen. Overlays show name/status/icons. Host sees proctor controls (video/audio/proctor buttons).
    - **Chat Sidebar**: Toggleable. Shows messages, input/send.
  - **Footer**: User controls (video/audio/screen buttons).
  - **Debug Panel**: Toggleable log list.
- **Inline Styles**: CSS variables for theming (dark mode). Responsive (grid for videos, mobile adaptations). Animations for alerts.

---

### Backend: Node.js/Express Server (`server.js`)

This is a simple signaling server. No database—state is in-memory (e.g., `roomHosts` map).

#### 1. **Setup**
- **Express + HTTP**: Serves API and static files (React build).
- **CORS**: Allows origins (localhost/Render), methods, credentials.
- **Socket.io**: Attached to HTTP server with CORS.

#### 2. **Routes**
- `GET /test`: Health check ("Server is running").
- `GET *`: Serves React's `index.html` (SPA routing).

#### 3. **Socket Events**
Handled on `io.on('connection')` for each socket:

- `join-room(roomId, userId, userName, isHost)`: Joins socket room. Sets host in `roomHosts`. Broadcasts `user-joined` to others in room. Logs users.
- `offer`/`answer`/`ice-candidate`: Forwards to target user (WebRTC signaling).
- `chat-message`: Broadcasts to room (excludes sender).
- `toggle-media`: Forwards to specific userId in room.
- `toggle-proctor`: Forwards to specific userId.
- `face-detection-alert`: Forwards to specific userId.
- `tab-switch-alert`: Forwards only to host of room.
- `screen-share-status`: Broadcasts to room.
- `disconnect`: Broadcasts `user-left` to others. Clears host if applicable.

- **Port**: 3000 or env PORT, binds to 0.0.0.0 (for hosting).

---

### Overall Flow

1. **App Load**:
   - Frontend loads face-api models, checks browser support.
   - Socket connects to server (with reconnections).

2. **Room Creation/Join**:
   - User enters name (optional roomId).
   - **Create**: Generate UUID, get local media stream (camera/mic), tag tracks, emit `join-room` (isHost=true), set inRoom=true.
   - **Join**: Validate roomId, get stream, emit `join-room` (isHost=false).
   - Server: Joins room, sets host, broadcasts `user-joined` → creates peer (initiator=true), starts signaling.

3. **Peer Connection (WebRTC)**:
   - On `user-joined`: Create SimplePeer, add local tracks (camera + screen if sharing).
   - Signaling: Offer/answer/ICE via socket → `on('stream')` receives remote tracks, classifies (camera/screen), assigns to video elements (with retries).
   - Connection: `on('connect')` → status 'connected', alert.

4. **Media Interactions**:
   - Toggle video/audio: Update local track, replace in peers, renegotiate (new offer/answer), emit status (non-hosts).
   - Screen Share: Get displayMedia (proctor forces full-screen), add/replace track, renegotiate, emit status.
   - Host Toggle: Emits `toggle-media`/`toggle-proctor` → participant updates tracks/UI.

5. **Proctor Mode (Host-Only)**:
   - Host toggles per-participant → emits, starts 5s face detection interval on camera video.
   - Detection: 0 or >1 faces → alert participant/host, emit `face-detection-alert`.
   - Tab Switch: On hidden tab (no share + proctor) → alert + emit `tab-switch-alert` to host.

6. **Chat**:
   - Type/send → emit `chat-message` → broadcast to room → append to messages (dedupe), auto-scroll.

7. **User Leave**:
   - Disconnect → server broadcasts `user-left` → destroy peer, clear streams/refs/intervals, alert.

8. **Reconnections/Errors**:
   - Socket reconnects automatically, re-joins room.
   - Alerts for failures (e.g., permissions, renegotiation timeouts).
   - Debug logs everything.

9. **Cleanup**:
   - Unmount: Disconnect socket, clear intervals.
   - Errors: Boundary catches, shows refresh message.

This flow ensures low-latency P2P (signaling only via server), with host oversight for proctored sessions. For production, add auth/persistence (e.g., rooms in DB).


right now in this functioanlity, user can create,join or schedule meeting but the scheduele meeting is not complted yet fully but here i want login for organiztion once login user can create ,join or schedule meeting and coming to outsiders i mean non-org person they can will link once user schedule a meeting based 
on that mail and once outsider join through link validte mailid 



======================================================================================

// sockets/index.js

const { pool } = require('../config/database');

// Store host socket ID for each room
const roomHosts = {};

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`New user connected: ${socket.id}`);


    socket.on('join-room', async (roomId, userId, userName, userEmail, isHost) => {
  try {
    socket.join(roomId);
    if (isHost) {
      roomHosts[roomId] = socket.id;
      console.log(`Host ${userId} (${userName}, ${userEmail}) joined room ${roomId}`);
    } else {
      console.log(`Participant ${userId} (${userName}, ${userEmail}) joined room ${roomId}`);
    }
    socket.to(roomId).emit('user-joined', userId, userName, userEmail, isHost);

    const [rows] = await pool.execute('SELECT id FROM meetings WHERE room_id = ?', [roomId]);
    if (rows.length > 0) {
      const meetingId = rows[0].id;
      await pool.execute(
        'INSERT INTO participants (meeting_id, name, email, participant_type) VALUES (?, ?, ?, ?)',
        [meetingId, userName, userEmail, isHost ? 'internal' : 'external'],
      );
      await pool.execute('UPDATE meetings SET status = "active" WHERE id = ?', [meetingId]);
      console.log(`Logged participant ${userName} (${userEmail}) for meeting ${roomId}`);
    }

    io.in(roomId)
      .allSockets()
      .then((sockets) => {
        console.log(`Users in room ${roomId}: ${[...sockets].join(', ')}`);
      })
      .catch((err) => {
        console.error(`Error fetching sockets for room ${roomId}: ${err.message}`);
      });
  } catch (err) {
    console.error(`Error in join-room for ${socket.id}: ${err.message}`);
  }
});

    // Handle WebRTC signaling: Offer
    socket.on('offer', (data) => {
      try {
        socket.to(data.to).emit('offer', { signal: data.signal, from: socket.id });
      } catch (err) {
        console.error(`Error handling offer from ${socket.id}: ${err.message}`);
      }
    });

    // Handle WebRTC signaling: Answer
    socket.on('answer', (data) => {
      try {
        socket.to(data.to).emit('answer', { signal: data.signal, from: socket.id });
      } catch (err) {
        console.error(`Error handling answer from ${socket.id}: ${err.message}`);
      }
    });

    // Handle WebRTC signaling: ICE candidate
    socket.on('ice-candidate', (data) => {
      try {
        socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
      } catch (err) {
        console.error(`Error handling ICE candidate from ${socket.id}: ${err.message}`);
      }
    });

    // Handle chat messages
    socket.on('chat-message', async (data) => {
      try {
        console.log(
          `Chat message from ${socket.id} (${data.userName}) in room ${data.roomId}: ${data.message}`,
        );

        // Log chat message for scheduled meetings
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

    // Handle media toggle (video/audio)
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

    // Handle proctor toggle
    socket.on('toggle-proctor', async (data) => {
      try {
        console.log(
          `Toggle proctor for ${data.userId} in room ${data.roomId}: proctor=${data.proctor}`,
        );

        // Log proctor events
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

    // Handle face detection alerts
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

    // Handle tab switch alerts
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

    // Handle screen share status
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
=======================================================================================
// routes/api

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidV4 } = require('uuid');
const { pool } = require('../config/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here'; // Replace with a secure secret in production

// testing purpose
router.get('/test', (req, res) => {
  res.status(200).send('Server is running');
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    console.log('login',users.length);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});


router.post('/validate-invitee', async (req, res) => {
  const { meetingId, email } = req.body;
  if (!meetingId || !email) {
    return res.status(400).json({ error: 'Meeting ID and email are required' });
  }

  try {
    const [meetings] = await pool.execute('SELECT invitees_json,creator_email FROM meetings WHERE room_id = ?', [meetingId]);
    console.log('meetingid',meetings)
    if (meetings.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    let invitees = [];
    const inviteesJson = meetings[0].invitees_json || '[]';
     const creator_email = meetings[0].creator_email || '[]';
    
    // try {
    //   // Attempt to parse invitees_json as JSON
    //   invitees = JSON.parse(inviteesJson);
    //   // Ensure invitees is an array
    //   if (!Array.isArray(invitees)) {
    //     console.warn(`Invalid invitees_json format for meeting ${meetingId}: ${inviteesJson}`);
    //     invitees = [];
    //   }
    // } catch (parseErr) {
    //   console.error(`Error parsing invitees_json for meeting ${meetingId}: ${parseErr.message}`);
    //   // Fallback: Treat invitees_json as a single email if it looks like one
    //   if (typeof inviteesJson === 'string' && inviteesJson.includes('@')) {
    //     invitees = [inviteesJson];
    //   } else {
    //     invitees = [];
    //   }
    // }

    // const valid = inviteesJson.includes(email) || creator_email.includes(email);
    // res.json({ valid: true, isHost: true }); 

    const isCreator = creator_email.includes(email);
const valid = inviteesJson.includes(email) || isCreator;
res.json({ 
  valid, 
  isHost: isCreator 
});
  } catch (err) {
    console.error('Error validating invitee:', err);
    res.status(500).json({ error: 'Failed to validate invitee' });
  }
});


router.post('/schedule', async (req, res) => {
  const { meetingTitle, creatorId, creatorName, creatorEmail, scheduledDate, scheduledTime, invitees, description, meetingType } = req.body;


  if (!meetingTitle || !creatorId || !creatorName || !creatorEmail || !scheduledDate || !scheduledTime || !Array.isArray(invitees)) {
    console.log('Invalid input data:', { meetingTitle, creatorId, creatorName, creatorEmail, scheduledDate, scheduledTime, invitees });
    return res.status(400).json({ error: 'Invalid input data' });
  }

  // Ensure invitees contains valid emails
  const validInvitees = invitees.filter(email => typeof email === 'string' && email.includes('@'));
  if (validInvitees.length !== invitees.length) {
    console.warn('Some invitees are invalid:', invitees);
  }

  const roomId = uuidV4();
  const scheduledDatetime = `${scheduledDate} ${scheduledTime}:00`;

  try {
    const [result] = await pool.execute(
      `INSERT INTO meetings 
       (room_id, meeting_title, creator_id, creator_name, creator_email, scheduled_datetime, description, invitees_json, meeting_type, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
      [
        roomId,
        meetingTitle,
        creatorId,
        creatorName,
        creatorEmail,
        scheduledDatetime,
        description,
        JSON.stringify(validInvitees), // Ensure valid JSON array
        meetingType || 'regular',
      ],
    );

    const baseUrl = req.protocol + '://' + req.get('host');
    const link = `${baseUrl}/join/${roomId}`;

    // TODO: Implement email sending using nodemailer
    console.log(`Sending email invitations to: ${validInvitees.join(', ')} with link: ${link}`);

    res.json({
      id: result.insertId,
      roomId,
      link,
      message: 'Meeting scheduled successfully',
    });
  } catch (err) {
    console.error('Error scheduling meeting:', err);
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
});

router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    console.log('Missing signup fields:', { email, password, name });
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  try {

    const [existingUsers] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      console.log('User already exists:', email);
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Hashed password for signup:', hashedPassword);


    const [result] = await pool.execute(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email, hashedPassword, name]
    );

    // Generate JWT
    const user = { id: result.insertId, email, name };
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    console.log('Generated token for new user:', token);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Error during signup:', err);
    res.status(500).json({ error: 'Failed to sign up' });
  }
});

module.exports = router;

===========Nov 6 2025===========

Here need to check when 1st Participants Join and later Host Joins 
