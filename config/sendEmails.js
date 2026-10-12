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
// options.essential: sent even during a pause of the volunteers' e-mails
// (password reset)
async function send(receivers, subject, text, attachments, options = {}) {
  let to = receivers;
  if (!options.essential) {
    // Imported here: the pause reads the database, the transport doesn't
    const { splitRecipients, withhold } = await import('../services/emailPause.js');
    const { send: recipients, withheld } = await splitRecipients(receivers);
    if (withheld.length) {
      await withhold(withheld, subject, text);
      console.log(`E-mail withheld (pause): ${withheld.join(', ')} - ${subject}`);
    }
    if (!recipients.length) return { withheld };
    to = recipients;
  }
  const result = await transporter.sendMail({
    from: 'MyCogniverse <gerald.berrebi@gmail.com>',
    to,
    subject: subject,
    html: text,
    ...(attachments ? { attachments } : {}),
  });

  console.log(JSON.stringify(result, null, 4));
  return result;
}

export default send;
