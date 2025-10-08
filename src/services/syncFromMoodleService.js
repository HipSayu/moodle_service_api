import databaseService from './databaseService.js';
import moodleService from './moodleService.js';
import { logger, syncLogger } from '../utils/logger.js';
import { retryOperation } from '../utils/errorHandler.js';

class SyncFromMoodleService {
  constructor() {
    this.lastSyncDate = {};
  }

  // Đồng bộ điểm từ Moodle về SQL Server
  async syncGradesFromMoodle() {
    try {
      syncLogger.info('Starting grades sync from Moodle');
      
      const courses = await databaseService.getCourses();
      let totalGrades = 0;
      let syncCount = 0;
      let errorCount = 0;
      const errors = [];
      const processedGrades = [];

      for (const course of courses) {
        try {
          // Lấy course trong Moodle
          const moodleCourse = await moodleService.getCourseByShortname(course.course_code);
          if (!moodleCourse) {
            syncLogger.warn(`Course not found in Moodle: ${course.course_code}`);
            continue;
          }

          // Lấy tất cả điểm từ course này
          const courseGrades = await moodleService.getAllCourseGrades(moodleCourse.id);
          totalGrades += courseGrades.length;

          syncLogger.info(`Processing ${courseGrades.length} grades for course ${course.course_code}`);

          for (const grade of courseGrades) {
            try {
              await retryOperation(async () => {
                // Tìm student trong SQL Server bằng username
                const students = await databaseService.getStudents();
                const student = students.find(s => s.student_code === grade.username);

                if (student) {
                  const gradeData = {
                    student_id: student.student_id,
                    course_id: course.course_id,
                    assignment_name: grade.itemName,
                    grade: grade.grade,
                    max_grade: grade.gradeMax,
                    grade_date: grade.gradeDate,
                    moodle_grade_id: grade.gradeItemId
                  };

                  processedGrades.push(gradeData);
                  syncCount++;

                  syncLogger.debug(`Processed grade for ${grade.username} in ${course.course_code}: ${grade.grade}/${grade.gradeMax}`);
                } else {
                  syncLogger.warn(`Student not found in SQL Server: ${grade.username}`);
                }
              }, 2, 1000);
            } catch (error) {
              errorCount++;
              errors.push({
                course: course.course_code,
                username: grade.username,
                error: error.message
              });
              syncLogger.error(`Failed to process grade for ${grade.username}:`, error);
            }
          }
        } catch (courseError) {
          syncLogger.error(`Failed to sync grades for course ${course.course_code}:`, courseError);
        }
      }

      // Batch update grades to SQL Server
      if (processedGrades.length > 0) {
        try {
          await databaseService.updateGrades(processedGrades);
          syncLogger.info(`Successfully updated ${processedGrades.length} grades in SQL Server`);
        } catch (updateError) {
          syncLogger.error('Failed to update grades in SQL Server:', updateError);
          throw updateError;
        }
      }

      this.lastSyncDate.grades = new Date();
      
      syncLogger.info('Grades sync from Moodle completed', {
        totalGrades,
        syncCount,
        errorCount,
        updatedInDb: processedGrades.length,
        errors: errors.slice(0, 10)
      });

      return {
        success: true,
        total: totalGrades,
        processed: syncCount,
        updated: processedGrades.length,
        errors: errorCount,
        errorDetails: errors
      };
    } catch (error) {
      syncLogger.error('Grades sync from Moodle failed:', error);
      throw error;
    }
  }

  // Đồng bộ điểm cho một course cụ thể
  async syncCourseGradesFromMoodle(courseCode) {
    try {
      syncLogger.info(`Starting grades sync for course ${courseCode} from Moodle`);
      
      // Lấy course từ SQL Server
      const courses = await databaseService.getCourses();
      const course = courses.find(c => c.course_code === courseCode);
      
      if (!course) {
        throw new Error(`Course not found in SQL Server: ${courseCode}`);
      }

      // Lấy course trong Moodle
      const moodleCourse = await moodleService.getCourseByShortname(course.course_code);
      if (!moodleCourse) {
        throw new Error(`Course not found in Moodle: ${courseCode}`);
      }

      // Lấy tất cả điểm từ course này
      const courseGrades = await moodleService.getAllCourseGrades(moodleCourse.id);
      
      let syncCount = 0;
      let errorCount = 0;
      const errors = [];
      const processedGrades = [];

      for (const grade of courseGrades) {
        try {
          // Tìm student trong SQL Server bằng username
          const students = await databaseService.getStudents();
          const student = students.find(s => s.student_code === grade.username);

          if (student) {
            const gradeData = {
              student_id: student.student_id,
              course_id: course.course_id,
              assignment_name: grade.itemName,
              grade: grade.grade,
              max_grade: grade.gradeMax,
              grade_date: grade.gradeDate,
              moodle_grade_id: grade.gradeItemId
            };

            processedGrades.push(gradeData);
            syncCount++;
          } else {
            syncLogger.warn(`Student not found in SQL Server: ${grade.username}`);
          }
        } catch (error) {
          errorCount++;
          errors.push({
            course: courseCode,
            username: grade.username,
            error: error.message
          });
          syncLogger.error(`Failed to process grade for ${grade.username}:`, error);
        }
      }

      // Update grades to SQL Server
      if (processedGrades.length > 0) {
        await databaseService.updateGrades(processedGrades);
      }

      syncLogger.info(`Grades sync for course ${courseCode} completed`, {
        totalGrades: courseGrades.length,
        syncCount,
        errorCount,
        updatedInDb: processedGrades.length
      });

      return {
        success: true,
        course: courseCode,
        total: courseGrades.length,
        processed: syncCount,
        updated: processedGrades.length,
        errors: errorCount,
        errorDetails: errors
      };
    } catch (error) {
      syncLogger.error(`Grades sync for course ${courseCode} failed:`, error);
      throw error;
    }
  }

  // Đồng bộ điểm cho một sinh viên cụ thể
  async syncStudentGradesFromMoodle(studentCode) {
    try {
      syncLogger.info(`Starting grades sync for student ${studentCode} from Moodle`);
      
      // Tìm student trong SQL Server
      const students = await databaseService.getStudents();
      const student = students.find(s => s.student_code === studentCode);
      
      if (!student) {
        throw new Error(`Student not found in SQL Server: ${studentCode}`);
      }

      // Tìm user trong Moodle
      const moodleUser = await moodleService.getUserByUsername(studentCode);
      if (!moodleUser) {
        throw new Error(`Student not found in Moodle: ${studentCode}`);
      }

      // Lấy tất cả courses mà student đã đăng ký
      const enrollments = await databaseService.getCourseEnrollments();
      const studentEnrollments = enrollments.filter(e => e.student_id === student.student_id);
      
      let totalGrades = 0;
      let syncCount = 0;
      let errorCount = 0;
      const errors = [];
      const processedGrades = [];

      for (const enrollment of studentEnrollments) {
        try {
          // Lấy course info
          const courses = await databaseService.getCourses();
          const course = courses.find(c => c.course_id === enrollment.course_id);
          
          if (!course) continue;

          // Lấy course trong Moodle
          const moodleCourse = await moodleService.getCourseByShortname(course.course_code);
          if (!moodleCourse) continue;

          // Lấy điểm của student trong course này
          const courseGrades = await moodleService.getAllCourseGrades(moodleCourse.id);
          const studentGrades = courseGrades.filter(g => g.username === studentCode);
          
          totalGrades += studentGrades.length;

          for (const grade of studentGrades) {
            try {
              const gradeData = {
                student_id: student.student_id,
                course_id: course.course_id,
                assignment_name: grade.itemName,
                grade: grade.grade,
                max_grade: grade.gradeMax,
                grade_date: grade.gradeDate,
                moodle_grade_id: grade.gradeItemId
              };

              processedGrades.push(gradeData);
              syncCount++;
            } catch (gradeError) {
              errorCount++;
              errors.push({
                course: course.course_code,
                assignment: grade.itemName,
                error: gradeError.message
              });
            }
          }
        } catch (courseError) {
          syncLogger.error(`Failed to sync grades for student ${studentCode} in course:`, courseError);
        }
      }

      // Update grades to SQL Server
      if (processedGrades.length > 0) {
        await databaseService.updateGrades(processedGrades);
      }

      syncLogger.info(`Grades sync for student ${studentCode} completed`, {
        totalGrades,
        syncCount,
        errorCount,
        updatedInDb: processedGrades.length
      });

      return {
        success: true,
        student: studentCode,
        total: totalGrades,
        processed: syncCount,
        updated: processedGrades.length,
        errors: errorCount,
        errorDetails: errors
      };
    } catch (error) {
      syncLogger.error(`Grades sync for student ${studentCode} failed:`, error);
      throw error;
    }
  }

  // Lấy thống kê điểm số mới nhất từ Moodle
  async getGradeStatistics() {
    try {
      syncLogger.info('Getting grade statistics from Moodle');
      
      const statistics = {
        totalCourses: 0,
        totalStudents: 0,
        totalGrades: 0,
        courseStats: []
      };

      const courses = await databaseService.getCourses();
      statistics.totalCourses = courses.length;

      for (const course of courses) {
        try {
          const moodleCourse = await moodleService.getCourseByShortname(course.course_code);
          if (!moodleCourse) continue;

          const courseGrades = await moodleService.getAllCourseGrades(moodleCourse.id);
          const uniqueStudents = [...new Set(courseGrades.map(g => g.username))];
          
          statistics.totalGrades += courseGrades.length;
          statistics.totalStudents += uniqueStudents.length;
          
          statistics.courseStats.push({
            courseCode: course.course_code,
            courseName: course.course_name,
            studentCount: uniqueStudents.length,
            gradeCount: courseGrades.length,
            averageGrade: courseGrades.length > 0 ? 
              (courseGrades.reduce((sum, g) => sum + (g.grade || 0), 0) / courseGrades.length).toFixed(2) : 0
          });
        } catch (courseError) {
          syncLogger.warn(`Failed to get statistics for course ${course.course_code}:`, courseError);
        }
      }

      return statistics;
    } catch (error) {
      syncLogger.error('Failed to get grade statistics:', error);
      throw error;
    }
  }
}

export default new SyncFromMoodleService();