import databaseService from './databaseService.js';
import databaseGvService from './databaseGvService.js';
import moodleService from './moodleService.js';
import { logger, syncLogger } from '../utils/logger.js';
import { retryOperation } from '../utils/errorHandler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SyncToMoodleService {
  constructor() {
    this.lastSyncDate = {};
    this.lastSyncFile = path.join(__dirname, '../../lastSync.json');
    this.loadLastSync();
  }

  // Load last sync dates from file
  loadLastSync() {
    try {
      if (fs.existsSync(this.lastSyncFile)) {
        const data = fs.readFileSync(this.lastSyncFile, 'utf8');
        const parsed = JSON.parse(data);
        // Convert string dates back to Date objects
        Object.keys(parsed).forEach(key => {
          if (parsed[key]) {
            this.lastSyncDate[key] = new Date(parsed[key]);
          }
        });
        syncLogger.info('Loaded last sync dates from file', this.lastSyncDate);
      } else {
        syncLogger.info('No last sync file found, starting fresh');
      }
    } catch (error) {
      syncLogger.error('Failed to load last sync dates:', error);
    }
  }

  // Save last sync dates to file
  saveLastSync() {
    try {
      // Convert Date objects to ISO strings for JSON
      const dataToSave = {};
      Object.keys(this.lastSyncDate).forEach(key => {
        if (this.lastSyncDate[key]) {
          dataToSave[key] = this.lastSyncDate[key].toISOString();
        }
      });
      fs.writeFileSync(this.lastSyncFile, JSON.stringify(dataToSave, null, 2));
      syncLogger.info('Saved last sync dates to file');
    } catch (error) {
      syncLogger.error('Failed to save last sync dates:', error);
    }
  }
  //Done
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
              email: student.Email ,
              city: student.NguyenQuan || "HN",
              idnumber: student.MaSinhVien,
              password: student.MaSinhVien,
            };
            if (existingUser) {
              console.log(`user đã tồn tại ${userData.first_name} ${userData.last_name}`)
              await moodleService.updateUser(existingUser.id, userData);
            } else {
              await moodleService.createUser(userData);
              console.log(`Tạo user Mới ${userData.first_name} ${userData.last_name}`)
            }

            syncCount++;
          }, 3, 2000);
        } catch (error) {
          syncLogger.error(`Failed to sync student ${student.MaSinhVien}:`, error);
        }
      }
      this.lastSyncDate.students = new Date();
      this.saveLastSync();

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
  //Done
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
              email: teacher.Email && teacher.Email.trim() !== "" ? teacher.Email.trim() : `${teacher.MaNhanSu}@huce.edu.vn`,
              city: teacher.NguyenQuan && teacher.NguyenQuan.trim() !== "" ? teacher.NguyenQuan.trim() : "Hanoi",
              idnumber: teacher.MaNhanSu,
              password: teacher.MaNhanSu,
            };

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
            // if (teacher.GiaoVien) {
            //   if (existingUser) {
            //     console.log('-----------------------')
            //     syncLogger.info('teacher đã tồn tại')
            //     await moodleService.updateUser(existingUser.id, userData);
            //     console.log(`Đã update ${teacher.HoDem} ${teacher.Ten}`)
            //   } else {
            //     console.log('-----------------------')
            //     syncLogger.info("Tạo teacher Mới")
            //     const newUser = await moodleService.createUser(userData);
            //     console.log(`Đã thêm ${teacher.HoDem} ${teacher.Ten}`)
            //   }
            // }
            // else {
            //   console.log('-----------------------')
            //   console.log(`${teacher.HoDem} ${teacher.Ten}`)
            //   syncLogger.info("Ko Phải là giảng viên")
            // }
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
      this.saveLastSync();

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
  //Done
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
            // console.log(course)
            // Kiểm tra course đã tồn tại chưa
            const existingCourse = await moodleService.getCourseByShortname(course.IDLopHocPhan);
            // Tìm Id Categori theo CategoriNumber
            const category = await moodleService.getCategoryByIdNumber(course.IDToBoMon.toString());
            if (!category) {
              throw new Error(`Category not found for department ID ${course.IDToBoMon}`);
            }
            const courseData = {
              course_fullname: `${course.TenLopHoc} - ${course.TenMonHoc} - ${course.TenDot}`,
              course_shortname: course.IDLopHocPhan,
              course_categoryid: category.id,
              course_idnumber: course.IDLopHocPhan
            };

            if (existingCourse) {
              console.log('-----------------------')
              syncLogger.info('Khóa học đã tồn tại')
              console.log(courseData.course_fullname)
              // Cập nhật course hiện có
              await moodleService.updateCourse(existingCourse.id, courseData);
              // Update Sinh Viên, Các thứ,.....
            } else {
              // Tạo course mới
              console.log('-----------------------')
              syncLogger.info('Tạo khóa học mới')
              const newCourse = await moodleService.createCourse(courseData);
              console.log(`Đã tạo khóa học mới ${courseData.course_fullname}`)

              // Tạo sections dựa trên loại khóa học
              // try {
              //   let sections = [];

              //   if (course.SoTietThucHanh < course.SoTietLyThuyet) {
              //     // Lớp lý thuyết - tạo sections cho lý thuyết
              //     sections = [
              //       { name: 'Tài liệu liên quan đến môn học', summary: 'Tài liệu liên quan đến môn học', section: 1 },
              //       { name: 'Chương 1', summary: 'Nội dung chương 1', section: 2 },
              //       { name: 'Chương 2', summary: 'Nội dung chương 2', section: 3 },
              //       { name: 'Chương 3', summary: 'Nội dung chương 3', section: 4 },
              //       { name: 'Kiểm Tra giữa kì', summary: 'Bài kiểm tra giữa kì', section: 5 },
              //       { name: 'Kiểm tra cuối kì', summary: 'Bài kiểm tra cuối kì', section: 6 }
              //     ];
              //   } else {
              //     // Lớp thực hành - tạo sections cho thực hành
              //     sections = [
              //       { name: 'Tài liệu liên quan đến môn học', summary: 'Tài liệu liên quan đến môn học', section: 1 },
              //       { name: 'Buổi Thông 1', summary: 'Buổi Thông 1', section: 2 },
              //       { name: 'Buổi Thông 2', summary: 'Buổi Thông 2', section: 3 },
              //       { name: 'Bảo vệ', summary: 'Bảo vệ', section: 4 },
              //     ];
              //   }

              //   const createdSections = [];
              //   for (const sectionData of sections) {
              //     const section = await moodleService.createSection(newCourse.id, sectionData);
              //     createdSections.push(section);
              //   }

              //   console.log(`Đã tạo nội dung cho khóa học ${courseData.course_fullname}`)
              // } catch (contentError) {
              //   syncLogger.error(`Failed to create content for course ${newCourse.id}:`, contentError);
              //   console.log(`Lỗi tạo nội dung cho khóa học ${courseData.course_fullname}`)
              // }
            }

            syncCount++;
          }, 3, 2000);
        } catch (error) {
          errorCount++;
          errors.push({
            course_code: course.MaLopHocPhan,
            error: error.message
          });
          syncLogger.error(`Failed to sync course ${course.MaLopHocPhan}:`, error);
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
  async syncEnrollmentsStudentToMoodle() {
    try {
      syncLogger.info('Starting enrollment sync to Moodle');

      const lastSync = this.lastSyncDate.studentEnrollments;
      const courses = await databaseService.getCourses();
      let totalEnrollments = 0;
      let syncCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const course of courses) {
        try {
          // Lấy course trong Moodle
          const moodleCourse = await moodleService.getCourseByShortname(course.IDLopHocPhan);
          if (!moodleCourse) {
            continue;
          }
          // Lấy danh sách đăng ký từ SQL Server
          const enrollments = await databaseService.getStudentCourseEnrollments(course.IDLopHocPhan, lastSync);
          totalEnrollments += enrollments.length;

          for (const enrollment of enrollments) {
            try {
              const moodleUser = await moodleService.getUserByIdNumber(enrollment.MaSinhVien);
              if (moodleUser) {
                // Đăng ký student vào course
                await moodleService.enrollUserToCourse(moodleUser.id, moodleCourse.id, 5, moodleUser, moodleCourse); // 5 = student role

                syncCount++;
                syncLogger.debug(`Enrolled student ${enrollment.HoTenSinhVien} to course ${course.TenMonHoc}`);
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
          console.log(`Done_______________________${course.TenMonHoc}`)
        } catch (courseError) {
          syncLogger.error(`Failed to sync enrollments for course ${course.course_code}:`, courseError);
        }
      }

      this.lastSyncDate.studentEnrollments = new Date();
      this.saveLastSync();

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

  // Đồng bộ đăng ký giảng viên vào khóa học từ SQL Server sang Moodle
  async syncTeacherEnrollmentsToMoodle() {
    try {
      syncLogger.info('Starting teacher enrollment sync to Moodle');
      const lastSync = this.lastSyncDate.teacherEnrollments;
      const courses = await databaseService.getCourses();
      let totalEnrollments = 0;
      let syncCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const course of courses) {
        try {
          // Lấy course trong Moodle
          const moodleCourse = await moodleService.getCourseByShortname(course.IDLopHocPhan);
          if (!moodleCourse) {
            continue;
          }
          // Lấy danh sách đăng ký giảng viên từ HRM_NUCE database
          const enrollments = await databaseService.getTeacherCourseEnrollments(course.IDLopHocPhan, lastSync);
          totalEnrollments += enrollments.length;
          for (const enrollment of enrollments) {
            try {
              const moodleUser = await moodleService.getUserByIdNumber(enrollment.MaGiangVien);
              if (moodleUser) {
                // Đăng ký teacher vào course
                await moodleService.enrollTeacherToCourse(moodleUser.id, moodleCourse.id, 3, moodleUser, moodleCourse); // 3 = teacher role

                syncCount++;
                syncLogger.debug(`Enrolled teacher ${enrollment.HoTenGiangVien} to course ${course.TenMonHoc}`);
              }
            } catch (enrollError) {
              errorCount++;
              errors.push({
                course_code: course.course_code,
                teacher_id: enrollment.teacher_id,
                error: enrollError.message
              });
            }
          }
        } catch (courseError) {
          syncLogger.error(`Failed to sync teacher enrollments for course ${course.course_code}:`, courseError);
        }
      }

      this.lastSyncDate.teacherEnrollments = new Date();
      this.saveLastSync();

      syncLogger.info(`Teacher enrollment sync completed: ${syncCount}/${totalEnrollments} synced, ${errorCount} errors`);

      return {
        success: true,
        total: totalEnrollments,
        synced: syncCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 10)
      };
    } catch (error) {
      syncLogger.error('Teacher enrollment sync to Moodle failed:', error);
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
        teacherEnrollments: null,
        startTime: new Date(),
        endTime: null,
        success: true,
        totalErrors: 0
      };

      // Đồng bộ theo thứ tự: students -> teachers -> courses -> student enrollments -> teacher enrollments
      try {
        results.students = await this.syncStudentsToMoodle();
        results.totalErrors += results.students.errors;
      } catch (error) {
        results.success = false;
        results.students = { success: false, error: error.message };
      }

      try {
        results.teachers = await this.syncTeachersToMoodle();
        results.totalErrors += results.teachers.errors;
      } catch (error) {
        results.success = false;
        results.teachers = { success: false, error: error.message };
      }

      try {
        results.courses = await this.syncCoursesToMoodle();
        results.totalErrors += results.courses.errors;
      } catch (error) {
        results.success = false;
        results.courses = { success: false, error: error.message };
      }

      try {
        results.enrollments = await this.syncEnrollmentsStudentToMoodle();
        results.totalErrors += results.enrollments.errors;
      } catch (error) {
        results.success = false;
        results.enrollments = { success: false, error: error.message };
      }

      try {
        results.teacherEnrollments = await this.syncTeacherEnrollmentsToMoodle();
        results.totalErrors += results.teacherEnrollments.errors;
      } catch (error) {
        results.success = false;
        results.teacherEnrollments = { success: false, error: error.message };
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