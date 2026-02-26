const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidV4 } = require('uuid');
const { pool } = require('../config/database');
const { sendEmail } = require('../utils/email');
const { v4 } = require('uuid');
const { stat } = require('fs');


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
    // Merge creator and invitee meetings
const allMeetings = [...createdMeetings, ...invitedMeetings];

// Remove duplicates by 'id'
const uniqueMeetings = Array.from(
  new Map(allMeetings.map(m => [m.id, m])).values()
);

// Format and send
const formattedMeetings = uniqueMeetings.map(m => ({
  id: m.id,
  roomId: m.room_id,
  title: m.meeting_title,
  host: m.creator_name,
  startTime: m.start_datetime,
  endTime: m.end_datetime,
  description: m.description,
}));

res.json(formattedMeetings);

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
  const { meetingTitle, creatorId, creatorName, creatorEmail, scheduledDate,startTime,endTime,duration, invitees, description, meetingType } = req.body;


  if (!meetingTitle || !creatorId || !creatorName || !creatorEmail || !scheduledDate  || !Array.isArray(invitees)) {
    console.log('Invalid input data:', { meetingTitle, creatorId, creatorName, creatorEmail, scheduledDate, scheduledTime, invitees });
    return res.status(400).json({ error: 'Invalid input data' });
  }

  // Ensure invitees contains valid emails
  const validInvitees = invitees.filter(email => typeof email === 'string' && email.includes('@'));
  if (validInvitees.length !== invitees.length) {
    console.warn('Some invitees are invalid:', invitees);
  }

  const roomId = uuidV4();
  const scheduledDatetime = `${scheduledDate} ${startTime}:00`;

  try {
 // Create date strings in local timezone
    const startDateTimeStr = `${scheduledDate}T${startTime}:00`;
    const endDateTimeStr = `${scheduledDate}T${endTime}:00`;
    const scheduledDateTimeStr = scheduledDate;
    
    // Create Date objects (will be interpreted in local timezone)
    const startDateTimeLocal = new Date(startDateTimeStr);
    const endDateTimeLocal = new Date(endDateTimeStr);
    const scheduledDateTimeLocal = new Date(scheduledDateTimeStr);
  
    
    // Check if dates are valid
    if (isNaN(startDateTimeLocal.getTime())) {
      console.error('Invalid start date/time:', startDateTimeStr);
      return res.status(400).json({ error: 'Invalid start date/time format' });
    }
    
    if (isNaN(endDateTimeLocal.getTime())) {
      console.error('Invalid end date/time:', endDateTimeStr);
      return res.status(400).json({ error: 'Invalid end date/time format' });
    }
    
    // Validate end time is after start time
    if (endDateTimeLocal <= startDateTimeLocal) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }
    
    // Convert to UTC ISO strings
    const startDateTimeUTC = startDateTimeLocal.toISOString().replace('T', ' ').substring(0, 19);
    const endDateTimeUTC = endDateTimeLocal.toISOString().replace('T', ' ').substring(0, 19);
    const scheduledDateTimeUTC = scheduledDateTimeLocal.toISOString().replace('T', ' ').substring(0, 19);
    
    // Also keep the scheduled_datetime as start time in UTC (for backward compatibility)
    const scheduledDatetimeUTC = startDateTimeUTC;
    
    console.log('Date conversions:', {
      input: {
        scheduledDate,
        startTime,
        endTime,
        duration
      },
      local: {
        start: startDateTimeLocal.toString(),
        end: endDateTimeLocal.toString()
      },
      utc: {
        start: startDateTimeUTC,
        end: endDateTimeUTC,
        scheduled: scheduledDatetimeUTC
      }
    });
    
    // Insert into database with UTC times
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
        scheduledDatetimeUTC,  // UTC
        startDateTimeUTC,      // UTC
        endDateTimeUTC,        // UTC
        duration,
        description,
        JSON.stringify(validInvitees),
        meetingType || 'regular',
        'scheduled',
      ]
    );


  const baseUrl = req.protocol + '://' + req.get('host');
  const link = `${baseUrl}/join/${roomId}`;

  // SEND EMAILS
  const emailSubject = `You're invited to "${meetingTitle}"`;
 const emailBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            background-color: #f7f9fc;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        .email-shell {
            width: 100%;
            padding: 20px 12px;
            box-sizing: border-box;
        }
        .email-wrapper {
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
            box-sizing: border-box;
        }
        .header {
            background-color: #4f46e5;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            padding: 32px 24px;
            text-align: center;
        }
        .header-icon {
            font-size: 48px;
            margin-bottom: 16px;
            display: inline-block;
            line-height: 1;
            font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif;
        }
        .header-title {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 8px 0;
            color: #ffffff !important;
        }
        .header-subtitle {
            font-size: 16px;
            opacity: 0.9;
            margin: 0;
            color: #ffffff !important;
        }
        .content {
            padding: 32px;
            box-sizing: border-box;
        }
        .meeting-card {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 12px;
            padding: 24px;
            margin: 24px 0;
            border: 1px solid #e2e8f0;
            position: relative;
        }
        .meeting-title {
            font-size: 22px;
            font-weight: 700;
            color: #1e293b;
            margin: 0 0 20px 0;
            padding-bottom: 16px;
            border-bottom: 2px solid #e2e8f0;
        }
        .detail-row {
            display: flex;
            margin-bottom: 16px;
            align-items: flex-start;
        }
        .detail-icon {
            width: 24px;
            height: 24px;
            background: #6366f1;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            flex-shrink: 0;
            color: white;
            font-size: 14px;
            line-height: 1;
            font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif;
        }
        .detail-content {
            flex: 1;
        }
        .detail-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .detail-value {
            font-size: 16px;
            color: #1e293b;
            font-weight: 500;
            word-break: break-word;
        }
        .description-box {
            background: #fff7ed;
            border-radius: 10px;
            padding: 20px;
            margin: 24px 0;
            border-left: 4px solid #f97316;
        }
        .description-title {
            font-size: 14px;
            font-weight: 600;
            color: #9a3412;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0 0 8px 0;
        }
        .description-text {
            color: #431407;
            margin: 0;
        }
        .button-container {
            text-align: center;
            margin: 32px 0;
        }
        .join-button {
            display: inline-block;
            background-color: #4f46e5;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: #ffffff !important;
            text-decoration: none;
            padding: 18px 36px;
            border-radius: 50px;
            font-weight: 600;
            font-size: 17px;
            transition: all 0.3s ease;
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);
            letter-spacing: 0.3px;
        }
        .join-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 25px rgba(99, 102, 241, 0.4);
        }
        .invitees-section {
            background: #f0f9ff;
            border-radius: 10px;
            padding: 20px;
            margin: 24px 0;
        }
        .invitees-title {
            font-size: 14px;
            font-weight: 600;
            color: #0369a1;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0 0 12px 0;
        }
        .invitees-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .invitee-tag {
            background: white;
            border: 1px solid #bae6fd;
            color: #0369a1;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
        }
        .action-links {
            display: flex;
            justify-content: center;
            gap: 24px;
            margin-top: 20px;
        }
        .action-link {
            color: #6366f1;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            word-break: break-word;
        }
        .meeting-id {
            text-align: center;
            font-size: 12px;
            color: #64748b;
            margin-top: 24px;
            padding: 12px;
            background: #f8fafc;
            border-radius: 8px;
        }
        .footer {
            background: #f1f5f9;
            padding: 24px;
            text-align: center;
            color: #64748b;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
        }
        .footer-links {
            margin-top: 16px;
        }
        .footer-link {
            color: #6366f1;
            text-decoration: none;
            margin: 0 12px;
            font-size: 13px;
        }
        @media (max-width: 600px) {
            .email-shell {
                padding: 10px 8px;
            }
            .header-title {
                font-size: 24px;
            }
            .header-subtitle {
                font-size: 15px;
            }
            .content {
                padding: 20px;
            }
            .header {
                padding: 24px 16px;
            }
            .meeting-card {
                padding: 16px;
                margin: 16px 0;
            }
            .meeting-title {
                font-size: 20px;
                margin-bottom: 16px;
                padding-bottom: 12px;
            }
            .detail-row {
                margin-bottom: 14px;
            }
            .detail-value {
                font-size: 15px;
            }
            .button-container {
                margin: 22px 0;
            }
            .join-button {
                display: block;
                width: 100%;
                box-sizing: border-box;
                padding: 14px 18px;
                font-size: 15px;
                text-align: center;
                border-radius: 12px;
            }
            .action-links {
                flex-direction: column;
                gap: 10px;
                align-items: center;
            }
            .action-link {
                width: 100%;
                justify-content: center;
            }
            .invitees-list {
                gap: 6px;
            }
            .invitee-tag {
                font-size: 12px;
                padding: 5px 10px;
            }
            .footer {
                padding: 18px 14px;
                font-size: 13px;
            }
            .footer-links {
                display: flex;
                flex-direction: column;
                gap: 8px;
                align-items: center;
            }
            .footer-link {
                margin: 0;
            }
        }
        @media (max-width: 420px) {
            .header-icon {
                font-size: 42px;
            }
            .header-title {
                font-size: 22px;
            }
            .detail-icon {
                width: 22px;
                height: 22px;
                font-size: 13px;
            }
            .description-box,
            .invitees-section {
                padding: 14px;
            }
        }
    </style>
</head>
<body>
    <div class="email-shell">
    <div class="email-wrapper">
        <div class="header">
            <div class="header-icon">&#128197;</div>
            <h1 class="header-title" style="color:#ffffff !important;">Meeting Invitation</h1>
            <p class="header-subtitle" style="color:#ffffff !important;">You've been invited to join a virtual meeting</p>
        </div>
        
        <div class="content">
            <div class="meeting-card">
                <h2 class="meeting-title">${meetingTitle}</h2>
                
                <div class="detail-row">
                    <div class="detail-icon">&#128197;</div>
                    <div class="detail-content">
                        <div class="detail-label">Date & Time</div>
                        <div class="detail-value">
                            ${scheduledDate} &bull; ${startTime} - ${endTime}
                            <span style="color: #64748b; font-size: 14px;"> (${duration} minutes)</span>
                        </div>
                    </div>
                </div>
                
                <div class="detail-row">
                    <div class="detail-icon">&#128100;</div>
                    <div class="detail-content">
                        <div class="detail-label">Meeting Host</div>
                        <div class="detail-value">${creatorName} (${creatorEmail})</div>
                    </div>
                </div>
                
                <div class="detail-row">
                    <div class="detail-icon">&#128205;</div>
                    <div class="detail-content">
                        <div class="detail-label">Meeting Type</div>
                        <div class="detail-value">${meetingType || 'Regular Meeting'}</div>
                    </div>
                </div>
            </div>
            
            ${description ? `
            <div class="description-box">
                <h3 class="description-title">Meeting Description</h3>
                <p class="description-text">${description}</p>
            </div>
            ` : ''}
            
            <div class="invitees-section">
                <h3 class="invitees-title">Invited Participants (${validInvitees.length})</h3>
                <div class="invitees-list">
                    ${validInvitees.map(email => `
                        <span class="invitee-tag">${email}</span>
                    `).join('')}
                </div>
            </div>
            
            <div class="button-container">
                <a href="${link}" class="join-button" style="background-color:#4f46e5;color:#ffffff !important;text-decoration:none;">&#127919; Join Meeting Now</a>
                <div class="action-links">
                    <a href="${generateCalendarLink({
                        title: meetingTitle,
                        description: description || '',
                        start: startDateTimeUTC,
                        end: endDateTimeUTC,
                        location: link
                    })}" class="action-link">
                        &#128197; Add to Calendar
                    </a>
                    <a href="mailto:${creatorEmail}?subject=Regarding: ${meetingTitle}" class="action-link">
                        &#9993; Email Host
                    </a>
                </div>
            </div>
            
            <div class="meeting-id">
                <strong>Meeting ID:</strong> ${roomId}<br>
                <strong>Meeting Link:</strong> <a href="${link}" style="color: #6366f1; word-break: break-all;">${link}</a>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated meeting invitation from ${creatorName}.</p>
            <p style="font-size: 13px; margin-top: 8px;">Please do not reply directly to this email. Contact the host for any changes.</p>
            <div class="footer-links">
                <a href="#" class="footer-link">Add to Google Calendar</a>
                <a href="#" class="footer-link">Add to Outlook</a>
                <a href="#" class="footer-link">Meeting Options</a>
            </div>
        </div>
    </div>
    </div>
</body>
</html>
`;

// Add this helper function in your backend
function generateCalendarLink({ title, description, start, end, location }) {
    const formatDate = (dateStr) => {
        return dateStr.replace(/[-:]/g, '').replace(' ', 'T') + 'Z';
    };
    
    const startFormatted = formatDate(start);
    const endFormatted = formatDate(end);
    
    // Generate Google Calendar link
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(description + '\\n\\nJoin link: ' + location)}&dates=${startFormatted}/${endFormatted}&location=${encodeURIComponent(location)}&sf=true&output=xml`;
    
    return googleCalendarUrl;
}

  await Promise.all(validInvitees.map(email => sendEmail({
    to: email,
    subject: emailSubject,
    html: emailBody,
    replyTo: creatorEmail
  })));

  console.log(`Invitations sent to: ${validInvitees.join(', ')}`);

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

// In your routes file (e.g., routes.js or index.js)
// Search endpoint (for partial matches)
router.get('/users/search', async (req, res) => {
  const { q } = req.query;
  
  if (!q || q.length < 3) {
    return res.json({ users: [] });
  }
  
  try {
    const [users] = await pool.execute(
      'SELECT name, email FROM pmx_users WHERE email LIKE ? OR name LIKE ? LIMIT 5',
      [`%${q}%`, `%${q}%`]
    );
    
    res.json({ users });
  } catch (err) {
    console.error('Error searching users:', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Exact email check endpoint (keep your existing one)
router.get('/users/check/:email', async (req, res) => {
  const { email } = req.params;
  console.log('Checking user existence for email:', email);
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const [users] = await pool.execute(
      'SELECT name, email FROM pmx_users WHERE email = ?',
      [email]
    );

    if (users.length > 0) {
      res.json({
        exists: true,
        name: users[0].name,
        email: users[0].email
      });
    } else {
      res.json({
        exists: false,
        name: null,
        email: email
      });
    }
  } catch (err) {
    console.error('Error checking user:', err);
    res.status(500).json({ error: 'Failed to check user' });
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


