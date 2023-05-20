import Missions from '../models/missions.model.js';


// Controller function to get the list of missions
export const getMissions = async (req, res) => {
  try {
    // Fetch all missions from the database
    const missions = await Missions.findAll();

    // Send missions as JSON response
    res.json(missions);
  } catch (error) {
    console.error(error);
    // Send error response with appropriate status code and error message
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
};

// Controller function for creating a new mission
export const createMission = async (req, res) => {
  try {
    // Extract mission data from request body
    const { title, description, location, is_active } = req.body;

    // Create a new mission using Sequelize model
    const mission = await Missions.create({
      title,
      description,
      location,
      is_active
    });

    // Send success response
    return res.status(201).json({ success: true, data: mission });
  } catch (err) {
    // Handle error
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to create mission' });
  }
};

// Controller function for updating a mission
export const updateMission = async (req, res) => {
  try {
    // Extract mission data from request body
    const { id, title, description, location, is_active } = req.body;

    // Find the mission to update by ID using Sequelize
    const mission = await Missions.findByPk(id);

    if (!mission) {
      // If mission not found, send error response
      return res.status(404).json({ success: false, error: 'Mission not found' });
    }

    // Update mission with new data
    mission.title = title;
    mission.description = description;
    mission.location = location;
    mission.is_active = is_active;

    // Save the updated mission
    await mission.save();

    // Send success response
    return res.status(200).json({ success: true, data: mission });
  } catch (err) {
    // Handle error
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to update mission' });
  }
};

