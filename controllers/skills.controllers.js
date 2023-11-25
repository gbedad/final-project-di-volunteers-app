import dotenv from 'dotenv';
import Skills from '../models/skills.model.js';
import Users from '../models/users.model.js';

dotenv.config();

export const createSkills = async (req, res) => {
  const { topics, when_day_slot, where_location } = req.body;

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

export const updateSkills = async (req, res) => {
  console.log(req.params.userId);
  console.log(req.body);
  try {
    const userId = req.params.userId;
    // console.log("Route", req.body)
    // Find the record with the given id
    const skill = await Skills.findOne({
      where: {
        userId: userId,
      },
    });
    console.log(userId);

    if (!skill) {
      const skill = await Skills.create({
        topics: [req.body.topics] || null,
        when_day_slot: [req.body.when_day_slot] || null,
        where_location: [req.body.where_location] || null,
        userId,
      });
      return res.status(201).json(skill);
    }
    //   return res.status(404).json({ error: 'No skill was found' });
    // }
    // console.log('====>>>', skill);

    // Update the fields of the record based on the values present in the request body
    if (req.body.topics) {
      skill.topics = JSON.parse(req.body.topics);
    }
    // console.log(req.body.when_day_slot);
    if (req.body.when_day_slot) {
      skill.when_day_slot = JSON.parse(req.body.when_day_slot);
    }

    if (req.body.where_location) {
      skill.where_location = req.body.where_location;
    }

    // if (req.body.interview1_comments) {
    //   skill.interview1_comments = req.body.interview1_comments;
    // }

    // if (req.body.interview1_date) {
    //   skill.interview1_date = req.body.interview1_date;
    // }

    // if (req.body.interview2_comments) {
    //   skill.interview2_comments = req.body.interview2_comments;
    // }

    // if (req.body.interview2_date) {
    //   skill.interview2_date = req.body.interview2_date;
    // }

    // Save the updated record to the database
    await skill.save();

    // Return a success response
    res.status(200).json({ message: 'Skill updated successfully' });
  } catch (error) {
    console.log(error);
    // Return an error response if any error occurs during the update process
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
