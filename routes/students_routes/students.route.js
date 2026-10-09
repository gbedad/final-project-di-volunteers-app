import express from 'express';
import { uploadStudentDocuments } from '../../config/multer.js';
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
import { adminAuth, managerAuth } from '../../middlewares/authAdmin.js';
import {
  listStudents,
  getStudent,
  createStudent,
  updateStudentFields,
  qfProofUploaded,
  deleteStudentRecord,
  searchSchools,
} from '../../controllers/students_module/admin-students.controllers.js';

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

// Admin pages "Élèves": the team reads, admins enter and edit
router.get('/admin/students', adminAuth, listStudents);
router.post('/admin/students', managerAuth, createStudent);
router.get('/admin/students/:id', adminAuth, getStudent);
router.patch('/admin/students/:id', managerAuth, updateStudentFields);
router.post(
  '/admin/students/:studentId/qf-proof',
  managerAuth,
  uploadStudentDocuments.single('file'),
  qfProofUploaded
);
router.delete('/admin/students/:id', managerAuth, deleteStudentRecord);
router.get('/admin/schools', adminAuth, searchSchools);

export default router;
