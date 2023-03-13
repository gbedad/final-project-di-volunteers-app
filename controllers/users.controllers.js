import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Users from '../models/users.model.js';
import Missions from '../models/missions.model.js';
// import Mailgun from 'mailgun.js'
// import formData from 'form-data'
import nodemailer from 'nodemailer'
// import {google} from 'googleapis';
import sendEmail from '../config/sendEmails.js'


dotenv.config()

export const gotoHomePage = async (req, res) => {
    try {
        const missions = await Missions.findAll({
            attributes: ['title', 'description', 'location']
        })
        res.status(200).json({msg: "Connected to Home Page", missions: missions})
    }
    catch(e) {
        console.log(e)
        res.status(404).json({msg: 'Page not found'})
    }
}

export const createUser = async (req, res) => {

}

export const getUsers = async (req, res) => {
    try {
        const users = await Users.findAll({
            attributes: ['id', 'email', 'first_name', 'last_name', 'phone', 'status', 'created_at', 'updated_at', 'is_active', 'message'],
            include: ['mission']
    })
        res.json(users)
        }
    catch(err) {
        res.status(404).json({msg: err.message})
        }
    }

export const register = async (req, res) => {
        const {email, password, first_name, last_name, phone, birth_date, message, mission_id} = req.body;

        const salt = await bcrypt.genSalt();
        const hashPassword = await bcrypt.hash(password, salt);

    try {
        await Users.create({
            email: email.toLowerCase(),
            password: hashPassword,
            first_name: first_name,
            last_name: last_name,
            phone: phone,
            birth_date: birth_date,
            message: message,
            missionId: mission_id
        });
        sendEmail(email, 'Registration confirmed', 'Thank you for registering on our platform')

        res.status(200).json({msg: 'Register Successful'})
        
    }
    catch(e) {
        console.log(e);
        res.status(404).json({msg: e.message})
    }
}

export const updateUser = async (req, res) => {
    const id = req.params.id;
    console.log(req.body);
    Users.update(req.body, {
        where: { id: id }
    })
        .then(num => {
        if (num == 1) {
            res.send({
            message: "User was updated successfully."
            });
        } else {
            res.send({
            message: `Cannot update User with id=${id}. Maybe User was not found or req.body is empty!`
            });
        }
        })
        .catch(err => {
        res.status(500).send({
            message: "Error updating User with id=" + id
        });
    });
}



export const login = async (req, res) => {
    try {
        const user = await Users.findOne(
            {
                where: {
                    email: req.body.email.toLowerCase()
                }
            }
        );
        const match = await bcrypt.compare(
            req.body.password,
            user.password
            );
        if (!match) return res.status(400).json({msg: 'Wrong password'})
        const userid = user.id;
        const email = user.email;
        const token = jwt.sign(
            {
                userid,
                email
            },
            `${process.env.ACCESS_SECRET_TOKEN}`,
            {
                expiresIn:'300s'
            }
            )
        res.cookie('accesstoken', token, {
            httpOnly: true,
            maxAge: 300 * 1000
        })
        res.json({token:token, user: user});
    }
    catch (error) {
        console.log(error);
        res.status(404).json({msg:'Email not found'});
    }
}


export const deleteRegistration = async (req, res) => {
    console.log(req.params.id);
    try {
        const count = await Users.destroy({ where: { id: req.params.id } }); 
        console.log(`deleted row(s): ${count}`);
        res.status(200).json({msg: `You have cancelled your registration.`})
    } catch (error) {
        console.log(error);
        res.status(404).json({msg:'Email not found'});
    }
}