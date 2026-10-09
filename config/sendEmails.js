import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD,
  },
});

// attachments (optional): [{ filename, content, contentType }]
async function send(receivers, subject, text, attachments) {
  const result = await transporter.sendMail({
    from: 'MyCogniverse <gerald.berrebi@gmail.com>',
    to: receivers,
    subject: subject,
    html: text,
    ...(attachments ? { attachments } : {}),
  });

  console.log(JSON.stringify(result, null, 4));
}

export default send;
