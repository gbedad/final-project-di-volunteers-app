import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'gerald.berrebi@gmail.com',
        pass: 'xzlduqnuujsxawij'
    }
});


async function send(receivers, subject, text) {
    const result = await transporter.sendMail({
        from: 'gerald.berrebi@gmail.com',
        to: receivers,
        subject: subject,
        text: text
    });

    console.log(JSON.stringify(result, null, 4));
}

export default send