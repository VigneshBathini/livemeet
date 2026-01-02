const nodemailer = require('nodemailer');


// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST, 
//   port: process.env.SMTP_PORT || 465, 
//   secure: true, 
//   auth: {
//     user: process.env.SMTP_USER, 
//     pass: process.env.SMTP_PASS, 
//   },
// });


//render SMTP settings
// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: 587,
//   secure: false, // MUST be false for 587 its for render
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS,
//   },
//    connectionTimeout: 10000,
//   // tls: {
//   //   rejectUnauthorized: false,  
//   // },
 
// });

//render jan2
const transporter = nodemailer.createTransport({
  // host: "smtp.gmail.com", // or smtp.office365.com
  // port: 587,
  // secure: false,
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 20000, // ⬅️ increase
  greetingTimeout: 20000,
  socketTimeout: 30000,
});



const sendEmail = async ({ to, subject, text, html,replyTo }) => {
  try {
    const info = await transporter.sendMail({
      from: `"Livemeet" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
      replyTo
    });
    console.log('Email sent:', info.messageId);
    return info;
  } catch (err) {
    console.error('Error sending email:', err);
    throw err;
  }
};

module.exports = { sendEmail };
