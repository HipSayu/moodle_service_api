import syncToMoodleService from "../services/syncToMoodleService.js";
import { ok, fail, syncResult } from "../utils/response.js";
import { getTenDot, getParam } from "../utils/requestParams.js";

// Đồng bộ sinh viên. POST /api/sync/students hoặc /api/sync/students/:maSinhVien
const syncStudents = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const maSinhVien = req.params.maSinhVien || getParam(req, "maSinhVien");

  const data = await syncToMoodleService.syncStudents({ tenDot, maSinhVien });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy sinh viên${maSinhVien ? ` ${maSinhVien}` : ""} trong đợt ${tenDot}`
      : `Đồng bộ ${data.succeeded}/${data.total} sinh viên, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ giảng viên. POST /api/sync/teachers hoặc /api/sync/teachers/:maGiangVien
const syncTeachers = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const maGiangVien = req.params.maGiangVien || getParam(req, "maGiangVien");

  const data = await syncToMoodleService.syncTeachers({ tenDot, maGiangVien });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy giảng viên${maGiangVien ? ` ${maGiangVien}` : ""} trong đợt ${tenDot}`
      : `Đồng bộ ${data.succeeded}/${data.total} giảng viên, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ khoa / bộ môn. POST /api/sync/categories
const syncCategories = async (req, res) => {
  const data = await syncToMoodleService.syncCategories();

  return syncResult(res, {
    message: data.notFound
      ? "Không lấy được danh sách khoa/bộ môn từ SQL Server"
      : `Tạo mới ${data.succeeded} category, đã có ${data.skipped}, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ khóa học. POST /api/sync/courses hoặc /api/sync/courses/:maLopHocPhan
// Chỉ tạo lớp chưa có, lớp đã tồn tại thì bỏ qua.
const syncCourses = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const maLopHocPhan = req.params.maLopHocPhan || getParam(req, "maLopHocPhan");

  const data = await syncToMoodleService.syncCourses({ tenDot, maLopHocPhan });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy lớp học phần${maLopHocPhan ? ` ${maLopHocPhan}` : ""} trong đợt ${tenDot}`
      : `Tạo mới ${data.created} khóa học, đã có ${data.skipped}, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ điểm tổng kết vào assignment cuối kỳ. POST /api/sync/grades
const syncGrades = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const data = await syncToMoodleService.syncAssignmentGrades({
    tenDot,
    maLopHocPhan: getParam(req, "maLopHocPhan"),
    tenLopHoc: getParam(req, "tenLopHoc"),
    maSinhVien: getParam(req, "maSinhVien"),
  });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy bản ghi điểm nào trong đợt ${tenDot}`
      : `Đồng bộ ${data.succeeded}/${data.total} điểm, bỏ qua ${data.skipped}, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ toàn bộ theo thứ tự. POST /api/sync/all
const syncAll = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const data = await syncToMoodleService.syncAll({ tenDot });

  return ok(res, {
    message: `Đồng bộ toàn bộ hoàn tất sau ${data.durationMs}ms, tổng lỗi ${data.failed}`,
    data,
  });
};

export default {
  syncStudents,
  syncTeachers,
  syncCategories,
  syncCourses,
  syncGrades,
  syncAll,
};
