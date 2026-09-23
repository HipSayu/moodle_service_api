// Smoke test dọn ghi danh nhầm cơ sở.
// Thao tác này GỠ người ra khỏi lớp nên phải chắc chắn chỉ gỡ đúng đối tượng.
import http from 'node:http';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import App from '../src/app.js';

const TEN_DOT = 'HK1 2026-2027';
const SHARED = `MH01_${TEN_DOT}`; // khóa học dùng chung của cơ sở chính

databaseService.checkConnection = async () => true;
databaseService.isConnected = true;
databaseService.executeQuery = async () => ({ recordset: [] });

// MH01 dạy ở cả 2 cơ sở:
//   SV_HN  - cơ sở chính        -> phải giữ
//   SV_HCM - chỉ cơ sở HCM      -> phải gỡ
//   SV_CA2 - học ở cả hai cơ sở -> phải giữ
// MH02 chỉ có ở cơ sở chính -> không đụng tới
databaseService.getStudentEnrollments = async () => [
  { MaLopHocPhan: 'MH01', TenDot: TEN_DOT, TenMonHoc: 'Toan', TenLopHoc: '71HN', MaSinhVien: 'SV_HN', HoTenSinhVien: 'Nguyen Van HN', IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính' },
  { MaLopHocPhan: 'MH01', TenDot: TEN_DOT, TenMonHoc: 'Toan', TenLopHoc: '71CS_S', MaSinhVien: 'SV_HCM', HoTenSinhVien: 'Tran Thi HCM', IDCoSo: 4, MaCoSo: 'CS3', TenCoSo: 'Cơ sở Hồ Chí Minh' },
  { MaLopHocPhan: 'MH01', TenDot: TEN_DOT, TenMonHoc: 'Toan', TenLopHoc: '71CS_S', MaSinhVien: 'SV_CA2', HoTenSinhVien: 'Le Van CA2', IDCoSo: 4, MaCoSo: 'CS3', TenCoSo: 'Cơ sở Hồ Chí Minh' },
  { MaLopHocPhan: 'MH01', TenDot: TEN_DOT, TenMonHoc: 'Toan', TenLopHoc: '71HN', MaSinhVien: 'SV_CA2', HoTenSinhVien: 'Le Van CA2', IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính' },
  { MaLopHocPhan: 'MH02', TenDot: TEN_DOT, TenMonHoc: 'Ly', TenLopHoc: '71HN', MaSinhVien: 'SV_HN', HoTenSinhVien: 'Nguyen Van HN', IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính' },
];

// Trong khóa học dùng chung trên Moodle đang có cả 4 người + 1 giảng viên
const moodleUsers = {
  SV_HN: { id: 101, idnumber: 'SV_HN', roles: [{ roleid: 5 }] },
  SV_HCM: { id: 102, idnumber: 'SV_HCM', roles: [{ roleid: 5 }] },
  SV_CA2: { id: 103, idnumber: 'SV_CA2', roles: [{ roleid: 5 }] },
  GV: { id: 201, idnumber: 'SV_HCM', roles: [{ roleid: 3 }] }, // trùng idnumber nhưng là giảng viên
};

const unenrolled = [];
moodleService.checkConnection = async () => 'HUCE Moodle';
moodleService.getCourseByShortname = async (sn) => (sn === SHARED ? { id: 900, fullname: 'Toan' } : null);
moodleService.getEnrolledUsers = async (cid) => (cid === 900 ? Object.values(moodleUsers) : []);
moodleService.unenrollUserFromCourse = async (userId, courseId) => {
  unenrolled.push({ userId, courseId });
  return true;
};

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

console.log('=== XEM TRƯỚC (apply=false) ===');

const preview = await call('POST', '/api/enrollments/cleanup-campus', { tenDot: TEN_DOT });
const dsPreview = preview.body?.data?.details || [];

check('HTTP 200', preview.status === 200, `HTTP ${preview.status}`);
check('Chỉ liệt kê đúng 1 người cần gỡ', dsPreview.length === 1, `${dsPreview.length} dòng`);
check('Đúng sinh viên chỉ học ở cơ sở HCM', dsPreview[0]?.MaSinhVien === 'SV_HCM', dsPreview[0]?.MaSinhVien);
check('Ghi rõ lớp đúng mà em đó phải vào', dsPreview[0]?.ShortNameDung === `MH01_CS3_${TEN_DOT}`, dsPreview[0]?.ShortNameDung);
check('Trạng thái là "Sẽ gỡ"', dsPreview[0]?.TrangThai === 'Sẽ gỡ');
check('XEM TRƯỚC KHÔNG GỠ AI', unenrolled.length === 0, `${unenrolled.length} lần gọi gỡ`);
check('Có file Excel để kiểm tra trước', Boolean(preview.body?.data?.excelFile));

console.log('\n=== CHẶN GỠ NHẦM ===');

const noConfirm = await call('POST', '/api/enrollments/cleanup-campus', { tenDot: TEN_DOT, apply: true });
check('apply=true thiếu confirm -> 400', noConfirm.status === 400, noConfirm.body?.message?.slice(0, 50));
check('Vẫn chưa gỡ ai', unenrolled.length === 0);

const noTenDot = await call('POST', '/api/enrollments/cleanup-campus', { apply: true, confirm: true });
check('Thiếu tenDot -> 400', noTenDot.status === 400);

console.log('\n=== GỠ THẬT (apply=true, confirm=true) ===');

const applied = await call('POST', '/api/enrollments/cleanup-campus', {
  tenDot: TEN_DOT, apply: true, confirm: true,
});
const dsApplied = applied.body?.data?.details || [];

check('HTTP 200', applied.status === 200, `HTTP ${applied.status}`);
check('Gỡ đúng 1 người', unenrolled.length === 1, `${unenrolled.length} lần gọi gỡ`);
check('Gỡ đúng userId 102 (SV_HCM) khỏi course 900',
  unenrolled[0]?.userId === 102 && unenrolled[0]?.courseId === 900,
  JSON.stringify(unenrolled[0]));
check('Trạng thái là "Đã gỡ"', dsApplied[0]?.TrangThai === 'Đã gỡ');

console.log('\n=== KHÔNG ĐỤNG NHỮNG NGƯỜI CÒN LẠI ===');
const goBo = unenrolled.map((u) => u.userId);
check('Giữ sinh viên cơ sở chính (101)', !goBo.includes(101));
check('Giữ sinh viên học ở CẢ HAI cơ sở (103)', !goBo.includes(103));
check('Không gỡ giảng viên (201)', !goBo.includes(201));

console.log(failures === 0 ? '\nPASS  dọn ghi danh nhầm cơ sở hoạt động đúng' : `\nFAIL  ${failures} kiểm tra không đạt`);

server.close();
process.exit(failures === 0 ? 0 : 1);
