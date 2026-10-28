// Smoke test lịch sử chạy: dùng MongoDB giả trong bộ nhớ, không đụng MongoDB thật.
import http from 'node:http';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import historyService from '../src/services/historyService.js';
import App from '../src/app.js';
import { createFakeDb } from './helpers/fakeMongo.mjs';

const HO_SO = {
  '1083471': { MaSinhVien: '1083471', HoDem: 'Nguyen Van', Ten: 'A', HoTenSinhVien: 'Nguyen Van A', Email: null, NguyenQuan: 'HN', MaLop: '71XDC2', TrangThai: 1 },
  '1083472': { MaSinhVien: '1083472', HoDem: 'Tran Thi', Ten: 'B', HoTenSinhVien: 'Tran Thi B', Email: 'b@x.vn', NguyenQuan: 'HN', MaLop: '71XDC6', TrangThai: 1 },
};

databaseService.checkConnection = async () => true;
databaseService.isConnected = true;
databaseService.queryDatasetAll = async (name, options) => {
  if (name !== 'cohort-students') return [];
  const filter = (options.filters || []).find((f) => f.field === 'MaSinhVien');
  return String(filter?.value ?? '').split(',').map((c) => HO_SO[c.trim()]).filter(Boolean);
};

// 1083472 tạo tài khoản lỗi để có cả dòng thành công lẫn dòng lỗi
moodleService.checkConnection = async () => 'HUCE Moodle';
moodleService.getUserByIdNumber = async () => null;
moodleService.updateUser = async () => true;
moodleService.createUser = async (data) => {
  if (data.idnumber === '1083472') throw new Error('Moodle API Error: email trùng');
  return { id: 901 };
};

historyService.useDb(createFakeDb());

const app = new App();
app.initializeMiddleware();
app.initializeRoutes();
const server = app.app.listen(0);
const port = server.address().port;

const call = (method, path, body, headers = {}) =>
  new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        method, port, path,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(text); } catch { /* CSV hoặc không phải JSON */ }
          resolve({ status: res.statusCode, headers: res.headers, text, body: parsed });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 'ERR', headers: {}, text: '', body: { message: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) failures++;
  console.log(`  ${cond ? 'ok      ' : 'FAIL    '} ${label}${extra ? ' — ' + extra : ''}`);
};

const runs = historyService.runs.docs;
const details = historyService.details.docs;

console.log('=== GHI LỊCH SỬ KHI CHẠY TÁC VỤ ===');

const auth = 'Basic ' + Buffer.from('daotao:matkhau').toString('base64');
const res = await call('POST', '/api/sync/students/by-code', { maSinhVien: '1083471,1083472' }, {
  'X-Task-Title': encodeURIComponent('Tài khoản SV — 2 mã'),
  'X-Task-Page': 'students',
  Authorization: auth,
});
await sleep(50);

const runId = res.headers['x-run-id'];
const run = runs.find((r) => String(r._id) === runId);

check('Tác vụ vẫn chạy bình thường (207 vì có 1 lỗi)', res.status === 207, `HTTP ${res.status}`);
check('Trả về X-Run-Id', /^[a-f0-9]{24}$/.test(runId || ''), runId);
check('Tạo đúng 1 bản ghi lần chạy', runs.length === 1);
check('Tên tác vụ lấy từ giao diện', run?.title === 'Tài khoản SV — 2 mã', run?.title);
check('Nguồn chạy = giao diện', run?.trigger === 'ui');
check('Người chạy lấy từ đăng nhập nginx (không lưu mật khẩu)', run?.actor === 'daotao' && !JSON.stringify(run).includes('matkhau'), run?.actor);
check('Phân loại = sync', run?.category === 'sync');
check('Trạng thái = partial', run?.status === 'partial', run?.status);
check('Tổng hợp số liệu', run?.summary?.total === 2 && run?.summary?.succeeded === 1 && run?.summary?.failed === 1, JSON.stringify(run?.summary));
check('Lưu tham số gửi lên', run?.params?.body?.maSinhVien === '1083471,1083472');
check('Có thời lượng', typeof run?.durationMs === 'number' && run.finishedAt instanceof Date);
check('Kết quả không chứa mảng chi tiết nặng', run?.result && !('details' in run.result));
check('Lưu 2 dòng chi tiết', details.length === 2 && run?.detailCount === 2, `${details.length} dòng`);
check('Dòng chi tiết có mã, trạng thái, lỗi để lọc',
  details.some((d) => d.code === '1083472' && d.status === 'Lỗi' && /email trùng/.test(d.error || '')));

console.log('\n=== KHÔNG GHI CÁC LẦN ĐỌC / XEM TRƯỚC ===');

await call('GET', '/api/health');
await call('POST', '/api/moodle/courses/merge/preview', { sourceCourseIds: [1, 2] });
await sleep(30);
check('GET và xem trước gộp lớp không tạo lần chạy', runs.length === 1, `${runs.length} lần chạy`);

const bad = await call('POST', '/api/sync/students/by-code', {});
await sleep(50);
const badRun = runs.find((r) => String(r._id) === bad.headers['x-run-id']);
check('Request lỗi tham số vẫn được ghi, trạng thái failed', bad.status === 400 && badRun?.status === 'failed', badRun?.status);
check('Gọi thẳng API -> tên mặc định, nguồn = api', badRun?.title === 'Tài khoản sinh viên' && badRun?.trigger === 'api', badRun?.title);

console.log('\n=== API ĐỌC LỊCH SỬ ===');

const list = await call('GET', '/api/history/runs?limit=10');
check('Danh sách lần chạy', list.status === 200 && list.body?.data?.total === 2, `total=${list.body?.data?.total}`);
check('Mới nhất lên đầu', list.body?.data?.items?.[0]?.id === bad.headers['x-run-id']);
check('Danh sách không kèm tham số/kết quả chi tiết', !('result' in (list.body?.data?.items?.[0] || {})));

const failedOnly = await call('GET', '/api/history/runs?status=failed');
check('Lọc theo trạng thái', failedOnly.body?.data?.total === 1);

const search = await call('GET', `/api/history/runs?q=${encodeURIComponent('2 mã')}`);
check('Tìm theo tên tác vụ', search.body?.data?.total === 1 && search.body.data.items[0].id === runId);

const one = await call('GET', `/api/history/runs/${runId}`);
check('Xem một lần chạy', one.status === 200 && one.body?.data?.params?.body?.maSinhVien === '1083471,1083472');

const missing = await call('GET', '/api/history/runs/abc');
check('Mã sai -> 404', missing.status === 404);

const d1 = await call('GET', `/api/history/runs/${runId}/details`);
check('Chi tiết từng dòng', d1.body?.data?.total === 2 && d1.body.data.items[0].data?.MaSinhVien === '1083471');
check('Đếm theo trạng thái', (d1.body?.data?.statuses || []).length === 2, JSON.stringify(d1.body?.data?.statuses));

const d2 = await call('GET', `/api/history/runs/${runId}/details?status=${encodeURIComponent('Lỗi')}`);
check('Lọc chi tiết theo trạng thái', d2.body?.data?.total === 1 && d2.body.data.items[0].data.MaSinhVien === '1083472');

const d3 = await call('GET', `/api/history/runs/${runId}/details?q=1083471`);
check('Tìm chi tiết theo mã', d3.body?.data?.total === 1);

const csv = await call('GET', `/api/history/runs/${runId}/export`);
check('Tải CSV', csv.status === 200 && /text\/csv/.test(csv.headers['content-type'] || ''));
check('CSV có BOM, tiêu đề tiếng Việt và đủ 2 dòng',
  csv.text.startsWith('﻿') && csv.text.includes('Mã Sinh Viên') && csv.text.trim().split('\r\n').length === 3);

console.log('\n=== JOB KHÔNG QUA HTTP (scheduler) ===');

await historyService.track(
  { title: 'Đồng bộ tự động', category: 'sync', trigger: 'scheduler', scope: { tenDot: 'HK1 2026-2027' } },
  async () => {
    await historyService.recordRows([{ MaSinhVien: '1', TrangThai: 'Thành công' }], { kind: 'students' });
    return { failed: 0 };
  },
  () => ({ httpStatus: 200, body: { success: true, message: 'xong', data: { total: 1, succeeded: 1, failed: 0 } } })
);
const job = runs.find((r) => r.trigger === 'scheduler');
check('Job ghi thành lần chạy riêng', job?.status === 'success' && job?.detailCount === 1);
check('Chi tiết của job không lẫn vào lần chạy khác', run.detailCount === 2);

console.log('\n=== MONGODB KHÔNG KẾT NỐI ===');

historyService.db = null;
const off = await call('GET', '/api/history/runs');
check('API lịch sử báo 503 kèm trạng thái', off.status === 503 && off.body?.data?.connected === false);
const stillWorks = await call('POST', '/api/sync/students/by-code', { maSinhVien: '1083471' });
check('Tác vụ vẫn chạy khi không có MongoDB', stillWorks.status === 200 && !stillWorks.headers['x-run-id']);

console.log(failures === 0 ? '\nPASS  lịch sử chạy hoạt động đúng' : `\nFAIL  ${failures} kiểm tra không đạt`);
server.close();
process.exit(failures === 0 ? 0 : 1);
