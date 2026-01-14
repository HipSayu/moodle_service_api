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

  const overallStatus = health.services.database && health.services.moodle;
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
//Done
router.post('/sync/courses', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncCoursesToMoodle();
  res.json({
    success: true,
    message: 'Course sync completed',
    data: result
  });
}));

// Đồng bộ đăng ký khóa học từ SQL Server sang Moodle
//Done
router.post('/sync/enrollments-students', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncEnrollmentsStudentToMoodle();
  res.json({
    success: true,
    message: 'Enrollment sync completed',
    data: result
  });
}));


// Đồng bộ đăng ký khóa học từ SQL Server sang Moodle
//Done
router.post('/sync/enrollments-students-one', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncOneEnrollmentsStudentToMoodle();
  res.json({
    success: true,
    message: 'Enrollment sync completed',
    data: result
  });
}));


// Đồng bộ đăng ký giảng viên vào khóa học từ SQL Server sang Moodle
// Done
router.post('/sync/enrollments-teachers', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncTeacherEnrollmentsToMoodle();
  res.json({
    success: true,
    message: 'Teacher enrollment sync completed',
    data: result
  });
}));


// Đồng bộ tất cả dữ liệu từ SQL Server sang Moodle
//Done
router.post('/sync/all-to-moodle', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncAllToMoodle();
  res.json({
    success: true,
    message: 'Full sync to Moodle completed',
    data: result
  });
}));

// Đồng bộ điểm assignment từ SQL Server vào Moodle
//Done
router.post('/sync/assignment-grades', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.syncAssignmentGrades();
  res.json({
    success: result.success,
    message: result.message,
    data: result
  });
}));



// Kiểm tra quyền của user Moodle
//Done
router.get('/moodle/user-info', asyncHandler(async (req, res) => {
  const userInfo = await moodleService.checkUserCapabilities();
  res.json({
    success: true,
    message: 'Moodle user capabilities retrieved',
    data: userInfo
  });
}));

// Kiểm tra các functions Moodle Web Service có sẵn
// Done
router.get('/moodle/functions', asyncHandler(async (req, res) => {
  const functions = await moodleService.getAllFunctions();
  res.json({
    success: true,
    message: 'Moodle Web Service functions retrieved',
    data: functions,
    count: functions.length
  });
}));



//---------------------------------------------------------------------------------------------------------------------------------
// Đang phát triển
// ---------------------------------------------------------------------------------------------------

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

// Tạo bài kiểm tra cuối kỳ cho tất cả khóa học trong Moodle
router.post('/sync/create-final-quiz', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.createFinalQuizForAllCourses();
  res.json({
    success: true,
    message: 'Final quiz creation completed',
    data: result
  });
}));



// Test tạo quiz trong một course cụ thể
router.post('/test/create-quiz/:courseId', asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  try {
    const quizData = {
      name: `Test Quiz - ${new Date().toISOString()}`,
      intro: '<p>This is a test quiz</p>',
      timeopen: 0,
      timeclose: 0,
      timelimit: 1800, // 30 minutes
      attempts: 1,
      grade: 10
    };

    const result = await moodleService.createQuiz(courseId, 1, quizData);
    res.json({
      success: true,
      message: 'Test quiz created successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// Xóa tất cả bài quiz trong tất cả khóa học Moodle
router.post('/sync/delete-all-quizzes', asyncHandler(async (req, res) => {
  const result = await syncToMoodleService.deleteAllQuizzesInAllCourses();
  res.json({
    success: result.success,
    message: result.message,
    data: result
  });
}));

// Test xóa tất cả quiz trong một course cụ thể
router.post('/sync/delete-quizzes/:courseId', asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const result = await moodleService.deleteAllQuizzesInCourse(parseInt(courseId));
  res.json({
    success: result.success,
    message: `Deleted ${result.deletedCount} quizzes from course ${courseId}`,
    data: result
  });
}));

// Lấy danh sách courses để test (giới hạn 10 courses)
router.get('/test/courses', asyncHandler(async (req, res) => {
  const courses = await moodleService.getCoursesLimit(10);
  res.json({
    success: true,
    message: 'Courses retrieved for testing',
    data: courses,
    count: courses.length
  });
}));



export default router;