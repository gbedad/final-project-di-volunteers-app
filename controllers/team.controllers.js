import { Op, literal } from 'sequelize';
import jwt from 'jsonwebtoken';
import Users from '../models/users.model.js';
import sendEmail from '../config/sendEmails.js';

export const ROLES = ['volunteer', 'interviewer', 'admin', 'superadmin'];

const PUBLIC_FIELDS = ['id', 'first_name', 'last_name', 'email', 'role'];

// Which role changes the current user is allowed to make on the target
const canChangeRole = (actor, target, newRole) => {
  if (actor.role === 'superadmin') return true;
  // Admins can only switch people between volunteer and interviewer
  const editable = ['volunteer', 'interviewer'];
  return (
    actor.role === 'admin' &&
    editable.includes(target.role) &&
    editable.includes(newRole)
  );
};

const STAFF_ROLE_LABELS = {
  interviewer: 'interviewer',
  admin: 'administrateur',
  superadmin: 'super-administrateur',
};

const clientUrl = () =>
  (process.env.CLIENT_URL || 'https://www.mycogniverse.org').replace(/\/$/, '');

const capitalize = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])\S/g, (letter) => letter.toUpperCase());

// Same secret as the password reset: the link stops working once a
// password has been chosen (the stored hash changes)
const sendInvitation = async (user, inviter) => {
  const secret = process.env.ACCESS_TOKEN_SECRET + user.password;
  const token = jwt.sign({ email: user.email, id: user.id }, secret, {
    expiresIn: '7d',
  });
  const link = `${clientUrl()}/reset-password/${user.id}/${token}?invitation=1`;
  await sendEmail(
    user.email,
    "Invitation à rejoindre l'équipe MyCogniverse",
    `<p>Bonjour ${user.first_name},</p>
    <p>${inviter.first_name} ${inviter.last_name} vous invite à rejoindre l'équipe MyCogniverse de l'association Séphora Berrebi en tant qu'<b>${STAFF_ROLE_LABELS[user.role]}</b>.</p>
    <p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#00695c;color:#fff;text-decoration:none;border-radius:4px">Choisir mon mot de passe</a></p>
    <p>Ce lien est valable 7 jours. Vous pourrez ensuite vous connecter avec votre e-mail (${user.email}) et ce mot de passe.</p>`
  );
};

export const getTeam = async (req, res) => {
  try {
    const team = await Users.findAll({
      where: { role: { [Op.ne]: 'volunteer' } },
      attributes: [...PUBLIC_FIELDS, [literal('password IS NULL'), 'pending']],
      order: [
        ['role', 'ASC'],
        ['last_name', 'ASC'],
      ],
    });
    res.json(team);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load the team' });
  }
};

export const findUserByEmail = async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    const user = await Users.findOne({
      where: { email },
      attributes: PUBLIC_FIELDS,
    });
    if (!user) {
      return res.status(404).json({ error: 'Aucun compte avec cet e-mail' });
    }
    res.json(user);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Search failed' });
  }
};

export const updateUserRole = async (req, res) => {
  const { role } = req.body;
  const actor = req.user;
  try {
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rôle inconnu' });
    }
    const target = await Users.findByPk(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    if (target.id === actor.userid) {
      return res
        .status(403)
        .json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });
    }
    if (!canChangeRole(actor, target, role)) {
      return res
        .status(403)
        .json({ error: "Vous n'avez pas le droit de faire ce changement" });
    }
    if (target.role === 'superadmin' && role !== 'superadmin') {
      const superadmins = await Users.count({ where: { role: 'superadmin' } });
      if (superadmins <= 1) {
        return res
          .status(409)
          .json({ error: 'Il doit rester au moins un superadmin' });
      }
    }
    target.role = role;
    await target.save();
    console.log(`Role of user ${target.id} set to ${role} by user ${actor.userid}`);
    res.json({
      id: target.id,
      first_name: target.first_name,
      last_name: target.last_name,
      email: target.email,
      role: target.role,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not change the role' });
  }
};

// Roles a manager can give to a new member
const invitableRoles = (actor) =>
  actor.role === 'superadmin'
    ? ['interviewer', 'admin', 'superadmin']
    : actor.role === 'admin'
    ? ['interviewer']
    : [];

export const inviteMember = async (req, res) => {
  const { first_name, last_name, role } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  try {
    if (!first_name?.trim() || !last_name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Prénom, nom et e-mail valides requis' });
    }
    if (!invitableRoles(req.user).includes(role)) {
      return res
        .status(403)
        .json({ error: "Vous n'avez pas le droit d'inviter avec ce rôle" });
    }
    const existing = await Users.findOne({
      where: { email },
      attributes: PUBLIC_FIELDS,
    });
    if (existing) {
      return res.status(409).json({
        error: 'Un compte existe déjà avec cet e-mail : changez plutôt son rôle',
        user: existing,
      });
    }
    const inviter = await Users.findByPk(req.user.userid);
    const member = await Users.create({
      email,
      first_name: capitalize(first_name),
      last_name: capitalize(last_name),
      role,
      password: null,
    });
    console.log(`User ${member.id} invited as ${role} by user ${inviter.id}`);
    try {
      await sendInvitation(member, inviter);
    } catch (err) {
      console.log('Invitation email not sent:', err.message);
      return res.status(502).json({
        error: "Compte créé, mais l'e-mail n'a pas pu être envoyé : utilisez « Renvoyer »",
      });
    }
    res.status(201).json({ id: member.id });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'invitation a échoué" });
  }
};

export const resendInvitation = async (req, res) => {
  try {
    const member = await Users.findByPk(req.params.id);
    if (!member || member.password !== null) {
      return res
        .status(404)
        .json({ error: 'Aucune invitation en attente pour ce compte' });
    }
    if (!invitableRoles(req.user).includes(member.role)) {
      return res.status(403).json({ error: "Vous n'avez pas le droit de faire cela" });
    }
    const inviter = await Users.findByPk(req.user.userid);
    await sendInvitation(member, inviter);
    res.json({ message: 'Invitation renvoyée' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'e-mail n'a pas pu être envoyé" });
  }
};
