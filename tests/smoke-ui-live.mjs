// Dựng server với databaseService/moodleService giả rồi gọi đúng các endpoint
// mà giao diện dùng, kiểm tra hình dạng dữ liệu trả về khớp với cái FE mong đợi.
import http from 'node:http';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import App from '../src/app.js';

const TEN_DOT = 'HK1 2026-2027';

databaseService.checkConnection = async () => true;
databaseService.isConnected = true;

// Giả lập tầng SQL: trả về 1 dòng mẫu theo dataset đang truy vấn
const SAMPLE = {
  students: { MaSinhVien: '1653965', HoDem: 'Nguyen Van', Ten: 'A', HoTenSinhVien: 'Nguyen Van A', Email: 'a@x.vn', NguyenQuan: 'HN', NgayCapNhatSinhVien: null },
  teachers: { MaNhanSu: '01025', HoDem: 'Tran Thi', Ten: 'B', HoTenGiangVien: 'Tran Thi B', Email: 'b@x.vn', NgayCapNhatGiangVien: null },
  courses: { MaLopHocPhan: 'LHP1', TenMonHoc: 'Toan', TenLopHoc: '67CS1', TenDot: TEN_DOT, IDLopHocPhan: 1, IDToBoMon: 7, SoTietLyThuyet: 45, SoTietThucHanh: 0, NgayCapNhat: null },
  studentEnroll: { MaLopHocPhan: 'LHP1', TenLopHoc: '67CS1', TenMonHoc: 'Toan', TenDot: TEN_DOT, MaSinhVien: '1653965', HoTenSinhVien: 'Nguyen Van A', Email: 'a@x.vn' },
  teacherEnroll: { MaLopHocPhan: 'LHP1', TenLopHoc: '67CS1', TenMonHoc: 'Toan', TenDot: TEN_DOT, MaGiangVien: '01025', HoTenGiangVien: 'Tran Thi B', Email: 'b@x.vn', IsTroGiang: 0 },
  grades: { MaSinhVien: '1653965', HoTenSinhVien: 'Nguyen Van A', DiemTongKet: 8.5, MaMonHoc: 'M1', TenMonHoc: 'Toan', MaLopHocPhan: 'LHP1', TenLopHoc: '67CS1', TenDot: TEN_DOT, IDSinhVien: 1, IDKetQuaHocTap: 1, IDMonHoc: 1, IDLopHocPhan: 1, NgayCapNhat: null },
  categories: { IDBoMon: 7, TenBoMon: 'BM Phan mem', TenPhongBan: 'Khoa CNTT' },
};

databaseService.executeQuery = async (query) => {
  if (query.includes('COUNT(*)')) return { recordset: [{ total: 1 }] };
  let key = 'students';
  if (query.includes('DM_GiangVien') && query.includes('IsTroGiang')) key = 'teacherEnroll';
  else if (query.includes('DM_GiangVien')) key = 'teachers';
  else if (query.includes('DT_KetQuaHocTapMonHoc')) key = 'grades';
  else if (query.includes('TMP_DsBoMonKhoa')) key = 'categories';
  else if (query.includes('DT_DangKyHocPhan') && query.includes('MaLopHocPhan')) key = 'studentEnroll';
  else if (query.includes('TKB_MonHoc AS mh')) key = 'courses';
  return { recordset: [SAMPLE[key]] };
};
databaseService.getStudents = async () => [
  { MaSinhVien: '1653965', HoDem: 'Nguyen Van', Ten: 'A', HoTenSinhVien: 'Nguyen Van A', Email: 'a@x.vn', NguyenQuan: 'HN' },
];
databaseService.getTeachers = async () => [
  { MaNhanSu: '01025', HoDem: 'Tran Thi', Ten: 'B', HoTenGiangVien: 'Tran Thi B', Email: 'b@x.vn' },
];
databaseService.getCourses = async () => [
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, TenLopHoc: '67CS1', TenMonHoc: 'Toan', IDToBoMon: 7, SoTietLyThuyet: 45, SoTietThucHanh: 0 },
];
databaseService.getStudentEnrollments = async () => [
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, MaSinhVien: '1653965', HoTenSinhVien: 'Nguyen Van A', TenMonHoc: 'Toan', TenLopHoc: '67CS1' },
];
databaseService.getTeacherEnrollments = async () => [
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, MaGiangVien: '01025', HoTenGiangVien: 'Tran Thi B', TenMonHoc: 'Toan', TenLopHoc: '67CS1', IsTroGiang: 0 },
];
databaseService.getGrades = async () => [
  { MaSinhVien: '1653965', HoTenSinhVien: 'Nguyen Van A', MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, DiemTongKet: 8.5 },
];
databaseService.getCategories = async () => [{ TenPhongBan: 'Khoa CNTT', TenBoMon: 'BM Phan mem', IDBoMon: 7 }];

moodleService.checkConnection = async () => 'HUCE Moodle';
moodleService.getCourses = async () => [
  { id: 900, shortname: `LHP1_${TEN_DOT}`, fullname: '67CS1 - Toan', idnumber: `LHP1_${TEN_DOT}`, categoryid: 55, visible: 1, format: 'topics', summary: '<p>rac</p>' },
];
moodleService.getUsers = async () => [
  { id: 101, username: 'a@x.vn', idnumber: '1653965', firstname: 'A', lastname: 'Nguyen Van', fullname: 'Nguyen Van A', email: 'a@x.vn', auth: 'manual', suspended: false },
];
moodleService.getEnrolledUsers = async () => [
  { id: 101, username: 'a@x.vn', idnumber: '1653965', fullname: 'Nguyen Van A', email: 'a@x.vn', roles: [{ roleid: 5, shortname: 'student' }] },
  { id: 201, username: 'b@x.vn', idnumber: '01025', fullname: 'Tran Thi B', email: 'b@x.vn', roles: [{ roleid: 3, shortname: 'editingteacher' }] },
];
moodleService.getUserByIdNumber = async () => ({ id: 101, fullname: 'Nguyen Van A' });
moodleService.updateUser = async () => true;
moodleService.getCourseByShortname = async (sn) => (sn === `LHP1_${TEN_DOT}` ? { id: 900, fullname: '67CS1 - Toan' } : null);
moodleService.getCategories = async () => [{ id: 55, idnumber: '7', name: 'BM Phan mem' }];
moodleService.getCategoryByName = async () => ({ id: 50 });
moodleService.getCategoryByIdNumber = async () => ({ id: 55 });
moodleService.enrollUserToCourse = async () => true;
moodleService.enrollTeacherToCourse = async () => true;

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

console.log('=== ENDPOINT GIAO DIỆN DÙNG (dữ liệu giả) ===');

// Tab Dữ liệu Core: mỗi endpoint phải trả data.items là mảng
for (const [label, path] of [
  ['Sinh viên', '/api/data/students'],
  ['Giảng viên', '/api/data/teachers'],
  ['Lớp học phần', '/api/data/courses'],
  ['ĐK sinh viên', '/api/data/student-enrollments'],
  ['Phân công GV', '/api/data/teacher-enrollments'],
  ['Điểm', '/api/data/grades'],
]) {
  const r = await call('GET', `${path}?tenDot=${encodeURIComponent(TEN_DOT)}`);
  check(`Core · ${label}`, r.status === 200 && Array.isArray(r.body?.data?.items) && r.body.data.items.length > 0,
    `HTTP ${r.status}, ${r.body?.data?.items?.length ?? '?'} dòng`);
}

const cat = await call('GET', '/api/data/categories');
check('Core · Khoa/Bộ môn (không cần tenDot)', cat.status === 200 && Array.isArray(cat.body?.data?.items));

// Thiếu tenDot phải bị chặn ở 400
const missing = await call('GET', '/api/data/students');
check('Core · thiếu tenDot -> 400', missing.status === 400);

// Lọc động theo trường
const DOT = encodeURIComponent(TEN_DOT);

const meta = await call('GET', '/api/data/grades/fields');
check(
  'Metadata trường của dataset',
  meta.status === 200 && meta.body?.data?.columns?.length === 13,
  `${meta.body?.data?.columns?.length} trường`
);

const dsList = await call('GET', '/api/data');
check(
  'Danh sách dataset',
  dsList.status === 200 && dsList.body?.data?.datasets?.length === 7,
  `${dsList.body?.data?.datasets?.length} dataset`
);

const filtered = await call(
  'GET',
  `/api/data/grades?tenDot=${DOT}&DiemTongKet__gte=8&TenLopHoc__contains=67&sort=DiemTongKet&order=desc&limit=10`
);
check(
  'Lọc nhiều điều kiện + sort + limit',
  filtered.status === 200 &&
    filtered.body?.data?.sort === 'DiemTongKet' &&
    filtered.body?.data?.order === 'desc' &&
    filtered.body?.data?.limit === 10,
  `HTTP ${filtered.status}`
);

// Toán tử mặc định theo kiểu cột: chuỗi -> contains, số -> eq
const defaultOp = await call('GET', `/api/data/grades?tenDot=${DOT}&MaSinhVien=1653`);
check('Lọc không nêu toán tử (dùng mặc định)', defaultOp.status === 200);

const inOp = await call('GET', `/api/data/grades?tenDot=${DOT}&MaLopHocPhan__in=A,B,C`);
check('Toán tử in với danh sách', inOp.status === 200);

const badField = await call('GET', `/api/data/grades?tenDot=${DOT}&KhongCoTruongNay=1`);
check('Lọc theo trường không tồn tại -> 400', badField.status === 400, badField.body?.message?.slice(0, 46));

const badOp = await call('GET', `/api/data/grades?tenDot=${DOT}&DiemTongKet__evil=1`);
check('Toán tử lạ -> 400', badOp.status === 400);

const badType = await call('GET', `/api/data/grades?tenDot=${DOT}&DiemTongKet__gte=abc`);
check('Giá trị sai kiểu -> 400', badType.status === 400, badType.body?.message?.slice(0, 40));

const badSort = await call(
  'GET',
  `/api/data/grades?tenDot=${DOT}&sort=${encodeURIComponent('1; DROP TABLE x')}`
);
check('Sort injection -> 400', badSort.status === 400);

const badDataset = await call('GET', '/api/data/khongcogi');
check('Dataset lạ -> 404', badDataset.status === 404);

// Tab Dữ liệu Moodle
const mc = await call('GET', '/api/moodle/courses');
check('Moodle · Khóa học', mc.status === 200 && mc.body?.data?.items?.[0]?.shortname === `LHP1_${TEN_DOT}`);

const mu = await call('GET', '/api/moodle/users?key=auth&value=manual');
check('Moodle · Người dùng', mu.status === 200 && mu.body?.data?.items?.[0]?.idnumber === '1653965');

const mm = await call('GET', '/api/moodle/courses/900/users?roleid=5');
check('Moodle · Thành viên lớp lọc role 5', mm.status === 200 && mm.body?.data?.items?.length === 1 &&
  mm.body.data.items[0].roles === 'student', `${mm.body?.data?.items?.length} dòng`);

const mmAll = await call('GET', '/api/moodle/courses/900/users');
check('Moodle · Thành viên lớp không lọc', mmAll.body?.data?.items?.length === 2);

// Tab Đồng bộ: các nút
console.log('\n=== NÚT ĐỒNG BỘ ===');
for (const [label, path] of [
  ['Khoa/Bộ môn', '/api/sync/categories'],
  ['Sinh viên', '/api/sync/students'],
  ['Giảng viên', '/api/sync/teachers'],
  ['Khóa học', '/api/sync/courses'],
  ['SV vào lớp', '/api/enrollments/students'],
  ['GV vào lớp', '/api/enrollments/teachers'],
]) {
  const r = await call('POST', path, { tenDot: TEN_DOT });
  const d = r.body?.data;
  check(`${label}`, [200, 207].includes(r.status) && typeof d?.total === 'number',
    `HTTP ${r.status} · total=${d?.total} ok=${d?.succeeded} skip=${d?.skipped} fail=${d?.failed}`);
}

// Nút một đối tượng
for (const [label, path] of [
  ['Một SV', '/api/sync/students/1653965'],
  ['Một GV', '/api/sync/teachers/01025'],
  ['Một lớp', '/api/sync/courses/LHP1'],
  ['Một SV vào lớp', '/api/enrollments/students/1653965'],
  ['Một GV vào lớp', '/api/enrollments/teachers/01025'],
]) {
  const r = await call('POST', path, { tenDot: TEN_DOT });
  check(`${label}`, [200, 207].includes(r.status) && typeof r.body?.data?.total === 'number',
    `HTTP ${r.status} · details=${Array.isArray(r.body?.data?.details) ? r.body.data.details.length : 'không có'}`);
}

// Thiếu tenDot khi đồng bộ
const noTenDot = await call('POST', '/api/sync/students', {});
check('Đồng bộ thiếu tenDot -> 400', noTenDot.status === 400);

console.log(failures === 0 ? '\nPASS  toàn bộ endpoint giao diện dùng đều hoạt động' : `\nFAIL  ${failures} mục lỗi`);

server.close();
process.exit(failures === 0 ? 0 : 1);
