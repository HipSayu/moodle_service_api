import moodleService from "./moodleService.js";
import config from "../config/index.js";
import { syncLogger } from "../utils/logger.js";
import { AppError, retryOperation } from "../utils/errorHandler.js";

// Gộp nhiều khóa học Moodle thành một lớp mới:
// tạo lớp mới -> chuyển toàn bộ thành viên sang -> xóa các lớp nguồn.
//
// Lưu ý nghiệp vụ: chỉ THÀNH VIÊN được chuyển. Nội dung, bài tập, bài nộp
// và điểm của lớp nguồn KHÔNG chuyển được qua web service, xóa lớp nguồn là
// mất hẳn. Vì vậy mặc định chỉ sao chép lại tên các section để giữ bố cục.

const ROLE_NAMES = {
  3: "Giảng viên chính",
  4: "Trợ giảng",
  5: "Sinh viên",
};

const ROLE_STUDENT = 5;
const TEACHER_ROLES = [3, 4];

// Course id 1 là trang chủ site, không bao giờ được gộp hay xóa
const SITE_HOME_COURSE_ID = 1;

// Số enrolment gửi trong một lần gọi Moodle. Tham số đi theo query string
// nên không đẩy lô quá lớn để tránh vượt giới hạn độ dài URL của web server.
const ENROL_CHUNK = 25;

const MAX_ERRORS_RETURNED = 50;

class CourseMergeService {
  // ==================== HELPERS ====================

  // Nhận mảng [12, 13] hoặc chuỗi "12,13" -> mảng số nguyên đã loại trùng.
  // min = số lượng tối thiểu: 2 khi tạo lớp mới để gộp vào, 1 khi gộp vào một lớp có sẵn.
  parseCourseIds(raw, { min = 2 } = {}) {
    const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
    const ids = [];

    for (const item of list) {
      const text = String(item ?? "").trim();
      if (text === "") continue;

      const id = parseInt(text, 10);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError(`Moodle course id không hợp lệ: ${text}`);
      }
      if (id === SITE_HOME_COURSE_ID) {
        throw new AppError("Không thể gộp trang chủ site (course id 1)");
      }
      if (!ids.includes(id)) ids.push(id);
    }

    if (ids.length < min) {
      throw new AppError(
        min <= 1
          ? "Cần chọn ít nhất 1 lớp nguồn"
          : `Cần chọn ít nhất ${min} khóa học khác nhau để gộp`
      );
    }
    return ids;
  }

  // Một course id đơn (lớp đích có sẵn)
  parseSingleCourseId(raw, label = "lớp đích") {
    const text = String(raw ?? "").trim();
    if (!text) throw new AppError(`Thiếu ${label}`);

    const id = parseInt(text, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError(`${label} không hợp lệ: ${text}`);
    }
    if (id === SITE_HOME_COURSE_ID) {
      throw new AppError(`${label} không thể là trang chủ site (course id 1)`);
    }
    return id;
  }

  // Lấy thông tin và thành viên của các lớp nguồn, giữ đúng thứ tự đã chọn
  async loadSources(courseIds) {
    const courses = await moodleService.getCoursesByIds(courseIds);
    const byId = new Map(courses.map((course) => [course.id, course]));

    const missing = courseIds.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new AppError(
        `Không tìm thấy khóa học trên Moodle: ${missing.join(", ")}`,
        404
      );
    }

    const sources = [];
    for (const id of courseIds) {
      const members = await moodleService.getEnrolledUsers(id);
      sources.push({ course: byId.get(id), members: members || [] });
    }
    return sources;
  }

  // Vai trò của một thành viên trong một lớp. Không có vai trò nào thì coi là sinh viên.
  memberRoleIds(user) {
    const roles = (user.roles || [])
      .map((role) => role.roleid)
      .filter((roleId) => Number.isInteger(roleId));

    return roles.length ? roles : [ROLE_STUDENT];
  }

  // Gom thành viên của mọi lớp nguồn về một danh sách duy nhất.
  // Một người có mặt ở nhiều lớp thì hợp nhất vai trò và chỉ đăng ký một lần.
  buildMemberUnion(sources) {
    const union = new Map();

    for (const { course, members } of sources) {
      for (const user of members) {
        let entry = union.get(user.id);

        if (!entry) {
          entry = {
            userId: user.id,
            fullname:
              user.fullname ||
              `${user.firstname || ""} ${user.lastname || ""}`.trim(),
            username: user.username || "",
            idnumber: user.idnumber || "",
            email: user.email || "",
            roleIds: new Set(),
            fromCourses: [],
          };
          union.set(user.id, entry);
        }

        this.memberRoleIds(user).forEach((roleId) => entry.roleIds.add(roleId));
        entry.fromCourses.push(course.shortname);
      }
    }

    return union;
  }

  roleLabel(roleIds) {
    return [...roleIds]
      .map((roleId) => ROLE_NAMES[roleId] || `Vai trò ${roleId}`)
      .join(", ");
  }

  courseUrl(courseId) {
    return `${config.moodle.url.replace(/\/+$/, "")}/course/view.php?id=${courseId}`;
  }

  // Tóm tắt một lớp nguồn cho phía giao diện
  summarizeSource({ course, members }) {
    const roleOf = (user) => this.memberRoleIds(user);

    return {
      id: course.id,
      shortname: course.shortname,
      fullname: course.fullname,
      idnumber: course.idnumber || "",
      categoryid: course.categoryid,
      visible: course.visible,
      memberCount: members.length,
      studentCount: members.filter((u) => roleOf(u).includes(ROLE_STUDENT))
        .length,
      teacherCount: members.filter((u) =>
        roleOf(u).some((roleId) => TEACHER_ROLES.includes(roleId))
      ).length,
    };
  }

  // ==================== XEM TRƯỚC ====================

  // Xem trước kết quả gộp: có bao nhiêu thành viên, trùng bao nhiêu người,
  // và gợi ý sẵn tên/mã cho lớp mới. targetCourseId có giá trị -> xem trước
  // kiểu "chuyển vào lớp có sẵn" thay vì tạo lớp mới.
  async previewMerge({ sourceCourseIds, targetCourseId = null } = {}) {
    if (targetCourseId) {
      return this.previewMergeIntoExisting({ sourceCourseIds, targetCourseId });
    }

    const ids = this.parseCourseIds(sourceCourseIds);
    const sources = await this.loadSources(ids);
    const union = this.buildMemberUnion(sources);

    const memberships = sources.reduce(
      (sum, source) => sum + source.members.length,
      0
    );

    const byRole = {};
    for (const member of union.values()) {
      for (const roleId of member.roleIds) {
        const label = ROLE_NAMES[roleId] || `Vai trò ${roleId}`;
        byRole[label] = (byRole[label] || 0) + 1;
      }
    }

    const shortnames = sources.map((source) => source.course.shortname);

    return {
      mode: "new",
      sources: sources.map((source) => this.summarizeSource(source)),
      members: {
        unique: union.size,
        memberships,
        duplicated: memberships - union.size,
        byRole,
        items: [...union.values()].map((member) => ({
          MaNguoiDung: member.idnumber,
          HoTen: member.fullname,
          TaiKhoan: member.username,
          VaiTro: this.roleLabel(member.roleIds),
          ThuocLop: [...new Set(member.fromCourses)].join(" + "),
        })),
      },
      suggestion: {
        fullname: `${sources[0].course.fullname} (lớp gộp)`,
        shortname: shortnames.join("+"),
        categoryid: sources[0].course.categoryid,
        idnumber: "",
      },
    };
  }

  // Xem trước khi chuyển SV/GV của các lớp nguồn sang MỘT lớp có sẵn
  // (lớp đích giữ nguyên nội dung, không bị xóa; chỉ các lớp nguồn bị xóa).
  async previewMergeIntoExisting({ sourceCourseIds, targetCourseId }) {
    const targetId = this.parseSingleCourseId(targetCourseId, "lớp đích");
    const ids = this.parseCourseIds(sourceCourseIds, { min: 1 });

    if (ids.includes(targetId)) {
      throw new AppError(
        "Lớp đích không được nằm trong danh sách lớp nguồn (lớp nguồn sẽ bị xóa)"
      );
    }

    const [target] = await this.loadSources([targetId]);
    const sources = await this.loadSources(ids);

    const incomingUnion = this.buildMemberUnion(sources);
    const targetMemberIds = new Set(target.members.map((user) => user.id));
    const newMembers = [...incomingUnion.values()].filter(
      (member) => !targetMemberIds.has(member.userId)
    );
    const totalUnion = this.buildMemberUnion([target, ...sources]);

    const byRole = {};
    for (const member of incomingUnion.values()) {
      for (const roleId of member.roleIds) {
        const label = ROLE_NAMES[roleId] || `Vai trò ${roleId}`;
        byRole[label] = (byRole[label] || 0) + 1;
      }
    }

    return {
      mode: "existing",
      target: this.summarizeSource(target),
      sources: sources.map((source) => this.summarizeSource(source)),
      members: {
        unique: totalUnion.size,
        incoming: incomingUnion.size,
        newMembers: newMembers.length,
        alreadyInTarget: incomingUnion.size - newMembers.length,
        byRole,
        items: [...incomingUnion.values()].map((member) => ({
          MaNguoiDung: member.idnumber,
          HoTen: member.fullname,
          TaiKhoan: member.username,
          VaiTro: this.roleLabel(member.roleIds),
          ThuocLop: [...new Set(member.fromCourses)].join(" + "),
          DaCoTrongLopDich: targetMemberIds.has(member.userId) ? "Có" : "",
        })),
      },
    };
  }

  // ==================== GỘP LỚP ====================

  // Danh sách tên section của các lớp nguồn, đã loại trùng theo tên
  async collectSectionNames(sources, warnings) {
    const sections = [];

    for (const { course } of sources) {
      try {
        const contents = await moodleService.getCourseContents(course.id);

        for (const section of contents || []) {
          // Section 0 là phần chung, Moodle tự tạo sẵn ở lớp mới
          if (!section.name || section.section === 0) continue;
          if (sections.some((item) => item.name === section.name)) continue;

          sections.push({ name: section.name, summary: section.summary || "" });
        }
      } catch (error) {
        warnings.push(
          `Không đọc được cấu trúc section của lớp ${course.shortname}: ${error.message}`
        );
      }
    }

    return sections;
  }

  async mergeCourses({
    sourceCourseIds,
    targetCourseId = null,
    fullname,
    shortname,
    idnumber = null,
    categoryid = null,
    summary = null,
    copySections = true,
    deleteSources = true,
  } = {}) {
    if (targetCourseId) {
      return this.mergeIntoExistingCourse({
        sourceCourseIds,
        targetCourseId,
        copySections,
        deleteSources,
      });
    }

    const ids = this.parseCourseIds(sourceCourseIds);

    if (!fullname) throw new AppError("Thiếu tên lớp mới (fullname)");
    if (!shortname) throw new AppError("Thiếu mã lớp mới (shortname)");

    // Shortname trùng thì Moodle báo lỗi khi tạo, chặn sớm để thông báo rõ ràng
    const duplicated = await moodleService.getCourseByShortname(shortname);
    if (duplicated) {
      throw new AppError(
        `Mã lớp "${shortname}" đã tồn tại trên Moodle (course id ${duplicated.id})`
      );
    }

    const sources = await this.loadSources(ids);
    const union = this.buildMemberUnion(sources);

    syncLogger.warn(
      `Bắt đầu gộp ${ids.length} lớp [${sources
        .map((source) => source.course.shortname)
        .join(", ")}] thành "${shortname}"`
    );

    const steps = {};
    const errors = [];
    const warnings = [];

    // ---------- Bước 1: tạo lớp mới ----------
    const startdates = sources
      .map((source) => source.course.startdate)
      .filter((value) => Number.isInteger(value) && value > 0);
    const enddates = sources
      .map((source) => source.course.enddate)
      .filter((value) => Number.isInteger(value) && value > 0);

    const created = await moodleService.createCourse({
      course_fullname: fullname,
      course_shortname: shortname,
      course_idnumber: idnumber || "",
      course_categoryid: categoryid || sources[0].course.categoryid || 1,
      description:
        summary ||
        `Lớp gộp từ: ${sources
          .map((source) => source.course.shortname)
          .join(", ")}`,
      start_date: startdates.length
        ? new Date(Math.min(...startdates) * 1000)
        : null,
      end_date: enddates.length ? new Date(Math.max(...enddates) * 1000) : null,
    });

    const newCourseId = created.id;
    steps["Tạo lớp mới"] = { total: 1, succeeded: 1, skipped: 0, failed: 0 };

    // ---------- Bước 2: sao chép bố cục section ----------
    if (copySections) {
      const sections = await this.collectSectionNames(sources, warnings);
      let sectionOk = 0;
      let sectionFailed = 0;

      for (const section of sections) {
        try {
          await moodleService.createSectionWithPlugin(newCourseId, {
            name: section.name,
            summary: section.summary,
            visible: 1,
            position: 0, // thêm vào cuối, giữ đúng thứ tự của lớp nguồn
          });
          sectionOk++;
        } catch (error) {
          sectionFailed++;
          warnings.push(
            `Không tạo được section "${section.name}": ${error.message}`
          );
        }
      }

      steps["Sao chép section"] = {
        total: sections.length,
        succeeded: sectionOk,
        skipped: 0,
        failed: sectionFailed,
      };
    }

    // ---------- Bước 3: chuyển thành viên sang lớp mới ----------
    const enrolments = [];
    for (const member of union.values()) {
      for (const roleId of member.roleIds) {
        enrolments.push({
          userId: member.userId,
          courseId: newCourseId,
          roleId,
        });
      }
    }

    let enrolled = 0;
    const failedUserIds = new Set();

    for (let i = 0; i < enrolments.length; i += ENROL_CHUNK) {
      const chunk = enrolments.slice(i, i + ENROL_CHUNK);

      try {
        await retryOperation(() => moodleService.enrolUsers(chunk), 3, 1500);
        enrolled += chunk.length;
      } catch (error) {
        // Cả lô hỏng thì đăng ký lại từng người để biết chính xác ai lỗi,
        // tránh đánh trượt oan những người vẫn đăng ký được.
        for (const item of chunk) {
          try {
            await moodleService.enrolUsers([item]);
            enrolled++;
          } catch (itemError) {
            failedUserIds.add(item.userId);
            const member = union.get(item.userId);
            errors.push({
              MaNguoiDung: member?.idnumber || "",
              HoTen: member?.fullname || `user ${item.userId}`,
              VaiTro: ROLE_NAMES[item.roleId] || `Vai trò ${item.roleId}`,
              error: itemError.message,
            });
          }
        }
      }
    }

    steps["Chuyển thành viên"] = {
      total: enrolments.length,
      succeeded: enrolled,
      skipped: 0,
      failed: enrolments.length - enrolled,
    };

    // ---------- Bước 4: xóa các lớp nguồn ----------
    const deletedCourseIds = [];

    if (!deleteSources) {
      steps["Xóa lớp nguồn"] = {
        total: ids.length,
        succeeded: 0,
        skipped: ids.length,
        failed: 0,
      };
      warnings.push("Giữ nguyên lớp nguồn theo yêu cầu (deleteSources=false).");
    } else if (failedUserIds.size > 0) {
      // Xóa lớp nguồn khi còn người chưa chuyển được là mất dấu vết vĩnh viễn
      steps["Xóa lớp nguồn"] = {
        total: ids.length,
        succeeded: 0,
        skipped: ids.length,
        failed: 0,
      };
      warnings.push(
        `Còn ${failedUserIds.size} thành viên chưa chuyển được nên KHÔNG xóa lớp nguồn. Xử lý xong hãy xóa lại.`
      );
    } else {
      try {
        const moodleWarnings = await moodleService.deleteCourses(ids);
        deletedCourseIds.push(...ids);

        moodleWarnings.forEach((warning) =>
          warnings.push(
            `Moodle cảnh báo khi xóa: ${warning.message || JSON.stringify(warning)}`
          )
        );

        steps["Xóa lớp nguồn"] = {
          total: ids.length,
          succeeded: ids.length,
          skipped: 0,
          failed: 0,
        };
      } catch (error) {
        steps["Xóa lớp nguồn"] = {
          total: ids.length,
          succeeded: 0,
          skipped: 0,
          failed: ids.length,
        };
        errors.push({ CourseId: ids.join(", "), error: error.message });
        warnings.push(
          "Lớp mới đã tạo và nhận đủ thành viên, nhưng xóa lớp nguồn thất bại — xóa thủ công trên Moodle."
        );
      }
    }

    const details = [...union.values()].map((member) => ({
      MaNguoiDung: member.idnumber,
      HoTen: member.fullname,
      VaiTro: this.roleLabel(member.roleIds),
      ThuocLop: [...new Set(member.fromCourses)].join(" + "),
      TrangThai: failedUserIds.has(member.userId) ? "Lỗi" : "Thành công",
    }));

    syncLogger.warn(
      `Gộp lớp xong: "${shortname}" (id ${newCourseId}) — ${union.size - failedUserIds.size}/${union.size} thành viên, xóa ${deletedCourseIds.length}/${ids.length} lớp nguồn`
    );

    return {
      total: union.size,
      succeeded: union.size - failedUserIds.size,
      skipped: 0,
      failed: failedUserIds.size,
      notFound: false,
      errors: errors.slice(0, MAX_ERRORS_RETURNED),
      errorsTruncated: errors.length > MAX_ERRORS_RETURNED,
      targetCourse: {
        id: newCourseId,
        shortname,
        fullname,
        url: this.courseUrl(newCourseId),
      },
      sources: sources.map((source) => this.summarizeSource(source)),
      deletedCourseIds,
      steps,
      warnings,
      details,
    };
  }

  // ==================== CHUYỂN VÀO LỚP CÓ SẴN ====================

  // Chuyển SV/GV của các lớp nguồn sang MỘT lớp đã có trên Moodle (giữ nguyên
  // nội dung/bài giảng của lớp đích), rồi xóa các lớp nguồn. Khác với
  // mergeCourses(): không tạo lớp mới nên lớp đích không mất nội dung sẵn có.
  async mergeIntoExistingCourse({
    sourceCourseIds,
    targetCourseId,
    copySections = true,
    deleteSources = true,
  } = {}) {
    const targetId = this.parseSingleCourseId(targetCourseId, "lớp đích");
    const ids = this.parseCourseIds(sourceCourseIds, { min: 1 });

    if (ids.includes(targetId)) {
      throw new AppError(
        "Lớp đích không được nằm trong danh sách lớp nguồn (lớp nguồn sẽ bị xóa)"
      );
    }

    const [target] = await this.loadSources([targetId]);
    const sources = await this.loadSources(ids);
    const union = this.buildMemberUnion(sources);

    syncLogger.warn(
      `Bắt đầu chuyển SV/GV từ ${sources.length} lớp [${sources
        .map((source) => source.course.shortname)
        .join(", ")}] sang lớp có sẵn "${target.course.shortname}" (id ${targetId})`
    );

    const steps = {};
    const errors = [];
    const warnings = [];

    // ---------- Bước 1: sao chép section còn thiếu vào lớp đích ----------
    if (copySections) {
      const existingNames = new Set();
      try {
        const contents = await moodleService.getCourseContents(targetId);
        for (const section of contents || []) {
          if (section.name) existingNames.add(section.name);
        }
      } catch (error) {
        warnings.push(
          `Không đọc được cấu trúc section của lớp đích: ${error.message}`
        );
      }

      const sections = (await this.collectSectionNames(sources, warnings)).filter(
        (section) => !existingNames.has(section.name)
      );

      let sectionOk = 0;
      let sectionFailed = 0;

      for (const section of sections) {
        try {
          await moodleService.createSectionWithPlugin(targetId, {
            name: section.name,
            summary: section.summary,
            visible: 1,
            position: 0,
          });
          sectionOk++;
        } catch (error) {
          sectionFailed++;
          warnings.push(
            `Không tạo được section "${section.name}": ${error.message}`
          );
        }
      }

      steps["Sao chép section"] = {
        total: sections.length,
        succeeded: sectionOk,
        skipped: 0,
        failed: sectionFailed,
      };
    }

    // ---------- Bước 2: chuyển thành viên chưa có trong lớp đích ----------
    const targetRoleMap = new Map(
      target.members.map((user) => [user.id, new Set(this.memberRoleIds(user))])
    );

    const enrolments = [];
    let alreadyThere = 0;

    for (const member of union.values()) {
      const existingRoles = targetRoleMap.get(member.userId);
      for (const roleId of member.roleIds) {
        if (existingRoles?.has(roleId)) {
          alreadyThere++;
          continue;
        }
        enrolments.push({ userId: member.userId, courseId: targetId, roleId });
      }
    }

    let enrolled = 0;
    const failedUserIds = new Set();

    for (let i = 0; i < enrolments.length; i += ENROL_CHUNK) {
      const chunk = enrolments.slice(i, i + ENROL_CHUNK);

      try {
        await retryOperation(() => moodleService.enrolUsers(chunk), 3, 1500);
        enrolled += chunk.length;
      } catch (error) {
        for (const item of chunk) {
          try {
            await moodleService.enrolUsers([item]);
            enrolled++;
          } catch (itemError) {
            failedUserIds.add(item.userId);
            const member = union.get(item.userId);
            errors.push({
              MaNguoiDung: member?.idnumber || "",
              HoTen: member?.fullname || `user ${item.userId}`,
              VaiTro: ROLE_NAMES[item.roleId] || `Vai trò ${item.roleId}`,
              error: itemError.message,
            });
          }
        }
      }
    }

    steps["Chuyển thành viên"] = {
      total: enrolments.length,
      succeeded: enrolled,
      skipped: alreadyThere,
      failed: enrolments.length - enrolled,
    };

    // ---------- Bước 3: xóa các lớp nguồn ----------
    const deletedCourseIds = [];

    if (!deleteSources) {
      steps["Xóa lớp nguồn"] = {
        total: ids.length,
        succeeded: 0,
        skipped: ids.length,
        failed: 0,
      };
      warnings.push("Giữ nguyên lớp nguồn theo yêu cầu (deleteSources=false).");
    } else if (failedUserIds.size > 0) {
      steps["Xóa lớp nguồn"] = {
        total: ids.length,
        succeeded: 0,
        skipped: ids.length,
        failed: 0,
      };
      warnings.push(
        `Còn ${failedUserIds.size} thành viên chưa chuyển được nên KHÔNG xóa lớp nguồn. Xử lý xong hãy xóa lại.`
      );
    } else {
      try {
        const moodleWarnings = await moodleService.deleteCourses(ids);
        deletedCourseIds.push(...ids);

        moodleWarnings.forEach((warning) =>
          warnings.push(
            `Moodle cảnh báo khi xóa: ${warning.message || JSON.stringify(warning)}`
          )
        );

        steps["Xóa lớp nguồn"] = {
          total: ids.length,
          succeeded: ids.length,
          skipped: 0,
          failed: 0,
        };
      } catch (error) {
        steps["Xóa lớp nguồn"] = {
          total: ids.length,
          succeeded: 0,
          skipped: 0,
          failed: ids.length,
        };
        errors.push({ CourseId: ids.join(", "), error: error.message });
        warnings.push(
          "Đã chuyển xong thành viên vào lớp đích, nhưng xóa lớp nguồn thất bại — xóa thủ công trên Moodle."
        );
      }
    }

    const details = [...union.values()].map((member) => ({
      MaNguoiDung: member.idnumber,
      HoTen: member.fullname,
      VaiTro: this.roleLabel(member.roleIds),
      ThuocLop: [...new Set(member.fromCourses)].join(" + "),
      TrangThai: failedUserIds.has(member.userId) ? "Lỗi" : "Thành công",
    }));

    syncLogger.warn(
      `Chuyển vào lớp có sẵn xong: "${target.course.shortname}" (id ${targetId}) — ${union.size - failedUserIds.size}/${union.size} thành viên, xóa ${deletedCourseIds.length}/${ids.length} lớp nguồn`
    );

    return {
      total: union.size,
      succeeded: union.size - failedUserIds.size,
      skipped: alreadyThere,
      failed: failedUserIds.size,
      notFound: false,
      errors: errors.slice(0, MAX_ERRORS_RETURNED),
      errorsTruncated: errors.length > MAX_ERRORS_RETURNED,
      targetCourse: {
        id: targetId,
        shortname: target.course.shortname,
        fullname: target.course.fullname,
        url: this.courseUrl(targetId),
        existing: true,
      },
      sources: sources.map((source) => this.summarizeSource(source)),
      deletedCourseIds,
      steps,
      warnings,
      details,
    };
  }
}

export default new CourseMergeService();
