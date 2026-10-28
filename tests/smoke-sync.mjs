// Smoke test tầng service: thay databaseService/moodleService bằng dữ liệu giả
import fs from 'node:fs';
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import syncToMoodleService from '../src/services/syncToMoodleService.js';
import config from '../src/config/index.js';

const TEN_DOT = 'HK1 2026-2027';

// Ghi file CSV/Excel mặc định tắt (đã lưu lịch sử MongoDB); bật lại để kiểm tra phần xuất file
config.exportFiles = true;

// ---- dữ liệu giả ----
// 1083471 trống Email, 1083472 chỉ có khoảng trắng -> phải tự sinh email theo mã sinh viên
databaseService.getStudents = async ({ maSinhVien }) =>
  (maSinhVien
    ? [{ MaSinhVien: maSinhVien, Email: `${maSinhVien}@x.vn` }]
    : [
        { MaSinhVien: 'SV1', Email: 'SV1@x.vn' },
        { MaSinhVien: 'SV2', Email: 'SV2@x.vn' },
        { MaSinhVien: '1083471', Email: null },
        { MaSinhVien: '1083472', Email: '   ' },
      ]
  ).map((s) => ({
    HoDem: 'Nguyen Van',
    Ten: 'A',
    HoTenSinhVien: 'Nguyen Van A',
    NguyenQuan: 'HN',
    ...s,
  }));

databaseService.getTeachers = async () => [
  { MaNhanSu: 'GV1', HoDem: 'Tran Thi', Ten: 'B', HoTenGiangVien: 'Tran Thi B', Email: 'gv1@x.vn' },
];

databaseService.getCourses = async () => [
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, TenLopHoc: '67CS1', TenMonHoc: 'Toan', IDToBoMon: 7, SoTietLyThuyet: 45, SoTietThucHanh: 0, IDCoSo: 1, MaCoSo: 'CS1', TenCoSo: 'Cơ sở chính' },
  { MaLopHocPhan: 'LHP2', TenDot: TEN_DOT, TenLopHoc: '67CS2', TenMonHoc: 'Ly', IDToBoMon: null, SoTietLyThuyet: 15, SoTietThucHanh: 30, IDCoSo: 4, MaCoSo: 'CS3', TenCoSo: 'Cơ sở Hồ Chí Minh' },
];

databaseService.getStudentEnrollments = async () => [
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, TenMonHoc: 'Toan', TenLopHoc: '67CS1', MaSinhVien: 'SV1', HoTenSinhVien: 'Nguyen Van A' },
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, TenMonHoc: 'Toan', TenLopHoc: '67CS1', MaSinhVien: 'SV2', HoTenSinhVien: 'Le Thi C' },
  { MaLopHocPhan: 'LHP9', TenDot: TEN_DOT, TenMonHoc: 'Hoa', TenLopHoc: '67CS9', MaSinhVien: 'SV1', HoTenSinhVien: 'Nguyen Van A' },
];

databaseService.getTeacherEnrollments = async () => [
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, TenMonHoc: 'Toan', TenLopHoc: '67CS1', MaGiangVien: 'GV1', HoTenGiangVien: 'Tran Thi B', IsTroGiang: 0 },
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, TenMonHoc: 'Toan', TenLopHoc: '67CS1', MaGiangVien: 'GV2', HoTenGiangVien: 'Pham D', IsTroGiang: 1 },
];

databaseService.getCategories = async () => [
  { TenPhongBan: 'Khoa CNTT', TenBoMon: 'BM Phan mem', IDBoMon: 7 },
];

// ---- Moodle giả ----
// SV1 đã ở trong LHP1 với role 5; GV1 đã ở trong LHP1 với role 3
const moodleUsers = { SV1: { id: 101, fullname: 'Nguyen Van A' }, SV2: { id: 102, fullname: 'Le Thi C' }, GV1: { id: 201, fullname: 'Tran Thi B' } };
const moodleCourses = { [`LHP1_${TEN_DOT}`]: { id: 900, fullname: 'Toan 67CS1' } };
const emails = [];
const calls = { createUser: 0, updateUser: 0, createCourse: 0, enrollStudent: 0, enrollTeacher: 0, createSection: 0, createCategory: 0 };

moodleService.getUserByIdNumber = async (id) => moodleUsers[id] || null;
moodleService.createUser = async (data) => { calls.createUser++; emails.push(data.email); return { id: 999 }; };
moodleService.updateUser = async (id, data) => { calls.updateUser++; emails.push(data.email); return true; };
moodleService.getCourseByShortname = async (sn) => moodleCourses[sn] || null;
moodleService.createCourse = async (d) => { calls.createCourse++; moodleCourses[d.course_shortname] = { id: 800 + calls.createCourse }; return moodleCourses[d.course_shortname]; };
moodleService.getCategories = async () => [{ id: 55, idnumber: '7', name: 'BM Phan mem' }];
moodleService.getCategoryByName = async () => ({ id: 50 });
moodleService.getCategoryByIdNumber = async (n) => (n === '7' ? { id: 55 } : null);
moodleService.createCategory = async () => { calls.createCategory++; return { id: 60 }; };
moodleService.createSectionWithPlugin = async () => { calls.createSection++; return { sectionid: 1 }; };
moodleService.getEnrolledUsers = async (cid) =>
  cid === 900 ? [{ id: 101, roles: [{ roleid: 5 }] }, { id: 201, roles: [{ roleid: 3 }] }] : [];
moodleService.enrollUserToCourse = async () => { calls.enrollStudent++; return true; };
moodleService.enrollTeacherToCourse = async () => { calls.enrollTeacher++; return true; };

// Giữ lại kết quả để kiểm tra file xuất ra ở cuối bài test
const results = {};

const show = (name, r) => {
  results[name] = r;
  console.log(
    `${name.padEnd(22)} total=${r.total} succeeded=${r.succeeded} skipped=${r.skipped} failed=${r.failed} notFound=${r.notFound}`
  );
};

console.log('=== SERVICE SMOKE ===');
show('syncStudents(all)', await syncToMoodleService.syncStudents({ tenDot: TEN_DOT }));
show('syncStudents(SV1)', await syncToMoodleService.syncStudents({ tenDot: TEN_DOT, maSinhVien: 'SV1' }));
show('syncTeachers', await syncToMoodleService.syncTeachers({ tenDot: TEN_DOT }));
show('syncCategories', await syncToMoodleService.syncCategories());
show('syncCourses', await syncToMoodleService.syncCourses({ tenDot: TEN_DOT }));
show('enrollStudents', await syncToMoodleService.syncStudentEnrollments({ tenDot: TEN_DOT }));
show('enrollTeachers', await syncToMoodleService.syncTeacherEnrollments({ tenDot: TEN_DOT }));

console.log('\n=== MOODLE CALLS ===');
console.log(calls);

console.log('\n=== KIỂM TRA KỲ VỌNG ===');
const check = (label, cond) => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
check('SV1 đã trong LHP1 -> không enroll lại (chỉ 1 enroll cho SV2)', calls.enrollStudent === 1);
check('GV1 đã có role 3 -> chỉ bỏ qua; GV2 không có trên Moodle -> skip', calls.enrollTeacher === 0);
check('LHP1 đã tồn tại -> chỉ tạo 1 course (LHP2)', calls.createCourse === 1);
check('LHP2 là lớp thực hành -> tạo 4 section', calls.createSection === 4);
// SV1/SV2/GV1 đã có trên Moodle -> update; 2 sinh viên mới -> create
check('User đã tồn tại -> chỉ update', calls.updateUser === 4);
check('User chưa có -> tạo mới', calls.createUser === 2);
check('Parent+child category đã có -> không tạo lại', calls.createCategory === 0);

// Shortname: cơ sở chính giữ nguyên tên cũ, cơ sở khác được chèn mã cơ sở
const snChinh = syncToMoodleService.buildShortname({ MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, IDCoSo: 1, MaCoSo: 'CS1' });
const snHCM = syncToMoodleService.buildShortname({ MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, IDCoSo: 4, MaCoSo: 'CS3' });
const snThieu = syncToMoodleService.buildShortname({ MaLopHocPhan: 'LHP1', TenDot: TEN_DOT });
check('Cơ sở chính -> shortname không đổi', snChinh === 'LHP1_' + TEN_DOT, snChinh);
check('Cơ sở khác -> chèn mã cơ sở', snHCM === 'LHP1_CS3_' + TEN_DOT, snHCM);
check('Thiếu dữ liệu cơ sở -> giữ tên cũ', snThieu === 'LHP1_' + TEN_DOT, snThieu);
check('Hai cơ sở cùng mã LHP -> hai shortname khác nhau', snChinh !== snHCM);

// Thiếu email thì dựng <MaSinhVien>@<STUDENT_EMAIL_DOMAIN>.
// Domain phải được bỏ dấu chấm thừa: ".st.huce.edu.vn" -> "st.huce.edu.vn",
// vì email kiểu "x@.st.huce.edu.vn" bị Moodle trả "Invalid parameter value detected".
const domain = (await import('../src/config/index.js')).default.sync.studentEmailDomain
  .trim()
  .replace(/^[.@\s]+/, '')
  .replace(/[.\s]+$/, '');

check(`Email trống -> tự sinh 1083471@${domain}`, emails.includes(`1083471@${domain}`.toLowerCase()));
check(`Email toàn khoảng trắng -> tự sinh 1083472@${domain}`, emails.includes(`1083472@${domain}`.toLowerCase()));
check('Email có sẵn thì giữ nguyên', emails.includes('sv1@x.vn'));

check('Không có email nào rỗng gửi sang Moodle', emails.every((e) => Boolean(e) && e.includes('@')));
check('Mọi email gửi đi đều hợp lệ (không có dấu chấm ngay sau @)',
  emails.every((e) => syncToMoodleService.isValidEmail(e)));

// Mỗi tác vụ có dữ liệu theo dòng phải xuất ra cả CSV lẫn Excel, file nằm trên đĩa thật.
// syncCategories không có dữ liệu theo dòng nên không xuất file.
for (const [name, r] of Object.entries(results)) {
  if (r.notFound || name === 'syncCategories') continue;

  // Chạy cả đợt thì đăng ký được tách CSV theo từng lớp (csvFiles),
  // lọc theo một đối tượng thì gộp lại một file (csvFile).
  const csvOk = r.csvFile
    ? fs.existsSync(r.csvFile)
    : (r.csvFiles || []).length > 0 && (r.csvFiles || []).every((f) => fs.existsSync(f.filePath));

  check(`${name}: xuất CSV`, csvOk);
  check(`${name}: xuất Excel`, Boolean(r.excelFile) && fs.existsSync(r.excelFile));
}

process.exit(0);
