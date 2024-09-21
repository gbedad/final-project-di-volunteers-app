import express from 'express';
import {
  getAllStudents,
  addStudent,
  updateStudent,
  deleteStudent,
  getSchools,
  getAddress,
  getStudentById,
  updateStudentInterview,
  updateStudentPreInterview,
  updateStudentTopics,
  updateStudentAvailabilities,
  updateStudentLocations,
  updateStudentHistory,
  addStudentInternalThread,
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
router.patch('/students-school-history/:id', updateStudentHistory);

router.patch('/students-topics/:id', updateStudentTopics);
router.patch('/students-availabilities/:id', updateStudentAvailabilities);
router.patch('/students-locations/:id', updateStudentLocations);

router.get('/student-demand/schools', getSchools);

router.get('/student-demand/address', getAddress);

router.post(
  '/student-demand/add-internalthread/:studentId',
  addStudentInternalThread
);

export default router;
