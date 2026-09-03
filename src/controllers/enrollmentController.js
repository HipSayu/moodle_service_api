import syncToMoodleService from "../services/syncToMoodleService.js";
import databaseService from "../services/databaseService.js";
import { fail, syncResult } from "../utils/response.js";
import { getTenDot, getParam } from "../utils/requestParams.js";

// Khóa (K70, K71...) là bộ lọc tùy chọn của mọi tác vụ đồng bộ, cho phép
// chạy từng khóa trong đợt thay vì cả đợt một lần.
// Nhận idKhoaHoc (chính xác) hoặc khoaHoc ("70", "K70", "Khóa 70 (2025)").
const resolveKhoa = (req, tenDot) =>
  databaseService.resolveCohortFilter({
    tenDot,
    khoaHoc: getParam(req, "khoaHoc"),
    idKhoaHoc: getParam(req, "idKhoaHoc"),
  });

// Ghi rõ khóa trong thông báo để không nhầm với lần chạy cả đợt
const khoaSuffix = (tenKhoaHoc) => (tenKhoaHoc ? ` — khóa ${tenKhoaHoc}` : "");

// Đăng ký sinh viên vào lớp trên Moodle.
// POST /api/enrollments/students hoặc /api/enrollments/students/:maSinhVien
// Sinh viên đã có trong lớp thì bỏ qua.
const enrollStudents = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const maSinhVien = req.params.maSinhVien || getParam(req, "maSinhVien");
  const maLopHocPhan = getParam(req, "maLopHocPhan");
  const { idKhoaHoc, tenKhoaHoc } = await resolveKhoa(req, tenDot);

  const data = await syncToMoodleService.syncStudentEnrollments({
    tenDot,
    maSinhVien,
    maLopHocPhan,
    idKhoaHoc,
    tenKhoaHoc,
  });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy đăng ký học phần nào trong đợt ${tenDot}${khoaSuffix(tenKhoaHoc)}`
      : `Đăng ký mới ${data.succeeded}${khoaSuffix(tenKhoaHoc)}, bỏ qua ${data.skipped}, lỗi ${data.failed} (tổng ${data.total})`,
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
  const { idKhoaHoc, tenKhoaHoc } = await resolveKhoa(req, tenDot);

  const data = await syncToMoodleService.syncTeacherEnrollments({
    tenDot,
    maGiangVien,
    maLopHocPhan,
    idKhoaHoc,
    tenKhoaHoc,
  });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy phân công giảng dạy nào trong đợt ${tenDot}${khoaSuffix(tenKhoaHoc)}`
      : `Đăng ký mới ${data.succeeded}${khoaSuffix(tenKhoaHoc)}, bỏ qua ${data.skipped}, lỗi ${data.failed} (tổng ${data.total})`,
    data,
  });
};

export default { enrollStudents, enrollTeachers };
