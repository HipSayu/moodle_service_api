import axios from 'axios';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

class MoodleService {
  constructor() {
    this.baseUrl = config.moodle.url;
    this.token = config.moodle.token;
    this.service = config.moodle.service;
  }





  // Gọi Moodle Web Service API
  async callWebService(wsfunction, parameters = {}, tokenCreate = '') {
    try {
      const url = `${this.baseUrl}/webservice/rest/server.php`;

      const data = {
        wstoken: tokenCreate !='' ? tokenCreate : this.token,
        wsfunction: wsfunction,
        moodlewsrestformat: 'json',
        ...parameters
      };

      const response = await axios.post(url, null, {
        params: data,
        timeout: 100000
      });

      if (response.data && response.data.exception) {
        throw new Error(`Moodle API Error: ${response.data.message}`);
      }

      return response.data;
    } catch (error) {
      logger.error(`Error calling Moodle API ${wsfunction}:`, error);
      throw error;
    }
  }

  // Tạo user trong Moodle
  async createUser(userData) {
    try {
      const user = {
        username: (userData.email || `${userData.idnumber}@huce.edu.vn`).toLowerCase(),
        firstname: userData.first_name || "Lỗi dữ liệu",
        lastname: userData.last_name || "Lỗi dữ liệu",
        email: userData.email || `${userData.idnumber}@huce.edu.vn`,
        city: userData.city || "HN",
        idnumber: userData.idnumber || `no ${Date.now()}`,
        password: userData.password || 'DefaultPassword123!',
        auth: 'manual'
      };

      const result = await this.callWebService('core_user_create_users', {
        'users[0][username]': user.username,
        'users[0][firstname]': user.firstname,
        'users[0][lastname]': user.lastname,
        'users[0][email]': user.email,
        'users[0][password]': user.password,
        'users[0][auth]': user.auth || 'manual',
        'users[0][idnumber]': user.idnumber,
        'users[0][city]': user.city,
      });

      if (result && result.length > 0) {
        logger.info(`Created user in Moodle: ${user.username} (ID: ${result[0].id})`);
        return result[0];
      }

      throw new Error('Failed to create user in Moodle');
    } catch (error) {
      logger.error('Error creating user in Moodle:', error);
      throw error;
    }
  }

  // Cập nhật user trong Moodle
  async updateUser(userId, userData) {
    try {
      const updateData = {
        'users[0][id]': userId,
        // 'users[0][username]': userData.username,
        'users[0][firstname]': userData.first_name,
        'users[0][lastname]': userData.last_name,
        // 'users[0][email]': userData.email,
        'users[0][auth]': userData.auth || 'manual',
        // 'users[0][idnumber]': userData.idnumber,
        'users[0][city]': userData.city || "",
      };

      await this.callWebService('core_user_update_users', updateData);
      logger.info(`Updated user in Moodle: ID ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error updating user in Moodle:', error);
      throw error;
    }
  }

  // Xóa user trong Moodle
  async deleteUser(userId) {
    try {
      await this.callWebService('core_user_delete_users', {
        'userids[0]': userId
      });
      logger.info(`Deleted user in Moodle: ID ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting user in Moodle:', error);
      throw error;
    }
  }

  // Tìm user theo username
  async getUserByUsername(username) {
    try {
      const result = await this.callWebService('core_user_get_users', {
        'criteria[0][key]': 'username',
        'criteria[0][value]': username
      });

      if (result && result.users && result.users.length > 0) {
        return result.users[0];
      }

      return null;
    } catch (error) {
      logger.error('Error getting user by username:', error);
      throw error;
    }
  }

  async getUserByIdNumber(idNumber) {
    try {
      const result = await this.callWebService('core_user_get_users', {
        'criteria[0][key]': 'idnumber',
        'criteria[0][value]': idNumber
      });

      if (result && result.users && result.users.length > 0) {
        return result.users[0];
      }

      return null;
    } catch (error) {
      logger.error('Error getting user by idnumber:', error);
      throw error;
    }
  }

  // Lấy danh sách users từ Moodle
  async getUsers() {
    try {
      const result = await this.callWebService('core_user_get_users', {});
      return result.users || [];
    } catch (error) {
      logger.error('Error getting users:', error);
      throw error;
    }
  }

  // Tạo category trong Moodle
  async createCategory(categoryData) {
    try {
      const category = {
        name: categoryData.name,
        parent: categoryData.parent || 0,
        description: categoryData.description || '',
        idnumber: categoryData.idnumber || ''
      };

      const result = await this.callWebService('core_course_create_categories', {
        categories: [category]
      });

      if (result && result[0] && result[0].id) {
        logger.info(`Created category in Moodle: ${category.name} (ID: ${result[0].id})`);
        return result[0];
      }

      throw new Error('Failed to create category in Moodle');
    } catch (error) {
      logger.error('Error creating category in Moodle:', error);
      throw error;
    }
  }

  // Tạo course trong Moodle
  async createCourse(courseData) {
    try {
      const course = {
        fullname: courseData.course_fullname,
        shortname: courseData.course_shortname,
        categoryid: courseData.course_categoryid || 1,
        summary: courseData.description || '',
        idnumber: courseData.course_idnumber,
        format: 'topics',
        visible: 1,
        startdate: courseData.start_date ? Math.floor(new Date(courseData.start_date).getTime() / 1000) : Math.floor(Date.now() / 1000),
        enddate: courseData.end_date ? Math.floor(new Date(courseData.end_date).getTime() / 1000) : null
      };

      const result = await this.callWebService('core_course_create_courses', {
        'courses[0][fullname]': course.fullname,
        'courses[0][shortname]': course.shortname,
        'courses[0][categoryid]': course.categoryid,
        'courses[0][idnumber]': course.idnumber,
        'courses[0][summary]': course.summary,
        'courses[0][format]': course.format,
        'courses[0][visible]': course.visible,
        'courses[0][startdate]': course.startdate,
        'courses[0][enddate]': course.enddate
      });

      if (result && result.length > 0) {
        logger.info(`Created course in Moodle: ${course.shortname} (ID: ${result[0].id})`);
        return result[0];
      }

      throw new Error('Failed to create course in Moodle');
    } catch (error) {
      logger.error('Error creating course in Moodle:', error);
      throw error;
    }
  }

  // Cập nhật course trong Moodle
  async updateCourse(courseId, courseData) {
    try {
      const updateData = {
        'courses[0][id]': courseId,
        'courses[0][fullname]': courseData.course_fullname,
        'courses[0][shortname]': courseData.course_shortname,
        'courses[0][categoryid]': courseData.course_categoryid,
        'courses[0][idnumber]': courseData.course_idnumber,
        'courses[0][summary]': courseData.description || ''
      };

      if (courseData.start_date) {
        updateData['courses[0][startdate]'] = Math.floor(new Date(courseData.start_date).getTime() / 1000);
      }

      if (courseData.end_date) {
        updateData['courses[0][enddate]'] = Math.floor(new Date(courseData.end_date).getTime() / 1000);
      }

      await this.callWebService('core_course_update_courses', updateData);
      logger.info(`Updated course in Moodle: ID ${courseId}`);
      return true;
    } catch (error) {
      logger.error('Error updating course in Moodle:', error);
      throw error;
    }
  }

  // Xóa course trong Moodle
  async deleteCourse(courseId) {
    try {
      await this.callWebService('core_course_delete_courses', {
        'courseids[0]': courseId
      });
      logger.info(`Deleted course in Moodle: ID ${courseId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting course in Moodle:', error);
      throw error;
    }
  }

  // Tìm course theo shortname
  async getCourseByShortname(shortname) {
    try {
      const result = await this.callWebService('core_course_get_courses_by_field', {
        field: 'shortname',
        value: shortname
      });

      if (result && result.courses && result.courses.length > 0) {
        return result.courses[0];
      }

      return null;
    } catch (error) {
      logger.error('Error getting course by shortname:', error);
      throw error;
    }
  }

  // Lấy danh sách courses từ Moodle
  async getCourses() {
    try {
      const result = await this.callWebService('core_course_get_courses', {});
      return result || [];
    } catch (error) {
      logger.error('Error getting courses:', error);
      throw error;
    }
  }

  async getCoursesLimit(limit = 10) {
    try {
      const result = await this.callWebService('core_course_get_courses', {});
      return (result || []).slice(0, limit);
    } catch (error) {
      logger.error('Error getting courses:', error);
      throw error;
    }
  }

  // Đăng ký user vào course
  async enrollUserToCourse(userId, courseId, roleId = 5, moodleUser, moodleCourse) {
    try {
      // roleId = 5 is student role by default
      const result = await this.callWebService('enrol_manual_enrol_users', {
        'enrolments[0][roleid]': roleId,
        'enrolments[0][userid]': userId,
        'enrolments[0][courseid]': courseId
      });

      logger.info(`Sinh Viên ${moodleUser.fullname} Đã tham gia ${moodleCourse.fullname} with role ${roleId}`);
      return true;
    } catch (error) {
      logger.error('Error enrolling user to course:', error);
      throw error;
    }
  }

  // Đăng ký teacher vào course
  async enrollTeacherToCourse(userId, courseId, roleId = 3, moodleUser, moodleCourse) {
    try {
      // roleId = 3 is editing teacher role by default
      const result = await this.callWebService('enrol_manual_enrol_users', {
        'enrolments[0][roleid]': roleId,
        'enrolments[0][userid]': userId,
        'enrolments[0][courseid]': courseId
      });

      logger.info(`Giảng Viên ${moodleUser.fullname} Đã tham gia ${moodleCourse.fullname} with role ${roleId}`);
      return true;
    } catch (error) {
      logger.error('Error enrolling teacher to course:', error);
      throw error;
    }
  }

  // Hủy đăng ký user khỏi course
  async unenrollUserFromCourse(userId, courseId) {
    try {
      await this.callWebService('enrol_manual_unenrol_users', {
        'enrolments[0][userid]': userId,
        'enrolments[0][courseid]': courseId
      });

      logger.info(`Unenrolled user ${userId} from course ${courseId}`);
      return true;
    } catch (error) {
      logger.error('Error unenrolling user from course:', error);
      throw error;
    }
  }

  // Lấy điểm từ course
  async getCourseGrades(courseId) {
    try {
      const result = await this.callWebService('gradereport_user_get_grade_items', {
        courseid: courseId
      });

      return result;
    } catch (error) {
      logger.error('Error getting course grades:', error);
      throw error;
    }
  }

  // Lấy tất cả users đã đăng ký trong course
  async getEnrolledUsers(courseId) {
    try {
      const result = await this.callWebService('core_enrol_get_enrolled_users', {
        courseid: courseId
      });

      return result || [];
    } catch (error) {
      logger.error('Error getting enrolled users:', error);
      throw error;
    }
  }

  // Lấy điểm của tất cả students trong course
  async getAllCourseGrades(courseId) {
    try {
      // Lấy danh sách users đã đăng ký
      const enrolledUsers = await this.getEnrolledUsers(courseId);
      const students = enrolledUsers.filter(user =>
        user.roles && user.roles.some(role => role.roleid === 5) // Student role
      );

      const allGrades = [];

      for (const student of students) {
        try {
          const grades = await this.callWebService('gradereport_user_get_grade_items', {
            courseid: courseId,
            userid: student.id
          });

          if (grades && grades.usergrades) {
            grades.usergrades.forEach(userGrade => {
              if (userGrade.gradeitems) {
                userGrade.gradeitems.forEach(gradeItem => {
                  if (gradeItem.graderaw !== null && gradeItem.graderaw !== undefined) {
                    allGrades.push({
                      userId: student.id,
                      username: student.username,
                      courseId: courseId,
                      gradeItemId: gradeItem.id,
                      itemName: gradeItem.itemname,
                      grade: parseFloat(gradeItem.graderaw),
                      gradeMax: parseFloat(gradeItem.grademax),
                      gradeDate: gradeItem.gradedategraded ? new Date(gradeItem.gradedategraded * 1000) : new Date()
                    });
                  }
                });
              }
            });
          }
        } catch (error) {
          logger.warn(`Error getting grades for student ${student.id}:`, error);
        }
      }

      return allGrades;
    } catch (error) {
      logger.error('Error getting all course grades:', error);
      throw error;
    }
  }

  // Kiểm tra kết nối Moodle
  async checkConnection() {
    try {
      const result = await this.callWebService('core_webservice_get_site_info');
      return result && result.sitename;
    } catch (error) {
      logger.error('Moodle connection check failed:', error);
      return false;
    }
  }



  // Lấy danh sách categories
  async getCategories() {
    try {
      const result = await this.callWebService('core_course_get_categories', {
        criteria: []
      });
      return result;
    } catch (error) {
      logger.error('Error getting categories:', error);
      throw error;
    }
  }

  // Tìm category theo tên
  async getCategoryByName(name) {
    try {
      const categories = await this.getCategories();
      return categories.find(cat => cat.name === name);
    } catch (error) {
      logger.error('Error finding category by name:', error);
      throw error;
    }
  }

  // Tìm category theo idnumber
  async getCategoryByIdNumber(idnumber) {
    try {
      const categories = await this.getCategories();
      return categories.find(cat => cat.idnumber === idnumber);
    } catch (error) {
      logger.error('Error finding category by idnumber:', error);
      throw error;
    }
  }

  // Tạo/cập nhật section trong course
  async createSection(courseId, sectionData) {
    try {
      const result = await this.callWebService('local_wsmanagesections_create_section', {
        courseid: courseId,
        name: sectionData.name,
        summary: sectionData.summary || '',
        section: sectionData.section || 0,
        visible: sectionData.visible !== undefined ? sectionData.visible : 1
      });

      if (result && result.sectionid) {
        logger.info(`Section created: ${sectionData.name} in course ${courseId}`);
        return { id: result.sectionid, name: sectionData.name };
      } else {
        throw new Error('Failed to create section');
      }
    } catch (error) {
      logger.error('Error creating section:', error);
      throw error;
    }
  }

  // Tạo quiz trong course
  async createQuiz(courseId, quizData) {
    try {
      const url = `${this.baseUrl}/webservice/rest/server.php`;

      const params = {
        wstoken: '6287e2aa8d57c5336498da6a129cfbd7',
        wsfunction: 'local_customws_create_quiz',
        moodlewsrestformat: 'json',
        courseid: Number(courseId),
        name: String(quizData.name),
        intro: String(quizData.intro ?? 'Final Exam'),
      };

      const response = await axios.post(url, null, { params, timeout: 60000 });
      const data = response.data;

      if (!data) {
        throw new Error('Không nhận được phản hồi từ Moodle');
      }

      if (data.exception || data.errorcode) {
        throw new Error(`Moodle Error: ${data.message || 'Không rõ nguyên nhân'}`);
      }

      if (data.status === 'success') {
        console.log(
          `✅ Quiz "${quizData.name}" created successfully in course ${courseId} (Quiz ID: ${data.quizid})`
        );
        return data;
      }
      // console.log(data)

      throw new Error(`❌ Tạo quiz thất bại cho khóa học ${courseId}: ${data.message || 'Unknown error'}`);

    } catch (error) {
      console.error(`💥 Lỗi khi tạo quiz trong khóa học ${courseId}: ${error.message}`);
      throw error;
    }
  }

  // Di chuyển module (quiz) vào section
  async moveModuleToSection(cmid, sectionId) {
    try {
      await this.callWebService('core_course_edit_module', {
        cmid: cmid,
        section: sectionId
      });
      logger.info(`Module ${cmid} moved to section ${sectionId}`);
    } catch (error) {
      logger.error('Error moving module to section:', error);
      throw error;
    }
  }

  // Kiểm tra các functions có sẵn trong Moodle Web Service
  async getAvailableFunctions() {
    try {
      const result = await this.callWebService('core_webservice_get_site_info', {});
      return result;
    } catch (error) {
      logger.error('Error getting available functions:', error);
      throw error;
    }
  }

  // Lấy danh sách tất cả functions
  async getAllFunctions() {
    try {
      const result = await this.callWebService('core_webservice_get_site_info', {});
      if (result && result.functions) {
        return result.functions.map(func => func.name);
      }
      return [];
    } catch (error) {
      logger.error('Error getting all functions:', error);
      throw error;
    }
  }

  // Kiểm tra quyền của user Moodle
  async checkUserCapabilities() {
    try {
      const result = await this.callWebService('core_webservice_get_site_info', {});
      return {
        userid: result.userid,
        username: result.username,
        firstname: result.firstname,
        lastname: result.lastname,
        siteurl: result.siteurl,
        usercanmanageownfiles: result.usercanmanageownfiles,
        userquota: result.userquota,
        usermaxuploadfilesize: result.usermaxuploadfilesize,
        userhomepage: result.userhomepage,
        userprivateaccesskey: result.userprivateaccesskey,
        siteid: result.siteid,
        sitecalendartype: result.sitecalendartype,
        usercalendartype: result.usercalendartype,
        theme: result.theme,
        language: result.language,
        functions: result.functions ? result.functions.length : 0
      };
    } catch (error) {
      logger.error('Error checking user capabilities:', error);
      throw error;
    }
  }

  // Get course contents
  async getCourseContents(courseId) {
    const url = `${this.baseUrl}/webservice/rest/server.php`;
    const params = {
      wstoken: this.token,
      wsfunction: 'core_course_get_contents',
      moodlewsrestformat: 'json',
      courseid: courseId
    };
    const response = await axios.get(url, { params, timeout: 30000 });
    return response.data;
  }

  // Rename section
  async renameSection(courseId, sectionId, newName) {
    const url = `${this.baseUrl}/webservice/rest/server.php`;
    const params = {
      wstoken: this.token,
      wsfunction: 'core_update_inplace_editable',
      moodlewsrestformat: 'json',
      component: 'format_topics',
      itemtype: 'sectionname',
      itemid: sectionId,
      value: newName
    };
    const response = await axios.get(url, { params, timeout: 30000 });
    return response.data;
  }

  /**
   * Tạo quiz sử dụng custom plugin local_quizapi
   * @param {number} courseId - ID của khóa học
   * @param {Object} quizData - Dữ liệu quiz
   * @returns {Object} Thông tin quiz đã tạo
   */
  async createQuizWithPlugin(courseId, quizData) {
    try {
      const params = {
        courseid: courseId,
        name: quizData.name,
        intro: quizData.intro || '',
        section: quizData.section || 0,
        timeopen: quizData.timeopen || 0,
        timeclose: quizData.timeclose || 0,
        timelimit: quizData.timelimit || 0,
        attempts: quizData.attempts || 0,
        grademethod: quizData.grademethod || 1,
        grade: quizData.grade || 10,
        password: quizData.password || '',
        shuffleanswers: quizData.shuffleanswers !== undefined ? quizData.shuffleanswers : 1,
        visible: quizData.visible !== undefined ? quizData.visible : 1
      };

      const result = await this.callWebService('local_quizapi_create_quiz', params);

      // Kiểm tra response từ plugin
      // Plugin trả về: { quizid, courseid, name, message }
      if (result && result.quizid) {
        logger.info(`✓ Quiz created via plugin: "${quizData.name}" in course ${courseId} (Quiz ID: ${result.quizid})`);
        return {
          success: true,
          quizId: result.quizid,
          courseId: result.courseid,
          name: result.name,
          message: result.message || 'Quiz created successfully'
        };
      } else if (result && result.exception) {
        // Moodle trả về lỗi
        throw new Error(`Moodle API Error: ${result.message || result.exception}`);
      } else {
        // Response không đúng định dạng
        throw new Error(`Invalid response from plugin: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      logger.error(`✗ Error creating quiz via plugin in course ${courseId}:`, error.message);
      throw error;
    }
  }

  // Lấy thông tin quiz từ plugin
  async getQuizInfo(quizId) {
    try {
      const result = await this.callWebService('local_quizapi_get_quiz_info', {
        quizid: quizId
      });
      return result;
    } catch (error) {
      logger.error('Error getting quiz info:', error);
      throw error;
    }
  }

  // Thêm câu hỏi vào quiz
  async addQuestionToQuiz(quizId, questionId, page = 1, maxmark = 1.0) {
    try {
      const result = await this.callWebService('local_quizapi_add_question_to_quiz', {
        quizid: quizId,
        questionid: questionId,
        page: page,
        maxmark: maxmark
      });
      return result;
    } catch (error) {
      logger.error('Error adding question to quiz:', error);
      throw error;
    }
  }
}

export default new MoodleService();