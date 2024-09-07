import express from 'express';
import {
  getAllStudents,
  addStudent,
  updateStudent,
  deleteStudent,
  getSchools,
  getStudentById,
  updateStudentInterview,
  updateStudentPreInterview,
  updateStudentTopics,
} from '../../controllers/students_module/students.controllers.js';
import { adminAuth } from '../../middlewares/authAdmin.js';

const router = express.Router();

// Routes
router.get('/students', getAllStudents);
router.post('/students', addStudent);
router.patch('/students/:id', updateStudent);
router.delete('/students/:id', deleteStudent);

router.get('/students/:id', getStudentById);

router.patch('/students-interview/:id', updateStudentInterview);
router.patch('/students-preinterview/:id', updateStudentPreInterview);

router.patch('/students-topics/:id', updateStudentTopics);

router.get('/student-demand/schools', getSchools);

export default router;
