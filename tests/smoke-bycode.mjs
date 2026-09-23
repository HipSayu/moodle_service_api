// Smoke test đồng bộ sinh viên theo mã, không cần chọn đợt.
import http from 'node:http';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import App from '../src/app.js';

// Hồ sơ trong DT_SinhVien: 2 em có thật, mã 9999999 không tồn tại.
// 1083471 chưa đăng ký học phần nào -> vẫn phải lên được Moodle.
const HO_SO = {
  '1083471': { MaSinhVien: '1083471', HoDem: 'Nguyen Van', Ten: 'A', HoTenSinhVien: 'Nguyen Van A', Email: null, NguyenQuan: 'HN', MaLop: '71XDC2', TrangThai: 1 },
  '1083472': { MaSinhVien: '1083472', HoDem: 'Tran Thi', Ten: 'B', HoTenSinhVien: 'Tran Thi B', Email: 'b@x.vn', NguyenQuan: 'HN', MaLop: '71XDC6', TrangThai: 1 },
};

databaseService.checkConnection = async () => true;
databaseService.isConnected = true;

// Chỉ dataset cohort-students được tra; ghi lại tham số để kiểm tra
const queries = [];
databaseService.queryDatasetAll = async (name, options) => {
  queries.push({ name, options });
  if (name !== 'cohort-students') return [];

  const filter = (options.filters || []).find((f) => f.field === 'MaSinhVien');
  const codes = String(filter?.value ?? '').split(',').map((c) => c.trim());
  return codes.map((c) => HO_SO[c]).filter(Boolean);
};

const created = [];
moodleService.checkConnection = async () => 'HUCE Moodle';
moodleService.getUserByIdNumber = async () => null;
moodleService.createUser = async (data) => { created.push(data); return { id: 900 + created.length }; };
moodleService.updateUser = async () => true;

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

console.log('=== MỘT MÃ, KHÔNG GỬI ĐỢT ===');

const one = await call('POST', '/api/sync/students/1083471', {});
check('Không cần tenDot -> HTTP 200', one.status === 200, `HTTP ${one.status}`);
check('Tạo tài khoản cho em chưa đăng ký học phần', created.length === 1, `${created.length} user`);
check('Không đụng tới bảng đăng ký học phần',
  queries.every((q) => q.name === 'cohort-students'),
  queries.map((q) => q.name).join(', '));
check('Email trống -> tự sinh theo mã',
  created[0]?.email === '1083471@st.huce.edu.vn', created[0]?.email);

console.log('\n=== NHIỀU MÃ MỘT LẦN ===');
created.length = 0;

const many = await call('POST', '/api/sync/students/by-code', { maSinhVien: '1083471, 1083472' });
check('HTTP 200', many.status === 200, `HTTP ${many.status}`);
check('Đồng bộ cả 2 em', many.body?.data?.total === 2, `total=${many.body?.data?.total}`);
check('Giữ nguyên email có sẵn', created.some((u) => u.email === 'b@x.vn'));

console.log('\n=== MÃ KHÔNG CÓ HỒ SƠ ===');
created.length = 0;

const mixed = await call('POST', '/api/sync/students/by-code', { maSinhVien: '1083471,9999999' });
check('Vẫn đồng bộ em có hồ sơ', mixed.body?.data?.total === 1, `total=${mixed.body?.data?.total}`);
check('Báo rõ mã không tìm thấy',
  (mixed.body?.data?.khongTimThay || []).includes('9999999'),
  JSON.stringify(mixed.body?.data?.khongTimThay));
check('Thông báo nhắc mã thiếu', (mixed.body?.message || '').includes('9999999'), mixed.body?.message);

const allMissing = await call('POST', '/api/sync/students/by-code', { maSinhVien: '9999999' });
check('Toàn mã sai -> 404', allMissing.status === 404, `HTTP ${allMissing.status}`);

const empty = await call('POST', '/api/sync/students/by-code', {});
check('Thiếu mã -> 400', empty.status === 400, empty.body?.message?.slice(0, 40));

console.log('\n=== GIỚI HẠN SỐ MÃ ===');
const tooMany = await call('POST', '/api/sync/students/by-code', {
  maSinhVien: Array.from({ length: 201 }, (_, i) => `MA${i}`).join(','),
});
check('Quá 200 mã -> 400', tooMany.status === 400, tooMany.body?.message?.slice(0, 50));

console.log(failures === 0 ? '\nPASS  đồng bộ sinh viên theo mã hoạt động đúng' : `\nFAIL  ${failures} kiểm tra không đạt`);

server.close();
process.exit(failures === 0 ? 0 : 1);
