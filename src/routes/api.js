import express from 'express';
import { asyncHandler } from '../utils/errorHandler.js';
import syncToMoodleService from '../services/syncToMoodleService.js';
import syncFromMoodleService from '../services/syncFromMoodleService.js';
import databaseService from '../services/databaseService.js';
import moodleService from '../services/moodleService.js';
const router = express.Router();

// Health check endpoint
router.get('/health', asyncHandler(async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: false,
      databaseGv: false,
      moodle: false
    }
  };

  try {
    health.services.database = await databaseService.checkConnection();
  } catch (error) {
    health.services.database = false;
  }


  try {
    health.services.moodle = await moodleService.checkConnection();
  } catch (error) {
    health.services.moodle = false;
  }

  const overallStatus = health.services.database && health.services.databaseGv && health.services.moodle;
  health.status = overallStatus ? 'ok' : 'error';

  res.status(overallStatus ? 200 : 503).json(health);
}));

// Đồng bộ sinh viên từ SQL Server sang Moodle
// Done
router.post('/sync/students', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncStudentsToMoodle();
  res.json({
    success: true,
    message: 'Student sync completed',
    data: result
  });
}));


// router.post('/sync/students-test', asyncHandler(async (req, res) => {
//   const result = await syncToMoodleService.testStudentToMoodle();
//   res.json({
//     success: true,
//     message: 'Student sync completed',
//     data: result
//   });
// }));


// Đồng bộ giảng viên từ SQL Server sang Moodle
// Done
router.post('/sync/teachers', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncTeachersToMoodle();
  res.json({
    success: true,
    message: 'Teacher sync completed',
    data: result
  });
}));
// Đồng bộ category từ SQL Server sang Moodle
// Done
router.post('/sync/category', asyncHandler(async (req, res) => {
  // Get department data from database
  const departmentData = await databaseService.getCategory();
  const result = await syncToMoodleService.syncCategoriesToMoodle(departmentData);
  res.json({
    success: true,
    message: 'Category sync completed',
    data: result
  });
}));


// Đồng bộ khóa học từ SQL Server sang Moodle
router.post('/sync/courses', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncCoursesToMoodle();
  res.json({
    success: true,
    message: 'Course sync completed',
    data: result
  });
}));

// Đồng bộ đăng ký khóa học từ SQL Server sang Moodle
router.post('/sync/enrollments-students', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncEnrollmentsStudentToMoodle();
  res.json({
    success: true,
    message: 'Enrollment sync completed',
    data: result
  });
}));

// Đồng bộ đăng ký giảng viên vào khóa học từ SQL Server sang Moodle
router.post('/sync/enrollments-teachers', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncTeacherEnrollmentsToMoodle();
  res.json({
    success: true,
    message: 'Teacher enrollment sync completed',
    data: result
  });
}));

// Đồng bộ điểm từ Moodle về SQL Server
router.post('/sync/grades', asyncHandler(async (req, res) => {
  const result = await syncFromMoodleService.syncGradesFromMoodle();
  res.json({
    success: true,
    message: 'Grade sync completed',
    data: result
  });
}));

// Đồng bộ điểm cho một course cụ thể
router.post('/sync/grades/:courseCode', asyncHandler(async (req, res) => {
  const { courseCode } = req.params;
  const result = await syncFromMoodleService.syncCourseGradesFromMoodle(courseCode);
  res.json({
    success: true,
    message: `Grade sync for course ${courseCode} completed`,
    data: result
  });
}));

// Đồng bộ điểm cho một sinh viên cụ thể
router.post('/sync/student-grades/:studentCode', asyncHandler(async (req, res) => {
  const { studentCode } = req.params;
  const result = await syncFromMoodleService.syncStudentGradesFromMoodle(studentCode);
  res.json({
    success: true,
    message: `Grade sync for student ${studentCode} completed`,
    data: result
  });
}));

// Đồng bộ tất cả dữ liệu từ SQL Server sang Moodle
router.post('/sync/all-to-moodle', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncAllToMoodle();
  res.json({
    success: true,
    message: 'Full sync to Moodle completed',
    data: result
  });
}));

// Đồng bộ tất cả (bao gồm cả điểm từ Moodle về)
router.post('/sync/all', asyncHandler(async (req, res) => {
  // Đồng bộ từ SQL Server sang Moodle trước
  const toMoodleResult = await syncToMoodleService.syncAllToMoodle();

  // Sau đó đồng bộ điểm từ Moodle về
  const fromMoodleResult = await syncFromMoodleService.syncGradesFromMoodle();

  res.json({
    success: true,
    message: 'Full bidirectional sync completed',
    data: {
      toMoodle: toMoodleResult,
      fromMoodle: fromMoodleResult
    }
  });
}));

// Lấy thống kê điểm
router.get('/stats/grades', asyncHandler(async (req, res) => {
  const stats = await syncFromMoodleService.getGradeStatistics();
  res.json({
    success: true,
    message: 'Grade statistics retrieved',
    data: stats
  });
}));

// Lấy danh sách sinh viên từ SQL Server
router.get('/data/students', asyncHandler(async (req, res) => {
  const students = await databaseService.getStudents();
  res.json({
    success: true,
    message: 'Students retrieved',
    data: students,
    count: students.length
  });
}));

// Lấy danh sách giảng viên từ SQL Server
router.get('/data/teachers', asyncHandler(async (req, res) => {
  const teachers = await databaseService.getTeachers();
  res.json({
    success: true,
    message: 'Teachers retrieved',
    data: teachers,
    count: teachers.length
  });
}));

// Lấy danh sách khóa học từ SQL Server
router.get('/data/courses', asyncHandler(async (req, res) => {
  const courses = await databaseService.getCourses();
  res.json({
    success: true,
    message: 'Courses retrieved',
    data: courses,
    count: courses.length
  });
}));



export default router;