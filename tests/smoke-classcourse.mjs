// Smoke test cho 2 tính năng mới:
//   - Đồng bộ sinh viên theo lớp học danh nghĩa (không cần đợt)
//   - Đồng bộ 1 lớp học phần theo mã + học kỳ (không cần chọn khóa)
import http from 'node:http';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import App from '../src/app.js';

// ==================== SINH VIÊN THEO LỚP DANH NGHĨA ====================

// Hồ sơ trong DT_SinhVien/DM_LopHoc: 70CS2 có 2 em (1 đang học, 1 đã nghỉ), 70CS3 có 1 em.
const SINH_VIEN = [
  { MaSinhVien: '2083001', HoDem: 'Nguyen Van', Ten: 'A', HoTenSinhVien: 'Nguyen Van A', Email: null, NguyenQuan: 'HN', MaLop: '70CS2', TrangThai: 1 },
  { MaSinhVien: '2083002', HoDem: 'Le Thi', Ten: 'B', HoTenSinhVien: 'Le Thi B', Email: 'b@x.vn', NguyenQuan: 'HN', MaLop: '70CS2', TrangThai: 3 },
  { MaSinhVien: '2083003', HoDem: 'Tran Van', Ten: 'C', HoTenSinhVien: 'Tran Van C', Email: null, NguyenQuan: 'HN', MaLop: '70CS3', TrangThai: 1 },
];

// Hồ sơ lớp học phần: MaLopHocPhan 417688 tồn tại trong học kỳ HK1 2026-2027.
const COURSES = [
  {
    MaLopHocPhan: '417688', TenMonHoc: 'Kỹ thuật lập trình', TenLopHoc: '417688 - Kỹ thuật lập trình',
    TenDot: 'HK1 2026-2027', IDLopHocPhan: 1, IDToBoMon: 5, SoTietLyThuyet: 30, SoTietThucHanh: 15,
    IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính', IDKhoaHoc: 47, TenKhoaHoc: 'K70',
  },
];

databaseService.checkConnection = async () => true;
databaseService.isConnected = true;

const queries = [];
databaseService.queryDatasetAll = async (name, options) => {
  queries.push({ name, options });

  if (name === 'cohort-students') {
    const maLopFilter = (options.filters || []).find((f) => f.field === 'MaLop');
    const trangThaiFilter = (options.filters || []).find((f) => f.field === 'TrangThai');
    const wanted = String(maLopFilter?.value ?? '').split(',').map((c) => c.trim());
    let rows = SINH_VIEN.filter((sv) => wanted.includes(sv.MaLop));
    if (trangThaiFilter) rows = rows.filter((sv) => sv.TrangThai === trangThaiFilter.value);
    return rows;
  }

  if (name === 'courses') {
    const maFilter = (options.filters || []).find((f) => f.field === 'MaLopHocPhan');
    if (!maFilter) return options.tenDot ? COURSES : [];
    return COURSES.filter((c) => c.MaLopHocPhan === maFilter.value);
  }

  return [];
};

const createdUsers = [];
const createdCourses = [];
moodleService.checkConnection = async () => 'HUCE Moodle';
moodleService.getUserByIdNumber = async () => null;
moodleService.createUser = async (data) => { createdUsers.push(data); return { id: 900 + createdUsers.length }; };
moodleService.updateUser = async () => true;
moodleService.getCourseByShortname = async () => null;
moodleService.getCategories = async () => [];
moodleService.createCourse = async (data) => { createdCourses.push(data); return { id: 5000 + createdCourses.length }; };
moodleService.createSectionWithPlugin = async () => true;

const app = new App();
app.initializeMiddleware();
app.initializeRoutes();
const server = app.app.listen(0);
const port = server.address().port;

const call = (method, path, body) =>
  new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { method, port, path, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { /* không phải JSON */ }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 'ERR', body: { message: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok      ' : 'FAIL    '} ${label}${extra ? ' — ' + extra : ''}`);
};

console.log('=== SINH VIÊN THEO LỚP DANH NGHĨA ===');

const oneClass = await call('POST', '/api/sync/students/by-class/70CS2', {});
check('Không cần tenDot -> HTTP 200', oneClass.status === 200, `HTTP ${oneClass.status}`);
check('Chỉ lấy em Đang học trong lớp (bỏ em đã nghỉ)', createdUsers.length === 1, `${createdUsers.length} user`);
check('Đúng em được tạo', createdUsers[0]?.idnumber === '2083001', createdUsers[0]?.idnumber);
check('Không đụng tới dataset đăng ký học phần',
  queries.every((q) => q.name === 'cohort-students'),
  queries.map((q) => q.name).join(', '));

console.log('\n=== NHIỀU LỚP MỘT LẦN ===');
createdUsers.length = 0;
queries.length = 0;

const manyClasses = await call('POST', '/api/sync/students/by-class', { maLop: '70CS2, 70CS3' });
check('HTTP 200', manyClasses.status === 200, `HTTP ${manyClasses.status}`);
check('Đồng bộ đúng 2 em đang học của cả 2 lớp', manyClasses.body?.data?.total === 2, `total=${manyClasses.body?.data?.total}`);

console.log('\n=== LỚP KHÔNG CÓ SINH VIÊN / THIẾU MÃ ===');
const missingClass = await call('POST', '/api/sync/students/by-class', { maLop: 'KHONGTONTAI' });
check('Lớp không tồn tại -> 404', missingClass.status === 404, `HTTP ${missingClass.status}`);
check('Báo rõ lớp không tìm thấy',
  (missingClass.body?.data?.khongTimThay || []).includes('KHONGTONTAI'),
  JSON.stringify(missingClass.body?.data?.khongTimThay));

const emptyClass = await call('POST', '/api/sync/students/by-class', {});
check('Thiếu mã lớp -> 400', emptyClass.status === 400, emptyClass.body?.message?.slice(0, 40));

// ==================== LỚP HỌC PHẦN THEO MÃ + HỌC KỲ ====================

console.log('\n=== LỚP HỌC PHẦN THEO MÃ + HỌC KỲ ===');
createdCourses.length = 0;

const course = await call('POST', '/api/sync/courses/by-code', { maLopHocPhan: '417688', tenDot: 'HK1 2026-2027' });
check('HTTP 200', course.status === 200, `HTTP ${course.status}`);
check('Tạo đúng 1 course', createdCourses.length === 1, `${createdCourses.length} course`);
check('Shortname đúng mẫu <MaLopHocPhan>_<TenDot>',
  createdCourses[0]?.course_shortname === '417688_HK1 2026-2027', createdCourses[0]?.course_shortname);

const courseByUrl = await call('POST', '/api/sync/courses/by-code/417688', { tenDot: 'HK1 2026-2027' });
check('Mã lớp học phần trên URL cũng chạy được', courseByUrl.status === 200 || courseByUrl.status === 207, `HTTP ${courseByUrl.status}`);

console.log('\n=== LỚP HỌC PHẦN THIẾU THAM SỐ ===');
const missingTenDot = await call('POST', '/api/sync/courses/by-code', { maLopHocPhan: '417688' });
check('Thiếu học kỳ -> 400', missingTenDot.status === 400, missingTenDot.body?.message?.slice(0, 40));

const missingMa = await call('POST', '/api/sync/courses/by-code', { tenDot: 'HK1 2026-2027' });
check('Thiếu mã lớp học phần -> 400', missingMa.status === 400, missingMa.body?.message?.slice(0, 40));

const notFoundCourse = await call('POST', '/api/sync/courses/by-code', { maLopHocPhan: 'KHONGTONTAI', tenDot: 'HK1 2026-2027' });
check('Không tìm thấy lớp học phần -> 404', notFoundCourse.status === 404, `HTTP ${notFoundCourse.status}`);

console.log(failures === 0
  ? '\nPASS  đồng bộ theo lớp danh nghĩa và theo mã lớp học phần + học kỳ hoạt động đúng'
  : `\nFAIL  ${failures} kiểm tra không đạt`);

server.close();
process.exit(failures === 0 ? 0 : 1);
