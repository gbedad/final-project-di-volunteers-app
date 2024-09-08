import dotenv from 'dotenv';

import axios from 'axios';

import Students from '../../models/students/students.model.js';

dotenv.config();

// Function to capitalize the first letter of a string
const capitalizeString = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const capitalizeFamilyName = (fullname) => {
  const nameParts = fullname.split(/[\s-]+/);
  if (nameParts.length < 2) {
    return capitalizeString(fullname);
  }

  // Capitalize composed names
  const capitalizedNames = nameParts.map(
    (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  );

  // Reconstruct the name
  const separator = fullname.includes('-') ? '-' : ' ';
  const capitalizedFullname = capitalizedNames.join(separator);

  return capitalizedFullname;
};

export const getAllStudents = async (req, res) => {
  // console.log('Reached all users', req);
  try {
    const students = await Students.findAll({
      attributes: [
        'id',
        'email',
        'first_name',
        'last_name',
        'phone',
        'status',
        'created_at',
        'updated_at',
        'launched_on',
        'is_active',
        'city',
        'level',
        'is_active',
        'priority',
        'level',
        'topics',
        'interviews',
        'pre_interview',
        'email_parent1',
        'email_parent2',
        'internal_thread',
      ],

      order: [['created_at', 'desc']],
    });
    // console.log(students);
    res.json(students);
  } catch (err) {
    console.log('Catch error', err);
    res.status(404).json({ msg: err.message });
  }
};

export const getStudentById = async (req, res) => {
  try {
    const { id } = req.params; // Extract the id from the request parameters

    // Find the student by ID
    const student = await Students.findByPk(id);

    if (!student) {
      // If no student is found with the given ID, return a 404 error
      return res.status(404).json({ error: 'Student not found' });
    }

    // If student is found, return it
    res.status(200).json(student);
  } catch (error) {
    console.error('Error fetching student:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while fetching the student.' });
  }
};

export const addStudent = async (req, res) => {
  try {
    const { first_name, last_name, ...otherFields } = req.body;

    // Capitalize first_name and last_name
    const capitalizedFirstName = capitalizeFamilyName(first_name);
    const capitalizedLastName = capitalizeFamilyName(last_name);
    const newStudent = await Students.create({
      first_name: capitalizedFirstName,
      last_name: capitalizedLastName,
      ...otherFields,
    });
    res.status(201).json(newStudent);
  } catch (error) {
    console.error('Error adding student:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while adding the student.' });
  }
};

// export const updateStudent = async (req, res) => {
//   const { id } = req.params;
//   console.log('id: ', id);

//   try {
//     const [updated] = await Students.update(req.body, {
//       where: { id: id },
//     });
//     console.log(updated);

//     if (updated) {
//       const updatedStudent = await Students.findByPk(id);
//       res.json(updatedStudent);
//     } else {
//       res.status(404).json({ error: 'Student not found.' });
//     }
//   } catch (error) {
//     console.error('Error updating student:', error);
//     res
//       .status(500)
//       .json({ error: 'An error occurred while updating the student.' });
//   }
// };
export const updateStudent = async (req, res) => {
  const { id } = req.params;
  console.log('id: ', id);
  console.log('Update data:', req.body);

  try {
    // Find the student
    const student = await Students.findByPk(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update the student with the data from req.body
    await student.update(req.body);

    // Fetch the updated student to return the most current data
    const updatedStudent = await Students.findByPk(id);

    return res.status(200).json(updatedStudent);
  } catch (error) {
    console.error('Error updating student:', error);
    if (error.name === 'SequelizeValidationError') {
      // Handle validation errors
      return res
        .status(400)
        .json({ error: error.errors.map((e) => e.message) });
    }
    res
      .status(500)
      .json({ error: 'An error occurred while updating the student.' });
  }
};

export const deleteStudent = async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await Students.destroy({
      where: { id: id },
    });
    if (deleted) {
      res.json({ message: 'Student deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Student not found.' });
    }
  } catch (error) {
    console.error('Error deleting student:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while deleting the student.' });
  }
};

export const updateStudentInterview = async (req, res) => {
  const { id } = req.params;
  console.log('Updating student interview for id:', id);
  console.log('Request body:', req.body);

  try {
    const student = await Students.findByPk(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Ensure current interviews is an array
    let currentInterviews = Array.isArray(student.interviews)
      ? student.interviews
      : [];

    // Add the new interview to the array
    currentInterviews.push(req.body.interviews[0]);

    // Update the student with the new interviews array
    await student.update({
      interviews: JSON.stringify(currentInterviews),
    });

    // Fetch the updated student
    const updatedStudent = await Students.findByPk(id);

    // Parse the interviews JSON before sending the response
    if (updatedStudent.interviews) {
      updatedStudent.interviews = JSON.parse(updatedStudent.interviews);
    }

    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error('Error updating student interview:', error);
    res.status(500).json({
      error: 'An error occurred while updating the student interview.',
      details: error.message,
    });
  }
};

export const updateStudentPreInterview = async (req, res) => {
  const { id } = req.params;
  console.log('Updating student pre interview for id:', id);
  console.log('Request body:', req.body);

  try {
    const student = await Students.findByPk(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update the student with the new interviews array
    await student.update({
      pre_interview: JSON.stringify(req.body.preInterview),
    });

    // Fetch the updated student
    const updatedStudent = await Students.findByPk(id);

    // Parse the interviews JSON before sending the response
    if (updatedStudent.pre_interview) {
      updatedStudent.pre_interview = JSON.parse(updatedStudent.pre_interview);
    }

    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error('Error updating student interview:', error);
    res.status(500).json({
      error: 'An error occurred while updating the student interview.',
      details: error.message,
    });
  }
};

export const updateStudentTopics = async (req, res) => {
  const { id } = req.params;
  console.log('Updating student topics for id:', id);
  console.log('Request body:', req.body);

  try {
    const student = await Students.findByPk(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Parse existing topics if it's a string, or use an empty array if it doesn't exist
    let currentTopics = [];
    if (student.topics) {
      try {
        currentTopics = JSON.parse(student.topics);
      } catch (e) {
        console.error('Error parsing existing topics:', e);
      }
    }

    // Ensure currentTopics is an array
    if (!Array.isArray(currentTopics)) {
      currentTopics = [];
    }

    // Function to check if a topic already exists
    const topicExists = (topic) =>
      currentTopics.some(
        (t) => t.subject === topic.subject && t.priority === topic.priority
      );

    // Add new topics only if they don't already exist
    if (Array.isArray(req.body.topics)) {
      req.body.topics.forEach((newTopic) => {
        if (!topicExists(newTopic)) {
          currentTopics.push(newTopic);
        }
      });
    }

    // Update the student with the new topics array
    await student.update({
      topics: JSON.stringify(currentTopics),
    });

    // Fetch the updated student
    const updatedStudent = await Students.findByPk(id);

    // Parse the topics JSON before sending the response
    if (updatedStudent.topics) {
      try {
        updatedStudent.topics = JSON.parse(updatedStudent.topics);
      } catch (e) {
        console.error('Error parsing updated topics:', e);
      }
    }

    console.log('Saved in db:', updatedStudent.topics);

    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error('Error updating student topics:', error);
    res.status(500).json({
      error: 'An error occurred while updating the student topics.',
      details: error.message,
    });
  }
};

export const updateStudentAvailabilities = async (req, res) => {
  const { id } = req.params;
  console.log('Updating student availabilities for id:', id);
  console.log('Request body:', req.body);

  try {
    const student = await Students.findByPk(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Parse existing topics if it's a string, or use an empty array if it doesn't exist
    let currentAvailabilities = [];
    if (student.when_day_slot) {
      try {
        currentAvailabilities = JSON.parse(student.when_day_slot);
      } catch (e) {
        console.error('Error parsing existing availabilities:', e);
      }
    }

    // Ensure currentTopics is an array
    if (!Array.isArray(currentAvailabilities)) {
      currentAvailabilities = [];
    }

    // Function to check if a topic already exists
    const dayslotExists = (dayslot) =>
      currentAvailabilities.some(
        (t) => t.day === dayslot.day && t.startTime === dayslot.startTime
      );

    // Add new topics only if they don't already exist
    if (Array.isArray(req.body.when_day_slot)) {
      req.body.when_day_slot.forEach((newDay) => {
        if (!dayslotExists(newDay)) {
          currentAvailabilities.push(newDay);
        }
      });
    }

    // Update the student with the new topics array
    await student.update({
      when_day_slot: JSON.stringify(currentAvailabilities),
    });

    // Fetch the updated student
    const updatedStudent = await Students.findByPk(id);

    // Parse the topics JSON before sending the response
    if (updatedStudent.when_day_slot) {
      try {
        updatedStudent.when_day_slot = JSON.parse(updatedStudent.when_day_slot);
      } catch (e) {
        console.error('Error parsing updated availabilities:', e);
      }
    }

    console.log('Saved in db:', updatedStudent.when_day_slot);

    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error('Error updating student availabilities:', error);
    res.status(500).json({
      error: 'An error occurred while updating the student availabilities.',
      details: error.message,
    });
  }
};

export const updateStudentLocations = async (req, res) => {
  const { id } = req.params;
  console.log('Updating student locations for id:', id);
  console.log('Request body:', req.body);

  try {
    const student = await Students.findByPk(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Parse existing topics if it's a string, or use an empty array if it doesn't exist
    let currentLocations = [];
    if (student.where_location) {
      try {
        currentLocations = JSON.parse(student.where_location);
      } catch (e) {
        console.error('Error parsing existing locations:', e);
      }
    }

    // Ensure currentTopics is an array
    if (!Array.isArray(currentLocations)) {
      currentLocations = [];
    }

    // Function to check if a topic already exists
    const locationExists = (location) =>
      currentLocations.some((t) => t.where_location === location.wher_location);

    // Add new topics only if they don't already exist
    if (Array.isArray(req.body.where_location)) {
      req.body.where_location.forEach((newLocation) => {
        if (!locationExists(newLocation)) {
          currentLocations.push(newLocation);
        }
      });
    }

    // Update the student with the new topics array
    await student.update({
      where_location: JSON.stringify(currentLocations),
    });

    // Fetch the updated student
    const updatedStudent = await Students.findByPk(id);

    // Parse the topics JSON before sending the response
    if (updatedStudent.when_day_slot) {
      try {
        updatedStudent.when_day_slot = JSON.parse(updatedStudent.when_day_slot);
      } catch (e) {
        console.error('Error parsing updated availabilities:', e);
      }
    }

    console.log('Saved in db:', updatedStudent.when_day_slot);

    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error('Error updating student availabilities:', error);
    res.status(500).json({
      error: 'An error occurred while updating the student availabilities.',
      details: error.message,
    });
  }
};
// // Load the JSON file (this should be optimized for production use)
// const schoolsData = JSON.parse(fs.readFileSync('schools.json', 'utf8'));

// export const getSchools = async (req, res) => {
//   const { search, page = 1, limit = 20 } = req.query;

//   let filteredSchools = await schoolsData;

//   // Filter schools based on search query
//   if (search) {
//     filteredSchools = schoolsData.filter((school) =>
//       school.nom_etablissement.toLowerCase().includes(search.toLowerCase())
//     );
//   }

//   // Paginate results
//   const startIndex = (page - 1) * limit;
//   const endIndex = page * limit;
//   const paginatedSchools = filteredSchools.slice(startIndex, endIndex);

//   res.json({
//     total: filteredSchools.length,
//     page: parseInt(page),
//     limit: parseInt(limit),
//     schools: paginatedSchools,
//   });
// };

const baseUrl =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records';

export const getSchools = async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let apiUrl = `${baseUrl}?limit=${limit}&offset=${offset}`;

    // Add search functionality
    if (search) {
      apiUrl += `&where=nom_etablissement like "%${encodeURIComponent(
        search
      )}%"`;
    }

    // Fetch data from API
    const response = await axios.get(apiUrl);
    const { total_count, results } = response.data;

    res.json({
      total: total_count,
      page: parseInt(page),
      limit: parseInt(limit),
      schools: results,
    });
  } catch (error) {
    console.error('Error fetching data from API:', error);
    res.status(500).json({ error: 'An error occurred while fetching data' });
  }
};
