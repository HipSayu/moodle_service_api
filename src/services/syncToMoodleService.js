import databaseService from "./databaseService.js";
import moodleService from "./moodleService.js";
import config from "../config/index.js";
import { syncLogger } from "../utils/logger.js";
import { retryOperation } from "../utils/errorHandler.js";
import { createProgress } from "../utils/progress.js";
import CSVHelper from "../utils/csvHelper.js";
import ExcelHelper from "../utils/excelHelper.js";

// Role id trên Moodle
const ROLE = {
  STUDENT: 5,
  TEACHER: 3, // Giảng viên chính (editing teacher)
  ASSISTANT: 4, // Trợ giảng (non-editing teacher)
};

// Category dùng khi không xác định được bộ môn
const CATEGORY_NO_DEPARTMENT = 92;
const CATEGORY_UNKNOWN_DEPARTMENT = 134;

// Mật khẩu khởi tạo, chỉ dùng khi TẠO MỚI user
const TEACHER_DEFAULT_PASSWORD = "Huce@1234";
const studentDefaultPassword = (maSinhVien) => `${maSinhVien}@Huce`;

// Số lỗi tối đa trả về trong response, tránh payload quá lớn
const MAX_ERRORS_RETURNED = 50;

class SyncToMoodleService {
  // ==================== HELPERS ====================

  // Mã cơ sở chèn vào shortname. Rỗng nghĩa là không chèn.
  //
  // Cơ sở chính được bỏ qua có chủ đích: hơn 11.000 khóa học đã đồng bộ từ trước
  // mang shortname <MaLopHocPhan>_<TenDot>. Nếu đổi hết thì mọi lần tra cứu đều
  // trượt và service sẽ tạo lại toàn bộ khóa học thành bản sao rỗng.
  // Đặt SHORTNAME_ALWAYS_CAMPUS=true nếu dựng Moodle mới từ đầu.
  campusTag(row) {
    const id = parseInt(row.IDCoSo, 10);
    if (!Number.isInteger(id)) return "";
    if (!config.sync.alwaysCampusInShortname && id === config.sync.mainCampusId) {
      return "";
    }

    // Bỏ khoảng trắng để shortname không có dấu cách thừa
    return String(row.MaCoSo || `CS${id}`).trim().replace(/\s+/g, "");
  }

  // Shortname/idnumber của khóa học trên Moodle.
  // Dùng thống nhất ở mọi nơi: tạo course, tra course, đăng ký, chấm điểm.
  //   cơ sở chính : <MaLopHocPhan>_<TenDot>
  //   cơ sở khác  : <MaLopHocPhan>_<MaCoSo>_<TenDot>
  // Cùng một mã lớp học phần dạy ở hai cơ sở trước đây dồn vào chung một khóa học.
  buildShortname(row) {
    const campus = this.campusTag(row);
    return campus
      ? `${row.MaLopHocPhan}_${campus}_${row.TenDot}`
      : `${row.MaLopHocPhan}_${row.TenDot}`;
  }

  // Email dùng làm tài khoản Moodle của sinh viên.
  // DT_SinhVien còn nhiều em trống Email, thiếu thì dựng theo mã sinh viên
  // (mẫu lấy từ STUDENT_EMAIL_DOMAIN trong .env) để vẫn tạo được tài khoản.
  //
  // Domain được chuẩn hóa bỏ dấu chấm thừa ở hai đầu: "@.st.huce.edu.vn" là email
  // sai chuẩn, Moodle trả "Invalid parameter value detected" và từ chối tạo user.
  studentEmail(maSinhVien, email) {
    const existing = String(email ?? "").trim();
    if (existing) return existing.toLowerCase();

    const domain = String(config.sync.studentEmailDomain ?? "")
      .trim()
      .replace(/^[.@\s]+/, "")
      .replace(/[.\s]+$/, "");

    return `${maSinhVien}@${domain}`.toLowerCase();
  }

  // Moodle validate email khá chặt. Chặn từ phía mình để báo rõ dòng nào hỏng
  // thay vì để cả lô fail với thông báo chung chung.
  isValidEmail(email) {
    return /^[^\s@]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
      String(email ?? "")
    );
  }

  // Tra user Moodle theo idnumber, có cache trong phạm vi một lần chạy
  async findMoodleUser(cache, idnumber) {
    if (cache.has(idnumber)) {
      return cache.get(idnumber);
    }
    const user = await moodleService.getUserByIdNumber(idnumber);
    cache.set(idnumber, user);
    return user;
  }

  // Map userId -> Set(roleId) của những người đã tham gia course.
  // Trả null nếu không lấy được, khi đó bỏ qua bước kiểm tra trùng.
  async getEnrolledRoleMap(moodleCourseId) {
    try {
      const enrolledUsers = await moodleService.getEnrolledUsers(moodleCourseId);
      const roleMap = new Map();
      (enrolledUsers || []).forEach((user) => {
        roleMap.set(
          user.id,
          new Set((user.roles || []).map((role) => role.roleid))
        );
      });
      return roleMap;
    } catch (error) {
      syncLogger.warn(
        `Không lấy được thành viên course ${moodleCourseId}, sẽ đăng ký không kiểm tra trùng: ${error.message}`
      );
      return null;
    }
  }

  // Danh sách section chuẩn theo loại lớp
  getRequiredSections(courseInfo) {
    if (courseInfo.SoTietThucHanh < courseInfo.SoTietLyThuyet) {
      // Lớp lý thuyết
      return [
        {
          name: "Tài liệu liên quan đến môn học",
          summary: "Tài liệu liên quan đến môn học",
          visible: 1,
        },
        { name: "Chương 1", summary: "Nội dung chương 1", visible: 1 },
        { name: "Chương 2", summary: "Nội dung chương 2", visible: 1 },
        { name: "Chương 3", summary: "Nội dung chương 3", visible: 1 },
        { name: "Kiểm tra giữa kì", summary: "Bài kiểm tra giữa kì", visible: 1 },
        { name: "Kiểm tra cuối kì", summary: "Bài kiểm tra cuối kì", visible: 1 },
      ];
    }

    // Lớp thực hành
    return [
      {
        name: "Tài liệu liên quan đến môn học",
        summary: "Tài liệu liên quan đến môn học",
        visible: 1,
      },
      { name: "Buổi Thông 1", summary: "Buổi Thông 1", visible: 1 },
      { name: "Buổi Thông 2", summary: "Buổi Thông 2", visible: 1 },
      { name: "Bảo vệ", summary: "Bảo vệ", visible: 1 },
    ];
  }

  // Khuôn kết quả chung cho mọi tác vụ đồng bộ
  buildResult({
    total = 0,
    succeeded = 0,
    skipped = 0,
    failed = 0,
    errors = [],
    notFound = false,
    ...extras
  }) {
    return {
      total,
      succeeded,
      skipped,
      failed,
      notFound,
      errors: errors.slice(0, MAX_ERRORS_RETURNED),
      errorsTruncated: errors.length > MAX_ERRORS_RETURNED,
      ...extras,
    };
  }

  // Nhãn phạm vi chạy, dùng cho log và thông báo
  scopeLabel(tenDot, tenKhoaHoc) {
    return tenKhoaHoc ? `${tenKhoaHoc} - đợt ${tenDot}` : `đợt ${tenDot}`;
  }

  // Loại dòng trùng theo một khóa định danh.
  // Một người học/dạy lớp của nhiều khóa sẽ có nhiều dòng sau khi truy vấn
  // kèm cột khóa, nhưng tài khoản Moodle thì chỉ cần xử lý một lần.
  uniqueBy(rows, keyFn) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = keyFn(row);
      if (key === null || key === undefined || key === "") return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Gom các dòng đăng ký theo lớp học phần để mỗi lớp chỉ tra Moodle một lần
  groupByCourse(rows) {
    const groups = new Map();
    for (const row of rows) {
      const shortname = this.buildShortname(row);
      if (!groups.has(shortname)) {
        groups.set(shortname, {
          shortname,
          MaLopHocPhan: row.MaLopHocPhan,
          TenMonHoc: row.TenMonHoc,
          TenLopHoc: row.TenLopHoc,
          TenDot: row.TenDot,
          rows: [],
        });
      }
      groups.get(shortname).rows.push(row);
    }
    return groups;
  }

  // ==================== SINH VIÊN ====================

  // Đồng bộ sinh viên sang Moodle.
  // maSinhVien: chỉ đồng bộ 1 sinh viên; bỏ trống thì đồng bộ cả đợt.
  // maLop: LỚP HỌC DANH NGHĨA (ví dụ 70CS2) — tự động lấy hết sinh viên trong lớp, không cần đợt.
  // toanKhoa = true: lấy theo HỒ SƠ khóa, gồm cả em chưa đăng ký học phần nào.
  // Mặc định (false) chỉ lấy em có đăng ký trong đợt — đúng phạm vi cần ghi danh.
  async syncStudents({
    tenDot,
    maSinhVien = null,
    idKhoaHoc = null,
    tenKhoaHoc = null,
    toanKhoa = false,
    chiDangHoc = true,
    theoMa = false,
    maLop = null,
  } = {}) {
    const scope = maLop
      ? `lớp học danh nghĩa ${maLop}`
      : theoMa
        ? `theo mã sinh viên (không cần đợt)`
        : maSinhVien
          ? `sinh viên ${maSinhVien}`
          : toanKhoa
            ? `toàn khóa ${tenKhoaHoc || idKhoaHoc} (theo hồ sơ)`
            : this.scopeLabel(tenDot, tenKhoaHoc);
    syncLogger.info(`Bắt đầu đồng bộ sinh viên (${scope})`);

    // Tra thẳng hồ sơ theo mã / theo lớp: không cần đợt, không cần đăng ký học phần
    let khongTimThay = [];
    let nguon;

    if (maLop) {
      const result = await databaseService.getStudentsByClassCode(maLop, { chiDangHoc });
      nguon = result.rows;
      khongTimThay = result.notFound;

      if (khongTimThay.length > 0) {
        syncLogger.warn(
          `Không tìm thấy sinh viên nào cho lớp: ${khongTimThay.join(", ")}`
        );
      }
    } else if (theoMa) {
      const result = await databaseService.getStudentsByCodes(maSinhVien);
      nguon = result.rows;
      khongTimThay = result.notFound;

      if (khongTimThay.length > 0) {
        syncLogger.warn(
          `Không có hồ sơ cho ${khongTimThay.length} mã: ${khongTimThay.slice(0, 20).join(", ")}`
        );
      }
    } else if (toanKhoa && !maSinhVien) {
      nguon = await databaseService.getCohortStudents({ idKhoaHoc, chiDangHoc });
    } else {
      nguon = await databaseService.getStudents({ tenDot, maSinhVien, idKhoaHoc });
    }

    const students = this.uniqueBy(nguon, (row) => row.MaSinhVien);

    if (students.length === 0) {
      syncLogger.warn(`Không tìm thấy sinh viên nào (${scope})`);
      return this.buildResult({ notFound: true, khongTimThay, details: [] });
    }

    const progress = createProgress(`Sinh viên · ${scope}`, students.length);

    let succeeded = 0;
    let failed = 0;
    let generatedEmails = 0;
    const errors = [];
    const rows = [];

    for (const student of students) {
      const email = this.studentEmail(student.MaSinhVien, student.Email);
      const isGenerated = !String(student.Email ?? "").trim();
      if (isGenerated) generatedEmails++;

      const row = {
        MaSinhVien: student.MaSinhVien,
        HoTenSinhVien: student.HoTenSinhVien,
        Email: email,
        EmailTuSinh: isGenerated ? "Tự sinh" : "",
        HanhDong: "",
        TrangThai: "Thành công",
        LoiChiTiet: "",
        ThoiGian: new Date().toISOString(),
      };

      const userData = {
        first_name: student.Ten,
        last_name: student.HoDem,
        email,
        city: student.NguyenQuan || "HN",
        idnumber: student.MaSinhVien,
        password: studentDefaultPassword(student.MaSinhVien),
      };

      try {
        // Email sai chuẩn thì Moodle chắc chắn từ chối, chặn trước cho khỏi
        // gọi API 3 lần rồi mới biết hỏng
        if (!this.isValidEmail(email)) {
          throw new Error(
            `Email không hợp lệ: "${email}" — sửa STUDENT_EMAIL_DOMAIN trong .env`
          );
        }

        await retryOperation(
          async () => {
            const existingUser = await moodleService.getUserByIdNumber(
              student.MaSinhVien
            );

            if (existingUser) {
              // Không gửi password để không reset mật khẩu sinh viên đã đổi
              await moodleService.updateUser(existingUser.id, userData);
              row.HanhDong = "Cập nhật";
              row.MoodleUserId = existingUser.id;
            } else {
              const newUser = await moodleService.createUser(userData);
              row.HanhDong = "Tạo mới";
              row.MoodleUserId = newUser.id;
            }
          },
          3,
          2000
        );
        succeeded++;
      } catch (error) {
        failed++;
        row.HanhDong = "Lỗi";
        row.TrangThai = "Lỗi";
        row.LoiChiTiet = error.message;
        errors.push({
          MaSinhVien: student.MaSinhVien,
          Email: email,
          error: error.message,
        });
        // Ghi rõ mã sinh viên và email, đống stack trace không cho biết dòng nào hỏng
        syncLogger.error(
          `Đồng bộ sinh viên ${student.MaSinhVien} (${email}) lỗi: ${error.message}`
        );
      }

      rows.push(row);
      progress.tick(row.HanhDong);
    }

    progress.finish();

    if (generatedEmails > 0) {
      // Lấy mẫu từ chính hàm dựng email để log đúng cái đã gửi đi Moodle
      const mau = this.studentEmail("<MaSinhVien>", null);
      syncLogger.warn(
        `${generatedEmails}/${students.length} sinh viên trống Email, đã tự sinh theo mẫu ${mau}`
      );
    }

    const csvFile = await CSVHelper.saveRows(rows, "sync_students");
    const excelFile = await ExcelHelper.saveRows(rows, "sync_students", {
      meta: { "Phạm vi": scope },
    });

    syncLogger.info(
      `Đồng bộ sinh viên xong (${scope}): ${succeeded}/${students.length} thành công, ${failed} lỗi`
    );

    return this.buildResult({
      total: students.length,
      succeeded,
      failed,
      errors,
      csvFile,
      excelFile,
      // Mã gửi lên nhưng không có hồ sơ trong DT_SinhVien
      khongTimThay,
      details: maSinhVien ? rows : undefined,
    });
  }

  // ==================== GIẢNG VIÊN ====================

  // maGiangVien: mã giảng viên hoặc email; bỏ trống thì đồng bộ cả đợt
  async syncTeachers({ tenDot, maGiangVien = null, idKhoaHoc = null, tenKhoaHoc = null } = {}) {
    const scope = maGiangVien
      ? `giảng viên ${maGiangVien}`
      : this.scopeLabel(tenDot, tenKhoaHoc);
    syncLogger.info(`Bắt đầu đồng bộ giảng viên (${scope})`);

    const teachers = this.uniqueBy(
      await databaseService.getTeachers({ tenDot, maGiangVien, idKhoaHoc }),
      (row) => row.MaNhanSu
    );

    if (teachers.length === 0) {
      syncLogger.warn(`Không tìm thấy giảng viên nào (${scope})`);
      return this.buildResult({ notFound: true, details: [] });
    }

    const progress = createProgress(`Giảng viên · ${scope}`, teachers.length);

    let succeeded = 0;
    let failed = 0;
    const errors = [];
    const rows = [];

    for (const teacher of teachers) {
      const row = {
        MaNhanSu: teacher.MaNhanSu,
        HoTenGiangVien: teacher.HoTenGiangVien,
        Email: teacher.Email,
        HanhDong: "",
        TrangThai: "Thành công",
        LoiChiTiet: "",
        ThoiGian: new Date().toISOString(),
      };

      const userData = {
        first_name: teacher.HoDem,
        last_name: teacher.Ten,
        email:
          teacher.Email && teacher.Email.trim() !== ""
            ? teacher.Email.trim()
            : `${teacher.MaNhanSu}@huce.edu.vn`,
        city: "Hanoi",
        idnumber: teacher.MaNhanSu,
        password: TEACHER_DEFAULT_PASSWORD,
      };

      try {
        await retryOperation(
          async () => {
            const existingUser = await moodleService.getUserByIdNumber(
              teacher.MaNhanSu
            );

            if (existingUser) {
              await moodleService.updateUser(existingUser.id, userData);
              row.HanhDong = "Cập nhật";
              row.MoodleUserId = existingUser.id;
            } else {
              const newUser = await moodleService.createUser(userData);
              row.HanhDong = "Tạo mới";
              row.MoodleUserId = newUser.id;
            }
          },
          3,
          2000
        );
        succeeded++;
      } catch (error) {
        failed++;
        row.HanhDong = "Lỗi";
        row.TrangThai = "Lỗi";
        row.LoiChiTiet = error.message;
        errors.push({ MaNhanSu: teacher.MaNhanSu, error: error.message });
        syncLogger.error(`Đồng bộ giảng viên ${teacher.MaNhanSu} lỗi:`, error);
      }

      rows.push(row);
      progress.tick(row.HanhDong);
    }

    progress.finish();
    const csvFile = await CSVHelper.saveRows(rows, "sync_teachers");
    const excelFile = await ExcelHelper.saveRows(rows, "sync_teachers", {
      meta: { "Phạm vi": scope },
    });

    syncLogger.info(
      `Đồng bộ giảng viên xong (${scope}): ${succeeded}/${teachers.length} thành công, ${failed} lỗi`
    );

    return this.buildResult({
      total: teachers.length,
      succeeded,
      failed,
      errors,
      csvFile,
      excelFile,
      details: maGiangVien ? rows : undefined,
    });
  }

  // ==================== CATEGORY (KHOA / BỘ MÔN) ====================

  async syncCategories() {
    syncLogger.info("Bắt đầu đồng bộ category (khoa / bộ môn)");

    const departments = await databaseService.getCategories();

    if (departments.length === 0) {
      return this.buildResult({ notFound: true });
    }

    // Gom bộ môn theo khoa
    const facultyMap = new Map();
    departments.forEach((dept) => {
      if (!facultyMap.has(dept.TenPhongBan)) {
        facultyMap.set(dept.TenPhongBan, []);
      }
      facultyMap.get(dept.TenPhongBan).push(dept);
    });

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    for (const [facultyName, depts] of facultyMap) {
      try {
        // Category cha = khoa
        let parentCategory = await moodleService.getCategoryByName(facultyName);

        if (!parentCategory) {
          parentCategory = await moodleService.createCategory({
            name: facultyName,
            description: `Khoa ${facultyName}`,
            parent: 0,
            idnumber: `faculty_${depts[0].IDBoMon}`,
          });
          succeeded++;
          syncLogger.info(`Đã tạo category khoa: ${facultyName}`);
        }

        // Category con = bộ môn
        for (const dept of depts) {
          try {
            const existing = await moodleService.getCategoryByIdNumber(
              dept.IDBoMon.toString()
            );

            if (existing) {
              skipped++;
              continue;
            }

            await moodleService.createCategory({
              name: dept.TenBoMon,
              description: `Bộ môn ${dept.TenBoMon}`,
              parent: parentCategory.id,
              idnumber: dept.IDBoMon.toString(),
            });
            succeeded++;
            syncLogger.info(
              `Đã tạo category bộ môn: ${dept.TenBoMon} thuộc ${facultyName}`
            );
          } catch (childError) {
            failed++;
            errors.push({
              TenBoMon: dept.TenBoMon,
              error: childError.message,
            });
            syncLogger.error(
              `Tạo category bộ môn ${dept.TenBoMon} lỗi:`,
              childError
            );
          }
        }
      } catch (error) {
        failed++;
        errors.push({ TenPhongBan: facultyName, error: error.message });
        syncLogger.error(`Xử lý khoa ${facultyName} lỗi:`, error);
      }
    }

    syncLogger.info(
      `Đồng bộ category xong: tạo mới ${succeeded}, đã có ${skipped}, lỗi ${failed}`
    );

    return this.buildResult({
      total: departments.length,
      succeeded,
      skipped,
      failed,
      errors,
      totalFaculties: facultyMap.size,
    });
  }

  // ==================== KHÓA HỌC ====================

  // Chỉ TẠO khóa học chưa có trên Moodle. Khóa học đã tồn tại thì bỏ qua,
  // không update để không ghi đè thay đổi thủ công trên Moodle.
  // maLopHocPhan: chỉ đồng bộ 1 lớp; bỏ trống thì đồng bộ cả đợt.
  async syncCourses({ tenDot, maLopHocPhan = null, idKhoaHoc = null, tenKhoaHoc = null } = {}) {
    const scope = maLopHocPhan
      ? `lớp ${maLopHocPhan}`
      : this.scopeLabel(tenDot, tenKhoaHoc);
    syncLogger.info(`Bắt đầu đồng bộ khóa học (${scope})`);

    const courses = await databaseService.getCourses({ tenDot, maLopHocPhan, idKhoaHoc });

    if (courses.length === 0) {
      syncLogger.warn(`Không tìm thấy lớp học phần nào (${scope})`);
      return this.buildResult({ notFound: true, details: [] });
    }

    // Tải category 1 lần rồi tra theo idnumber thay vì gọi lại cho từng lớp
    const categoryMap = new Map();
    try {
      const categories = await moodleService.getCategories();
      (categories || []).forEach((cat) => {
        if (cat.idnumber) categoryMap.set(cat.idnumber.toString(), cat);
      });
      syncLogger.info(`Đã tải ${categoryMap.size} category từ Moodle`);
    } catch (error) {
      syncLogger.error(
        "Không tải được category từ Moodle, dùng category mặc định:",
        error
      );
    }

    const progress = createProgress(`Khóa học · ${scope}`, courses.length);

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    const rows = [];

    for (const course of courses) {
      const shortname = this.buildShortname(course);
      const row = {
        MaLopHocPhan: course.MaLopHocPhan,
        TenLopHoc: course.TenLopHoc,
        TenMonHoc: course.TenMonHoc,
        TenDot: course.TenDot,
        ShortName: shortname,
        HanhDong: "",
        TrangThai: "",
        LoiChiTiet: "",
        ThoiGian: new Date().toISOString(),
      };

      try {
        const existingCourse = await moodleService.getCourseByShortname(
          shortname
        );

        if (existingCourse) {
          skipped++;
          row.HanhDong = "Bỏ qua";
          row.TrangThai = "Đã tồn tại";
          row.MoodleCourseId = existingCourse.id;
          syncLogger.info(`Khóa học đã tồn tại, bỏ qua: ${shortname}`);
          rows.push(row);
          progress.tick(row.TrangThai);
          continue;
        }

        // Category theo bộ môn, không xác định được thì dùng mặc định
        let categoryId;
        if (!course.IDToBoMon) {
          categoryId = CATEGORY_NO_DEPARTMENT;
        } else {
          const category = categoryMap.get(course.IDToBoMon.toString());
          if (!category) {
            syncLogger.warn(
              `Không tìm thấy category cho bộ môn ${course.IDToBoMon}, dùng ${CATEGORY_UNKNOWN_DEPARTMENT}`
            );
            categoryId = CATEGORY_UNKNOWN_DEPARTMENT;
          } else {
            categoryId = category.id;
          }
        }

        const courseData = {
          course_fullname:
            `${course.TenLopHoc} - ${course.TenMonHoc} - ${course.TenDot}` +
            (this.campusTag(course) && course.TenCoSo ? ` (${course.TenCoSo})` : ""),
          course_shortname: shortname,
          course_categoryid: categoryId,
          course_idnumber: shortname,
        };

        let newCourse;
        try {
          newCourse = await retryOperation(
            () => moodleService.createCourse(courseData),
            3,
            2000
          );
        } catch (createError) {
          // Có thể Moodle đã tạo xong nhưng response lỗi/timeout -> kiểm tra lại
          const recheck = await moodleService.getCourseByShortname(shortname);
          if (!recheck) throw createError;
          newCourse = recheck;
          syncLogger.warn(
            `Khóa học ${shortname} đã tồn tại sau lỗi tạo, coi như thành công`
          );
        }

        created++;
        row.HanhDong = "Tạo mới";
        row.TrangThai = "Thành công";
        row.MoodleCourseId = newCourse.id;
        syncLogger.info(`Đã tạo khóa học: ${courseData.course_fullname}`);

        // Lỗi tạo section không làm hỏng khóa học đã tạo
        try {
          for (const sectionData of this.getRequiredSections(course)) {
            await moodleService.createSectionWithPlugin(
              newCourse.id,
              sectionData
            );
          }
        } catch (contentError) {
          row.TrangThai = "Tạo mới (thiếu section)";
          row.LoiChiTiet = contentError.message;
          syncLogger.error(
            `Tạo section cho course ${newCourse.id} lỗi:`,
            contentError
          );
        }
      } catch (error) {
        failed++;
        row.HanhDong = "Lỗi";
        row.TrangThai = "Lỗi";
        row.LoiChiTiet = error.message;
        errors.push({ MaLopHocPhan: course.MaLopHocPhan, shortname, error: error.message });
        syncLogger.error(`Đồng bộ khóa học ${shortname} lỗi:`, error);
      }

      rows.push(row);
      progress.tick(row.TrangThai);
    }

    progress.finish();
    const csvFile = await CSVHelper.saveRows(rows, "sync_courses");
    const excelFile = await ExcelHelper.saveRows(rows, "sync_courses", {
      meta: { "Phạm vi": scope },
    });

    syncLogger.info(
      `Đồng bộ khóa học xong (${scope}): tạo mới ${created}, đã có ${skipped}, lỗi ${failed}`
    );

    return this.buildResult({
      total: courses.length,
      succeeded: created,
      skipped,
      failed,
      errors,
      created,
      csvFile,
      excelFile,
      details: maLopHocPhan ? rows : undefined,
    });
  }

  // Bù các section còn thiếu cho một khóa học đã tồn tại
  async ensureCourseSections(moodleCourseId, courseInfo) {
    const existingSections = await moodleService.getCourseContents(
      moodleCourseId
    );
    const requiredSections = this.getRequiredSections(courseInfo);
    const created = [];

    for (let i = 0; i < requiredSections.length; i++) {
      const sectionIndex = i + 1; // section 0 là General
      const exists = existingSections.find((s) => s.section === sectionIndex);

      if (exists) continue;

      try {
        await moodleService.createSectionWithPlugin(
          moodleCourseId,
          requiredSections[i]
        );
        created.push(requiredSections[i].name);
      } catch (error) {
        syncLogger.error(
          `Tạo section "${requiredSections[i].name}" cho course ${moodleCourseId} lỗi:`,
          error
        );
      }
    }

    return created;
  }

  // ==================== ĐĂNG KÝ SINH VIÊN VÀO LỚP ====================

  // Sinh viên đã có trong lớp thì bỏ qua, không gọi lại Moodle.
  // maSinhVien: 1 mã, nhiều mã phân tách bởi dấu phẩy, hoặc mảng mã.
  async syncStudentEnrollments({
    tenDot,
    maSinhVien = null,
    maLopHocPhan = null,
    idKhoaHoc = null,
    tenKhoaHoc = null,
  } = {}) {
    const filtered = Boolean(maSinhVien || maLopHocPhan);
    const scope = maSinhVien
      ? `sinh viên ${maSinhVien}`
      : maLopHocPhan
        ? `lớp ${maLopHocPhan}`
        : this.scopeLabel(tenDot, tenKhoaHoc);

    syncLogger.info(`Bắt đầu đăng ký sinh viên vào lớp (${scope})`);

    const enrollments = await databaseService.getStudentEnrollments({
      tenDot,
      maSinhVien,
      maLopHocPhan,
      idKhoaHoc,
    });

    if (enrollments.length === 0) {
      syncLogger.warn(`Không tìm thấy đăng ký học phần nào (${scope})`);
      return this.buildResult({ notFound: true, details: [] });
    }

    const courseGroups = this.groupByCourse(enrollments);
    syncLogger.info(
      `${enrollments.length} đăng ký thuộc ${courseGroups.size} lớp học phần`
    );
    const progress = createProgress(`ĐK sinh viên · ${scope}`, enrollments.length);

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    const csvFiles = [];
    const allRows = [];
    const userCache = new Map();

    for (const group of courseGroups.values()) {
      const courseRows = [];

      try {
        const moodleCourse = await moodleService.getCourseByShortname(
          group.shortname
        );

        if (!moodleCourse) {
          skipped += group.rows.length;
          syncLogger.warn(`Không có khóa học trên Moodle: ${group.shortname}`);
          group.rows.forEach((r) =>
            courseRows.push({
              MaSinhVien: r.MaSinhVien,
              HoTenSinhVien: r.HoTenSinhVien,
              ShortName: group.shortname,
              TrangThai: "Bỏ qua",
              LoiChiTiet: "Không tìm thấy khóa học trên Moodle",
              ThoiGian: new Date().toISOString(),
            })
          );
          progress.add(group.rows.length, "Bỏ qua");
          allRows.push(...courseRows);
          continue;
        }

        const enrolledRoleMap = await this.getEnrolledRoleMap(moodleCourse.id);

        for (const enrollment of group.rows) {
          const row = {
            MaSinhVien: enrollment.MaSinhVien,
            HoTenSinhVien: enrollment.HoTenSinhVien,
            ShortName: group.shortname,
            TrangThai: "Thành công",
            LoiChiTiet: "",
            ThoiGian: new Date().toISOString(),
          };

          try {
            const moodleUser = await this.findMoodleUser(
              userCache,
              enrollment.MaSinhVien
            );

            if (!moodleUser) {
              skipped++;
              row.TrangThai = "Bỏ qua";
              row.LoiChiTiet =
                "Không tìm thấy sinh viên trên Moodle (chạy đồng bộ sinh viên trước)";
            } else if (enrolledRoleMap?.get(moodleUser.id)?.has(ROLE.STUDENT)) {
              skipped++;
              row.TrangThai = "Đã tồn tại";
              row.LoiChiTiet = "Sinh viên đã có trong lớp";
            } else {
              await moodleService.enrollUserToCourse(
                moodleUser.id,
                moodleCourse.id,
                ROLE.STUDENT,
                moodleUser,
                moodleCourse
              );
              succeeded++;
              row.MoodleCourseId = moodleCourse.id;
            }
          } catch (error) {
            failed++;
            row.TrangThai = "Lỗi";
            row.LoiChiTiet = error.message;
            errors.push({
              MaSinhVien: enrollment.MaSinhVien,
              shortname: group.shortname,
              error: error.message,
            });
            syncLogger.error(
              `Đăng ký sinh viên ${enrollment.MaSinhVien} vào ${group.shortname} lỗi:`,
              error
            );
          }

          courseRows.push(row);
          progress.tick(row.TrangThai);
        }

        allRows.push(...courseRows);

        // Chỉ tách CSV theo lớp khi chạy cả đợt
        if (!filtered && courseRows.length > 0) {
          const filePath = await CSVHelper.saveCourseRows(
            courseRows,
            group.MaLopHocPhan,
            group.TenMonHoc,
            "enrollments/students"
          );
          if (filePath) {
            csvFiles.push({
              shortname: group.shortname,
              filePath,
              total: courseRows.length,
            });
          }
        }
      } catch (error) {
        failed += group.rows.length;
        progress.add(group.rows.length, "Lỗi");
        errors.push({ shortname: group.shortname, error: error.message });
        syncLogger.error(`Xử lý lớp ${group.shortname} lỗi:`, error);
      }
    }

    progress.finish();

    // Excel gộp cả lần chạy vào một file, kèm sheet tổng hợp theo lớp
    const excelFile = await ExcelHelper.saveRows(allRows, "enroll_students", {
      subDir: "enrollments/students",
      groupBy: "ShortName",
      meta: { "Phạm vi": scope },
    });

    // Khi lọc theo 1 đối tượng thì gộp thành 1 file cho dễ xem

    const csvFile = filtered
      ? await CSVHelper.saveRows(
          allRows,
          `enroll_students_${CSVHelper.safeName(maSinhVien || maLopHocPhan)}`,
          "enrollments/students"
        )
      : null;

    syncLogger.info(
      `Đăng ký sinh viên xong (${scope}): ${succeeded} mới, ${skipped} bỏ qua, ${failed} lỗi`
    );

    return this.buildResult({
      total: enrollments.length,
      succeeded,
      skipped,
      failed,
      errors,
      totalCourses: courseGroups.size,
      csvFile,
      excelFile,
      csvFiles: filtered ? undefined : csvFiles,
      details: filtered ? allRows : undefined,
    });
  }

  // ==================== ĐĂNG KÝ GIẢNG VIÊN VÀO LỚP ====================

  // IsTroGiang = 1 -> Trợ giảng (role 4), ngược lại -> Giảng viên chính (role 3).
  // Giảng viên đã có trong lớp với đúng role thì bỏ qua.
  // ==================== DỌN GHI DANH NHẦM CƠ SỞ ====================

  // Trước khi shortname có mã cơ sở, cùng một mã lớp học phần dạy ở hai cơ sở
  // dồn chung vào MỘT khóa học Moodle của cơ sở chính. Sinh viên cơ sở khác vì thế
  // bị ghi danh nhầm vào đó. Sau khi tách khóa học riêng, hàm này gỡ họ ra.
  //
  // Chỉ gỡ sinh viên thỏa CẢ HAI điều kiện:
  //   - có đăng ký lớp học phần đó ở cơ sở KHÁC cơ sở chính
  //   - KHÔNG có đăng ký lớp học phần đó ở chính cơ sở chính
  // Em nào học ở cả hai nơi thì giữ nguyên.
  //
  // apply = false (mặc định) chỉ liệt kê, không gọi Moodle gỡ ai.
  async cleanupCrossCampusEnrollments({ tenDot, apply = false } = {}) {
    const scope = `đợt ${tenDot}`;
    syncLogger.info(
      `Bắt đầu ${apply ? "DỌN" : "xem trước"} ghi danh nhầm cơ sở (${scope})`
    );

    // Quét cả đợt, không lọc theo khóa: thiếu một phần dữ liệu là xác định sai
    // ai "chỉ học ở cơ sở khác" và gỡ nhầm người.
    const enrollments = await databaseService.getStudentEnrollments({ tenDot });

    if (enrollments.length === 0) {
      syncLogger.warn(`Không tìm thấy đăng ký học phần nào (${scope})`);
      return this.buildResult({ notFound: true, details: [] });
    }

    // Gom theo shortname của khóa học CƠ SỞ CHÍNH (tên cũ dùng chung)
    const byCourse = new Map();
    for (const row of enrollments) {
      const shared = `${row.MaLopHocPhan}_${row.TenDot}`;
      if (!byCourse.has(shared)) {
        byCourse.set(shared, {
          shortname: shared,
          MaLopHocPhan: row.MaLopHocPhan,
          TenMonHoc: row.TenMonHoc,
          coSoChinh: new Set(),
          coSoKhac: new Map(),
        });
      }

      const group = byCourse.get(shared);
      if (this.campusTag(row)) group.coSoKhac.set(row.MaSinhVien, row);
      else group.coSoChinh.add(row.MaSinhVien);
    }

    // Chỉ những lớp thực sự có sinh viên cơ sở khác mới cần kiểm tra
    const candidates = [...byCourse.values()].filter((g) => g.coSoKhac.size > 0);
    syncLogger.info(
      `${candidates.length}/${byCourse.size} lớp có sinh viên cơ sở khác, đang đối chiếu với Moodle`
    );

    if (candidates.length === 0) {
      return this.buildResult({ total: 0, details: [], apply });
    }

    const progress = createProgress(
      `Dọn ghi danh nhầm cơ sở · ${scope}`,
      candidates.length
    );

    let goBo = 0;
    let loi = 0;
    let khongCoLop = 0;
    const errors = [];
    const rows = [];

    for (const group of candidates) {
      try {
        const course = await moodleService.getCourseByShortname(group.shortname);

        if (!course) {
          khongCoLop++;
          progress.tick("Không có lớp");
          continue;
        }

        const enrolled = await moodleService.getEnrolledUsers(course.id);

        for (const user of enrolled || []) {
          const maSinhVien = String(user.idnumber || "").trim();
          const info = group.coSoKhac.get(maSinhVien);

          // Không phải sinh viên cơ sở khác, hoặc có học cả ở cơ sở chính -> giữ nguyên
          if (!info || group.coSoChinh.has(maSinhVien)) continue;

          const laSinhVien = (user.roles || []).some(
            (role) => role.roleid === ROLE.STUDENT
          );
          if (!laSinhVien) continue;

          const row = {
            MaLopHocPhan: group.MaLopHocPhan,
            TenMonHoc: group.TenMonHoc,
            ShortName: group.shortname,
            MaSinhVien: maSinhVien,
            HoTenSinhVien: info.HoTenSinhVien,
            CoSo: info.TenCoSo || "",
            ShortNameDung: this.buildShortname(info),
            MoodleUserId: user.id,
            MoodleCourseId: course.id,
            TrangThai: apply ? "Đã gỡ" : "Sẽ gỡ",
            LoiChiTiet: "",
            ThoiGian: new Date().toISOString(),
          };

          if (apply) {
            try {
              await moodleService.unenrollUserFromCourse(user.id, course.id);
              goBo++;
            } catch (error) {
              loi++;
              row.TrangThai = "Lỗi";
              row.LoiChiTiet = error.message;
              errors.push({
                MaSinhVien: maSinhVien,
                shortname: group.shortname,
                error: error.message,
              });
              syncLogger.error(
                `Gỡ sinh viên ${maSinhVien} khỏi ${group.shortname} lỗi: ${error.message}`
              );
            }
          } else {
            goBo++;
          }

          rows.push(row);
        }

        progress.tick("Đã kiểm tra");
      } catch (error) {
        loi++;
        errors.push({ shortname: group.shortname, error: error.message });
        syncLogger.error(`Kiểm tra lớp ${group.shortname} lỗi: ${error.message}`);
        progress.tick("Lỗi");
      }
    }

    progress.finish();

    const csvFile = await CSVHelper.saveRows(
      rows,
      apply ? "cleanup_campus_applied" : "cleanup_campus_preview"
    );
    const excelFile = await ExcelHelper.saveRows(
      rows,
      apply ? "cleanup_campus_applied" : "cleanup_campus_preview",
      { groupBy: "ShortName", meta: { "Phạm vi": scope, "Chế độ": apply ? "Đã gỡ thật" : "Chỉ xem trước" } }
    );

    syncLogger.warn(
      `${apply ? "Đã gỡ" : "Sẽ gỡ"} ${goBo} lượt ghi danh nhầm cơ sở khỏi ${new Set(rows.map((r) => r.ShortName)).size} lớp, lỗi ${loi}`
    );

    return this.buildResult({
      total: rows.length,
      succeeded: goBo,
      skipped: khongCoLop,
      failed: loi,
      errors,
      apply,
      soLopKiemTra: candidates.length,
      soLopCanDon: new Set(rows.map((r) => r.ShortName)).size,
      csvFile,
      excelFile,
      details: rows.slice(0, 200),
    });
  }

  async syncTeacherEnrollments({
    tenDot,
    maGiangVien = null,
    maLopHocPhan = null,
    idKhoaHoc = null,
    tenKhoaHoc = null,
  } = {}) {
    const filtered = Boolean(maGiangVien || maLopHocPhan);
    const scope = maGiangVien
      ? `giảng viên ${maGiangVien}`
      : maLopHocPhan
        ? `lớp ${maLopHocPhan}`
        : this.scopeLabel(tenDot, tenKhoaHoc);

    syncLogger.info(`Bắt đầu đăng ký giảng viên vào lớp (${scope})`);

    const enrollments = await databaseService.getTeacherEnrollments({
      tenDot,
      maGiangVien,
      maLopHocPhan,
      idKhoaHoc,
    });

    if (enrollments.length === 0) {
      syncLogger.warn(`Không tìm thấy phân công giảng dạy nào (${scope})`);
      return this.buildResult({ notFound: true, details: [] });
    }

    const courseGroups = this.groupByCourse(enrollments);
    syncLogger.info(
      `${enrollments.length} phân công thuộc ${courseGroups.size} lớp học phần`
    );
    const progress = createProgress(`Phân công GV · ${scope}`, enrollments.length);

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    const csvFiles = [];
    const allRows = [];
    const userCache = new Map();

    for (const group of courseGroups.values()) {
      const courseRows = [];

      try {
        const moodleCourse = await moodleService.getCourseByShortname(
          group.shortname
        );

        if (!moodleCourse) {
          skipped += group.rows.length;
          syncLogger.warn(`Không có khóa học trên Moodle: ${group.shortname}`);
          group.rows.forEach((r) =>
            courseRows.push({
              MaGiangVien: r.MaGiangVien,
              HoTenGiangVien: r.HoTenGiangVien,
              LoaiGiangVien:
                r.IsTroGiang === 1 ? "Trợ giảng" : "Giảng viên chính",
              ShortName: group.shortname,
              TrangThai: "Bỏ qua",
              LoiChiTiet: "Không tìm thấy khóa học trên Moodle",
              ThoiGian: new Date().toISOString(),
            })
          );
          progress.add(group.rows.length, "Bỏ qua");
          allRows.push(...courseRows);
          continue;
        }

        const enrolledRoleMap = await this.getEnrolledRoleMap(moodleCourse.id);

        for (const enrollment of group.rows) {
          const roleId =
            enrollment.IsTroGiang === 1 ? ROLE.ASSISTANT : ROLE.TEACHER;
          const roleName =
            enrollment.IsTroGiang === 1 ? "Trợ giảng" : "Giảng viên chính";

          const row = {
            MaGiangVien: enrollment.MaGiangVien,
            HoTenGiangVien: enrollment.HoTenGiangVien,
            LoaiGiangVien: roleName,
            ShortName: group.shortname,
            TrangThai: "Thành công",
            LoiChiTiet: "",
            ThoiGian: new Date().toISOString(),
          };

          try {
            const moodleUser = await this.findMoodleUser(
              userCache,
              enrollment.MaGiangVien
            );

            if (!moodleUser) {
              skipped++;
              row.TrangThai = "Bỏ qua";
              row.LoiChiTiet =
                "Không tìm thấy giảng viên trên Moodle (chạy đồng bộ giảng viên trước)";
            } else if (enrolledRoleMap?.get(moodleUser.id)?.has(roleId)) {
              skipped++;
              row.TrangThai = "Đã tồn tại";
              row.LoiChiTiet = "Giảng viên đã có trong lớp với đúng vai trò";
            } else {
              await moodleService.enrollTeacherToCourse(
                moodleUser.id,
                moodleCourse.id,
                roleId,
                moodleUser,
                moodleCourse
              );
              succeeded++;
              row.MoodleCourseId = moodleCourse.id;
            }
          } catch (error) {
            failed++;
            row.TrangThai = "Lỗi";
            row.LoiChiTiet = error.message;
            errors.push({
              MaGiangVien: enrollment.MaGiangVien,
              shortname: group.shortname,
              error: error.message,
            });
            syncLogger.error(
              `Đăng ký giảng viên ${enrollment.MaGiangVien} vào ${group.shortname} lỗi:`,
              error
            );
          }

          courseRows.push(row);
          progress.tick(row.TrangThai);
        }

        allRows.push(...courseRows);

        if (!filtered && courseRows.length > 0) {
          const filePath = await CSVHelper.saveCourseRows(
            courseRows,
            group.MaLopHocPhan,
            group.TenMonHoc,
            "enrollments/teachers"
          );
          if (filePath) {
            csvFiles.push({
              shortname: group.shortname,
              filePath,
              total: courseRows.length,
            });
          }
        }
      } catch (error) {
        failed += group.rows.length;
        progress.add(group.rows.length, "Lỗi");
        errors.push({ shortname: group.shortname, error: error.message });
        syncLogger.error(`Xử lý lớp ${group.shortname} lỗi:`, error);
      }
    }

    progress.finish();

    // Excel gộp cả lần chạy vào một file, kèm sheet tổng hợp theo lớp
    const excelFile = await ExcelHelper.saveRows(allRows, "enroll_teachers", {
      subDir: "enrollments/teachers",
      groupBy: "ShortName",
      meta: { "Phạm vi": scope },
    });

    const csvFile = filtered
      ? await CSVHelper.saveRows(
          allRows,
          `enroll_teachers_${CSVHelper.safeName(maGiangVien || maLopHocPhan)}`,
          "enrollments/teachers"
        )
      : null;

    syncLogger.info(
      `Đăng ký giảng viên xong (${scope}): ${succeeded} mới, ${skipped} bỏ qua, ${failed} lỗi`
    );

    return this.buildResult({
      total: enrollments.length,
      succeeded,
      skipped,
      failed,
      errors,
      totalCourses: courseGroups.size,
      csvFile,
      excelFile,
      csvFiles: filtered ? undefined : csvFiles,
      details: filtered ? allRows : undefined,
    });
  }

  // ==================== ĐIỂM ====================

  // Đẩy điểm tổng kết từ SQL Server vào assignment "Bài tập cuối kỳ" trên Moodle
  async syncAssignmentGrades({
    tenDot,
    maLopHocPhan = null,
    tenLopHoc = null,
    maSinhVien = null,
    idKhoaHoc = null,
    tenKhoaHoc = null,
  } = {}) {
    const scope = maLopHocPhan
      ? `lớp ${maLopHocPhan}`
      : tenLopHoc
        ? `lớp học ${tenLopHoc}`
        : this.scopeLabel(tenDot, tenKhoaHoc);

    syncLogger.info(`Bắt đầu đồng bộ điểm (${scope})`);

    const grades = await databaseService.getGrades({
      tenDot,
      maLopHocPhan,
      tenLopHoc,
      maSinhVien,
      idKhoaHoc,
    });

    if (grades.length === 0) {
      syncLogger.warn(`Không tìm thấy bản ghi điểm nào (${scope})`);
      return this.buildResult({ notFound: true, details: [] });
    }

    const courseGroups = this.groupByCourse(grades);

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    const rows = [];
    const userCache = new Map();

    for (const group of courseGroups.values()) {
      try {
        const moodleCourse = await moodleService.getCourseByShortname(
          group.shortname
        );

        if (!moodleCourse) {
          skipped += group.rows.length;
          syncLogger.warn(`Không có khóa học trên Moodle: ${group.shortname}`);
          continue;
        }

        // Assignment cuối kỳ của lớp, tra 1 lần cho cả lớp
        const assignments = await moodleService.getAssignments(moodleCourse.id);
        const finalAssignment = assignments.find(
          (a) => a.name && a.name.toLowerCase().includes("cuối kỳ")
        );

        if (!finalAssignment) {
          skipped += group.rows.length;
          syncLogger.warn(
            `Không có assignment cuối kỳ trong ${group.shortname}`
          );
          continue;
        }

        for (const grade of group.rows) {
          const row = {
            MaSinhVien: grade.MaSinhVien,
            HoTenSinhVien: grade.HoTenSinhVien,
            ShortName: group.shortname,
            Diem: grade.DiemTongKet,
            TrangThai: "Thành công",
            LoiChiTiet: "",
            ThoiGian: new Date().toISOString(),
          };

          try {
            const moodleUser = await this.findMoodleUser(
              userCache,
              grade.MaSinhVien
            );

            if (!moodleUser) {
              skipped++;
              row.TrangThai = "Bỏ qua";
              row.LoiChiTiet = "Không tìm thấy sinh viên trên Moodle";
            } else {
              await moodleService.gradeAssignment(
                finalAssignment.id,
                moodleUser.id,
                grade.DiemTongKet
              );
              succeeded++;
            }
          } catch (error) {
            failed++;
            row.TrangThai = "Lỗi";
            row.LoiChiTiet = error.message;
            errors.push({
              MaSinhVien: grade.MaSinhVien,
              shortname: group.shortname,
              error: error.message,
            });
          }

          rows.push(row);
        }
      } catch (error) {
        failed += group.rows.length;
        errors.push({ shortname: group.shortname, error: error.message });
        syncLogger.error(`Đồng bộ điểm lớp ${group.shortname} lỗi:`, error);
      }
    }

    const csvFile = await CSVHelper.saveRows(rows, "sync_grades", "grades");

    syncLogger.info(
      `Đồng bộ điểm xong (${scope}): ${succeeded} thành công, ${skipped} bỏ qua, ${failed} lỗi`
    );

    return this.buildResult({
      total: grades.length,
      succeeded,
      skipped,
      failed,
      errors,
      totalCourses: courseGroups.size,
      csvFile,
    });
  }

  // ==================== QUIZ ====================

  // Tạo bài kiểm tra cuối kỳ ở section cuối của mọi khóa học trên Moodle
  async createFinalQuizForAllCourses() {
    syncLogger.info("Bắt đầu tạo quiz cuối kỳ cho toàn bộ khóa học Moodle");

    const courses = await moodleService.getCourses();

    if (!courses || courses.length === 0) {
      return this.buildResult({ notFound: true });
    }

    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    const created = [];
    const QUIZ_NAME = "Bài kiểm tra cuối kỳ";

    for (const course of courses) {
      if (course.id === 1) {
        skipped++; // Site home
        continue;
      }

      try {
        await retryOperation(
          async () => {
            const contents = await moodleService.getCourseContents(course.id);

            if (!contents || contents.length === 0) {
              skipped++;
              return;
            }

            // Section có số lớn nhất, bỏ qua section 0 (General)
            const lastSection = contents.reduce(
              (max, s) => (s.section > max.section ? s : max),
              contents[0]
            );

            const hasQuiz = (lastSection.modules || []).some(
              (m) =>
                m.modname === "quiz" &&
                (m.name === QUIZ_NAME || m.name.includes("kiểm tra cuối"))
            );

            if (hasQuiz) {
              skipped++;
              return;
            }

            if (lastSection.name !== QUIZ_NAME) {
              try {
                await moodleService.renameSection(
                  course.id,
                  lastSection.id,
                  QUIZ_NAME
                );
              } catch (renameError) {
                syncLogger.warn(
                  `Không đổi được tên section của ${course.fullname}: ${renameError.message}`
                );
              }
            }

            const result = await moodleService.createQuizWithPlugin(course.id, {
              name: QUIZ_NAME,
              intro: `<p>Bài kiểm tra cuối kỳ của khóa học <strong>${course.fullname}</strong></p>`,
              section: lastSection.section,
              timeopen: 0,
              timeclose: 0,
              timelimit: 3600,
              attempts: 1,
              grademethod: 1,
              grade: 10,
              shuffleanswers: 1,
              visible: 1,
            });

            if (!result?.success || !result.quizId) {
              throw new Error(
                `Plugin trả về kết quả không hợp lệ: ${JSON.stringify(result)}`
              );
            }

            succeeded++;
            created.push({
              courseId: course.id,
              courseName: course.fullname,
              quizId: result.quizId,
              section: lastSection.section,
            });
          },
          3,
          2000
        );
      } catch (error) {
        failed++;
        errors.push({
          courseId: course.id,
          courseName: course.fullname,
          error: error.message,
        });
        syncLogger.error(`Tạo quiz cho ${course.fullname} lỗi:`, error);
      }
    }

    syncLogger.info(
      `Tạo quiz cuối kỳ xong: ${succeeded} tạo mới, ${skipped} bỏ qua, ${failed} lỗi`
    );

    return this.buildResult({
      total: courses.length,
      succeeded,
      skipped,
      failed,
      errors,
      createdQuizzes: created.slice(0, 50),
    });
  }

  // Xóa toàn bộ quiz trong mọi khóa học. Thao tác không hoàn tác được.
  async deleteAllQuizzesInAllCourses() {
    syncLogger.warn("Bắt đầu XÓA toàn bộ quiz trong mọi khóa học Moodle");

    const courses = await moodleService.getCourses();

    if (!courses || courses.length === 0) {
      return this.buildResult({ notFound: true });
    }

    let deleted = 0;
    let succeeded = 0;
    let failed = 0;
    const errors = [];

    for (const course of courses) {
      if (course.id === 1) continue; // Site home

      try {
        const result = await retryOperation(
          () => moodleService.deleteAllQuizzesInCourse(course.id),
          3,
          2000
        );

        succeeded++;
        deleted += result.deletedCount || 0;

        if (result.errorsCount > 0) {
          errors.push(
            ...result.errors.map((err) => ({
              courseId: course.id,
              courseName: course.fullname,
              ...err,
            }))
          );
        }
      } catch (error) {
        failed++;
        errors.push({
          courseId: course.id,
          courseName: course.fullname,
          error: error.message,
        });
        syncLogger.error(`Xóa quiz của ${course.fullname} lỗi:`, error);
      }
    }

    syncLogger.warn(
      `Xóa quiz xong: ${deleted} quiz từ ${succeeded} khóa học, ${failed} khóa học lỗi`
    );

    return this.buildResult({
      total: courses.length,
      succeeded,
      failed,
      errors,
      deletedQuizzes: deleted,
    });
  }

  // ==================== TỔNG HỢP ====================

  // Đồng bộ ĐẦY ĐỦ 1 lớp học phần theo mã + học kỳ: tạo khóa học trên Moodle
  // (nếu chưa có) rồi ghi danh cả sinh viên và giảng viên vào khóa học đó.
  // Không cần chọn khóa (K70, K71...) — chỉ cần biết mã lớp học phần + học kỳ.
  //
  // Sinh viên/giảng viên phải ĐÃ CÓ tài khoản Moodle từ trước (đồng bộ sinh viên/
  // giảng viên chạy riêng); người chưa có tài khoản bị bỏ qua ở bước ghi danh,
  // không chặn cả lớp — chi tiết nằm trong data.students/data.teachers.
  async syncCourseFull({ tenDot, maLopHocPhan } = {}) {
    const scope = `lớp ${maLopHocPhan} (${tenDot})`;
    syncLogger.info(`Bắt đầu đồng bộ đầy đủ ${scope}`);
    const startTime = new Date();

    const course = await this.syncCourses({ tenDot, maLopHocPhan });
    const students = await this.syncStudentEnrollments({ tenDot, maLopHocPhan });
    const teachers = await this.syncTeacherEnrollments({ tenDot, maLopHocPhan });

    const notFound = Boolean(course.notFound && students.notFound && teachers.notFound);
    const failed = (course.failed || 0) + (students.failed || 0) + (teachers.failed || 0);

    syncLogger.info(
      `Đồng bộ đầy đủ ${scope} xong: khóa học tạo mới ${course.created ?? 0}, ` +
        `SV ghi danh mới ${students.succeeded ?? 0}, GV ghi danh mới ${teachers.succeeded ?? 0}, tổng lỗi ${failed}`
    );

    return this.buildResult({
      total: (course.total || 0) + (students.total || 0) + (teachers.total || 0),
      succeeded: (course.succeeded || 0) + (students.succeeded || 0) + (teachers.succeeded || 0),
      skipped: (course.skipped || 0) + (students.skipped || 0) + (teachers.skipped || 0),
      failed,
      notFound,
      course,
      students,
      teachers,
      durationMs: new Date() - startTime,
    });
  }

  // Chạy tuần tự: sinh viên -> giảng viên -> khóa học -> đăng ký SV -> đăng ký GV.
  // Một bước lỗi không chặn các bước sau.
  async syncAll({ tenDot, idKhoaHoc = null, tenKhoaHoc = null } = {}) {
    const scope = this.scopeLabel(tenDot, tenKhoaHoc);
    syncLogger.info(`Bắt đầu đồng bộ toàn bộ (${scope})`);
    const startTime = new Date();

    const args = { tenDot, idKhoaHoc, tenKhoaHoc };
    const steps = [
      ["students", () => this.syncStudents(args)],
      ["teachers", () => this.syncTeachers(args)],
      ["courses", () => this.syncCourses(args)],
      ["studentEnrollments", () => this.syncStudentEnrollments(args)],
      ["teacherEnrollments", () => this.syncTeacherEnrollments(args)],
    ];

    const results = {};
    let totalFailed = 0;

    for (const [name, run] of steps) {
      try {
        results[name] = await run();
        totalFailed += results[name].failed || 0;
      } catch (error) {
        results[name] = { error: error.message };
        totalFailed++;
        syncLogger.error(`Bước ${name} lỗi:`, error);
      }
    }

    const endTime = new Date();
    syncLogger.info(
      `Đồng bộ toàn bộ xong sau ${endTime - startTime}ms, tổng lỗi: ${totalFailed}`
    );

    return {
      tenDot,
      khoaHoc: tenKhoaHoc,
      steps: results,
      failed: totalFailed,
      startTime,
      endTime,
      durationMs: endTime - startTime,
    };
  }
}

export default new SyncToMoodleService();
