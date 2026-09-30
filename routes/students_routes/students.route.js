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

router.get('/students', adminAuth, getAllStudents);
router.post('/students', adminAuth, addStudent);
router.patch('/students/:id', adminAuth, updateStudent);
router.delete('/students/:id', adminAuth, deleteStudent);

router.get('/students/:id', adminAuth, getStudentById);

router.patch('/students-interview/:id', adminAuth, updateStudentInterview);
router.patch(
  '/students-preinterview/:id',
  adminAuth,
  updateStudentPreInterview
);
router.patch('/students-school-history/:id', adminAuth, updateStudentHistory);

router.patch('/students-topics/:id', adminAuth, updateStudentTopics);
router.patch(
  '/students-availabilities/:id',
  adminAuth,
  updateStudentAvailabilities
);
router.patch('/students-locations/:id', adminAuth, updateStudentLocations);

router.get('/student-demand/schools', adminAuth, getSchools);

router.get('/student-demand/address', adminAuth, getAddress);

router.post(
  '/student-demand/add-internalthread/:studentId',
  adminAuth,
  addStudentInternalThread
);

export default router;
