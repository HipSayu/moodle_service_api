import databaseService from './databaseService.js';
import moodleService from './moodleService.js';
import { logger, syncLogger } from '../utils/logger.js';
import { retryOperation } from '../utils/errorHandler.js';
import databaseGvService from './databaseGvService.js';
import { CONSTRAINTS } from 'cron/dist/constants.js';

class SyncToMoodleService {
  constructor() {
    this.lastSyncDate = {};
  }

  async syncStudentsToMoodle() {
    try {
      const lastSync = this.lastSyncDate.students;
      syncLogger.info('Starting student sync to Moodle');
      const students = await databaseService.getStudents(lastSync);
      let syncCount = 0;
      let errorCount = 0;
      const errors = [];
      for (const student of students) {
        try {
          await retryOperation(async () => {
            const existingUser = await moodleService.getUserByIdNumber(student.MaSinhVien);

            const userData = {
              username: student.MaSinhVien,
              first_name: student.HoDem,
              last_name: student.Ten,
              email: student.Email,
              city: student.NguyenQuan,
              idnumber: student.MaSinhVien,
              password: student.MaSinhVien,
            };

            if (existingUser) {
              console.log('user đã tồn tại')
              await moodleService.updateUser(existingUser.id, userData);
            } else {
              const newUser = await moodleService.createUser(userData);
              console.log("Tạo user Mới")
            }

          }, 3, 2000);
        } catch (error) {
          syncLogger.error(`Failed to sync student ${student.MaSinhVien}:`, error);
        }
      }
      this.lastSyncDate.students = new Date();

      syncLogger.info('Student sync to Moodle completed', {
        totalStudents: students.length,
        syncCount,
        errorCount,
        errors: errors.slice(0, 10)
      });

      return {
        success: true,
        total: students.length,
        synced: syncCount,
        errors: errorCount,
        errorDetails: errors
      };
    }
    catch (error) {
      syncLogger.error('Student sync to Moodle failed:', error);
      throw error;
    }
  }

  async syncTeachersToMoodle() {
    try {
      syncLogger.info('Starting teacher sync to Moodle');

      const lastSync = this.lastSyncDate.teachers;
      const teachers = await databaseGvService.getTeachers(lastSync);

      let syncCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const teacher of teachers) {
        try {
          await retryOperation(async () => {
            // Kiểm tra user đã tồn tại chưa
            const existingUser = await moodleService.getUserByIdNumber(teacher.MaNhanSu);
            const userData = {
              username: teacher.MaNhanSu,
              first_name: teacher.HoDem,
              last_name: teacher.Ten,
              email: teacher.Email || "",
              city: teacher.NguyenQuan || "",
              idnumber: teacher.MaNhanSu,
              password: teacher.MaNhanSu,
            };
            if (teacher.GiaoVien) {
              if (existingUser) {
                console.log('-----------------------')
                syncLogger.info('teacher đã tồn tại')
                await moodleService.updateUser(existingUser.id, userData);
                console.log(`Đã update ${teacher.HoDem} ${teacher.Ten}`)
              } else {
                console.log('-----------------------')
                syncLogger.info("Tạo teacher Mới")
                const newUser = await moodleService.createUser(userData);
                console.log(`Đã thêm ${teacher.HoDem} ${teacher.Ten}`)
              }
            }
            else {
              console.log('-----------------------')
              console.log(`${teacher.HoDem} ${teacher.Ten}`)
              syncLogger.info("Ko Phải là giảng viên")
            }
            syncCount++;
          }, 3, 2000);
        } catch (error) {
          errorCount++;
          errors.push({
            teacher_code: teacher.teacher_code,
            error: error.message
          });
          syncLogger.error(`Failed to sync teacher ${teacher.teacher_code}:`, error);
        }
      }

      this.lastSyncDate.teachers = new Date();

      syncLogger.info('Teacher sync to Moodle completed', {
        totalTeachers: teachers.length,
        syncCount,
        errorCount,
        errors: errors.slice(0, 10)
      });

      return {
        success: true,
        total: teachers.length,
        synced: syncCount,
        errors: errorCount,
        errorDetails: errors
      };
    } catch (error) {
      syncLogger.error('Teacher sync to Moodle failed:', error);
      throw error;
    }
  }

  // Đồng bộ khóa học từ SQL Server sang Moodle
  async syncCoursesToMoodle() {
    try {
      syncLogger.info('Starting course sync to Moodle');

      const lastSync = this.lastSyncDate.courses;
      const courses = await databaseService.getCourses(lastSync);

      let syncCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const course of courses) {
        try {
          await retryOperation(async () => {
            console.log("----------------------------------------")
            console.log(course)
            // Kiểm tra course đã tồn tại chưa
            const existingCourse = await moodleService.getCourseByShortname(course.course_code);
            // Tìm Id Categori theo CategoriNumber
            const category = await moodleService.getCategoryByIdNumber(course.IDToBoMon.toString());
            if (!category) {
              throw new Error(`Category not found for department ID ${course.IDToBoMon}`);
            }
            const courseData = {
              course_fullname: `${course.TenLopHoc} - ${course.TenMonHoc} - ${course.TenDot}`,
              course_shortname: course.MaLopHocPhan,
              course_categoryid: category.id,
              course_idnumber: course.MaLopHocPhan
            };

            if (course.SoTietThucHanh < course.SoTietLyThuyet) {

            }

            if (existingCourse) {
              console.log('-----------------------')
              syncLogger.info('Khóa học đã tồn tại')
              console.log(courseData.course_fullname)
              // Cập nhật course hiện có
              // await moodleService.updateCourse(existingCourse.id, courseData);
              // Update Sinh Viên, Các thứ,.....
            } else {
              // Tạo course mới
              console.log('-----------------------')
              syncLogger.info('Tạo khóa học mới')
              const newCourse = await moodleService.createCourse(courseData);
              console.log(`Đã tạo khóa học mới ${courseData.course_fullname}`)

              // Nếu là lớp lý thuyết (SoTietThucHanh < SoTietLyThuyet), tạo các topics và quizzes
              if (course.SoTietThucHanh < course.SoTietLyThuyet) {
                try {
                  // Chuẩn bị dữ liệu sections cho lớp lý thuyết
                  const sectionsData = [
                    { name: 'Tài liệu liên quan đến môn học', summary: 'Tài liệu liên quan đến môn học', visible: 1 },
                    { name: 'Chương 1', summary: 'Nội dung chương 1', visible: 1 },
                    { name: 'Chương 2', summary: 'Nội dung chương 2', visible: 1 },
                    { name: 'Chương 3', summary: 'Nội dung chương 3', visible: 1 },
                    { name: 'Kiểm Tra giữa kì', summary: 'Bài kiểm tra giữa kì', visible: 1 },
                    { name: 'Kiểm tra cuối kì', summary: 'Bài kiểm tra cuối kì', visible: 1 }
                  ];

                  // Tạo/cập nhật sections
                  await moodleService.createSections(newCourse.id, sectionsData);

                  // Tạo quizzes trong sections kiểm tra (section 5 và 6)
                  await moodleService.createQuizActivity(newCourse.id, 5, {
                    name: 'Quiz Kiểm Tra Giữa Kì',
                    intro: 'Bài quiz kiểm tra giữa kì cho môn ' + course.TenMonHoc,
                    grade: 10,
                    attempts: 1
                  });

                  await moodleService.createQuizActivity(newCourse.id, 6, {
                    name: 'Quiz Kiểm Tra Cuối Kì',
                    intro: 'Bài quiz kiểm tra cuối kì cho môn ' + course.TenMonHoc,
                    grade: 10,
                    attempts: 1
                  });

                  syncLogger.info(`Created topics and quizzes for theory course ${newCourse.id}`);
                } catch (topicError) {
                  syncLogger.error(`Failed to create topics/quizzes for course ${newCourse.id}:`, topicError);
                }
              } else {
                // Lớp thực hành/đồ án
                try {
                  const sectionsData = [
                    { name: 'Tài liệu liên quan đến môn học', summary: 'Tài liệu hướng dẫn và tham khảo', visible: 1 },
                    { name: 'Buổi thực hành 1', summary: 'Nội dung buổi thực hành đầu tiên', visible: 1 },
                    { name: 'Buổi thực hành 2', summary: 'Nội dung buổi thực hành thứ hai', visible: 1 },
                    { name: 'Bảo vệ đồ án', summary: 'Bảo vệ và nộp bài đồ án', visible: 1 }
                  ];

                  await moodleService.createSections(newCourse.id, sectionsData);
                  syncLogger.info(`Created practical course sections for ${newCourse.id}`);
                } catch (practicalError) {
                  syncLogger.error(`Failed to create practical sections for course ${newCourse.id}:`, practicalError);
                }
              }

              console.log(`Đã tạo khóa học và nội dung cho ${courseData.course_fullname}`);
            }

            syncCount++;
          }, 3, 2000);
        } catch (error) {
          errorCount++;
          errors.push({
            course_code: course.course_code,
            error: error.message
          });
          syncLogger.error(`Failed to sync course ${course.course_code}:`, error);
        }
      }

      this.lastSyncDate.courses = new Date();

      syncLogger.info('Course sync to Moodle completed', {
        totalCourses: courses.length,
        syncCount,
        errorCount,
        errors: errors.slice(0, 10)
      });

      return {
        success: true,
        total: courses.length,
        synced: syncCount,
        errors: errorCount,
        errorDetails: errors
      };
    } catch (error) {
      syncLogger.error('Course sync to Moodle failed:', error);
      throw error;
    }
  }

  // Đồng bộ đăng ký khóa học
  async syncEnrollmentsToMoodle() {
    try {
      syncLogger.info('Starting enrollment sync to Moodle');

      const courses = await databaseService.getCourses();
      let totalEnrollments = 0;
      let syncCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const course of courses) {
        try {
          // Lấy course trong Moodle
          const moodleCourse = await moodleService.getCourseByShortname(course.course_code);
          if (!moodleCourse) {
            continue;
          }

          // Lấy danh sách đăng ký từ SQL Server
          const enrollments = await databaseService.getCourseEnrollments(course.course_id);
          totalEnrollments += enrollments.length;

          for (const enrollment of enrollments) {
            try {
              // Lấy thông tin student từ SQL Server
              const students = await databaseService.getStudents();
              const student = students.find(s => s.student_id === enrollment.student_id);

              if (student) {
                // Tìm user trong Moodle
                const moodleUser = await moodleService.getUserByUsername(student.student_code);

                if (moodleUser) {
                  // Đăng ký student vào course
                  await moodleService.enrollUserToCourse(moodleUser.id, moodleCourse.id, 5); // 5 = student role
                  syncCount++;

                  syncLogger.debug(`Enrolled student ${student.student_code} to course ${course.course_code}`);
                }
              }
            } catch (enrollError) {
              errorCount++;
              errors.push({
                course_code: course.course_code,
                student_id: enrollment.student_id,
                error: enrollError.message
              });
            }
          }
        } catch (courseError) {
          syncLogger.error(`Failed to sync enrollments for course ${course.course_code}:`, courseError);
        }
      }

      syncLogger.info('Enrollment sync to Moodle completed', {
        totalEnrollments,
        syncCount,
        errorCount,
        errors: errors.slice(0, 10)
      });

      return {
        success: true,
        total: totalEnrollments,
        synced: syncCount,
        errors: errorCount,
        errorDetails: errors
      };
    } catch (error) {
      syncLogger.error('Enrollment sync to Moodle failed:', error);
      throw error;
    }
  }

  // Helper function để đăng ký giảng viên vào course
  async enrollTeacherToCourse(teacherId, moodleCourseId) {
    try {
      // Lấy thông tin teacher từ SQL Server
      const teachers = await databaseService.getTeachers();
      const teacher = teachers.find(t => t.teacher_id === teacherId);

      if (teacher) {
        // Tìm user trong Moodle
        const moodleUser = await moodleService.getUserByUsername(teacher.teacher_code);

        if (moodleUser) {
          // Đăng ký teacher vào course với role teacher (role id = 3)
          await moodleService.enrollUserToCourse(moodleUser.id, moodleCourseId, 3);
          syncLogger.info(`Enrolled teacher ${teacher.teacher_code} to course ID ${moodleCourseId}`);
        }
      }
    } catch (error) {
      syncLogger.error(`Failed to enroll teacher ${teacherId} to course ${moodleCourseId}:`, error);
    }
  }

  // Đồng bộ tất cả dữ liệu
  async syncAllToMoodle() {
    try {
      syncLogger.info('Starting full sync to Moodle');

      const results = {
        students: null,
        teachers: null,
        courses: null,
        enrollments: null,
        startTime: new Date(),
        endTime: null,
        success: true,
        totalErrors: 0
      };

      // Đồng bộ theo thứ tự: teachers -> students -> courses -> enrollments
      try {
        results.teachers = await this.syncTeachersToMoodle();
        results.totalErrors += results.teachers.errors;
      } catch (error) {
        results.success = false;
        results.teachers = { success: false, error: error.message };
      }

      try {
        results.students = await this.syncStudentsToMoodle();
        results.totalErrors += results.students.errors;
      } catch (error) {
        results.success = false;
        results.students = { success: false, error: error.message };
      }

      try {
        results.courses = await this.syncCoursesToMoodle();
        results.totalErrors += results.courses.errors;
      } catch (error) {
        results.success = false;
        results.courses = { success: false, error: error.message };
      }

      try {
        results.enrollments = await this.syncEnrollmentsToMoodle();
        results.totalErrors += results.enrollments.errors;
      } catch (error) {
        results.success = false;
        results.enrollments = { success: false, error: error.message };
      }

      results.endTime = new Date();
      return results;
    } catch (error) {
      syncLogger.error('Full sync to Moodle failed:', error);
      throw error;
    }
  }

  async syncCategoriesToMoodle(departmentData) {
    try {
      syncLogger.info('Starting category sync to Moodle');

      const facultyMap = new Map();

      departmentData.forEach(dept => {
        if (!facultyMap.has(dept.TenPhongBan)) {
          facultyMap.set(dept.TenPhongBan, []);
        }
        facultyMap.get(dept.TenPhongBan).push(dept);
      });

      let syncCount = 0;
      let errorCount = 0;
      const errors = [];

      // Create parent categories (faculties/departments)
      for (const [facultyName, departments] of facultyMap) {
        try {
          await retryOperation(async () => {
            // Check if parent category already exists
            let parentCategory = await moodleService.getCategoryByName(facultyName);

            if (!parentCategory) {
              // Create parent category
              parentCategory = await moodleService.createCategory({
                name: facultyName,
                description: `Khoa ${facultyName}`,
                parent: 0, // Root level
                idnumber: `faculty_${departments[0].IDBoMon}` // Use first department ID as reference
              });
              syncLogger.info(`Created parent category: ${facultyName}`);
            }

            // Create child categories (departments)
            for (const dept of departments) {
              try {
                // Check if child category already exists
                let childCategory = await moodleService.getCategoryByIdNumber(dept.IDBoMon.toString());

                if (!childCategory) {
                  // Create child category
                  childCategory = await moodleService.createCategory({
                    name: dept.TenBoMon,
                    description: `Bộ môn ${dept.TenBoMon}`,
                    parent: parentCategory.id,
                    idnumber: dept.IDBoMon.toString()
                  });
                  syncLogger.info(`Created child category: ${dept.TenBoMon} under ${facultyName}`);
                  syncCount++;
                } else {
                  syncLogger.info(`Child category already exists: ${dept.TenBoMon}`);
                }
              } catch (childError) {
                errorCount++;
                errors.push(`Failed to create child category ${dept.TenBoMon}: ${childError.message}`);
                syncLogger.error(`Failed to create child category ${dept.TenBoMon}:`, childError);
              }
            }
          }, 3, 2000);
        } catch (error) {
          errorCount++;
          errors.push(`Failed to process faculty ${facultyName}: ${error.message}`);
          syncLogger.error(`Failed to process faculty ${facultyName}:`, error);
        }
      }

      syncLogger.info('Category sync to Moodle completed', {
        totalFaculties: facultyMap.size,
        totalDepartments: departmentData.length,
        syncCount,
        errorCount,
        errors: errors.slice(0, 10)
      });

      return {
        success: true,
        totalFaculties: facultyMap.size,
        totalDepartments: departmentData.length,
        synced: syncCount,
        errors: errorCount,
        errorDetails: errors
      };
    } catch (error) {
      syncLogger.error('Category sync to Moodle failed:', error);
      throw error;
    }
  }
}

export default new SyncToMoodleService();