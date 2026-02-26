const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidV4 } = require('uuid');
const { pool } = require('../config/database');
const { sendEmail } = require('../utils/email');
const { v4 } = require('uuid');


const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here'; 

router.get('/test', (req, res) => {
  res.status(200).send('Server is running');
});


router.post('/instant', async (req, res) => {
  const { meetingTitle, creatorId } = req.body;

  try {
    //  Fetch name & email from users table (trusted)
    const [user] = await pool.execute(
      "SELECT name, email FROM pmx_users WHERE id = ?",
      [creatorId]
    );

    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const creatorName = user[0].name;
    const creatorEmail = user[0].email;

    const roomId = v4();

    console.log('Creating instant meeting:', { roomId, meetingTitle, creatorId, creatorName, creatorEmail });

    const [result] = await pool.execute(
      `INSERT INTO pmx_instant_meeting 
       (room_id, meeting_title, creator_id, creator_email, creator_name)
       VALUES (?, ?, ?, ?, ?)`,
      [roomId, meetingTitle, creatorId, creatorEmail, creatorName]
    );

    res.json({
      message: 'Instant meeting created',
      roomId,
      meetingId: result.insertId,
      meetingTitle: meetingTitle || 'Instant Meeting',
      creatorName,
      creatorEmail
    });

  } catch (err) {
    console.error('Error creating instant meeting:', err);
    res.status(500).json({ error: 'Failed to create instant meeting' });
  }
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const [users] = await pool.execute('SELECT * FROM pmx_users WHERE email = ?', [email]);
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
    const [meetings] = await pool.execute('SELECT invitees_json,creator_email FROM pmx_scheduled_meetings WHERE room_id = ?', [meetingId]);
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

router.post('/claim-host', async (req, res) => {
  const { meetingId, email } = req.body;
  
  if (!meetingId || !email) {
    console.log('❌ Invalid claim-host request:', { meetingId, email });
    return res.status(400).json({ error: 'Meeting ID and email are required' });
  }

  try {
    const [meetings] = await pool.execute(
      'SELECT creator_email FROM pmx_scheduled_meetings WHERE room_id = ?',
      [meetingId]
    );

    if (meetings.length === 0) {
      console.log(`Meeting not found: ${meetingId}`);
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const isRealHost = meetings[0].creator_email === email;
    console.log(`Host check for ${email} in ${meetingId}: ${isRealHost}`);
    
    res.json({ 
      isHost: isRealHost,
      meetingId: meetingId,
      userEmail: email
    });
    
  } catch (err) {
    console.error('Claim host error:', err);
    res.status(500).json({ 
      error: 'Server error during host verification',
      details: err.message 
    });
  }
});

router.get('/meetings/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch user details
    const [users] = await pool.execute("SELECT email FROM pmx_users WHERE id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userEmail = users[0].email;

    // Fetch meetings created by user
    const [createdMeetings] = await pool.execute(
      `SELECT * FROM pmx_scheduled_meetings WHERE creator_id = ?`, 
      [userId]
    );

    // Fetch meetings where user is an invitee
    const [invitedMeetings] = await pool.execute(
      `SELECT * FROM pmx_scheduled_meetings WHERE invitees_json LIKE ?`, 
      [`%${userEmail}%`]
    );

    // Merge and format results
    const allMeetings = [...createdMeetings, ...invitedMeetings].map(m => ({
      id: m.id,
      roomId: m.room_id,
      title: m.meeting_title,
      host: m.creator_name,
      startTime: m.start_datetime,
      endTime: m.end_datetime,
      description: m.description
    }));

    res.json(allMeetings);
  } catch (err) {
    console.error("Error fetching meetings:", err);
    res.status(500).json({ error: "Failed to load meetings" });
  }
});

// New route — only for instant meetings
router.post('/validate-instant', async (req, res) => {
  const { roomId, email } = req.body;

  if (!roomId || !email) {
    return res.status(400).json({ error: 'Room ID and email are required' });
  }

  try {
    const [instantMeetings] = await pool.execute(
      'SELECT creator_email FROM pmx_instant_meeting WHERE room_id = ?',
      [roomId]
    );

    if (instantMeetings.length === 0) {
      return res.status(404).json({ error: 'Instant meeting not found' });
    }

    const creatorEmail = instantMeetings[0].creator_email;
    const isHost = creatorEmail === email;

    // Instant meetings are open to anyone with the link
    return res.json({ valid: true, isHost });

  } catch (err) {
    console.error('Error validating instant meeting:', err);
    res.status(500).json({ error: 'Failed to validate instant meeting' });
  }
});

// New route — claim host for instant meetings only
router.post('/claim-host-instant', async (req, res) => {
  const { roomId, email } = req.body;

  if (!roomId || !email) {
    return res.status(400).json({ error: 'Room ID and email are required' });
  }

  try {
    const [instant] = await pool.execute(
      'SELECT creator_email FROM pmx_instant_meeting WHERE room_id = ?',
      [roomId]
    );

    if (instant.length === 0) {
      return res.status(404).json({ error: 'Instant meeting not found' });
    }

    const isHost = instant[0].creator_email === email;

    res.json({ isHost, roomId, userEmail: email });

  } catch (err) {
    console.error('Claim host instant error:', err);
    res.status(500).json({ error: 'Server error during instant host verification' });
  }
});


router.post('/schedule', async (req, res) => {
  const {
    meetingTitle,
    creatorId,
    creatorName,
    creatorEmail,
    scheduledDate,
    startTime,
    endTime,
    duration,
    invitees,
    description,
    meetingType
  } = req.body;

  if (
    !meetingTitle ||
    !creatorId ||
    !creatorName ||
    !creatorEmail ||
    !scheduledDate ||
    !startTime ||
    !endTime ||
    !Array.isArray(invitees)
  ) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  const validInvitees = invitees.filter(
    email => typeof email === 'string' && email.includes('@')
  );

  const roomId = uuidV4();

  try {
    // ✅ IST → UTC conversion
    const startDateTimeUTC = istToUTC(scheduledDate, startTime);
    const endDateTimeUTC = istToUTC(scheduledDate, endTime);

    if (endDateTimeUTC <= startDateTimeUTC) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Backward compatibility
    const scheduledDatetimeUTC = startDateTimeUTC;

    console.log('IST → UTC:', {
      ist: `${scheduledDate} ${startTime} - ${endTime}`,
      utc: {
        start: startDateTimeUTC,
        end: endDateTimeUTC
      }
    });

    const [result] = await pool.execute(
      `INSERT INTO pmx_scheduled_meetings 
       (room_id, meeting_title, creator_id, creator_name, creator_email,
        scheduled_datetime, start_datetime, end_datetime, duration_minutes,
        description, invitees_json, meeting_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        roomId,
        meetingTitle,
        creatorId,
        creatorName,
        creatorEmail,
        scheduledDatetimeUTC,
        startDateTimeUTC,
        endDateTimeUTC,
        duration,
        description,
        JSON.stringify(validInvitees),
        meetingType || 'regular',
        'scheduled',
      ]
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/join/${roomId}`;

    await Promise.all(
      validInvitees.map(email =>
        sendEmail({
          to: email,
          subject: `You're invited to "${meetingTitle}"`,
          html: `
            <p><strong>Meeting:</strong> ${meetingTitle}</p>
            <p><strong>Date & Time (IST):</strong> ${scheduledDate} ${startTime}</p>
            <p><a href="${link}">${link}</a></p>
          `,
          replyTo: creatorEmail,
        })
      )
    );

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

    //for existing user validation
    const [existingUsers] = await pool.execute('SELECT * FROM pmx_users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      console.log('User already exists:', email);
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Hashed password for signup:', hashedPassword);


    const [result] = await pool.execute(
      'INSERT INTO pmx_users (email, password, name) VALUES (?, ?, ?)',
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