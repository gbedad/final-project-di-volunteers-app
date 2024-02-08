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
import dayjs from 'dayjs';

dotenv.config();

// Function to capitalize the first letter of a string
const capitalizeString = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
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
        'email2',
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

export const register = async (req, res) => {
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
  // Check if the email already exists in the database
  console.log(email);
  const existingUser = await Users.findOne({
    where: {
      email: email,
    },
  });
  // console.log('>>>>', existingUser);

  if (existingUser) {
    // Email already exists, return an error response
    return res
      .status(409)
      .json({ error: 'Email already exists. Please use a different email.' });
  }

  const serverTimezone = new Date().getTimezoneOffset();
  console.log('Server Timezone Offset:', serverTimezone);
  console.log('Date received:', birth_date);

  const newDate = addHours(new Date(birth_date), 2);
  console.log(newDate);

  // const localDate = dayjs(birth_date).tz('Europe/Paris');
  const firstname = capitalizeString(first_name);
  const lastname = capitalizeString(last_name);
  // console.log('Controllers.register', req.body);
  const salt = await bcrypt.genSalt();
  const hashPassword = await bcrypt.hash(password, salt);

  try {
    await Users.create({
      email: email.toLowerCase(),
      password: hashPassword,
      first_name: firstname,
      last_name: lastname,
      phone,
      birth_date: newDate,
      message,
      mission_id,
    });
    sendEmail(
      email,
      'Inscription confirmée',
      "Merci de vous être inscrit(e) sur notre plateforme. Vous pouvez dès à présent vous connecter sur <a href='https://mycogniverse.org'>MyCogniverse</a> à l'aide de votre email et votre mot de passe"
    );

    sendEmail(
      [
        'gerald.berrebi@gmail.com',
        'gerald@sephoraberrebi.org',
        'associationsephoraberrebi@gmail.com',
        'noemie@sephoraberrebi.org',
      ],
      'Nouvelle inscription sur la plateforme MyCogniverse',
      `<h4>Cher adminsistrateur</h4>
      <p>Un nouveau tuteur s'est enregistré sur la plateforme pour la mission ${mission_id}:</p>
      <p>Email : ${email}</p>
      <p>Nom : ${first_name} ${last_name}</p>
      <p>Téléphone : ${phone}</p>
      <br>
      <p>A très vite.</p>`
    );

    res.status(200).json({ msg: 'Register Successful' });
  } catch (e) {
    console.log(e);
    res.status(404).json({ msg: e.message });
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
        expiresIn: '7d',
      }
    );
    res.cookie('accesstoken', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 3600 * 1000,
    });
    res.json({ token, user });
  } catch (error) {
    console.log(error);
    res.status(404).json({ msg: 'Email not found' });
  }
};

export const deleteRegistration = async (req, res) => {
  // console.log(req.params.id);
  try {
    const count = await Users.destroy({ where: { id: req.params.id } });
    console.log(`deleted row(s): ${count}`);
    res.status(200).json({ msg: `You have cancelled your registration.` });
  } catch (error) {
    console.log(error);
    res.status(404).json({ msg: 'Email not found' });
  }
};

export const logout = (req, res) => {
  res.clearCookie('accesstoken').json({ response: 'You are Logged Out' });
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
    sendEmail(
      userEmail,
      'Changement de statut sur MyCogniverse',
      `<p>Cher(e) ${user.first_name} ${user.last_name}</p>
      <p>Votre statut a changé.</p>
      <p>Il est passé à : "${newStatus}".</p>
      <p>Veuillez vous connecter sur le site <a href=mycogniverse.org>mycogniverse.org</a> pour connaitre les prochaines étapes.</p>
    
      <p>A très vite,</p>
      <p>L'équipe de MyCogniverse</p>
      `
    );

    res.json({ message: 'Row updated successfully.', updatedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating row.' });
  }
};

export const setActiveUser = async (req, res) => {
  const userId = req.params.id; // get the ID of the record to update from the request parameters
  const { newIsActive } = req.body;
  try {
    const record = await Users.findOne({
      where: {
        id: userId,
      },
    }); // find the record in the database by its ID
    if (!record) {
      return res.status(404).json({ error: 'Record not found' }); // return an error response if the record doesn't exist
    }
    const updatedRecord = await record.update({ is_active: newIsActive }); // update the is_active field to false
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
    if (street !== userProfile.street || activity !== userProfile.activity) {
      sendEmail(
        [
          'gerald.berrebi@gmail.com',
          'associationsephoraberrebi@gmail.com',
          'noemie@sephoraberrebi.org',
        ],
        'Ajout adresse ou activité sur MyCogniverse',
        `<h4>Cher adminsistrateur</h4>
        <p>Un tuteur a mis à jour son profil:</p>
        <p>Id du tuteur : ${userId}</p>
        <p>${
          street && street !== userProfile.street
            ? street + ' ' + city + ' ' + zipcode
            : ''
        }</p>
        <p>${activity && activity !== userProfile.activity ? activity : ''}</p>
        <br>
        <p>A très vite.</p>`
      );
    }

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

    const link = `https://mycogniverse.org/reset-password/${oldUser.id}/${token}`;

    sendEmail(
      email,
      'Changement de mot de passe',
      `<h4>Cher(e) ${oldUser.first_name},</h4>
      <p>Vous avez demandé le changement de votre mot de passe. Pour le changer, il suffit de cliquer sur ce lien :${link}.</p>
      <p>Attention, ce lien ne sera valide que pendant 5 minutes.</p>
      <p>A très vite.</p>`
    );
    console.log(link);
    res.status(201).json({ message: 'Email sent successfully', status: 201 });
  } catch (error) {
    console.log(error);
    res.status(401).json({ message: 'Invalid user', status: 401 });
  }
};

export const resetPasswordVerify = async (req, res) => {
  const { id, token } = req.params;
  // console.log(req.params);
  const oldUser = await Users.findOne({ where: { id: id } });
  // console.log('====>>', oldUser);
  if (!oldUser) {
    return res.json({ status: 'User Not Exists!!' });
  }
  const secret = process.env.ACCESS_TOKEN_SECRET + oldUser.password;
  try {
    const verify = jwt.verify(token, secret);
    // console.log(verify);
    if (oldUser && verify.id) {
      console.log(verify.email);
      return res.status(201).json({ status: 201, oldUser });
    } else {
      return res
        .status(401)
        .json({ status: 401, message: 'User does not exist' });
    }
  } catch (error) {
    console.log(error);
    return res.status(401).json({ status: 401, message: error.message });
  }
};

export const renewPassword = async (req, res) => {
  const { id, token } = req.params;
  const { password } = req.body;
  console.log(id);
  try {
    const oldUser = await Users.findOne({ where: { id: id } });
    if (!oldUser) {
      return res.json({ status: 'User Not Exists!!' });
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
