import express from "express";
import { asyncHandler } from "../utils/errorHandler.js";

import syncController from "../controllers/syncController.js";
import enrollmentController from "../controllers/enrollmentController.js";
import dataController from "../controllers/dataController.js";
import reportController from "../controllers/reportController.js";
import moodleController from "../controllers/moodleController.js";
import systemController from "../controllers/systemController.js";

const router = express.Router();
const h = asyncHandler; // mọi handler async đều đi qua đây để lỗi rơi về errorHandler

// ==================== HỆ THỐNG ====================
router.get("/health", h(systemController.health));

router.get("/scheduler/status", h(systemController.schedulerStatus));
router.post("/scheduler/start", h(systemController.schedulerStart));
router.post("/scheduler/stop", h(systemController.schedulerStop));
router.post("/scheduler/jobs/:jobName/run", h(systemController.schedulerRunJob));

// ==================== ĐỒNG BỘ SQL SERVER -> MOODLE ====================
// Không có tham số ở URL: chạy cho cả đợt.
// Có tham số ở URL: chạy cho đúng một đối tượng.
// tenDot luôn bắt buộc, truyền trong body.

router.post("/sync/students", h(syncController.syncStudents));
router.post("/sync/students/:maSinhVien", h(syncController.syncStudents));

router.post("/sync/teachers", h(syncController.syncTeachers));
router.post("/sync/teachers/:maGiangVien", h(syncController.syncTeachers));

router.post("/sync/categories", h(syncController.syncCategories));

router.post("/sync/courses", h(syncController.syncCourses));
router.post("/sync/courses/:maLopHocPhan", h(syncController.syncCourses));

router.post("/sync/grades", h(syncController.syncGrades));

router.post("/sync/all", h(syncController.syncAll));

// ==================== ĐĂNG KÝ VÀO LỚP ====================
router.post("/enrollments/students", h(enrollmentController.enrollStudents));
router.post(
  "/enrollments/students/:maSinhVien",
  h(enrollmentController.enrollStudents)
);

router.post("/enrollments/teachers", h(enrollmentController.enrollTeachers));
router.post(
  "/enrollments/teachers/:maGiangVien",
  h(enrollmentController.enrollTeachers)
);

// ==================== ĐỌC DỮ LIỆU SQL SERVER ====================
// Lọc được theo mọi trường của dataset:
//   ?MaSinhVien=1653965              toán tử mặc định theo kiểu cột
//   ?DiemTongKet__gte=8&DiemTongKet__lte=9
//   ?sort=MaSinhVien&order=desc&limit=200&offset=0
router.get("/data", h(dataController.listAll));
router.get("/data/:dataset/fields", h(dataController.describe));
router.get("/data/:dataset", h(dataController.query));

// ==================== BÁO CÁO ====================
// GET /api/reports/locked-grades?idDot=298&merge=true&late=false&download=true
router.get("/reports/locked-grades", h(reportController.exportLockedGrades));

// ==================== MOODLE ====================
router.get("/moodle/site-info", h(moodleController.getSiteInfo));
router.get("/moodle/functions", h(moodleController.getFunctions));
router.get("/moodle/courses", h(moodleController.listCourses));
router.get("/moodle/users", h(moodleController.listUsers));
router.get("/moodle/courses/:courseId/users", h(moodleController.listCourseUsers));

router.get("/moodle/courses/:courseId/quizzes", h(moodleController.listCourseQuizzes));
router.post("/moodle/courses/:courseId/quizzes", h(moodleController.createCourseQuiz));
router.delete("/moodle/courses/:courseId/quizzes", h(moodleController.deleteCourseQuizzes));

router.post("/moodle/final-quizzes", h(moodleController.createFinalQuizzes));
router.delete("/moodle/quizzes", h(moodleController.deleteAllQuizzes));

export default router;
