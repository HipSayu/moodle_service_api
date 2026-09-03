// Smoke test luồng gộp lớp: dựng server với moodleService giả rồi gọi
// /api/moodle/courses/merge{,/preview} như giao diện vẫn gọi.
import http from 'node:http';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import App from '../src/app.js';

databaseService.checkConnection = async () => true;
databaseService.isConnected = true;

// ---- Moodle giả ----
// Lớp 901 và 902 có chung sinh viên 101 (đúng tình huống cần hợp nhất)
const COURSES = {
  901: { id: 901, shortname: 'LHP1_HK1', fullname: '67CS1 - Toan', idnumber: 'LHP1', categoryid: 55, visible: 1, startdate: 1700000000, enddate: 1710000000 },
  902: { id: 902, shortname: 'LHP2_HK1', fullname: '67CS2 - Toan', idnumber: 'LHP2', categoryid: 55, visible: 1, startdate: 1690000000, enddate: 1720000000 },
};

const MEMBERS = {
  901: [
    { id: 101, username: 'a@x.vn', idnumber: '1653965', fullname: 'Nguyen Van A', roles: [{ roleid: 5 }] },
    { id: 201, username: 'gv@x.vn', idnumber: '01025', fullname: 'Tran Thi B', roles: [{ roleid: 3 }] },
  ],
  902: [
    { id: 101, username: 'a@x.vn', idnumber: '1653965', fullname: 'Nguyen Van A', roles: [{ roleid: 5 }] },
    { id: 102, username: 'c@x.vn', idnumber: '1653966', fullname: 'Le Van C', roles: [] }, // không vai trò -> mặc định sinh viên
  ],
};

const state = { created: [], enrolled: [], deleted: [], sections: [], failUserId: null };

moodleService.checkConnection = async () => 'HUCE Moodle';
moodleService.getCoursesByIds = async (ids) => ids.map((id) => COURSES[id]).filter(Boolean);
moodleService.getEnrolledUsers = async (id) => MEMBERS[id] || [];
moodleService.getCourseByShortname = async (sn) =>
  Object.values(COURSES).find((c) => c.shortname === sn) || null;
moodleService.getCourseContents = async () => [
  { section: 0, name: 'General' },
  { section: 1, name: 'Chương 1', summary: '' },
  { section: 2, name: 'Kiểm tra cuối kì', summary: '' },
];
moodleService.createSectionWithPlugin = async (courseId, data) => {
  state.sections.push(data.name);
  return { sectionid: state.sections.length, name: data.name };
};
moodleService.createCourse = async (data) => {
  state.created.push(data);
  return { id: 950, shortname: data.course_shortname };
};
moodleService.enrolUsers = async (items) => {
  if (state.failUserId && items.some((i) => i.userId === state.failUserId)) {
    throw new Error('Moodle API Error: enrol thất bại');
  }
  state.enrolled.push(...items);
  return items.length;
};
moodleService.deleteCourses = async (ids) => {
  state.deleted.push(...ids);
  return [];
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

const reset = () => {
  state.created = [];
  state.enrolled = [];
  state.deleted = [];
  state.sections = [];
  state.failUserId = null;
};

console.log('=== XEM TRƯỚC ===');

const preview = await call('POST', '/api/moodle/courses/merge/preview', { sourceCourseIds: [901, 902] });
check('Preview HTTP 200', preview.status === 200, `HTTP ${preview.status}`);
check('Hợp nhất còn 3 thành viên', preview.body?.data?.members?.unique === 3, `${preview.body?.data?.members?.unique}`);
check('Đếm đúng 1 lượt trùng', preview.body?.data?.members?.duplicated === 1);
check('Gợi ý shortname ghép 2 lớp', preview.body?.data?.suggestion?.shortname === 'LHP1_HK1+LHP2_HK1', preview.body?.data?.suggestion?.shortname);
check('Tóm tắt đủ 2 lớp nguồn', preview.body?.data?.sources?.length === 2);

const oneId = await call('POST', '/api/moodle/courses/merge/preview', { sourceCourseIds: [901] });
check('Chọn 1 lớp -> 400', oneId.status === 400, oneId.body?.message);

const sameId = await call('POST', '/api/moodle/courses/merge/preview', { sourceCourseIds: [901, 901] });
check('Chọn trùng một lớp -> 400', sameId.status === 400);

const siteHome = await call('POST', '/api/moodle/courses/merge/preview', { sourceCourseIds: [1, 901] });
check('Gộp trang chủ site -> 400', siteHome.status === 400, siteHome.body?.message);

const notFound = await call('POST', '/api/moodle/courses/merge/preview', { sourceCourseIds: [901, 999] });
check('Course id không tồn tại -> 404', notFound.status === 404, notFound.body?.message);

console.log('\n=== CHẶN TRƯỚC KHI XÓA ===');

const noConfirm = await call('POST', '/api/moodle/courses/merge', {
  sourceCourseIds: [901, 902], fullname: 'Lop gop', shortname: 'GOP1',
});
check('Thiếu confirm -> 400', noConfirm.status === 400, noConfirm.body?.message?.slice(0, 40));
check('Chưa tạo lớp nào khi bị chặn', state.created.length === 0);

const dupShortname = await call('POST', '/api/moodle/courses/merge', {
  sourceCourseIds: [901, 902], fullname: 'Lop gop', shortname: 'LHP1_HK1', confirm: true,
});
check('Trùng shortname -> 400', dupShortname.status === 400, dupShortname.body?.message?.slice(0, 40));
check('Không tạo lớp khi shortname trùng', state.created.length === 0);

const noName = await call('POST', '/api/moodle/courses/merge', {
  sourceCourseIds: [901, 902], shortname: 'GOP1', confirm: true,
});
check('Thiếu fullname -> 400', noName.status === 400);

console.log('\n=== GỘP THÀNH CÔNG ===');
reset();

const merged = await call('POST', '/api/moodle/courses/merge', {
  sourceCourseIds: [901, 902],
  fullname: 'Lop gop 67CS',
  shortname: 'GOP_67CS',
  categoryid: 55,
  confirm: true,
});

const data = merged.body?.data;
check('HTTP 200', merged.status === 200, `HTTP ${merged.status}`);
check('Tạo đúng 1 lớp mới', state.created.length === 1);
check('Lớp mới đúng tên', state.created[0]?.course_shortname === 'GOP_67CS');
check('Lấy startdate sớm nhất của lớp nguồn', state.created[0]?.start_date?.getTime() === 1690000000 * 1000);
check('Lấy enddate muộn nhất của lớp nguồn', state.created[0]?.end_date?.getTime() === 1720000000 * 1000);
check('Sao chép section, bỏ section 0', state.sections.length === 2 && !state.sections.includes('General'), state.sections.join(', '));
check('Chuyển 3 thành viên', data?.total === 3 && data?.succeeded === 3, `total=${data?.total} ok=${data?.succeeded}`);
check('Không đăng ký trùng người ở 2 lớp', state.enrolled.filter((e) => e.userId === 101).length === 1);
check('Giữ vai trò giảng viên', state.enrolled.some((e) => e.userId === 201 && e.roleId === 3));
check('Không có vai trò -> mặc định sinh viên', state.enrolled.some((e) => e.userId === 102 && e.roleId === 5));
check('Mọi enrolment vào lớp mới', state.enrolled.every((e) => e.courseId === 950));
check('Đã xóa 2 lớp nguồn', state.deleted.length === 2 && state.deleted.includes(901) && state.deleted.includes(902));
check('Trả về link lớp mới', typeof data?.targetCourse?.url === 'string' && data.targetCourse.id === 950);
check('Có chi tiết từng thành viên', data?.details?.length === 3);

console.log('\n=== GIỮ LỚP NGUỒN ===');
reset();

const keep = await call('POST', '/api/moodle/courses/merge', {
  sourceCourseIds: [901, 902], fullname: 'Lop gop 2', shortname: 'GOP_2', deleteSources: false,
});
check('deleteSources=false không cần confirm', keep.status === 200, `HTTP ${keep.status}`);
check('Không xóa lớp nguồn', state.deleted.length === 0);
check('Vẫn chuyển đủ thành viên', keep.body?.data?.succeeded === 3);

console.log('\n=== CÓ THÀNH VIÊN LỖI THÌ KHÔNG XÓA ===');
reset();
state.failUserId = 102;

const partial = await call('POST', '/api/moodle/courses/merge', {
  sourceCourseIds: [901, 902], fullname: 'Lop gop 3', shortname: 'GOP_3', confirm: true,
});
check('Có lỗi -> HTTP 207', partial.status === 207, `HTTP ${partial.status}`);
check('Đếm đúng 1 người lỗi', partial.body?.data?.failed === 1, `failed=${partial.body?.data?.failed}`);
check('KHÔNG xóa lớp nguồn khi còn người lỗi', state.deleted.length === 0);
check('Có cảnh báo cho người vận hành', (partial.body?.data?.warnings || []).some((w) => w.includes('KHÔNG xóa')));
// Cả lô hỏng vì một người, đăng ký lại từng người thì 2 người còn lại vẫn vào được
check('Những người còn lại vẫn được chuyển', state.enrolled.length === 2, `${state.enrolled.length} enrolment`);
check('Người lỗi không bị bỏ sót khỏi báo cáo', (partial.body?.data?.details || []).some((d) => d.TrangThai === 'Lỗi'));

console.log(failures === 0 ? '\nPASS  luồng gộp lớp hoạt động đúng' : `\nFAIL  ${failures} kiểm tra không đạt`);

server.close();
process.exit(failures === 0 ? 0 : 1);
