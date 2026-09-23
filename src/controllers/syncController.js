import syncToMoodleService from "../services/syncToMoodleService.js";
import databaseService from "../services/databaseService.js";
import { ok, fail, syncResult } from "../utils/response.js";
import { getTenDot, getParam, getBool } from "../utils/requestParams.js";

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

// Đồng bộ sinh viên. POST /api/sync/students hoặc /api/sync/students/:maSinhVien
const syncStudents = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const maSinhVien = req.params.maSinhVien || getParam(req, "maSinhVien");
  const { idKhoaHoc, tenKhoaHoc } = await resolveKhoa(req, tenDot);

  // toanKhoa: lấy theo hồ sơ khóa, gồm cả sinh viên chưa đăng ký học phần nào.
  // Không có khóa thì phạm vi là toàn bộ sinh viên của trường nên phải chặn.
  const toanKhoa = getBool(req, "toanKhoa");
  if (toanKhoa && !idKhoaHoc) {
    return fail(res, {
      message:
        "toanKhoa=true bắt buộc chọn khóa (khoaHoc hoặc idKhoaHoc), nếu không sẽ quét toàn bộ sinh viên của trường",
    });
  }

  const data = await syncToMoodleService.syncStudents({
    tenDot,
    maSinhVien,
    idKhoaHoc,
    tenKhoaHoc,
    toanKhoa,
    chiDangHoc: getBool(req, "chiDangHoc", true),
  });

  const phamVi = toanKhoa
    ? ` — toàn khóa ${tenKhoaHoc} (theo hồ sơ)`
    : khoaSuffix(tenKhoaHoc);

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy sinh viên${maSinhVien ? ` ${maSinhVien}` : ""} trong đợt ${tenDot}${phamVi}`
      : `Đồng bộ ${data.succeeded}/${data.total} sinh viên${phamVi}, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ sinh viên theo mã, KHÔNG cần đợt.
// POST /api/sync/students/by-code  body { maSinhVien: "1083471, 1083472" }
// Lấy thẳng từ hồ sơ DT_SinhVien nên em chưa đăng ký học phần nào vẫn lên được Moodle.
const syncStudentsByCode = async (req, res) => {
  const maSinhVien = req.params.maSinhVien || getParam(req, "maSinhVien");

  if (!maSinhVien) {
    return fail(res, {
      message: 'Thiếu mã sinh viên. Gửi một mã hoặc nhiều mã cách nhau dấu phẩy: "1083471,1083472"',
    });
  }

  const data = await syncToMoodleService.syncStudents({
    maSinhVien,
    theoMa: true,
  });

  const thieu = data.khongTimThay?.length
    ? `, ${data.khongTimThay.length} mã không có hồ sơ: ${data.khongTimThay.slice(0, 10).join(", ")}`
    : "";

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy hồ sơ sinh viên nào khớp mã đã gửi${thieu}`
      : `Đồng bộ ${data.succeeded}/${data.total} sinh viên theo mã, lỗi ${data.failed}${thieu}`,
    data,
  });
};

// Đồng bộ sinh viên theo LỚP HỌC DANH NGHĨA, KHÔNG cần chọn học kỳ.
// POST /api/sync/students/by-class  body { maLop: "70CS2" } hoặc /api/sync/students/by-class/:maLop
// Chỉ cần nhập mã lớp (ví dụ 70CS2), tự động lấy hết sinh viên đang học trong lớp đó lên Moodle.
const syncStudentsByClass = async (req, res) => {
  const maLop = req.params.maLop || getParam(req, "maLop");

  if (!maLop) {
    return fail(res, {
      message:
        'Thiếu mã lớp học danh nghĩa. Gửi một mã hoặc nhiều mã cách nhau dấu phẩy: "70CS2,70CS3"',
    });
  }

  const data = await syncToMoodleService.syncStudents({
    maLop,
    chiDangHoc: getBool(req, "chiDangHoc", true),
  });

  const thieu = data.khongTimThay?.length
    ? `, không tìm thấy lớp: ${data.khongTimThay.join(", ")}`
    : "";

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy sinh viên nào trong lớp ${maLop}${thieu}`
      : `Đồng bộ ${data.succeeded}/${data.total} sinh viên lớp ${maLop}, lỗi ${data.failed}${thieu}`,
    data,
  });
};

// Đồng bộ giảng viên. POST /api/sync/teachers hoặc /api/sync/teachers/:maGiangVien
const syncTeachers = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const maGiangVien = req.params.maGiangVien || getParam(req, "maGiangVien");
  const { idKhoaHoc, tenKhoaHoc } = await resolveKhoa(req, tenDot);

  const data = await syncToMoodleService.syncTeachers({
    tenDot,
    maGiangVien,
    idKhoaHoc,
    tenKhoaHoc,
  });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy giảng viên${maGiangVien ? ` ${maGiangVien}` : ""} trong đợt ${tenDot}${khoaSuffix(tenKhoaHoc)}`
      : `Đồng bộ ${data.succeeded}/${data.total} giảng viên${khoaSuffix(tenKhoaHoc)}, lỗi ${data.failed}`,
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
  const { idKhoaHoc, tenKhoaHoc } = await resolveKhoa(req, tenDot);

  const data = await syncToMoodleService.syncCourses({
    tenDot,
    maLopHocPhan,
    idKhoaHoc,
    tenKhoaHoc,
  });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy lớp học phần${maLopHocPhan ? ` ${maLopHocPhan}` : ""} trong đợt ${tenDot}${khoaSuffix(tenKhoaHoc)}`
      : `Tạo mới ${data.created} khóa học${khoaSuffix(tenKhoaHoc)}, đã có ${data.skipped}, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ 1 lớp học phần theo MÃ + HỌC KỲ, không cần chọn khóa (K70, K71...).
// POST /api/sync/courses/by-code  body { maLopHocPhan: "417688", tenDot: "HK1 2026-2027" }
// hoặc /api/sync/courses/by-code/:maLopHocPhan kèm tenDot trong body.
const syncCoursesByCode = async (req, res) => {
  const maLopHocPhan = req.params.maLopHocPhan || getParam(req, "maLopHocPhan");
  if (!maLopHocPhan) {
    return fail(res, { message: "Thiếu mã lớp học phần" });
  }

  const tenDot = getTenDot(req);
  if (!tenDot) {
    return fail(res, { message: "Thiếu học kỳ (tenDot), ví dụ: HK1 2026-2027" });
  }

  const data = await syncToMoodleService.syncCourses({ tenDot, maLopHocPhan });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy lớp học phần ${maLopHocPhan} trong học kỳ ${tenDot}`
      : `Tạo mới ${data.created} khóa học, đã có ${data.skipped}, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ ĐẦY ĐỦ 1 lớp học phần theo MÃ + HỌC KỲ: tạo khóa học trên Moodle
// rồi ghi danh luôn cả sinh viên và giảng viên vào khóa học đó, không cần chọn khóa.
// POST /api/sync/courses/full  body { maLopHocPhan: "417688", tenDot: "HK1 2026-2027" }
// hoặc /api/sync/courses/full/:maLopHocPhan kèm tenDot trong body.
const syncCourseFull = async (req, res) => {
  const maLopHocPhan = req.params.maLopHocPhan || getParam(req, "maLopHocPhan");
  if (!maLopHocPhan) {
    return fail(res, { message: "Thiếu mã lớp học phần" });
  }

  const tenDot = getTenDot(req);
  if (!tenDot) {
    return fail(res, { message: "Thiếu học kỳ (tenDot), ví dụ: HK1 2026-2027" });
  }

  const data = await syncToMoodleService.syncCourseFull({ tenDot, maLopHocPhan });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy lớp học phần ${maLopHocPhan} trong học kỳ ${tenDot}`
      : `Lớp ${maLopHocPhan}: khóa học tạo mới ${data.course.created ?? 0}, đã có ${data.course.skipped ?? 0}` +
        ` — SV ghi danh mới ${data.students.succeeded ?? 0}, bỏ qua ${data.students.skipped ?? 0}` +
        ` — GV ghi danh mới ${data.teachers.succeeded ?? 0}, bỏ qua ${data.teachers.skipped ?? 0}` +
        ` — tổng lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ điểm tổng kết vào assignment cuối kỳ. POST /api/sync/grades
const syncGrades = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const { idKhoaHoc, tenKhoaHoc } = await resolveKhoa(req, tenDot);

  const data = await syncToMoodleService.syncAssignmentGrades({
    tenDot,
    maLopHocPhan: getParam(req, "maLopHocPhan"),
    tenLopHoc: getParam(req, "tenLopHoc"),
    maSinhVien: getParam(req, "maSinhVien"),
    idKhoaHoc,
    tenKhoaHoc,
  });

  return syncResult(res, {
    message: data.notFound
      ? `Không tìm thấy bản ghi điểm nào trong đợt ${tenDot}${khoaSuffix(tenKhoaHoc)}`
      : `Đồng bộ ${data.succeeded}/${data.total} điểm${khoaSuffix(tenKhoaHoc)}, bỏ qua ${data.skipped}, lỗi ${data.failed}`,
    data,
  });
};

// Đồng bộ toàn bộ theo thứ tự. POST /api/sync/all
const syncAll = async (req, res) => {
  const tenDot = getTenDot(req);
  if (!tenDot) return fail(res, { message: "Thiếu tenDot trong body" });

  const { idKhoaHoc, tenKhoaHoc } = await resolveKhoa(req, tenDot);

  const data = await syncToMoodleService.syncAll({ tenDot, idKhoaHoc, tenKhoaHoc });

  return ok(res, {
    message: `Đồng bộ toàn bộ${khoaSuffix(tenKhoaHoc)} hoàn tất sau ${data.durationMs}ms, tổng lỗi ${data.failed}`,
    data,
  });
};

export default {
  syncStudents,
  syncStudentsByCode,
  syncStudentsByClass,
  syncTeachers,
  syncCategories,
  syncCourses,
  syncCoursesByCode,
  syncCourseFull,
  syncGrades,
  syncAll,
};
