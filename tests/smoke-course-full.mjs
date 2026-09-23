// Smoke test cho đồng bộ ĐẦY ĐỦ 1 lớp học phần theo mã + học kỳ:
// tạo khóa học trên Moodle rồi ghi danh luôn cả sinh viên và giảng viên.
import http from 'node:http';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import App from '../src/app.js';

const MA = '417688';
const TEN_DOT = 'HK1 2026-2027';

const COURSES = [
  {
    MaLopHocPhan: MA, TenMonHoc: 'Kỹ thuật lập trình', TenLopHoc: `${MA} - Kỹ thuật lập trình`,
    TenDot: TEN_DOT, IDLopHocPhan: 1, IDToBoMon: 5, SoTietLyThuyet: 30, SoTietThucHanh: 15,
    IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính', IDKhoaHoc: 47, TenKhoaHoc: 'K70',
  },
];

const STUDENT_ENROLLMENTS = [
  { MaLopHocPhan: MA, TenLopHoc: `${MA} - KTLT`, TenMonHoc: 'Kỹ thuật lập trình', TenDot: TEN_DOT, MaSinhVien: '2083001', HoTenSinhVien: 'Nguyen Van A', Email: 'a@x.vn', IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính', IDKhoaHoc: 47, TenKhoaHoc: 'K70' },
  { MaLopHocPhan: MA, TenLopHoc: `${MA} - KTLT`, TenMonHoc: 'Kỹ thuật lập trình', TenDot: TEN_DOT, MaSinhVien: '2083002', HoTenSinhVien: 'Le Thi B', Email: 'b@x.vn', IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính', IDKhoaHoc: 47, TenKhoaHoc: 'K70' },
];

const TEACHER_ENROLLMENTS = [
  { MaLopHocPhan: MA, TenLopHoc: `${MA} - KTLT`, TenMonHoc: 'Kỹ thuật lập trình', TenDot: TEN_DOT, MaGiangVien: 'GV001', HoTenGiangVien: 'Tran Van C', Email: 'gv@x.vn', IsTroGiang: 0, IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính', IDKhoaHoc: 47, TenKhoaHoc: 'K70' },
];

const MOODLE_USERS = {
  '2083001': { id: 101, idnumber: '2083001' },
  '2083002': { id: 102, idnumber: '2083002' },
  GV001: { id: 201, idnumber: 'GV001' },
};

databaseService.checkConnection = async () => true;
databaseService.isConnected = true;

databaseService.queryDatasetAll = async (name, options) => {
  const maFilter = (options.filters || []).find((f) => f.field === 'MaLopHocPhan');
  const wanted = maFilter?.value;

  if (name === 'courses') return wanted ? COURSES.filter((c) => c.MaLopHocPhan === wanted) : [];
  if (name === 'student-enrollments') return wanted ? STUDENT_ENROLLMENTS.filter((r) => r.MaLopHocPhan === wanted) : [];
  if (name === 'teacher-enrollments') return wanted ? TEACHER_ENROLLMENTS.filter((r) => r.MaLopHocPhan === wanted) : [];
  return [];
};

const moodleCoursesByShortname = new Map();
const createdCourses = [];
const studentEnrollCalls = [];
const teacherEnrollCalls = [];

moodleService.checkConnection = async () => 'HUCE Moodle';
moodleService.getUserByIdNumber = async (idnumber) => MOODLE_USERS[idnumber] || null;
moodleService.getCategories = async () => [];
moodleService.getCourseByShortname = async (shortname) => moodleCoursesByShortname.get(shortname) || null;
moodleService.createCourse = async (data) => {
  const course = { id: 6000 + moodleCoursesByShortname.size + 1 };
  moodleCoursesByShortname.set(data.course_shortname, course);
  createdCourses.push(data);
  return course;
};
moodleService.createSectionWithPlugin = async () => true;
moodleService.getEnrolledUsers = async () => [];
moodleService.enrollUserToCourse = async (userId, courseId) => { studentEnrollCalls.push({ userId, courseId }); return true; };
moodleService.enrollTeacherToCourse = async (userId, courseId, roleId) => { teacherEnrollCalls.push({ userId, courseId, roleId }); return true; };

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

console.log('=== ĐỒNG BỘ ĐẦY ĐỦ: TẠO KHÓA HỌC + GHI DANH SV + GV ===');

const full = await call('POST', '/api/sync/courses/full', { maLopHocPhan: MA, tenDot: TEN_DOT });
check('HTTP 200', full.status === 200, `HTTP ${full.status}`);
check('Tạo đúng 1 khóa học', createdCourses.length === 1, `${createdCourses.length} course`);
check('Shortname đúng mẫu', createdCourses[0]?.course_shortname === `${MA}_${TEN_DOT}`, createdCourses[0]?.course_shortname);
check('Ghi danh đúng 2 sinh viên', studentEnrollCalls.length === 2, `${studentEnrollCalls.length} lượt`);
check('Ghi danh đúng 1 giảng viên', teacherEnrollCalls.length === 1, `${teacherEnrollCalls.length} lượt`);
check('Giảng viên nhận role 3 (giảng viên chính)', teacherEnrollCalls[0]?.roleId === 3, teacherEnrollCalls[0]?.roleId);
check('data.course/data.students/data.teachers có mặt',
  Boolean(full.body?.data?.course && full.body?.data?.students && full.body?.data?.teachers));
check('Tổng lỗi = 0', full.body?.data?.failed === 0, full.body?.data?.failed);

console.log('\n=== GỌI LẦN 2: KHÓA HỌC ĐÃ CÓ, SV/GV ĐÃ GHI DANH -> CHỈ BỎ QUA ===');
studentEnrollCalls.length = 0;
teacherEnrollCalls.length = 0;
createdCourses.length = 0;
moodleService.getEnrolledUsers = async () => [
  { id: 101, roles: [{ roleid: 5 }] },
  { id: 102, roles: [{ roleid: 5 }] },
  { id: 201, roles: [{ roleid: 3 }] },
];

const again = await call('POST', '/api/sync/courses/full/417688', { tenDot: TEN_DOT });
check('HTTP 200 (mã trên URL)', again.status === 200, `HTTP ${again.status}`);
check('Không tạo lại khóa học', createdCourses.length === 0, `${createdCourses.length} course`);
check('Không ghi danh lại ai', studentEnrollCalls.length === 0 && teacherEnrollCalls.length === 0);
check('Khóa học báo "đã có"', full_second_skip(again), JSON.stringify(again.body?.data?.course?.skipped));

function full_second_skip(res) {
  return res.body?.data?.course?.skipped === 1
    && res.body?.data?.students?.skipped === 2
    && res.body?.data?.teachers?.skipped === 1;
}

console.log('\n=== THIẾU THAM SỐ / KHÔNG TÌM THẤY ===');
const missingTenDot = await call('POST', '/api/sync/courses/full', { maLopHocPhan: MA });
check('Thiếu học kỳ -> 400', missingTenDot.status === 400, missingTenDot.body?.message?.slice(0, 40));

const missingMa = await call('POST', '/api/sync/courses/full', { tenDot: TEN_DOT });
check('Thiếu mã lớp học phần -> 400', missingMa.status === 400, missingMa.body?.message?.slice(0, 40));

const notFound = await call('POST', '/api/sync/courses/full', { maLopHocPhan: 'KHONGTONTAI', tenDot: TEN_DOT });
check('Không tìm thấy lớp học phần -> 404', notFound.status === 404, `HTTP ${notFound.status}`);

console.log(failures === 0
  ? '\nPASS  đồng bộ đầy đủ lớp học phần (course + SV + GV) hoạt động đúng'
  : `\nFAIL  ${failures} kiểm tra không đạt`);

server.close();
process.exit(failures === 0 ? 0 : 1);
