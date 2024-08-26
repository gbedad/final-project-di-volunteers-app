import dotenv from 'dotenv';
import Students from '../../models/students/students.model.js';

dotenv.config();

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

export const addStudent = async (req, res) => {
  try {
    const newStudent = await Students.create(req.body);
    res.status(201).json(newStudent);
  } catch (error) {
    console.error('Error adding student:', error);
    res
      .status(500)
      .json({ error: 'An error occurred while adding the student.' });
  }
};

export const updateStudent = async (req, res) => {
  const { id } = req.params;

  try {
    const [updated] = await Students.update(req.body, {
      where: { id: id },
    });
    if (updated) {
      const updatedStudent = await Students.findByPk(id);
      res.json(updatedStudent);
    } else {
      res.status(404).json({ error: 'Student not found.' });
    }
  } catch (error) {
    console.error('Error updating student:', error);
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
