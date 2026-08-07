// Smoke test tầng service: thay databaseService/moodleService bằng dữ liệu giả
import databaseService from '../src/services/databaseService.js';
import moodleService from '../src/services/moodleService.js';
import syncToMoodleService from '../src/services/syncToMoodleService.js';

const TEN_DOT = 'HK1 2026-2027';

// ---- dữ liệu giả ----
databaseService.getStudents = async ({ maSinhVien }) =>
  (maSinhVien ? [{ MaSinhVien: maSinhVien }] : [{ MaSinhVien: 'SV1' }, { MaSinhVien: 'SV2' }]).map(
    (s) => ({ ...s, HoDem: 'Nguyen Van', Ten: 'A', HoTenSinhVien: 'Nguyen Van A', Email: `${s.MaSinhVien}@x.vn`, NguyenQuan: 'HN' })
  );

databaseService.getTeachers = async () => [
  { MaNhanSu: 'GV1', HoDem: 'Tran Thi', Ten: 'B', HoTenGiangVien: 'Tran Thi B', Email: 'gv1@x.vn' },
];

databaseService.getCourses = async () => [
  { MaLopHocPhan: 'LHP1', TenDot: TEN_DOT, TenLopHoc: '67CS1', TenMonHoc: 'Toan', IDToBoMon: 7, SoTietLyThuyet: 45, SoTietThucHanh: 0 },
  { MaLopHocPhan: 'LHP2', TenDot: TEN_DOT, TenLopHoc: '67CS2', TenMonHoc: 'Ly', IDToBoMon: null, SoTietLyThuyet: 15, SoTietThucHanh: 30 },
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
const calls = { createUser: 0, updateUser: 0, createCourse: 0, enrollStudent: 0, enrollTeacher: 0, createSection: 0, createCategory: 0 };

moodleService.getUserByIdNumber = async (id) => moodleUsers[id] || null;
moodleService.createUser = async () => { calls.createUser++; return { id: 999 }; };
moodleService.updateUser = async () => { calls.updateUser++; return true; };
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

const show = (name, r) =>
  console.log(
    `${name.padEnd(22)} total=${r.total} succeeded=${r.succeeded} skipped=${r.skipped} failed=${r.failed} notFound=${r.notFound}`
  );

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
check('User đã tồn tại -> chỉ update, không tạo mới', calls.createUser === 0 && calls.updateUser === 4);
check('Parent+child category đã có -> không tạo lại', calls.createCategory === 0);

process.exit(0);
