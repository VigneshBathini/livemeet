# WebRTC Proctor (Frontend + Backend)

Full-stack video meeting and proctoring application using React, Express, Socket.IO, WebRTC, and MySQL.

## What This Project Includes

- `frontend/`: React app (authentication, meeting flows, scheduling UI, lobby/waiting room UX).
- `backend/`: Express + Socket.IO server (REST APIs, signaling, meeting state, DB persistence, email invites).

## Core Features

- Organization user authentication (signup/login).
- Instant meeting creation and join.
- Scheduled meetings with invitee email validation.
- Waiting lobby where host admits/denies participants.
- Real-time WebRTC audio/video with chat.
- Host controls for participant media/proctor toggles.
- Database logging for meetings, participants, chat, and proctor events.
- Email invitations for scheduled meetings.

## Tech Stack

- Frontend: React 19, React Router, Axios, Socket.IO client, simple-peer, face-api.js
- Backend: Node.js, Express, Socket.IO, mysql2, bcrypt, JWT, nodemailer
- Database: MySQL (SSL CA cert currently used via `backend/config/ca.pem`)

## Project Structure

```text
Webrtc/
  frontend/
    src/components/
      Video.js
      JoinMeetingPage.js
      SchedulePage.js
      ScheduledMeetings.js
      LoginPage.js
      SignupPage.js
      LandingPage.js
  backend/
    server.js
    routes/api.js
    sockets/index.js
    config/database.js
    config/cors.js
    utils/email.js
```

## Application Flow

### 1) Auth and Entry

- User lands on `/` (landing page), then can go to login/signup.
- Logged-in users can access:
  - `/video` (meeting page)
  - `/schedule` (schedule meeting modal)
  - `/scheduled-meetings` (list of meetings)
- Guests/external users join using `/join/:meetingId`.

### 2) Meetings

- Instant meeting:
  - Created via `POST /api/instant`.
  - Creator is recognized as host.
- Scheduled meeting:
  - Created via `POST /api/schedule`.
  - Invitees receive email invitation link.
  - Invitee is validated by `POST /api/validate-invitee` before joining.

### 3) Lobby and Join Authorization

- Non-host joiners emit `request-join` and enter waiting list.
- Host sees waiting users and can:
  - `approve-join`
  - `deny-join`
- Only approved users (or host/instant creator) can `join-room`.

### 4) In-Meeting Real Time

- Signaling: `offer`, `answer`, `ice-candidate`.
- Collaboration events: `chat-message`, `media-state-change`, `screen-share-status`.
- Host moderation: `toggle-media`, `toggle-proctor`, `tab-switch-alert`, `face-detection-alert`.
- Disconnect updates user state and persists participant leave timestamps.

## Frontend Documentation

### Main Routes

- `/` -> `LandingPage`
- `/login` -> `LoginPage`
- `/signup` -> `SignupPage`
- `/video` -> `Video` (authenticated)
- `/schedule` -> `SchedulePage` (authenticated modal)
- `/scheduled-meetings` -> `ScheduledMeetings` (authenticated)
- `/join/:meetingId` -> `JoinMeetingPage` (guest/external)

### Key Frontend Components

- `Video.js`: Meeting room, local/remote streams, WebRTC peer lifecycle, chat, host controls.
- `JoinMeetingPage.js`: Invitee validation and transition into `Video`.
- `SchedulePage.js`: Meeting creation workflow with invitees.
- `ScheduledMeetings.js`: Fetch and display user-linked meetings.
- `AuthContext.js`: Auth/session state and token persistence.

### Frontend API Usage (Current)

- `POST /api/signup`
- `POST /api/login`
- `GET /api/meetings/:userId`
- `POST /api/schedule`
- `POST /api/instant`
- `POST /api/validate-invitee`
- `POST /api/validate-instant`
- `POST /api/claim-host`
- `POST /api/claim-host-instant`
- `GET /api/users/search?q=...`
- `GET /api/users/check/:email`

## Backend Documentation

### Server Bootstrap (`backend/server.js`)

- Creates Express app + HTTP server + Socket.IO.
- Serves built frontend from `frontend/build`.
- Mounts REST routes at `/api`.
- Initializes socket handlers from `backend/sockets/index.js`.
- Checks DB connection during startup.

### REST API Summary (`backend/routes/api.js`)

- Health:
  - `GET /api/test`
- Auth:
  - `POST /api/signup`
  - `POST /api/login`
- Meeting lifecycle:
  - `POST /api/instant`
  - `POST /api/schedule`
  - `GET /api/meetings/:userId`
- Validation/host checks:
  - `POST /api/validate-invitee`
  - `POST /api/validate-instant`
  - `POST /api/claim-host`
  - `POST /api/claim-host-instant`
- User lookup:
  - `GET /api/users/search`
  - `GET /api/users/check/:email`

### Socket Events Summary (`backend/sockets/index.js`)

- Lobby:
  - `request-join`, `get-waiting-users`, `approve-join`, `deny-join`
  - responses/events: `lobby-waiting`, `waiting-users`, `join-approved`, `join-denied`, `host-verified`
- Room and signaling:
  - `join-room`, `user-joined`, `room-users`, `user-left`
  - `offer`, `answer`, `ice-candidate`
- Collaboration and moderation:
  - `chat-message`
  - `media-state-change`, `toggle-media`
  - `toggle-proctor`, `face-detection-alert`, `tab-switch-alert`
  - `screen-share-status`

### Database (Expected Tables)

From current backend code, these tables are expected:

- `pmx_users`
- `pmx_scheduled_meetings`
- `pmx_scheduled_participants`
- `pmx_instant_meeting`
- `pmx_instant_participants`
- `pmx_chat_messages`
- `pmx_proctor_logs`

## Environment Configuration

Create `backend/.env`:

```env
PORT=3000
CLIENT_URL=http://localhost:3000
JWT_SECRET=replace_with_secure_secret

DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_PORT=3306

SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

Notes:

- Backend currently uses SSL CA file at `backend/config/ca.pem` in DB pool config.
- CORS allows `CLIENT_URL`, `http://localhost:3000`, and `http://localhost:3001`.
- Frontend currently hardcodes `http://localhost:3000` in major components (`Video.js`, `SchedulePage.js`, `SignupPage.js`, etc.). Keep backend on port `3000` for local runs unless you refactor API base URLs.

## Local Development

### 1) Install Dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2) Run Frontend and Backend

Use two terminals:

```bash
# Terminal 1
cd backend
npm start
```

```bash
# Terminal 2
cd frontend
npm start
```

Frontend dev server opens on `http://localhost:3000` by default. If frontend uses another port, ensure backend CORS and frontend API URLs are aligned.

## Build and Production Serving

Backend is set to serve `frontend/build`:

```bash
cd backend
npm run build
npm start
```

## Testing

Frontend:

```bash
cd frontend
npm test
npm run test:coverage
```

Backend currently has no dedicated automated test script in `backend/package.json`.

## Current Known Constraints

- Some frontend files still use hardcoded API/signal URLs.
- `frontend/src/components/RemoteVideo.js` contains multiple duplicated blocks and legacy code.
- `frontend/README.md` is a historical notes file; this root README is the primary project documentation.

## Recommended Next Improvements

1. Centralize frontend API/socket base URL in one config file (env-based).
2. Add DB schema/migration files for reproducible setup.
3. Add backend test coverage for `/api` and socket event flows.
4. Split `Video.js` into smaller feature modules to reduce complexity.