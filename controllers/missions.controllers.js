import Missions from '../models/missions.model.js';
import fs from 'fs';

// Controller function to get the list of missions
export const getMissions = async (req, res) => {
  try {
    // Fetch all missions from the database
    const missions = await Missions.findAll({
      attributes: [
        'id',
        'title',
        'location',
        'description',
        'image_name',
        'image_type',
        'image_data',
        'created_at',
        'updated_at',
        'is_active',
      ],

      order: [['title', 'asc']],
    });

    if (missions) {
      console.log('=========???????');
    }
    await missions.map((mission) => {
      if (mission.image_data) {
        console.log(mission.image_data);
      }
    });
    console.log('====>>', missions);
    // Send missions as JSON response
    res.status(201).json(missions);
  } catch (error) {
    console.error(error);
    // Send error response with appropriate status code and error message
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
};

export const getAllMissions = async (req, res) => {
  try {
    // Fetch all missions from the database
    const missions = await Missions.findAll({
      attributes: [
        'id',
        'title',
        'location',
        'description',
        'image_name',
        'image_type',
        'image_data',
        'created_at',
        'updated_at',
        'is_active',
      ],
      order: [['id', 'asc']],
    });

    if (missions) {
      console.log('=========???????');
    }
    await missions.map((mission) => {
      if (mission.image_data) {
        console.log(mission.image_data);
      }
    });
    console.log('====>>', missions);
    // Send missions as JSON response
    res.status(201).json(missions);
  } catch (error) {
    console.error(error);
    // Send error response with appropriate status code and error message
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
};

// Controller function for creating a new mission
export const createMission = async (req, res) => {
  const { title, description, location, is_active } = req.body;

  // const imageType= req.file.mimetype
  // const imageName= req.file.originalname
  // const imageData= req.file.buffer

  try {
    // Extract mission data from request body
    console.log('====>>', req.file.originalname);

    if (!req.file.originalname) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Create a new mission using Sequelize model
    const newMission = await Missions.create({
      title,
      description,
      location,
      image_type: req.file.mimetype,
      image_name: req.file.originalname,
      image_data: req.file.location,
      is_active,
    });
    console.log(Buffer.from(newMission.image_data));
    // Send success response
    return res.status(201).json({ success: true, data: newMission });
  } catch (err) {
    // Handle error
    console.error(err);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to create mission' });
  }
};

// Controller function for updating a mission
export const updateMission = async (req, res) => {
  // Extract mission data from request body
  const { id } = req.params;
  const { title, description, location, is_active } = req.body;

  try {
    // Find the mission to update by ID using Sequelize
    const existingMission = await Missions.findByPk(id);

    if (!existingMission) {
      // If mission not found, send error response
      return res
        .status(404)
        .json({ success: false, error: 'Mission not found' });
    }

    // Update mission with new data
    existingMission.title = title;
    existingMission.description = description;
    existingMission.location = location;
    if (req.file) {
      existingMission.image_type = req.file.mimetype;

      existingMission.image_data = req.file.location;

      existingMission.image_name = req.file.originalname;
    }

    existingMission.is_active = is_active;

    // Save the updated mission
    await existingMission.save();

    // Send success response
    return res.status(200).json({ success: true, data: existingMission });
  } catch (err) {
    // Handle error
    console.error(err);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to update mission' });
  }
};
