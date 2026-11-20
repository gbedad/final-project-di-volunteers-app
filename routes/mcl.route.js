import crypto from 'crypto';
import express from 'express';
import { Op } from 'sequelize';
import Users from '../models/users.model.js';

const router = express.Router();

// Clé de l'application des Master Classes (variable MCL_API_KEY). Comparaison
// des empreintes, à temps constant ; sans clé configurée, la route est fermée.
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const mclAuth = (req, res, next) => {
  const expected = process.env.MCL_API_KEY;
  const given = req.headers['x-api-key'];
  if (!expected || !given || !crypto.timingSafeEqual(sha(given), sha(expected))) {
    return res.status(401).json({ error: 'Clé invalide' });
  }
  next();
};

// Bénévoles validés portant l'étiquette « Master Classe » (posée par l'équipe),
// hors démo et archivés. Identité et contact seulement : rien d'autre ne sort.
router.get('/api/mcl/benevoles', mclAuth, async (req, res) => {
  try {
    const users = await Users.findAll({
      where: { role: 'volunteer', status: 'Validé', is_demo: { [Op.not]: true }, archived_at: null },
      attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'engagements'],
      raw: true,
    });
    res.json(
      users
        .filter((u) => Array.isArray(u.engagements) && u.engagements.includes('masterclasses') && u.email)
        .map((u) => ({ id: u.id, prenom: u.first_name || '', nom: u.last_name || '', email: u.email, telephone: u.phone || '' }))
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Liste indisponible' });
  }
});

export default router;
