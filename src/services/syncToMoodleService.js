import databaseService from "./databaseService.js";
import moodleService from "./moodleService.js";
import { syncLogger } from "../utils/logger.js";
import { retryOperation } from "../utils/errorHandler.js";
import CSVHelper from "../utils/csvHelper.js";

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

  // Shortname/idnumber của khóa học trên Moodle.
  // Dùng thống nhất ở mọi nơi: tạo course, tra course, đăng ký, chấm điểm.
  buildShortname(row) {
    return `${row.MaLopHocPhan}_${row.TenDot}`;
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
  async syncStudents({ tenDot, maSinhVien = null, idKhoaHoc = null, tenKhoaHoc = null } = {}) {
    const scope = maSinhVien
      ? `sinh viên ${maSinhVien}`
      : this.scopeLabel(tenDot, tenKhoaHoc);
    syncLogger.info(`Bắt đầu đồng bộ sinh viên (${scope})`);

    const students = this.uniqueBy(
      await databaseService.getStudents({ tenDot, maSinhVien, idKhoaHoc }),
      (row) => row.MaSinhVien
    );

    if (students.length === 0) {
      syncLogger.warn(`Không tìm thấy sinh viên nào (${scope})`);
      return this.buildResult({ notFound: true, details: [] });
    }

    let succeeded = 0;
    let failed = 0;
    const errors = [];
    const rows = [];

    for (const student of students) {
      const row = {
        MaSinhVien: student.MaSinhVien,
        HoTenSinhVien: student.HoTenSinhVien,
        Email: student.Email,
        HanhDong: "",
        TrangThai: "Thành công",
        LoiChiTiet: "",
        ThoiGian: new Date().toISOString(),
      };

      const userData = {
        first_name: student.Ten,
        last_name: student.HoDem,
        email: student.Email,
        city: student.NguyenQuan || "HN",
        idnumber: student.MaSinhVien,
        password: studentDefaultPassword(student.MaSinhVien),
      };

      try {
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
        errors.push({ MaSinhVien: student.MaSinhVien, error: error.message });
        syncLogger.error(`Đồng bộ sinh viên ${student.MaSinhVien} lỗi:`, error);
      }

      rows.push(row);
    }

    const csvFile = await CSVHelper.saveRows(rows, "sync_students");

    syncLogger.info(
      `Đồng bộ sinh viên xong (${scope}): ${succeeded}/${students.length} thành công, ${failed} lỗi`
    );

    return this.buildResult({
      total: students.length,
      succeeded,
      failed,
      errors,
      csvFile,
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
    }

    const csvFile = await CSVHelper.saveRows(rows, "sync_teachers");

    syncLogger.info(
      `Đồng bộ giảng viên xong (${scope}): ${succeeded}/${teachers.length} thành công, ${failed} lỗi`
    );

    return this.buildResult({
      total: teachers.length,
      succeeded,
      failed,
      errors,
      csvFile,
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
          course_fullname: `${course.TenLopHoc} - ${course.TenMonHoc} - ${course.TenDot}`,
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
    }

    const csvFile = await CSVHelper.saveRows(rows, "sync_courses");

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
        errors.push({ shortname: group.shortname, error: error.message });
        syncLogger.error(`Xử lý lớp ${group.shortname} lỗi:`, error);
      }
    }

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
      csvFiles: filtered ? undefined : csvFiles,
      details: filtered ? allRows : undefined,
    });
  }

  // ==================== ĐĂNG KÝ GIẢNG VIÊN VÀO LỚP ====================

  // IsTroGiang = 1 -> Trợ giảng (role 4), ngược lại -> Giảng viên chính (role 3).
  // Giảng viên đã có trong lớp với đúng role thì bỏ qua.
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
        errors.push({ shortname: group.shortname, error: error.message });
        syncLogger.error(`Xử lý lớp ${group.shortname} lỗi:`, error);
      }
    }

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
