import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Users from '../models/users.model.js';
import Missions from '../models/missions.model.js';
import Skills from '../models/skills.model.js';
// import Mailgun from 'mailgun.js'
// import formData from 'form-data'
import nodemailer from 'nodemailer';
// import {google} from 'googleapis';
import sendEmail from '../config/sendEmails.js';
import { escapeHtml, clientUrl, adminEmails } from '../config/notify.js';
import dayjs from 'dayjs';
import { getAccessToken } from '../middlewares/verifyToken.js';
import Files from '../models/files.model.js';
import { deleteStoredFile } from '../config/aws.config.js';

dotenv.config();

// Function to capitalize the first letter of a string
const capitalizeString = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const capitalizeFamilyName = (fullname) => {
  const nameParts = fullname.split(/[\s-]+/);
  if (nameParts.length < 2) {
    return capitalizeString(fullname);
  }

  // Capitalize composed names
  const capitalizedNames = nameParts.map(
    (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  );

  // Reconstruct the name
  const separator = fullname.includes('-') ? '-' : ' ';
  const capitalizedFullname = capitalizedNames.join(separator);

  return capitalizedFullname;
};

export const gotoHomePage = async (req, res) => {
  try {
    const missions = await Missions.findAll({
      attributes: ['id', 'title', 'description', 'location'],
    });
    res.status(200).json(missions);
  } catch (e) {
    console.log(e);
    res.status(404).json({ msg: 'Page not found' });
  }
};

export const createUser = async (req, res) => {};

export const getUsers = async (req, res) => {
  // console.log('Reached all users', req);
  try {
    const users = await Users.findAll({
      attributes: [
        'id',
        'email',
        'first_name',
        'last_name',
        'phone',
        'status',
        'created_at',
        'updated_at',
        'is_active',
        'message',
        'role',
        'is_active',
        'id_received',
        'cv_received',
        'b3_received',
        'convention_received',
        'test_voltaire_passed',
        'activity',
        'interviews',
        'pre_interview',
        'email2',
        'internal_thread',
        'is_available',
        'genre',
        'cohorte_year',
      ],
      include: ['mission', 'skill', 'file'],
      where: {
        role: 'volunteer',
      },
      order: [['created_at', 'desc']],
    });
    // console.log(users);
    res.json(users);
    // if (users.role === 'volunteer') {
    //     res.json(users)
    // }
    // else {
    //     res.status(404).json({msg: 'Access denied'})
    // }
  } catch (err) {
    console.log('Catch error', err);
    res.status(404).json({ msg: err.message });
  }
};
// export const getUserById = async (req, res) => {
//   // console.log('Reached all users', req);
//   try {
//     const users = await Users.findOne({
//       include: ['mission', 'skill', 'file'],
//       where: {
//         id: userId,
//       },
//     });
//     console.log(user);
//     res.json(user);
//     // if (users.role === 'volunteer') {
//     //     res.json(users)
//     // }
//     // else {
//     //     res.status(404).json({msg: 'Access denied'})
//     // }
//   } catch (err) {
//     console.log('Catch error', err);
//     res.status(404).json({ msg: err.message });
//   }
// };

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

const notifyRegistration = async (user) => {
  const mission = user.mission_id
    ? await Missions.findByPk(user.mission_id, { attributes: ['id', 'title'] })
    : null;
  const missionTitle = mission ? escapeHtml(mission.title) : 'non précisée';
  const url = clientUrl();

  await sendEmail(
    user.email,
    'Inscription confirmée',
    `<p>Bonjour ${escapeHtml(user.first_name)},</p>
    <p>Merci de vous être inscrit(e) sur MyCogniverse. Vous pouvez dès à présent vous connecter sur <a href="${url}/login">MyCogniverse</a> avec votre e-mail et votre mot de passe pour suivre l'avancement de votre candidature.</p>
    <p>A très vite.</p>`
  );

  await sendEmail(
    adminEmails(),
    `Nouvelle candidature : ${user.first_name} ${user.last_name}`,
    `<h4>Nouvelle inscription sur MyCogniverse</h4>
    <p><b>Mission :</b> <a href="${url}/missions">${missionTitle}</a></p>
    <p><b>Nom :</b> ${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}<br>
    <b>Email :</b> ${escapeHtml(user.email)}<br>
    <b>Téléphone :</b> ${escapeHtml(user.phone)}</p>
    <p><b>Motivation :</b><br>${escapeHtml(user.message).replace(/\n/g, '<br>')}</p>
    <p><a href="${url}/login?candidat=${user.id}" style="display:inline-block;padding:10px 16px;background:#00695c;color:#fff;text-decoration:none;border-radius:4px">Voir la fiche du candidat</a></p>`
  );
};

export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      first_name,
      last_name,
      phone,
      birth_date,
      message,
      mission_id,
    } = req.body;

    const missing = ['email', 'password', 'first_name', 'last_name', 'phone', 'birth_date']
      .filter((field) => !req.body[field] || !String(req.body[field]).trim());
    if (missing.length > 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Missing or invalid fields', missing });
    }

    // Check if the email already exists in the database
    const existingUser = await Users.findOne({
      where: {
        email: email.toLowerCase(),
      },
    });

    if (existingUser) {
      return res
        .status(409)
        .json({ error: 'Email already exists. Please use a different email.' });
    }

    const newDate = addHours(new Date(birth_date), 2);
    const firstname = capitalizeFamilyName(first_name);
    const lastname = capitalizeFamilyName(last_name);
    const salt = await bcrypt.genSalt();
    const hashPassword = await bcrypt.hash(password, salt);

    const newUser = await Users.create({
      email: email.toLowerCase(),
      password: hashPassword,
      first_name: firstname,
      last_name: lastname,
      phone,
      birth_date: newDate,
      message,
      mission_id,
      // The volunteer can fill in the application right away
      status: 'A renseigner',
    });

    // Answer first: a failing email must not make the registration fail
    res.status(201).json({ msg: 'Register Successful', userId: newUser.id });

    notifyRegistration(newUser).catch((err) =>
      console.error('Registration emails not sent:', err.message)
    );
    return;
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'An error occurred during registration. Please try again.',
    });
  }
};

export const updateUser = async (req, res) => {
  const id = req.params.id;
  // console.log(req.body);
  Users.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        res.send({
          message: 'User was updated successfully.',
        });
      } else {
        res.send({
          message: `Cannot update User with id=${id}. Maybe User was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      res.status(500).send({
        message: 'Error updating User with id=' + id,
      });
    });
};

export const checkToken = (req, res) => {
  const token = getAccessToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Token is invalid or expired' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err) => {
    if (err) {
      return res.status(401).json({ message: 'Token is invalid or expired' });
    }

    res.status(200).json({ message: 'Token is valid' });
  });
};

export const refreshTokenFunc = (req, res) => {
  const refreshToken = req.body.refreshToken;
  console.log(refreshToken);
  if (!refreshToken) return res.sendStatus(401);

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    const accessToken = jwt.sign(
      {
        userId: user.userid,
        email: user.email,
        role: user.role,
      },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: '2d',
      }
    );
    return res.json({ accessToken });
  });
};

export const login = async (req, res) => {
  try {
    const user = await Users.findOne({
      where: {
        email: req.body.email.toLowerCase(),
      },
      include: ['mission', 'skill', 'file'],
    });
    const match = await bcrypt.compare(req.body.password, user.password);
    if (!match) return res.status(400).json({ msg: 'Wrong password' });
    const userid = user.id;
    const email = user.email;
    const role = user.role;
    const token = jwt.sign(
      {
        userid,
        email,
        role,
      },
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: '1d',
      }
    );

    const refreshToken = jwt.sign(
      { userid, email, role },
      process.env.REFRESH_TOKEN_SECRET,
      {
        expiresIn: '1d', // Refresh token expires in 7 days
      }
    );
    console.log('refresh', refreshToken);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,

      maxAge: 7 * 24 * 3600 * 1000,
      //   secure: true, // Uncomment if using HTTPS
      //   sameSite: 'none', // Uncomment if using cross-site requests
    });
    res.json({ token, user, refreshToken });
  } catch (error) {
    console.log(error);
    res.status(404).json({ msg: 'Email not found' });
  }
};

export const deleteRegistration = async (req, res) => {
  try {
    const target = await Users.findByPk(req.params.id, {
      include: [{ model: Files, as: 'file', attributes: ['id', 'path'] }],
    });
    if (!target) {
      return res.status(404).json({ msg: 'User not found' });
    }
    // Anyone can delete their own account; only a superadmin can delete
    // someone else's admin account; one superadmin must always remain
    const isSelf = target.id === Number(req.user.userid);
    if (
      !isSelf &&
      ['admin', 'superadmin'].includes(target.role) &&
      req.user.role !== 'superadmin'
    ) {
      return res.status(403).json({ msg: 'Not authorized' });
    }
    if (
      target.role === 'superadmin' &&
      (await Users.count({ where: { role: 'superadmin' } })) <= 1
    ) {
      return res.status(409).json({ msg: 'Il doit rester au moins un superadmin' });
    }
    // Remove the person's documents from storage, not only from the database
    for (const file of target.file) {
      await deleteStoredFile(file.path).catch((err) =>
        console.log('Could not delete from storage:', err.message)
      );
    }
    const count = await Users.destroy({ where: { id: target.id } });
    console.log(`deleted row(s): ${count}`);
    res.status(200).json({ msg: `You have cancelled your registration.` });
  } catch (error) {
    console.log(error);
    res.status(404).json({ msg: 'Email not found' });
  }
};

export const logout = (req, res) => {
  res.clearCookie('token').json({ response: 'You are Logged Out' });
};

export async function getUserById(req, res) {
  try {
    const user = await Users.findOne({
      where: { id: req.params.id },
      include: ['mission', 'skill', 'file'],
    });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: 'Internal server error',
    });
  }
}

export const updateById = async (req, res) => {
  const { id } = req.params;
  const { newStatus } = req.body; // use "newStatus" instead of "newFieldValue"
  console.log(newStatus);

  try {
    const user = await Users.findByPk(id);
    const userEmail = user.email;

    const [numUpdated, updatedRows] = await Users.update(
      { status: newStatus }, // set the "status" field to the new value
      { where: { id } }
    );

    if (numUpdated === 0) {
      return res.status(404).json({ message: 'No rows found for that ID.' });
    }
    console.log(userEmail);
    // sendEmail(
    //   userEmail,
    //   'Changement de statut sur MyCogniverse',
    //   `<p>Cher(e) ${user.first_name} ${user.last_name}</p>
    //   <p>Votre statut a changé.</p>
    //   <p>Il est passé à : "${newStatus}".</p>
    //   <p>Veuillez vous connecter sur le site <a href=mycogniverse.org>mycogniverse.org</a> pour connaitre les prochaines étapes.</p>

    //   <p>A très vite,</p>
    //   <p>L'équipe de MyCogniverse</p>
    //   `
    // );

    res.json({ message: 'Row updated successfully.', updatedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating row.' });
  }
};

export const setActiveUser = async (req, res) => {
  const userId = req.params.id; // get the ID of the record to update from the request parameters
  const { isActive } = req.body;
  try {
    const record = await Users.findOne({
      where: {
        id: userId,
      },
    }); // find the record in the database by its ID
    if (!record) {
      return res.status(404).json({ error: 'Record not found' }); // return an error response if the record doesn't exist
    }
    const updatedRecord = await record.update({ is_active: isActive }); // update the is_active field to false
    return res.json(updatedRecord); // return the updated record as a JSON response
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' }); // return an error response if something goes wrong
  }
};

// Controller method to update the fields based on checkbox value
export const updateReceivedFields = async (req, res) => {
  const {
    userId,
    cvReceived,
    idReceived,
    b3Received,
    conventionReceived,
    testVoltairePassed,
  } = req.body;
  // console.log('REQ.BODY===>>>', req.body);
  try {
    // Find the user by userId
    const user = await Users.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update the fields based on checkbox values
    user.cv_received = cvReceived || false;
    user.id_received = idReceived || false;
    user.b3_received = b3Received || false;
    user.convention_received = conventionReceived || false;
    user.test_voltaire_passed = testVoltairePassed || false;

    // Save the updated user
    await user.save();

    return res.status(200).json({ message: 'Fields updated successfully' });
  } catch (error) {
    console.error('Error updating fields:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveActivity = async (req, res) => {
  try {
    const { userId, selectedActivity } = req.body;
    const user = await Users.findByPk(userId);
    console.log('=====>>', userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.activity = selectedActivity;
    await user.save();
    return res.status(200).json({
      message: 'Activity updated successfully',
      content: selectedActivity,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Controller method to update the fields based on checkbox value
export const updateUserAddress = async (req, res) => {
  const {
    userId,
    streetSelected,
    citySelected,
    zipcodeSelected,
    countrySelected,
  } = req.body;
  // console.log('REQ.BODY===>>>', req.body);
  try {
    // Find the user by userId
    const user = await Users.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update the fields
    user.street = streetSelected;
    user.city = citySelected;
    user.zipcode = zipcodeSelected;
    user.country = countrySelected;

    // Save the updated user
    await user.save();

    return res.status(200).json({ message: 'Address updated successfully' });
  } catch (error) {
    console.error('Error updating fields:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const addUserInterviews = async (req, res) => {
  // console.log(req.body.interviews);
  const interviews = req.body.interviews;
  const userId = req.params.userId;
  try {
    const user = await Users.findByPk(userId);

    if (!user) {
      return res.status(401).json({ message: 'No user found' });
    }
    user.interviews = interviews.map((interview) => JSON.stringify(interview));

    await user.save();
    return res
      .status(200)
      .json({ message: 'Interviews saved successfully', data: interviews });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.massage });
  }
};

export const addUserPreInterview = async (req, res) => {
  console.log(req.body.preInterview);
  const preInterview = req.body.preInterview;
  const userId = req.params.userId;
  console.log(userId);
  try {
    const user = await Users.findByPk(userId);

    if (!user) {
      return res.status(401).json({ message: 'No user found' });
    }
    user.pre_interview = JSON.stringify(preInterview);

    await user.save();
    return res
      .status(200)
      .json({ message: 'Pre-Interview saved successfully' });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.massage });
  }
};

export const addUserInternalThread = async (req, res) => {
  console.log('message thread:', req.body);
  const messages = req.body;
  const userId = req.params.userId;
  console.log(userId);
  console.log(messages);
  try {
    const user = await Users.findByPk(userId);

    if (!user) {
      return res.status(401).json({ message: 'No user found' });
    }
    user.internal_thread = messages.map((message) => message);

    await user.save();
    return res
      .status(200)
      .json({ message: 'Internal thread saved successfully' });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

export const updateUserProfile = async (req, res) => {
  // console.log(req.body);
  const { userId } = req.params;
  const {
    first_name,
    last_name,
    email2,
    birth_date,
    phone,
    activity,
    street,
    city,
    zipcode,
    country,
    message,
    mission_id,
  } = req.body;
  try {
    const userProfile = await Users.findByPk(userId);
    if (!userProfile) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    // if (street !== userProfile.street || activity !== userProfile.activity) {
    //   sendEmail(
    //     [
    //       'gerald.berrebi@gmail.com',
    //       'associationsephoraberrebi@gmail.com',
    //       'noemie@sephoraberrebi.org',
    //     ],
    //     'Ajout adresse ou activité sur MyCogniverse',
    //     `<h4>Cher adminsistrateur</h4>
    //     <p>Un tuteur a mis à jour son profil:</p>
    //     <p>Id du tuteur : ${userId}</p>
    //     <p>${
    //       street && street !== userProfile.street
    //         ? street + ' ' + city + ' ' + zipcode
    //         : ''
    //     }</p>
    //     <p>${activity && activity !== userProfile.activity ? activity : ''}</p>
    //     <br>
    //     <p>A très vite.</p>`
    //   );
    // }

    // Update only the provided fields
    if (first_name) {
      userProfile.first_name = first_name;
    }
    if (last_name) {
      userProfile.last_name = last_name;
    }
    if (email2) {
      userProfile.email2 = email2;
    }
    if (birth_date) {
      userProfile.birth_date = birth_date;
    }
    if (phone) {
      userProfile.phone = phone;
    }
    if (activity) {
      userProfile.activity = activity;
    }
    if (message) {
      userProfile.message = message;
    }

    if (street) {
      userProfile.street = street;
    }

    if (city) {
      userProfile.city = city;
    }
    if (zipcode) {
      userProfile.zipcode = zipcode;
    }

    if (country) {
      userProfile.country = country;
    }
    if (mission_id) {
      userProfile.mission_id = mission_id;
    }

    // Save the updated profile
    await userProfile.save();

    return res
      .status(200)
      .json({ message: 'Profile updated successfully', userProfile });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Error updating user profile' });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const oldUser = await Users.findOne({ where: { email: email } });
    if (!oldUser) {
      return res.json({ status: 'User Not Exists!!' });
    }
    const secret = process.env.ACCESS_TOKEN_SECRET + oldUser.password;
    const token = jwt.sign({ email: oldUser.email, id: oldUser.id }, secret, {
      expiresIn: '300s',
    });

    const clientUrl = process.env.CLIENT_URL || 'https://www.mycogniverse.org';
    const link = `${clientUrl}/reset-password/${oldUser.id}/${token}`;

    // #3 wait for the email so failures are reported instead of crashing
    await sendEmail(
      email,
      'Changement de mot de passe',
      `<h4>Cher(e) ${oldUser.first_name},</h4>
      <p>Vous avez demandé le changement de votre mot de passe. Pour le changer, il suffit de cliquer sur ce lien :${link}.</p>
      <p>Attention, ce lien ne sera valide que pendant 5 minutes.</p>
      <p>A très vite.</p>`
    );
    res.status(201).json({ message: 'Email sent successfully', status: 201 });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "L'email n'a pas pu être envoyé", status: 500 });
  }
};

export const resetPasswordVerify = async (req, res) => {
  const { id, token } = req.params;
  try {
    const oldUser = await Users.findOne({ where: { id: id } });
    if (!oldUser) {
      return res.status(404).json({ status: 404, message: 'User Not Exists!!' });
    }
    const secret = process.env.ACCESS_TOKEN_SECRET + oldUser.password;
    const verify = jwt.verify(token, secret);
    if (verify.id) {
      // Only send what the reset page needs, never the password hash
      return res.status(201).json({ status: 201, email: verify.email });
    } else {
      return res
        .status(401)
        .json({ status: 401, message: 'User does not exist' });
    }
  } catch (error) {
    console.log(error.message);
    return res
      .status(401)
      .json({ status: 401, message: 'Lien invalide ou expiré' });
  }
};

export const renewPassword = async (req, res) => {
  const { id, token } = req.params;
  const { password } = req.body;
  try {
    const oldUser = await Users.findOne({ where: { id: id } });
    if (!oldUser) {
      return res.status(404).json({ status: 404, message: 'User Not Exists!!' });
    }
    const secret = process.env.ACCESS_TOKEN_SECRET + oldUser.password;

    const verify = jwt.verify(token, secret);
    const salt = await bcrypt.genSalt();
    const encryptedPassword = await bcrypt.hash(password, salt);
    await Users.update(
      {
        password: encryptedPassword,
      },
      {
        where: {
          id: oldUser.id,
        },
      }
    );

    res.status(201).json({ status: 201, email: verify.email });
  } catch (error) {
    console.log(error);
    res.status(401).json({ status: 'Something Went Wrong' });
  }
};

export const updateUserAvailability = async (req, res) => {
  try {
    const { userId, isAvailable } = req.body;

    // Validate input
    if (userId === undefined || isAvailable === undefined) {
      return res
        .status(400)
        .json({ message: 'User ID and availability status are required' });
    }

    // Find the user and update their availability
    const user = await Users.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the isAvailable field
    user.is_available = isAvailable;
    await user.save();

    // Send a success response
    res.status(200).json({
      message: 'User availability updated successfully',
      user: {
        id: user.id,
        isAvailable: user.isAvailable,
      },
    });
  } catch (error) {
    console.error('Error updating user availability:', error);
    res
      .status(500)
      .json({ message: 'An error occurred while updating user availability' });
  }
};
