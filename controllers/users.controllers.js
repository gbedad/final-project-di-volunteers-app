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
import { onMembershipChange } from '../services/cohorts.js';
import { recordStatusChange } from '../services/statusHistory.js';
import {
  notifyConventionToSign,
  notifyApplicationValidated,
} from '../services/convention.js';

// Limits of the "why do you apply" text (same as the client)
const MOTIVATION_MIN = 15;
const MOTIVATION_MAX = 1000;
import { deleteStoredFile } from '../config/aws.config.js';
import { formatName } from '../services/names.js';
import { availabilityOf, usedPlaces } from '../services/availability.js';
import { conventionState } from '../services/application.js';

dotenv.config();

// Function to capitalize the first letter of a string
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
        'is_available',
        'genre',
        'cohorte_year',
        'unavailable_until',
        'paper_documents',
        'is_demo',
      ],
      include: ['mission', 'skill', 'file'],
      where: {
        role: 'volunteer',
      },
      order: [['created_at', 'desc']],
    });
    // Can each tutor take a new student now (computed)
    const used = await usedPlaces(users.map((u) => u.id));
    res.json(
      users.map((u) => {
        const user = u.toJSON();
        return {
          ...user,
          availability: availabilityOf(user, used[u.id] || 0),
          // to_sign / to_countersign / complete, with the dates
          convention: conventionState(
            user.file || [],
            (user.paper_documents || []).includes('convention')
          ),
        };
      })
    );
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
    const motivation = String(message || '').trim();
    if (
      motivation.length < MOTIVATION_MIN ||
      motivation.length > MOTIVATION_MAX
    ) {
      return res.status(400).json({
        error: `La motivation doit faire entre ${MOTIVATION_MIN} et ${MOTIVATION_MAX} caractères`,
      });
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
    const firstname = formatName(first_name);
    const lastname = formatName(last_name);
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

    await recordStatusChange(newUser.id, null, newUser.status);

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
    // Former volunteer: account kept, but no access any more
    if (user.status === 'Archivé') {
      return res.status(403).json({
        code: 'archived',
        msg: "Votre compte est archivé. Pour reprendre votre engagement, contactez l'association.",
      });
    }
    const userid = user.id;
    const email = user.email;
    const role = user.role;
    const now = new Date();
    await Users.update(
      { last_login_at: now, last_seen_at: now },
      // silent: updated_at stays the date of the last change of the profile
      { where: { id: userid }, silent: true }
    );
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
        // Renews the 1-day access token without logging in again
        expiresIn: '7d',
      }
    );

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

// Never sent to anyone
const PRIVATE_FIELDS = ['password'];
// Team notes about the volunteer, not shown to the volunteer
const STAFF_ONLY_FIELDS = ['interviews', 'pre_interview', 'internal_thread'];

// Allowed for the account owner and the team (route: selfOrAdmin)
export async function getUserById(req, res) {
  try {
    const hidden =
      req.user?.role === 'volunteer'
        ? [...PRIVATE_FIELDS, ...STAFF_ONLY_FIELDS]
        : PRIVATE_FIELDS;
    const user = await Users.findOne({
      where: { id: req.params.id },
      attributes: { exclude: hidden },
      include: ['mission', 'skill', 'file'],
    });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    // Can this tutor take a new student now (computed)
    const data = user.toJSON();
    const used = await usedPlaces([user.id]);
    return res.json({ ...data, availability: availabilityOf(data, used[user.id] || 0) });
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

    // First validation: validation date and cohort of the academic year
    await recordStatusChange(user.id, user.status, newStatus, req.user.userid);
    // Interview passed: the volunteer is invited to sign the convention
    if (newStatus === 'A finaliser' && user.status !== 'A finaliser') {
      notifyConventionToSign(user);
    }
    // Welcome email to the new tutor
    if (newStatus === 'Validé' && user.status !== 'Validé') {
      notifyApplicationValidated(user);
    }
    await onMembershipChange(id, { justValidated: newStatus === 'Validé' });
    res.json({ message: 'Row updated successfully.', status: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating row.' });
  }
};

// Statuses an admin can choose (same list as the client)
export const STATUSES = [
  'Compte créé',
  'A renseigner',
  'A télécharger',
  'A interviewer',
  'A finaliser',
  'Validé',
  'A conserver',
  'Déclinée',
];

// Several volunteers at once from the dashboard.
// Body: { ids: [1, 2], status?: 'Déclinée', is_active?: false }
export const bulkUpdateUsers = async (req, res) => {
  const ids = [...new Set((req.body.ids || []).map(Number))].filter(Boolean);
  const { status, is_active, is_demo } = req.body;
  const changes = {};
  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Statut inconnu' });
    }
    changes.status = status;
  }
  if (is_active !== undefined) changes.is_active = !!is_active;
  // Fake volunteer used for trials (label "Démo", left out of the analysis)
  if (is_demo !== undefined) changes.is_demo = !!is_demo;
  if (!ids.length || !Object.keys(changes).length) {
    return res.status(400).json({ error: 'Rien à modifier' });
  }
  try {
    // Only volunteers: team accounts are managed on the Team page
    const users = await Users.findAll({
      where: { id: ids, role: 'volunteer' },
      attributes: [
        'id',
        'status',
        'first_name',
        'email',
        'email2',
        'honorability_received',
      ],
    });
    for (const user of users) {
      await Users.update(changes, { where: { id: user.id } });
      if (status !== undefined) {
        await recordStatusChange(user.id, user.status, status, req.user.userid);
        if (status === 'A finaliser' && user.status !== 'A finaliser') {
          notifyConventionToSign(user);
        }
        if (status === 'Validé' && user.status !== 'Validé') {
          notifyApplicationValidated(user);
        }
      }
      await onMembershipChange(user.id, {
        justValidated: status === 'Validé' && user.status !== 'Validé',
      });
    }
    res.json({ updated: users.map((u) => u.id), ...changes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Modification impossible' });
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
    await onMembershipChange(record.id);
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
      userProfile.first_name = formatName(first_name);
    }
    if (last_name) {
      userProfile.last_name = formatName(last_name);
    }
    // The alternative e-mail is optional: an empty value removes it
    if (email2 !== undefined) {
      userProfile.email2 = email2 ? email2.trim() : null;
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
      if (String(message).trim().length > MOTIVATION_MAX) {
        return res
          .status(400)
          .json({ message: `${MOTIVATION_MAX} caractères maximum` });
      }
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

    // Only the confirmation: the full record (password hash…) stays here
    return res.status(200).json({ message: 'Profile updated successfully' });
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

// Body: { until: 'YYYY-MM-DD' } or { until: null }: the tutor is not
// available for a new student until that date (by the tutor or the team)
export const setUnavailableUntil = async (req, res) => {
  const { until } = req.body;
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(until))) {
    return res.status(400).json({ error: 'Date invalide' });
  }
  if (until && until < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'La date est déjà passée' });
  }
  try {
    const [updated] = await Users.update(
      { unavailable_until: until || null },
      { where: { id: req.params.id, role: 'volunteer' } }
    );
    if (!updated) return res.status(404).json({ error: 'Bénévole introuvable' });
    res.json({ unavailable_until: until || null });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "La disponibilité n'a pas pu être enregistrée" });
  }
};
