import moodleService from "../services/moodleService.js";
import syncToMoodleService from "../services/syncToMoodleService.js";
import courseMergeService from "../services/courseMergeService.js";
import config from "../config/index.js";
import { ok, fail, syncResult } from "../utils/response.js";
import { getInt, getParam, getBool } from "../utils/requestParams.js";

// Danh sách course id cần gộp. Nhận cả mảng JSON lẫn chuỗi "12,13"
const getCourseIds = (req) =>
  req.body?.sourceCourseIds ?? req.query?.sourceCourseIds ?? null;

// Thông tin site + quyền của token đang dùng
const getSiteInfo = async (req, res) => {
  const data = await moodleService.checkUserCapabilities();
  return ok(res, { message: "Lấy thông tin site Moodle", data });
};

// Danh sách web service function mà token được phép gọi
const getFunctions = async (req, res) => {
  const functions = await moodleService.getAllFunctions();
  return ok(res, {
    message: `Token có quyền gọi ${functions.length} function`,
    data: { total: functions.length, items: functions },
  });
};

// Danh sách khóa học trên Moodle.
// Kèm siteUrl để giao diện dựng được link mở lớp trên Moodle.
const listCourses = async (req, res) => {
  const limit = getInt(req, "limit");
  const courses = await moodleService.getCourses();
  const items = limit ? courses.slice(0, limit) : courses;

  return ok(res, {
    message: `Lấy ${items.length}/${courses.length} khóa học từ Moodle`,
    data: {
      siteUrl: config.moodle.url,
      total: courses.length,
      returned: items.length,
      items,
    },
  });
};

// Danh sách category (khoa / bộ môn) trên Moodle
const listCategories = async (req, res) => {
  const categories = await moodleService.getCategories();
  const items = (categories || []).map((c) => ({
    id: c.id,
    name: c.name,
    idnumber: c.idnumber,
    parent: c.parent,
    coursecount: c.coursecount,
    visible: c.visible,
  }));

  return ok(res, {
    message: `Lấy ${items.length} danh mục từ Moodle`,
    data: { total: items.length, items },
  });
};

// Xem trước kết quả gộp lớp: thành viên hợp nhất, số người trùng, gợi ý tên lớp mới
const previewMergeCourses = async (req, res) => {
  const data = await courseMergeService.previewMerge({
    sourceCourseIds: getCourseIds(req),
  });

  return ok(res, {
    message: `Gộp ${data.sources.length} lớp sẽ được ${data.members.unique} thành viên (${data.members.duplicated} lượt trùng)`,
    data,
  });
};

// Gộp nhiều lớp thành một lớp mới rồi xóa lớp nguồn.
// Xóa lớp không hoàn tác được nên bắt xác nhận rõ ràng.
const mergeCourses = async (req, res) => {
  const deleteSources = getBool(req, "deleteSources", true);

  if (deleteSources && !getBool(req, "confirm")) {
    return fail(res, {
      message:
        "Gộp lớp sẽ XÓA các lớp nguồn cùng toàn bộ nội dung, bài nộp và điểm của chúng. Gửi confirm=true để xác nhận, hoặc deleteSources=false để giữ lại lớp nguồn.",
    });
  }

  const data = await courseMergeService.mergeCourses({
    sourceCourseIds: getCourseIds(req),
    fullname: getParam(req, "fullname"),
    shortname: getParam(req, "shortname"),
    idnumber: getParam(req, "idnumber"),
    categoryid: getInt(req, "categoryid"),
    summary: getParam(req, "summary"),
    copySections: getBool(req, "copySections", true),
    deleteSources,
  });

  return syncResult(res, {
    message: `Đã tạo lớp "${data.targetCourse.shortname}" (id ${data.targetCourse.id}), chuyển ${data.succeeded}/${data.total} thành viên, xóa ${data.deletedCourseIds.length}/${data.sources.length} lớp nguồn`,
    data,
  });
};

// Danh sách người dùng trên Moodle.
// key/value là tiêu chí của core_user_get_users: auth, idnumber, email, firstname...
const listUsers = async (req, res) => {
  const key = getParam(req, "key") || "auth";
  const value = getParam(req, "value") || "manual";
  const limit = getInt(req, "limit");

  const users = await moodleService.getUsers({ key, value });
  const items = limit ? users.slice(0, limit) : users;

  return ok(res, {
    message: `Tìm thấy ${users.length} người dùng (${key}=${value})`,
    data: {
      criteria: { key, value },
      total: users.length,
      returned: items.length,
      items: items.map((u) => ({
        id: u.id,
        username: u.username,
        idnumber: u.idnumber,
        fullname: u.fullname || `${u.firstname || ""} ${u.lastname || ""}`.trim(),
        firstname: u.firstname,
        lastname: u.lastname,
        email: u.email,
        city: u.city,
        auth: u.auth,
        suspended: u.suspended,
      })),
    },
  });
};

// Thành viên của một khóa học. roleid: 5 = sinh viên, 3 = giảng viên chính, 4 = trợ giảng
const listCourseUsers = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) {
    return fail(res, { message: "courseId phải là số nguyên" });
  }

  const roleId = getInt(req, "roleid");
  const users = await moodleService.getEnrolledUsers(courseId);

  const items = users
    .filter((u) => !roleId || (u.roles || []).some((r) => r.roleid === roleId))
    .map((u) => ({
      id: u.id,
      username: u.username,
      idnumber: u.idnumber,
      fullname: u.fullname,
      email: u.email,
      roles: (u.roles || []).map((r) => r.shortname).join(", "),
      roleIds: (u.roles || []).map((r) => r.roleid).join(", "),
    }));

  return ok(res, {
    message: `Khóa học ${courseId} có ${items.length}/${users.length} thành viên khớp bộ lọc`,
    data: { courseId, roleId, total: users.length, returned: items.length, items },
  });
};

// Danh sách quiz trong một khóa học
const listCourseQuizzes = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) {
    return fail(res, { message: "courseId phải là số nguyên" });
  }

  const quizzes = await moodleService.getCourseQuizzes(courseId);
  return ok(res, {
    message: `Khóa học ${courseId} có ${quizzes.length} quiz`,
    data: { courseId, total: quizzes.length, items: quizzes },
  });
};

// Tạo quiz trong một khóa học cụ thể
const createCourseQuiz = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) {
    return fail(res, { message: "courseId phải là số nguyên" });
  }

  const data = await moodleService.createQuizWithPlugin(courseId, {
    name: getParam(req, "name") || "Bài kiểm tra cuối kỳ",
    intro: getParam(req, "intro") || "<p>Bài kiểm tra cuối kỳ</p>",
    section: getInt(req, "section", 0),
    timelimit: getInt(req, "timelimit", 3600),
    attempts: getInt(req, "attempts", 1),
    grade: getInt(req, "grade", 10),
    visible: 1,
  });

  return ok(res, {
    message: `Đã tạo quiz trong khóa học ${courseId}`,
    data,
    status: 201,
  });
};

// Tạo quiz cuối kỳ cho toàn bộ khóa học trên Moodle
const createFinalQuizzes = async (req, res) => {
  const data = await syncToMoodleService.createFinalQuizForAllCourses();

  return syncResult(res, {
    message: data.notFound
      ? "Không có khóa học nào trên Moodle"
      : `Tạo mới ${data.succeeded} quiz, bỏ qua ${data.skipped}, lỗi ${data.failed}`,
    data,
  });
};

// Xóa toàn bộ quiz trong một khóa học
const deleteCourseQuizzes = async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  if (!Number.isInteger(courseId)) {
    return fail(res, { message: "courseId phải là số nguyên" });
  }

  const data = await moodleService.deleteAllQuizzesInCourse(courseId);
  return ok(res, {
    message: `Đã xóa ${data.deletedCount} quiz khỏi khóa học ${courseId}`,
    data,
  });
};

// Xóa toàn bộ quiz trong MỌI khóa học. Không hoàn tác được nên bắt xác nhận rõ ràng.
const deleteAllQuizzes = async (req, res) => {
  if (!getBool(req, "confirm")) {
    return fail(res, {
      message:
        "Thao tác xóa toàn bộ quiz trên mọi khóa học không thể hoàn tác. Gửi confirm=true để xác nhận.",
    });
  }

  const data = await syncToMoodleService.deleteAllQuizzesInAllCourses();

  return syncResult(res, {
    message: data.notFound
      ? "Không có khóa học nào trên Moodle"
      : `Đã xóa ${data.deletedQuizzes} quiz từ ${data.succeeded} khóa học, lỗi ${data.failed}`,
    data,
  });
};

export default {
  getSiteInfo,
  getFunctions,
  listCourses,
  listCategories,
  previewMergeCourses,
  mergeCourses,
  listUsers,
  listCourseUsers,
  listCourseQuizzes,
  createCourseQuiz,
  createFinalQuizzes,
  deleteCourseQuizzes,
  deleteAllQuizzes,
};
