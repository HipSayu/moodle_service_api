import syncToMoodleService from "../services/syncToMoodleService.js";
import { fail, syncResult } from "../utils/response.js";
import { getTenDot, getParam } from "../utils/requestParams.js";

// Đăng ký sinh viên vào lớp trên Moodle.
// POST /api/enrollments/students hoặc /api/enrollments/students/:maSinhVien
// Sinh viên đã có trong lớp thì bỏ qua.
const enrollStudents = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const maSinhVien = req.params.maSinhVien || getParam(req, "maSinhVien");
  const maLopHocPhan = getParam(req, "maLopHocPhan");

  const data = await syncToMoodleService.syncStudentEnrollments({
    tenDot,
    maSinhVien,
    maLopHocPhan,
  });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy đăng ký học phần nào trong đợt ${tenDot}`
      : `Đăng ký mới ${data.succeeded}, bỏ qua ${data.skipped}, lỗi ${data.failed} (tổng ${data.total})`,
    data,
  });
};

// Đăng ký giảng viên vào lớp trên Moodle.
// POST /api/enrollments/teachers hoặc /api/enrollments/teachers/:maGiangVien
// Giảng viên đã có trong lớp với đúng vai trò thì bỏ qua.
const enrollTeachers = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const maGiangVien = req.params.maGiangVien || getParam(req, "maGiangVien");
  const maLopHocPhan = getParam(req, "maLopHocPhan");

  const data = await syncToMoodleService.syncTeacherEnrollments({
    tenDot,
    maGiangVien,
    maLopHocPhan,
  });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy phân công giảng dạy nào trong đợt ${tenDot}`
      : `Đăng ký mới ${data.succeeded}, bỏ qua ${data.skipped}, lỗi ${data.failed} (tổng ${data.total})`,
    data,
  });
};

export default { enrollStudents, enrollTeachers };
