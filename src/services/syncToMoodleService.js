import databaseService from './databaseService.js';
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

  //Done Đồng bộ sinh viên
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
              city: student.NguyenQuan || "HN",
              idnumber: student.MaSinhVien,
              password: `${student.MaSinhVien}@Huce`,
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
   // Đồng bộ Giảng Viên 
  async syncTeachersToMoodle() {
    try {
      syncLogger.info('Starting teacher sync to Moodle');

      const lastSync = this.lastSyncDate.teachers;
      const teachers = await databaseService.getTeachers(lastSync);

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

  /**
   * Đảm bảo course có đủ sections, nếu thiếu thì tạo thêm
   * @param {number} courseId - Moodle Course ID
   * @param {object} courseInfo - Thông tin khóa học từ database
   */
  // DONE
  async ensureCourseSections(courseId, courseInfo) {
    try {
      syncLogger.info(`Checking sections for course ${courseId}`);

      // Lấy danh sách sections hiện có
      const existingSections = await moodleService.getCourseContents(courseId);

      // Xác định sections cần có dựa trên loại khóa học
      let requiredSections = [];
      if (courseInfo.SoTietThucHanh < courseInfo.SoTietLyThuyet) {
        // Lớp lý thuyết
        requiredSections = [
          { name: 'Tài liệu liên quan đến môn học', summary: 'Tài liệu liên quan đến môn học', visible: 1 },
          { name: 'Chương 1', summary: 'Nội dung chương 1', visible: 1 },
          { name: 'Chương 2', summary: 'Nội dung chương 2', visible: 1 },
          { name: 'Chương 3', summary: 'Nội dung chương 3', visible: 1 },
          { name: 'Kiểm tra giữa kì', summary: 'Bài kiểm tra giữa kì', visible: 1 },
          { name: 'Kiểm tra cuối kì', summary: 'Bài kiểm tra cuối kì', visible: 1 }
        ];
      } else {
        // Lớp thực hành
        requiredSections = [
          { name: 'Tài liệu liên quan đến môn học', summary: 'Tài liệu liên quan đến môn học', visible: 1 },
          { name: 'Buổi Thông 1', summary: 'Buổi Thông 1', visible: 1 },
          { name: 'Buổi Thông 2', summary: 'Buổi Thông 2', visible: 1 },
          { name: 'Bảo vệ', summary: 'Bảo vệ', visible: 1 }
        ];
      }

      // Kiểm tra từng section
      const createdSections = [];
      for (let i = 0; i < requiredSections.length; i++) {
        const requiredSection = requiredSections[i];
        // Section index bắt đầu từ 1 (0 là General section)
        const sectionIndex = i + 1;

        // Tìm section tương ứng trong existingSections
        let existingSection = existingSections.find(s => s.section === sectionIndex);

        if (!existingSection) {
          // Section chưa tồn tại, tạo mới
          syncLogger.info(`Creating missing section "${requiredSection.name}" for course ${courseId}`);
          try {
            const newSection = await moodleService.createSectionWithPlugin(courseId, {
              name: requiredSection.name,
              summary: requiredSection.summary,
              visible: requiredSection.visible,
              position: 0
            });
            createdSections.push(newSection);
            syncLogger.info(`✓ Created section "${requiredSection.name}" (section ${sectionIndex})`);
          } catch (createError) {
            syncLogger.error(`Failed to create section "${requiredSection.name}":`, createError);
          }
        } else {
          // Section đã tồn tại, có thể cập nhật tên nếu cần
          if (existingSection.name !== requiredSection.name) {
            syncLogger.info(`Section ${sectionIndex} exists but with different name: "${existingSection.name}" -> "${requiredSection.name}"`);
            // Có thể update tên section ở đây nếu cần
          }
          createdSections.push(existingSection);
        }
      }

      // Nếu là lớp lý thuyết, kiểm tra và tạo quiz và assignment
      if (courseInfo.SoTietThucHanh < courseInfo.SoTietLyThuyet && createdSections.length >= 6) {
        await this.ensureCourseQuizzes(courseId, createdSections);
      }

      // Tạo assignment cuối kỳ cho tất cả các khóa học (cả lý thuyết và thực hành)
      await this.ensureCourseAssignments(courseId, courseInfo, createdSections);

      syncLogger.info(`✓ Course ${courseId} sections verified/created`);
      return createdSections;

    } catch (error) {
      syncLogger.error(`Failed to ensure sections for course ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Đảm bảo course có quiz giữa kỳ và cuối kỳ
   * @param {number} courseId - Moodle Course ID
   * @param {array} sections - Danh sách sections của course
   */
  async ensureCourseQuizzes(courseId, sections) {
    try {
      // Kiểm tra section 5 (Kiểm tra giữa kì) có quiz chưa
      const midtermSection = sections[4]; // Index 4 = Section 5
      if (midtermSection) {
        // Check nếu có modules array và có quiz
        const hasMidtermQuiz = midtermSection.modules && midtermSection.modules.length > 0
          ? midtermSection.modules.some(m => m.modname === 'quiz' && m.name.toLowerCase().includes('giữa'))
          : false;

        if (!hasMidtermQuiz) {
          syncLogger.info(`Creating midterm quiz for course ${courseId} in section ${midtermSection.section}`);
          try {
            const midtermQuiz = await moodleService.createQuizWithPlugin(courseId, {
              name: 'Bài kiểm tra giữa kỳ',
              intro: '<p>Bài kiểm tra giữa kỳ</p>',
              section: midtermSection.section,
              timeopen: Math.floor(Date.now() / 1000),
              timeclose: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
              timelimit: 1800,
              attempts: 2,
              grademethod: 1,
              grade: 10,
              visible: 1
            });
            syncLogger.info(`✓ Created midterm quiz for course ${courseId}: ${midtermQuiz.quizId || 'unknown'}`);
          } catch (quizError) {
            syncLogger.error(`Failed to create midterm quiz for course ${courseId}:`, quizError);
          }
        } else {
          syncLogger.info(`Midterm quiz already exists for course ${courseId}`);
        }
      } else {
        syncLogger.warn(`Midterm section (index 4) not found for course ${courseId}`);
      }

      // Kiểm tra section 6 (Kiểm tra cuối kì) có assignment chưa
      const finalSection = sections[5]; // Index 5 = Section 6
      if (finalSection) {
        // Check nếu có modules array và có assignment
        const hasFinalAssignment = finalSection.modules && finalSection.modules.length > 0
          ? finalSection.modules.some(m => m.modname === 'assign' && m.name.toLowerCase().includes('cuối'))
          : false;

        if (!hasFinalAssignment) {
          syncLogger.info(`Creating final assignment for course ${courseId} in section ${finalSection.section}`);
          try {
            const finalAssignment = await moodleService.createAssignmentWithPlugin(courseId, {
              name: 'Bài tập cuối kỳ',
              intro: '<p>Bài tập cuối kỳ - Nộp báo cáo và code</p>',
              section: finalSection.section,
              duedate: Math.floor(Date.now() / 1000) + 14 * 24 * 3600, // 2 tuần
              cutoffdate: Math.floor(Date.now() / 1000) + 15 * 24 * 3600, // 15 ngày
              grade: 10,
              assignsubmission_onlinetext_enabled: 1,
              assignsubmission_file_enabled: 1,
              assignsubmission_file_maxfiles: 5,
              assignsubmission_file_maxsizebytes: 10485760, // 10MB
              assignfeedback_comments_enabled: 1
            });
            syncLogger.info(`✓ Created final assignment for course ${courseId}: ${finalAssignment.assignmentid || 'unknown'}`);
          } catch (assignmentError) {
            syncLogger.error(`Failed to create final assignment for course ${courseId}:`, assignmentError);
          }
        } else {
          syncLogger.info(`Final assignment already exists for course ${courseId}`);
        }
      } else {
        syncLogger.warn(`Final section (index 5) not found for course ${courseId}`);
      }

    } catch (error) {
      syncLogger.error(`Failed to ensure quizzes for course ${courseId}:`, error);
    }
  }

  /**
   * Đảm bảo course có assignment cuối kỳ
   * @param {number} courseId - Moodle Course ID
   * @param {object} courseInfo - Thông tin khóa học từ database
   * @param {array} sections - Danh sách sections của course
   */
  async ensureCourseAssignments(courseId, courseInfo, sections) {
    try {
      // Xác định section để đặt assignment cuối kỳ
      let assignmentSection;
      let assignmentIntro;

      if (courseInfo.SoTietThucHanh < courseInfo.SoTietLyThuyet) {
        // Lớp lý thuyết: đặt assignment trong section "Kiểm tra cuối kì" (index 5)
        assignmentSection = sections[5];
        assignmentIntro = '<p>Bài tập cuối kỳ - Nộp báo cáo và code</p>';
      } else {
        // Lớp thực hành: đặt assignment trong section "Bảo vệ" (index 3)
        assignmentSection = sections[3];
        assignmentIntro = '<p>Bài tập cuối kỳ - Nộp báo cáo thực hành và code</p>';
      }

      if (!assignmentSection) {
        syncLogger.warn(`Assignment section not found for course ${courseId}`);
        return;
      }

      // Kiểm tra xem đã có assignment cuối kỳ chưa
      const hasFinalAssignment = assignmentSection.modules && assignmentSection.modules.length > 0
        ? assignmentSection.modules.some(m => m.modname === 'assign' && m.name.toLowerCase().includes('cuối'))
        : false;

      if (!hasFinalAssignment) {
        syncLogger.info(`Creating final assignment for course ${courseId} in section ${assignmentSection.section}`);
        try {
          const finalAssignment = await moodleService.createAssignmentWithPlugin(courseId, {
            name: 'Bài tập cuối kỳ',
            intro: assignmentIntro,
            section: assignmentSection.section,
            duedate: Math.floor(Date.now() / 1000) + 14 * 24 * 3600, // 2 tuần
            cutoffdate: Math.floor(Date.now() / 1000) + 15 * 24 * 3600, // 15 ngày
            grade: 10,
            assignsubmission_onlinetext_enabled: 1,
            assignsubmission_file_enabled: 1,
            assignsubmission_file_maxfiles: 5,
            assignsubmission_file_maxsizebytes: 10485760, // 10MB
            assignfeedback_comments_enabled: 1
          });
          syncLogger.info(`✓ Created final assignment for course ${courseId}: ${finalAssignment.assignmentid || 'unknown'}`);
        } catch (assignmentError) {
          syncLogger.error(`Failed to create final assignment for course ${courseId}:`, assignmentError);
        }
      } else {
        syncLogger.info(`Final assignment already exists for course ${courseId}`);
      }

    } catch (error) {
      syncLogger.error(`Failed to ensure assignments for course ${courseId}:`, error);
    }
  }
 

  // Đồng bộ khóa học từ SQL Server sang Moodle
  // Done
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
            const existingCourse = await moodleService.getCourseByShortname(course.IDLopHocPhan);
            let courseData = {}
            if (course.IDToBoMon) {
              const category = await moodleService.getCategoryByIdNumber(course.IDToBoMon.toString());
              if (!category) {
                console.log(`Category not found for department ID ${course.IDToBoMon}`);
                courseData = {
                  course_fullname: `${course.TenLopHoc} - ${course.TenMonHoc} - ${course.TenDot}`,
                  course_shortname: course.IDLopHocPhan,
                  course_categoryid: 134,
                  course_idnumber: course.IDLopHocPhan
                };
              }
              else {
                courseData = {
                  course_fullname: `${course.TenLopHoc} - ${course.TenMonHoc} - ${course.TenDot}`,
                  course_shortname: course.IDLopHocPhan,
                  course_categoryid: category.id,
                  course_idnumber: course.IDLopHocPhan
                };
              }
            }
            else {
              courseData = {
                course_fullname: `${course.TenLopHoc} - ${course.TenMonHoc} - ${course.TenDot}`,
                course_shortname: course.IDLopHocPhan,
                course_categoryid: 92,
                course_idnumber: course.IDLopHocPhan
              };
            }

            if (existingCourse) {
              console.log('-----------------------')
              syncLogger.info('Khóa học đã tồn tại')
              console.log(courseData.course_fullname)
              // Cập nhật course hiện có
              await moodleService.updateCourse(existingCourse.id, courseData);

              // Kiểm tra và tạo sections nếu thiếu
              try {
                await this.ensureCourseSections(existingCourse.id, course);
              } catch (sectionError) {
                syncLogger.error(`Failed to ensure sections for existing course ${existingCourse.id}:`, sectionError);
              }
            } else {
              // Tạo course mới
              console.log('-----------------------')
              syncLogger.info('Tạo khóa học mới')
              const newCourse = await moodleService.createCourse(courseData);
              console.log(`Đã tạo khóa học mới ${courseData.course_fullname}`)

              // Tạo sections dựa trên loại khóa học
              try {
                let sections = [];
                let Quiz
                if (course.SoTietThucHanh < course.SoTietLyThuyet) {
                  // Lớp lý thuyết - tạo sections cho lý thuyết
                  sections = [
                    { name: 'Tài liệu liên quan đến môn học', summary: 'Tài liệu liên quan đến môn học', visible: 1, position: 0 },
                    { name: 'Chương 1', summary: 'Nội dung chương 1', visible: 1, position: 0 },
                    { name: 'Chương 2', summary: 'Nội dung chương 2', visible: 1, position: 0 },
                    { name: 'Chương 3', summary: 'Nội dung chương 3', visible: 1, position: 0 },
                    { name: 'Kiểm tra giữa kì', summary: 'Bài kiểm tra giữa kì', visible: 1, position: 0 },
                    { name: 'Kiểm tra cuối kì', summary: 'Bài kiểm tra cuối kì', visible: 1, position: 0 }
                  ];
                } else {
                  // Lớp thực hành - tạo sections cho thực hành
                  sections = [
                    { name: 'Tài liệu liên quan đến môn học', summary: 'Tài liệu liên quan đến môn học', visible: 1, position: 0 },
                    { name: 'Buổi Thông 1', summary: 'Buổi Thông 1', visible: 1, position: 0 },
                    { name: 'Buổi Thông 2', summary: 'Buổi Thông 2', visible: 1, position: 0 },
                    { name: 'Bảo vệ', summary: 'Bảo vệ', visible: 1, position: 0 },
                  ];
                }

                const createdSections = [];
                for (const sectionData of sections) {
                  const section = await moodleService.createSectionWithPlugin(newCourse.id, sectionData);
                  createdSections.push(section);
                }

                // Tạo quiz cho lớp lý thuyết và assignment cho cả hai loại lớp
                if (course.SoTietThucHanh < course.SoTietLyThuyet) {
                  // Lớp lý thuyết: tạo quiz giữa kỳ và assignment cuối kỳ
                  if (createdSections.length < 6) {
                    syncLogger.warn(`Not enough sections created for theory course ${newCourse.id}. Expected 6, got ${createdSections.length}`);
                  } else {
                    // Tạo quiz giữa kỳ
                    try {
                      const midtermQuiz = await moodleService.createQuizWithPlugin(newCourse.id, {
                        name: 'Bài kiểm tra giữa kỳ',
                        intro: '<p>Bài kiểm tra giữa kỳ</p>',
                        section: createdSections[4].section,
                        timeopen: Math.floor(Date.now() / 1000),
                        timeclose: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
                        timelimit: 1800,
                        attempts: 2,
                        grademethod: 1,
                        grade: 10,
                        visible: 1
                      });
                      syncLogger.info(`Created midterm quiz for course ${newCourse.id}: ${midtermQuiz.quizId || 'unknown'}`);
                    } catch (quizError) {
                      syncLogger.error(`Failed to create midterm quiz for course ${newCourse.id}:`, quizError);
                    }

                    // Tạo assignment cuối kỳ
                    try {
                      const finalAssignment = await moodleService.createAssignmentWithPlugin(newCourse.id, {
                        name: 'Bài tập cuối kỳ',
                        intro: '<p>Bài tập cuối kỳ - Nộp báo cáo và code</p>',
                        section: createdSections[5].section,
                        duedate: Math.floor(Date.now() / 1000) + 14 * 24 * 3600, // 2 tuần
                        cutoffdate: Math.floor(Date.now() / 1000) + 15 * 24 * 3600, // 15 ngày
                        grade: 10,
                        assignsubmission_onlinetext_enabled: 1,
                        assignsubmission_file_enabled: 1,
                        assignsubmission_file_maxfiles: 5,
                        assignsubmission_file_maxsizebytes: 10485760, // 10MB
                        assignfeedback_comments_enabled: 1
                      });
                      syncLogger.info(`Created final assignment for theory course ${newCourse.id}: ${finalAssignment.assignmentid || 'unknown'}`);
                    } catch (assignmentError) {
                      syncLogger.error(`Failed to create final assignment for theory course ${newCourse.id}:`, assignmentError);
                    }
                  }
                } else {
                  // Lớp thực hành: tạo assignment cuối kỳ
                  if (createdSections.length < 4) {
                    syncLogger.warn(`Not enough sections created for practical course ${newCourse.id}. Expected 4, got ${createdSections.length}`);
                  } else {
                    // Tạo assignment cuối kỳ cho lớp thực hành
                    try {
                      const finalAssignment = await moodleService.createAssignmentWithPlugin(newCourse.id, {
                        name: 'Bài tập cuối kỳ',
                        intro: '<p>Bài tập cuối kỳ - Nộp báo cáo thực hành và code</p>',
                        section: createdSections[3].section, // Section "Bảo vệ" (index 3)
                        duedate: Math.floor(Date.now() / 1000) + 14 * 24 * 3600, // 2 tuần
                        cutoffdate: Math.floor(Date.now() / 1000) + 15 * 24 * 3600, // 15 ngày
                        grade: 10,
                        assignsubmission_onlinetext_enabled: 1,
                        assignsubmission_file_enabled: 1,
                        assignsubmission_file_maxfiles: 5,
                        assignsubmission_file_maxsizebytes: 10485760, // 10MB
                        assignfeedback_comments_enabled: 1
                      });
                      syncLogger.info(`Created final assignment for practical course ${newCourse.id}: ${finalAssignment.assignmentid || 'unknown'}`);
                    } catch (assignmentError) {
                      syncLogger.error(`Failed to create final assignment for practical course ${newCourse.id}:`, assignmentError);
                    }
                  }
                }


                console.log(`Đã tạo nội dung cho khóa học ${courseData.course_fullname}`)
              } catch (contentError) {
                syncLogger.error(`Failed to create content for course ${newCourse.id}:`, contentError);
                console.log(`Lỗi tạo nội dung cho khóa học ${courseData.course_fullname}`)
              }
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
  // DONE
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
  // Role: IsTroGiang = 1 -> Trợ giảng (roleId = 4), ngược lại -> Giảng viên chính (roleId = 3)
  // DONE
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
                // Xác định role dựa trên trường IsTroGiang
                // IsTroGiang = 1: Trợ giảng (roleId = 4)
                // IsTroGiang = 0 hoặc null: Giảng viên chính (roleId = 3)
                const roleId = enrollment.IsTroGiang === 1 ? 4 : 3;
                const roleName = enrollment.IsTroGiang === 1 ? 'Trợ giảng' : 'Giảng viên chính';

                // Đăng ký teacher vào course với role tương ứng
                await moodleService.enrollTeacherToCourse(moodleUser.id, moodleCourse.id, roleId, moodleUser, moodleCourse);

                syncCount++;
                syncLogger.debug(`Enrolled ${roleName} ${enrollment.HoTenGiangVien} to course ${course.TenMonHoc} (role: ${roleId})`);
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

      syncLogger.info(`Teacher enrollment sync completed: ${syncCount}/${totalEnrollments} synced, ${errorCount} errors (Role: IsTroGiang=1→Trợ giảng, else→Giảng viên chính)`);

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

  // Đồng bộ tất cả dữ liệu hàng ngày (không bao gồm grades)
  // Đồng bộ theo thứ tự:
  // students -> teachers -> courses -> student enrollments -> teacher enrollments
  // Chạy mỗi ngày một lần
  async syncAllToMoodleDaily() {
    try {
      // Kiểm tra xem đã chạy hôm nay chưa
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset về đầu ngày

      const lastRun = this.lastSyncDate.dailySync;
      if (lastRun) {
        const lastRunDate = new Date(lastRun);
        lastRunDate.setHours(0, 0, 0, 0);

        if (lastRunDate.getTime() === today.getTime()) {
          syncLogger.info('Daily sync already ran today, skipping...');
          return {
            success: true,
            message: 'Daily sync already completed today',
            skipped: true
          };
        }
      }

      syncLogger.info('Starting daily sync to Moodle (students -> teachers -> courses -> enrollments)');

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

      // Cập nhật thời gian chạy daily sync
      this.lastSyncDate.dailySync = new Date();
      this.saveLastSync();

      const summary = {
        ...results,
        message: `Daily sync completed. Total errors: ${results.totalErrors}`,
        duration: `${results.endTime - results.startTime}ms`
      };

      syncLogger.info('Daily sync to Moodle completed', summary);
      return summary;

    } catch (error) {
      syncLogger.error('Daily sync to Moodle failed:', error);
      throw error;
    }
  }

  // Đồng bộ tất cả dữ liệu
    // Đồng bộ theo thứ tự:
    // students ->
    // teachers ->
    //  courses ->
    // student enrollments ->
    // teacher enrollments ->
    // grades
  // DONE
  async syncAllToMoodle() {
    try {
      syncLogger.info('Starting full sync to Moodle (students -> teachers -> courses -> enrollments -> grades)');

      const results = {
        students: null,
        teachers: null,
        courses: null,
        enrollments: null,
        teacherEnrollments: null,
        grades: null,
        startTime: new Date(),
        endTime: null,
        success: true,
        totalErrors: 0
      };

      // Đồng bộ theo thứ tự: students -> teachers -> courses -> student enrollments -> teacher enrollments -> grades -> grades
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

      try {
        results.grades = await this.syncAssignmentGrades();
        results.totalErrors += results.grades.errors;
      } catch (error) {
        results.success = false;
        results.grades = { success: false, error: error.message };
      }

      results.endTime = new Date();
      return results;
    } catch (error) {
      syncLogger.error('Full sync to Moodle failed:', error);
      throw error;
    }
  }

  // Schedule daily sync để chạy mỗi ngày một lần
  startDailySyncScheduler() {
    syncLogger.info('Starting daily sync scheduler...');

    // Chạy ngay lập tức khi khởi động
    setTimeout(async () => {
      try {
        syncLogger.info('Running initial daily sync on startup...');
        await this.syncAllToMoodleDaily();
      } catch (error) {
        syncLogger.error('Initial daily sync failed:', error);
      }
    }, 5000); // Chờ 5 giây sau khi khởi động

    // Schedule chạy mỗi ngày lúc 2:00 AM
    const scheduleDailySync = () => {
      const now = new Date();
      const nextRun = new Date(now);
      nextRun.setHours(2, 0, 0, 0); // 2:00 AM

      // Nếu đã qua 2:00 AM hôm nay, set cho ngày mai
      if (now >= nextRun) {
        nextRun.setDate(nextRun.getDate() + 1);
      }

      const timeUntilNextRun = nextRun.getTime() - now.getTime();

      syncLogger.info(`Next daily sync scheduled for: ${nextRun.toISOString()} (${Math.round(timeUntilNextRun / 1000 / 60)} minutes from now)`);

      setTimeout(async () => {
        try {
          syncLogger.info('Running scheduled daily sync...');
          await this.syncAllToMoodleDaily();

          // Schedule lại cho ngày mai
          scheduleDailySync();
        } catch (error) {
          syncLogger.error('Scheduled daily sync failed:', error);

          // Vẫn schedule lại cho ngày mai dù có lỗi
          setTimeout(scheduleDailySync, 1000 * 60 * 60); // Thử lại sau 1 giờ
        }
      }, timeUntilNextRun);
    };

    // Bắt đầu schedule
    scheduleDailySync();
  }

  // Đồng bộ Categori bộ môn, khoa
  // Done
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

  /**
   * Tạo bài kiểm tra cuối kỳ cho tất cả khóa học trong Moodle
   * Sử dụng custom plugin local_quizapi để tạo quiz qua Web Service API
   * 
   * @returns {Object} Kết quả tạo quiz với thống kê
   */
  async createFinalQuizForAllCourses() {
    try {
      syncLogger.info('Starting to create final quizzes for all Moodle courses');

      // Lấy danh sách khóa học từ Moodle
      const courses = await moodleService.getCourses();

      if (!courses || courses.length === 0) {
        syncLogger.info('No courses found in Moodle');
        return {
          success: true,
          message: 'No courses found in Moodle',
          totalCourses: 0,
          quizzesCreated: 0,
          skipped: 0,
          errors: []
        };
      }

      let quizzesCreated = 0;
      let skipped = 0;
      const errors = [];
      const createdQuizzes = [];

      for (const course of courses) {
        // Bỏ qua "Site home" course (ID = 1)
        if (course.id === 1) {
          syncLogger.info('Skipping Site home course');
          skipped++;
          continue;
        }

        try {
          await retryOperation(async () => {
            // Lấy nội dung khóa học (các sections)
            const contents = await moodleService.getCourseContents(course.id);

            if (!contents || contents.length === 0) {
              syncLogger.warn(`No sections found in course: ${course.fullname} (ID: ${course.id})`);
              skipped++;
              return;
            }

            // Tìm section cuối cùng (section có số lớn nhất)
            const lastSection = contents.reduce((max, section) => {
              // Bỏ qua section 0 (General)
              if (section.section === 0) return max;
              return section.section > max.section ? section : max;
            }, contents[0]);

            // Kiểm tra xem đã có quiz trong section cuối chưa
            const quizSectionName = 'Bài kiểm tra cuối kỳ';
            let hasQuiz = false;

            if (lastSection.modules && lastSection.modules.length > 0) {
              hasQuiz = lastSection.modules.some(module =>
                module.modname === 'quiz' &&
                (module.name === 'Bài kiểm tra cuối kỳ' || module.name.includes('kiểm tra cuối'))
              );
            }

            if (hasQuiz) {
              syncLogger.info(`Quiz already exists in course: ${course.fullname} (ID: ${course.id})`);
              skipped++;
              return;
            }

            // Đổi tên section cuối nếu chưa đúng
            if (lastSection.name !== quizSectionName) {
              try {
                await moodleService.renameSection(course.id, lastSection.id, quizSectionName);
                syncLogger.info(`✓ Renamed section to "${quizSectionName}" for course: ${course.fullname}`);
              } catch (renameError) {
                syncLogger.warn(`Could not rename section for course ${course.fullname}: ${renameError.message}`);
                // Tiếp tục tạo quiz dù không đổi tên được
              }
            }

            // Tạo quiz trong section cuối bằng custom plugin
            const quizData = {
              name: 'Bài kiểm tra cuối kỳ',
              intro: `<p>Bài kiểm tra cuối kỳ của khóa học <strong>${course.fullname}</strong></p>
                      <p>Thời gian làm bài: 60 phút</p>
                      <p>Số lần làm bài: 1 lần</p>
                      <p>Điểm tối đa: 10 điểm</p>`,
              section: lastSection.section, // Section number (không phải section.id)
              timeopen: 0, // Không giới hạn thời gian mở
              timeclose: 0, // Không giới hạn thời gian đóng
              timelimit: 3600, // 60 phút = 3600 giây
              attempts: 1, // Cho phép làm 1 lần
              grademethod: 1, // 1 = Highest grade (lấy điểm cao nhất)
              grade: 10, // Điểm tối đa
              password: '', // Không đặt mật khẩu
              shuffleanswers: 1, // Trộn câu trả lời
              visible: 1 // Hiển thị
            };

            syncLogger.info(`Creating quiz for course: ${course.fullname} (ID: ${course.id}), Section: ${lastSection.section}`);

            // Sử dụng custom plugin để tạo quiz
            const result = await moodleService.createQuizWithPlugin(course.id, quizData);

            if (result && result.success && result.quizId) {
              quizzesCreated++;
              createdQuizzes.push({
                course_id: course.id,
                course_name: course.fullname,
                quiz_id: result.quizId,
                quiz_name: result.name,
                section: lastSection.section
              });
              syncLogger.info(`✓ Quiz created successfully - Course: ${course.fullname}, Quiz ID: ${result.quizId}`);
            } else {
              throw new Error(`Plugin returned unsuccessful result for course ${course.fullname}: ${JSON.stringify(result)}`);
            }
          }, 3, 2000); // Retry 3 lần, delay 2 giây

        } catch (error) {
          errors.push({
            course_id: course.id,
            course_name: course.fullname,
            error: error.message,
            stack: error.stack
          });
          syncLogger.error(`✗ Failed to create quiz for course ${course.fullname} (ID: ${course.id}):`, error);
        }
      }

      const summary = {
        success: errors.length < courses.length, // Thành công nếu có ít nhất 1 course được xử lý
        totalCourses: courses.length,
        quizzesCreated,
        skipped,
        errors: errors.length,
        errorDetails: errors,
        createdQuizzes: createdQuizzes.slice(0, 20), // Chỉ trả về 20 quiz đầu tiên để tránh response quá lớn
        message: `Đã tạo ${quizzesCreated} quiz cho ${courses.length} khóa học. Bỏ qua: ${skipped}. Lỗi: ${errors.length}.`,
        timestamp: new Date().toISOString()
      };

      syncLogger.info('Final quiz creation completed', {
        totalCourses: courses.length,
        quizzesCreated,
        skipped,
        errorCount: errors.length,
        topErrors: errors.slice(0, 5)
      });

      return summary;

    } catch (error) {
      syncLogger.error('Final quiz creation failed with critical error:', error);
      throw error;
    }
  }

  /**
   * Đồng bộ điểm assignment từ SQL Server vào Moodle
   * @returns {object} Kết quả đồng bộ
   */
  // DONE
  async syncAssignmentGrades() {
    try {
      syncLogger.info('🔄 Starting assignment grades synchronization...');

      // 1. Lấy điểm từ SQL Server
      const lastSync = this.lastSyncDate.grades;
      const gradesFromDB = await databaseService.getGrades(lastSync);
      syncLogger.info(`Found ${gradesFromDB.length} grade records from database${lastSync ? ` (since ${lastSync.toISOString()})` : ''}`);

      if (gradesFromDB.length === 0) {
        return {
          success: true,
          message: 'No grades to sync',
          processed: 0,
          synced: 0,
          skipped: 0,
          errors: 0
        };
      }

      // 2. Xử lý từng bản ghi điểm
      let processed = 0;
      let synced = 0;
      let skipped = 0;
      let errors = 0;
      const errorDetails = [];

      for (const grade of gradesFromDB) {
        try {
          processed++;

          // Tìm khóa học trong Moodle theo IdLopHocPhan (shortname)
          const moodleCourse = await moodleService.getCourseByShortname(grade.IdLopHocPhan.toString());
          if (!moodleCourse) {
            syncLogger.warn(`⚠ Course not found: ${grade.IdLopHocPhan}`);
            skipped++;
            continue;
          }

          // Tìm assignment "Bài tập cuối kỳ" trong khóa học
          const assignments = await moodleService.getAssignments(moodleCourse.id);
          const finalAssignment = assignments.find(a => a.name && a.name.includes('cuối kỳ'));
          if (!finalAssignment) {
            syncLogger.warn(`⚠ Final assignment not found in course ${moodleCourse.id}`);
            skipped++;
            continue;
          }

          // Tìm sinh viên theo MaSinhVien (idnumber)
          const moodleUser = await moodleService.getUserByIdNumber(grade.MaSinhVien);
          if (!moodleUser) {
            syncLogger.warn(`⚠ User not found: ${grade.MaSinhVien}`);
            skipped++;
            continue;
          }

          const moodleGrade = grade.DiemTongKet;

          // Chấm điểm
          await moodleService.gradeAssignment(finalAssignment.id, moodleUser.id, moodleGrade);

          synced++;
          syncLogger.info(`✓ Graded ${grade.MaSinhVien}: ${moodleGrade}/100 in ${moodleCourse.fullname}`);

        } catch (error) {
          syncLogger.error(`✗ Error grading ${grade.MaSinhVien}:`, error.message);
          errors++;
          errorDetails.push({
            student: grade.MaSinhVien,
            courseId: grade.IdLopHocPhan,
            courseName: grade.TenMonHoc,
            error: error.message
          });
        }
      }

      // 3. Tổng kết
      const summary = {
        success: errors < processed,
        message: `Đồng bộ ${synced} điểm thành công từ ${processed} bản ghi`,
        totalGrades: gradesFromDB.length,
        gradesProcessed: processed,
        gradesSynced: synced,
        skipped: skipped,
        errors: errors,
        errorDetails: errorDetails.slice(0, 10),
        timestamp: new Date().toISOString()
      };

      syncLogger.info('✅ Assignment grades sync completed', summary);

      // Cập nhật thời gian last sync
      this.lastSyncDate.grades = new Date();
      this.saveLastSync();

      return summary;

    } catch (error) {
      syncLogger.error('❌ Assignment grades sync failed:', error);
      throw error;
    }
  }
}
export default new SyncToMoodleService();