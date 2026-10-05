import Users from '../models/users.model.js';
import {
  academicYear,
  availableYears,
  isAcademicYear,
  sortYears,
} from '../services/cohorts.js';

export const getCohorts = async (req, res) => {
  try {
    const user = await Users.findByPk(req.params.userId, {
      attributes: ['id', 'cohorte_year', 'validated_at', 'status', 'is_active'],
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      years: sortYears(user.cohorte_year || []),
      validated_at: user.validated_at,
      current: academicYear(),
      available: availableYears(),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not load the cohorts' });
  }
};

// Body: { years: ['2024/2025', ...] } — manual correction by an admin
export const updateCohorts = async (req, res) => {
  const { years } = req.body;
  try {
    if (!Array.isArray(years) || !years.every(isAcademicYear)) {
      return res.status(400).json({ error: 'Années invalides' });
    }
    const user = await Users.findByPk(req.params.userId, { attributes: ['id'] });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await Users.update(
      { cohorte_year: sortYears(years) },
      { where: { id: user.id } }
    );
    res.json({ years: sortYears(years) });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Could not update the cohorts' });
  }
};
