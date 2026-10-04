import dotenv from 'dotenv';
import Skills from '../models/skills.model.js';
import Users from '../models/users.model.js';



dotenv.config();

export const createSkills = async (req, res) => {
  const { topics, when_day_slot, where_location, how_location } = req.body;

  const userId = req.params.userId;
  try {
    const skills = await Skills.findOne({
      where: {
        userId: userId,
      },
    });
    // console.log(skills.topics, skills.when_day_slot)
    if (!skills) {
      const skill = await Skills.create({
        topics,
        when_day_slot,
        where_location,
        how_location,
        userId,
      });
      res.json(skill);
    } else if (skills.topics) {
      skills.topics = topics;
      await skills.save();
    } else if (checkUser.when_day_slot) {
      await checkUser.update(when_day_slot);
    }
    res.json(checkUser);
  } catch (err) {
    res.status(404).json({ msg: err.message });
  }
};

// Saves the fields sent (the client saves each block on its own, as soon as
// it changes). No email here: the admins are notified once, when the
// volunteer sends the complete application.
const asArray = (value) =>
  Array.isArray(value) ? value : typeof value === 'string' ? JSON.parse(value) : [];

export const updateSkills = async (req, res) => {
  const { userId } = req.params;
  const body = req.body;
  try {
    const changes = {};
    if ('topics' in body) changes.topics = asArray(body.topics);
    if ('when_day_slot' in body) changes.when_day_slot = asArray(body.when_day_slot);
    if ('where_location' in body) {
      changes.where_location = Array.isArray(body.where_location)
        ? body.where_location
        : body.where_location
        ? [body.where_location]
        : [];
    }
    if ('availability' in body) changes.availability = body.availability;
    if ('how_location' in body) changes.how_location = body.how_location || '';
    if ('number_of_students' in body) {
      changes.number_of_students = Number(body.number_of_students) || null;
    }

    let skill = await Skills.findOne({ where: { userId } });
    if (skill) {
      await skill.update(changes);
    } else {
      skill = await Skills.create({
        topics: [],
        when_day_slot: [],
        where_location: [],
        ...changes,
        userId,
      });
    }
    res.status(200).json({ message: 'Enregistré', skill });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSkill = async (req, res) => {
  const userSkill = await Skills.findOne({
    where: {
      userId: req.params.userId,
    },
  });
  if (userSkill) {
    await userSkill.destroy();
    res.send('Skill deleted');
  } else {
    res.status(404).send('Skill not found');
  }
};
