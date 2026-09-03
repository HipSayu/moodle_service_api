// Smoke test đồng bộ theo khóa (K70, K71...):
// dựng server với SQL/Moodle giả rồi kiểm tra việc giải mã khóa người dùng nhập
// và bộ lọc thực sự được truyền xuống tầng truy vấn.
import http from 'node:http';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import App from '../src/app.js';

const TEN_DOT = 'HK1 2025-2026';

// Danh sách khóa giống hệt dữ liệu thật: tên không theo chuẩn nào
const COHORTS = [
  { IDKhoaHoc: 47, TenKhoaHoc: 'Khóa 70 (2025)', NamKhoaHoc: 2025, TenDot: TEN_DOT, SoLopHoc: 121, SoLopHocPhan: 1125 },
  { IDKhoaHoc: 45, TenKhoaHoc: 'Khóa 69 (2024)', NamKhoaHoc: 2024, TenDot: TEN_DOT, SoLopHoc: 118, SoLopHocPhan: 1062 },
  { IDKhoaHoc: 64, TenKhoaHoc: 'K71', NamKhoaHoc: 2027, TenDot: TEN_DOT, SoLopHoc: 2, SoLopHocPhan: 5 },
  { IDKhoaHoc: 46, TenKhoaHoc: '2024-07', NamKhoaHoc: 2024, TenDot: TEN_DOT, SoLopHoc: 24, SoLopHocPhan: 51 },
];

databaseService.checkConnection = async () => true;
databaseService.isConnected = true;

// Chỉ dataset cohorts cần chạy qua executeQuery (endpoint /api/data/cohorts)
databaseService.executeQuery = async (query) => {
  if (query.includes('COUNT(*)')) return { recordset: [{ total: COHORTS.length }] };
  if (query.includes('DM_KhoaHoc kh')) return { recordset: COHORTS };
  return { recordset: [] };
};

// Ghi lại tham số mà tầng đồng bộ truyền xuống truy vấn
const calls = [];
const record = (name, args) => { calls.push({ name, ...args }); };
const lastCall = (name) => [...calls].reverse().find((c) => c.name === name);

databaseService.getStudents = async (args) => {
  record('getStudents', args);
  // Cùng một sinh viên xuất hiện ở 2 khóa -> tầng đồng bộ phải gộp lại
  return [
    { MaSinhVien: '1653965', HoDem: 'Nguyen Van', Ten: 'A', HoTenSinhVien: 'Nguyen Van A', Email: 'a@x.vn', IDKhoaHoc: 47, TenKhoaHoc: 'Khóa 70 (2025)' },
    { MaSinhVien: '1653965', HoDem: 'Nguyen Van', Ten: 'A', HoTenSinhVien: 'Nguyen Van A', Email: 'a@x.vn', IDKhoaHoc: 45, TenKhoaHoc: 'Khóa 69 (2024)' },
    { MaSinhVien: '1653966', HoDem: 'Le', Ten: 'C', HoTenSinhVien: 'Le C', Email: 'c@x.vn', IDKhoaHoc: 47, TenKhoaHoc: 'Khóa 70 (2025)' },
  ];
};
databaseService.getTeachers = async (args) => {
  record('getTeachers', args);
  return [
    { MaNhanSu: '01025', HoDem: 'Tran Thi', Ten: 'B', HoTenGiangVien: 'Tran Thi B', Email: 'b@x.vn', IDKhoaHoc: 47 },
    { MaNhanSu: '01025', HoDem: 'Tran Thi', Ten: 'B', HoTenGiangVien: 'Tran Thi B', Email: 'b@x.vn', IDKhoaHoc: 45 },
  ];
};
databaseService.getCourses = async (args) => {
  record('getCourses', args);
  return [{ MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, TenLopHoc: '70KAE', TenMonHoc: 'Toan', IDToBoMon: 7, SoTietLyThuyet: 45, SoTietThucHanh: 0, IDKhoaHoc: 47 }];
};
databaseService.getStudentEnrollments = async (args) => {
  record('getStudentEnrollments', args);
  return [{ MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, MaSinhVien: '1653965', HoTenSinhVien: 'Nguyen Van A', TenMonHoc: 'Toan', TenLopHoc: '70KAE', IDKhoaHoc: 47 }];
};
databaseService.getTeacherEnrollments = async (args) => {
  record('getTeacherEnrollments', args);
  return [{ MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, MaGiangVien: '01025', HoTenGiangVien: 'Tran Thi B', TenMonHoc: 'Toan', TenLopHoc: '70KAE', IsTroGiang: 0, IDKhoaHoc: 47 }];
};

// Moodle giả: mọi thứ đã tồn tại nên tác vụ chạy nhanh và không gọi ra ngoài
moodleService.checkConnection = async () => 'HUCE Moodle';
moodleService.getUserByIdNumber = async () => ({ id: 101, fullname: 'Nguyen Van A' });
moodleService.updateUser = async () => true;
moodleService.getCourseByShortname = async () => ({ id: 900, fullname: '70KAE - Toan' });
moodleService.getCategories = async () => [{ id: 55, idnumber: '7', name: 'BM Phan mem' }];
moodleService.getEnrolledUsers = async () => [];
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

console.log('=== ĐỌC SỐ KHÓA TỪ CHUỖI TỰ DO ===');
for (const [input, expected] of [
  ['70', 70],
  ['K70', 70],
  ['k 70', 70],
  ['Khóa 70 (2025)', 70],
  ['Khoa 71', 71],
  ['K71', 71],
  ['2024-07', null],
  ['abc', null],
]) {
  const got = databaseService.cohortNumber(input);
  check(`cohortNumber(${JSON.stringify(input)}) = ${expected}`, got === expected, `nhận ${got}`);
}

console.log('\n=== DANH SÁCH KHÓA TRONG ĐỢT ===');
const list = await call('GET', `/api/data/cohorts?tenDot=${encodeURIComponent(TEN_DOT)}`);
check('GET /api/data/cohorts', list.status === 200 && list.body?.data?.items?.length === 4,
  `HTTP ${list.status}, ${list.body?.data?.items?.length} khóa`);
check('Có số lớp học phần để biết khóa nào đang chạy',
  list.body?.data?.items?.[0]?.SoLopHocPhan !== undefined);

console.log('\n=== TAB DỮ LIỆU LỌC THEO KHÓA ===');

const dataKhoa = await call('GET', `/api/data/students?tenDot=${encodeURIComponent(TEN_DOT)}&idKhoaHoc=47`);
check('GET /api/data/students?idKhoaHoc=47', dataKhoa.status === 200, `HTTP ${dataKhoa.status}`);

const dataKhoaText = await call('GET', `/api/data/courses?tenDot=${encodeURIComponent(TEN_DOT)}&khoaHoc=K71`);
check('GET /api/data/courses?khoaHoc=K71', dataKhoaText.status === 200, `HTTP ${dataKhoaText.status}`);

const dataBadKhoa = await call('GET', '/api/data/categories?khoaHoc=70');
check('Dataset không hỗ trợ khóa -> 400', dataBadKhoa.status === 400, dataBadKhoa.body?.message);

const dsList = await call('GET', '/api/data');
check('Danh sách dataset có cờ khoaHocFilter',
  dsList.body?.data?.datasets?.some((d) => d.name === 'students' && d.khoaHocFilter === true) &&
    dsList.body?.data?.datasets?.some((d) => d.name === 'categories' && d.khoaHocFilter === false));

console.log('\n=== ĐỒNG BỘ THEO KHÓA ===');

const byNumber = await call('POST', '/api/sync/students', { tenDot: TEN_DOT, khoaHoc: '70' });
check('khoaHoc="70" -> lọc IDKhoaHoc 47', byNumber.status === 200 && lastCall('getStudents')?.idKhoaHoc === 47,
  `idKhoaHoc=${lastCall('getStudents')?.idKhoaHoc}`);
check('Thông báo ghi rõ tên khóa', (byNumber.body?.message || '').includes('Khóa 70 (2025)'), byNumber.body?.message);
check('Sinh viên ở 2 khóa chỉ xử lý một lần', byNumber.body?.data?.total === 2,
  `total=${byNumber.body?.data?.total}`);

const byK = await call('POST', '/api/sync/students', { tenDot: TEN_DOT, khoaHoc: 'K71' });
check('khoaHoc="K71" -> lọc IDKhoaHoc 64', byK.status === 200 && lastCall('getStudents')?.idKhoaHoc === 64,
  `idKhoaHoc=${lastCall('getStudents')?.idKhoaHoc}`);

const byFullName = await call('POST', '/api/sync/courses', { tenDot: TEN_DOT, khoaHoc: 'Khóa 69 (2024)' });
check('khoaHoc là tên đầy đủ -> lọc IDKhoaHoc 45', byFullName.status === 200 && lastCall('getCourses')?.idKhoaHoc === 45,
  `idKhoaHoc=${lastCall('getCourses')?.idKhoaHoc}`);

const byId = await call('POST', '/api/enrollments/students', { tenDot: TEN_DOT, idKhoaHoc: 47 });
check('idKhoaHoc=47 -> lọc đúng khóa', byId.status === 200 && lastCall('getStudentEnrollments')?.idKhoaHoc === 47,
  `idKhoaHoc=${lastCall('getStudentEnrollments')?.idKhoaHoc}`);

const noKhoa = await call('POST', '/api/enrollments/teachers', { tenDot: TEN_DOT });
check('Không chọn khóa -> chạy cả đợt', noKhoa.status === 200 && lastCall('getTeacherEnrollments')?.idKhoaHoc === null,
  `idKhoaHoc=${lastCall('getTeacherEnrollments')?.idKhoaHoc}`);

console.log('\n=== KHÓA KHÔNG HỢP LỆ ===');

const before = calls.length;

const unknown = await call('POST', '/api/sync/students', { tenDot: TEN_DOT, khoaHoc: '999' });
check('Khóa không có trong đợt -> 400', unknown.status === 400, unknown.body?.message?.slice(0, 60));
check('Báo lỗi kèm danh sách khóa để chọn lại', (unknown.body?.message || '').includes('Khóa 70 (2025)'));

const ambiguous = await call('POST', '/api/sync/students', { tenDot: TEN_DOT, khoaHoc: '4' });
check('Khớp nhiều khóa -> 400 kèm id để chọn', ambiguous.status === 400 && (ambiguous.body?.message || '').includes('='),
  ambiguous.body?.message?.slice(0, 70));

const badId = await call('POST', '/api/sync/students', { tenDot: TEN_DOT, idKhoaHoc: 12345 });
check('idKhoaHoc không thuộc đợt -> 400', badId.status === 400, badId.body?.message?.slice(0, 60));

check('Khóa sai thì không chạy đồng bộ nào', calls.length === before, `${calls.length - before} lần gọi`);

console.log(failures === 0 ? '\nPASS  đồng bộ theo khóa hoạt động đúng' : `\nFAIL  ${failures} kiểm tra không đạt`);

server.close();
process.exit(failures === 0 ? 0 : 1);
