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

async function send(receivers, subject, text) {
  const result = await transporter.sendMail({
    from: 'My Cogniverse<gerald.berrebi@gmail.com',
    to: receivers,
    subject: subject,
    html: text,
  });

  console.log(JSON.stringify(result, null, 4));
}

export default send;
