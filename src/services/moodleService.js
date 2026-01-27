import axios from 'axios';
import https from 'https';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

class MoodleService {
  constructor() {
    this.baseUrl = config.moodle.url;
    this.token = config.moodle.token;
    this.service = config.moodle.service;
    // Create HTTPS agent to ignore certificate errors
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
  }

  // Gọi Moodle Web Service API
  async callWebService(wsfunction, parameters = {}, tokenCreate = '') {
    try {
      const url = `${this.baseUrl}/webservice/rest/server.php`;
      const data = {
        wstoken: tokenCreate != '' ? tokenCreate : this.token,
        wsfunction: wsfunction,
        moodlewsrestformat: 'json',
        ...parameters
      };

      const response = await axios.post(url, null, {
        params: data,
        timeout: 100000,
        httpsAgent: this.httpsAgent
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
  // Done
  async createUser(userData) {
    try {
      const user = {
        username: (userData.email || `${userData.idnumber}@huce.edu.vn`).toLowerCase(),
        firstname: userData.first_name || "Lỗi dữ liệu",
        lastname: userData.last_name || "Lỗi dữ liệu",
        email: userData.email || `${userData.idnumber ?? Date.now()}@huce.edu.vn`,
        city: userData.city || "HN",
        idnumber: userData.idnumber || `no ${Date.now()}`,
        password: userData.password || 'DefaultPassword123!',
        auth: 'manual'
      };

      const result = await this.callWebService('core_user_create_users', {
        'users[0][username]': user.username || '',
        'users[0][firstname]': user.firstname || '',
        'users[0][lastname]': user.lastname || '',
        'users[0][email]': user.email || '',
        'users[0][password]': user.password || '',
        'users[0][auth]': 'manual',
        'users[0][idnumber]': user.idnumber || '',
        'users[0][city]': user.city || '',
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
  // Done
  async updateUser(userId, userData) {
    try {
      const updateData = {
        'users[0][id]': userId,
        // 'users[0][username]': userData.username,
        'users[0][firstname]': userData.first_name,
        'users[0][lastname]': userData.last_name,
        // 'users[0][email]': userData.email,
        // 'users[0][auth]': 'manual',
        // 'users[0][password]': userData.password,
        // 'users[0][idnumber]': userData.idnumber,
        // 'users[0][city]': userData.city || "",
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
  // tìm kiếm người dùng bằng idNumber
  //Done
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
  // DONE
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
  // DONE
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

      const data = await this.callWebService('core_course_update_courses', updateData);
      logger.info(`Updated course in Moodle: ID ${courseId}`);
      return data;
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
  // DONE
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
  // DONE
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
  // DONE
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
  // DONE
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
  // DONE
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
  // DONE
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
  // DONE
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
    const response = await axios.get(url, { params, timeout: 30000, httpsAgent: this.httpsAgent });
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
    const response = await axios.get(url, { params, timeout: 30000, httpsAgent: this.httpsAgent });
    return response.data;
  }

  //DONE
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

  /**
   * Tạo assignment mới trong course bằng plugin local_assignmentapi
   * @param {number} courseId - Moodle Course ID
   * @param {object} assignmentData - Dữ liệu assignment
   * @returns {object} Kết quả tạo assignment
   */
  //DONE
  async createAssignmentWithPlugin(courseId, assignmentData) {
    try {
      const params = {
        courseid: courseId,
        name: assignmentData.name,
        intro: assignmentData.intro || '',
        section: assignmentData.section || 0,
        duedate: assignmentData.duedate || 0,
        cutoffdate: assignmentData.cutoffdate || 0,
        allowsubmissionsfromdate: assignmentData.allowsubmissionsfromdate || 0,
        grade: assignmentData.grade || 100,
        submissiondrafts: assignmentData.submissiondrafts || 0,
        sendnotifications: assignmentData.sendnotifications || 0,
        sendlatenotifications: assignmentData.sendlatenotifications || 0,
        sendstudentnotifications: assignmentData.sendstudentnotifications !== undefined ? assignmentData.sendstudentnotifications : 1,
        maxattempts: assignmentData.maxattempts || -1,
        attemptreopenmethod: assignmentData.attemptreopenmethod || 'none',
        assignsubmission_onlinetext_enabled: assignmentData.assignsubmission_onlinetext_enabled !== undefined ? assignmentData.assignsubmission_onlinetext_enabled : 1,
        assignsubmission_file_enabled: assignmentData.assignsubmission_file_enabled !== undefined ? assignmentData.assignsubmission_file_enabled : 1,
        assignsubmission_file_maxfiles: assignmentData.assignsubmission_file_maxfiles || 3,
        assignsubmission_file_maxsizebytes: assignmentData.assignsubmission_file_maxsizebytes || 1048576,
        assignfeedback_comments_enabled: assignmentData.assignfeedback_comments_enabled !== undefined ? assignmentData.assignfeedback_comments_enabled : 1,
        assignfeedback_file_enabled: assignmentData.assignfeedback_file_enabled || 0
      };

      const result = await this.callWebService('local_assignmentapi_create_assignment', params);

      // Kiểm tra response từ plugin
      // Plugin trả về: { assignmentid, cmid, courseid, name, duedate, grade, message }
      if (result && result.assignmentid) {
        logger.info(`✓ Assignment created via plugin: "${assignmentData.name}" in course ${courseId} (Assignment ID: ${result.assignmentid})`);
        return {
          success: true,
          assignmentid: result.assignmentid,
          cmid: result.cmid,
          courseId: result.courseid,
          name: result.name,
          duedate: result.duedate,
          grade: result.grade,
          message: result.message || 'Assignment created successfully'
        };
      } else if (result && result.exception) {
        // Moodle trả về lỗi
        throw new Error(`Moodle API Error: ${result.message || result.exception}`);
      } else {
        // Response không đúng định dạng
        throw new Error(`Invalid response from plugin: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      logger.error(`✗ Error creating assignment via plugin in course ${courseId}:`, error.message);
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

  async gradeAssignment(assignmentid, userid, grade, attemptnumber = -1) {
    try {
      const params = {
        assignmentid,
        userid,
        grade,
        attemptnumber,
        addattempt: 0,
        workflowstate: 'released',
        applytoall: 0
      };

      const result = await this.callWebService('mod_assign_save_grade', params);

      logger.debug('mod_assign_save_grade response:', result);

      if (result === null || result === undefined ||
        result.status === true ||
        (Array.isArray(result) && result.length === 0) ||
        (!Array.isArray(result) && Object.keys(result).length === 0)) {
        logger.info(`✓ Graded assignment ${assignmentid} for user ${userid}: ${grade}`);
        return {
          success: true,
          assignmentid,
          userid,
          grade,
          message: 'Grade saved successfully'
        };
      } else {
        throw new Error(`Unexpected Moodle response: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      logger.error(`✗ Error grading assignment ${assignmentid} for user ${userid}: ${error.message}`, {
        stack: error.stack,
        assignmentId: assignmentid,
        userId: userid,
        grade
      });
      throw error;
    }
  }


  /**
   * Lấy danh sách assignments trong course
   * @param {number} courseId - Course ID
   * @returns {array} Danh sách assignments
   */
  async getAssignments(courseId) {
    try {
      logger.info(`Getting assignments for course ${courseId}...`);

      // Luôn enroll user vào course với role teacher trước để đảm bảo có quyền truy cập
      try {
        const siteInfo = await this.callWebService('core_webservice_get_site_info', {});
        const currentUserId = siteInfo.userid;
        await this.callWebService('enrol_manual_enrol_users', {
          'enrolments[0][roleid]': 3, // Teacher roleFV
          'enrolments[0][userid]': currentUserId,
          'enrolments[0][courseid]': courseId
        });
      } catch (enrollError) {
        logger.warn(`Could not enroll user in course ${courseId}, proceeding anyway:`, enrollError.message);
      }

      // Lấy assignments
      const result = await this.callWebService('mod_assign_get_assignments', {
        courseids: [courseId]
      });

      if (result && result.courses && result.courses.length > 0) {
        logger.info(`Found ${result.courses[0].assignments?.length || 0} assignments in course ${courseId}`);
        return result.courses[0].assignments || [];
      }

      logger.info(`No courses found in result for course ${courseId}`);
      return [];
    } catch (error) {
      logger.error(`Error getting assignments for course ${courseId}:`, error);
      throw error;
    }
  }

  // ==================== SECTION API PLUGIN ====================
  // DONE

  /**
   * Tạo section mới sử dụng plugin local_sectionapi
   * @param {number} courseId - ID của course
   * @param {object} sectionData - Dữ liệu section
   * @returns {object} Thông tin section đã tạo
   */
  async createSectionWithPlugin(courseId, sectionData) {
    try {
      logger.info(`Creating section with plugin for course ${courseId}: ${sectionData.name}`);

      const result = await this.callWebService('local_sectionapi_create_section', {
        courseid: courseId,
        name: sectionData.name,
        summary: sectionData.summary || '',
        visible: sectionData.visible !== undefined ? sectionData.visible : 1,
        position: sectionData.position || 0  // 0 = thêm vào cuối
      });

      if (result && result.sectionid) {
        logger.info(`Section created successfully: ${result.name} (ID: ${result.sectionid}, Section: ${result.section})`);
        return {
          sectionid: result.sectionid,
          courseid: result.courseid,
          name: result.name,
          section: result.section,
          message: result.message
        };
      } else {
        throw new Error('Failed to create section - no section ID returned');
      }
    } catch (error) {
      logger.error('Error creating section with plugin:', {
        courseId,
        sectionName: sectionData.name,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Cập nhật section sử dụng plugin local_sectionapi
   */
  async updateSectionWithPlugin(sectionId, updateData) {
    try {
      const params = {
        sectionid: sectionId
      };

      if (updateData.name !== undefined) params.name = updateData.name;
      if (updateData.summary !== undefined) params.summary = updateData.summary;
      if (updateData.visible !== undefined) params.visible = updateData.visible;

      const result = await this.callWebService('local_sectionapi_update_section', params);

      if (result && result.success) {
        logger.info(`Section updated successfully: ${sectionId}`);
        return result;
      } else {
        throw new Error('Failed to update section');
      }
    } catch (error) {
      logger.error('Error updating section:', error);
      throw error;
    }
  }

  /**
   * Xóa section sử dụng plugin local_sectionapi
   */
  async deleteSectionWithPlugin(sectionId, forceDelete = false) {
    try {
      const result = await this.callWebService('local_sectionapi_delete_section', {
        sectionid: sectionId,
        forcedelete: forceDelete
      });

      if (result && result.success) {
        logger.info(`Section deleted successfully: ${sectionId}`);
        return result;
      } else {
        logger.warn(`Failed to delete section ${sectionId}: ${result.message}`);
        return result;
      }
    } catch (error) {
      logger.error('Error deleting section:', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách tất cả sections trong course
   */
  async getCourseSectionsWithPlugin(courseId) {
    try {
      const result = await this.callWebService('local_sectionapi_get_course_sections', {
        courseid: courseId
      });

      if (Array.isArray(result)) {
        logger.info(`Retrieved ${result.length} sections for course ${courseId}`);
        return result;
      } else {
        throw new Error('Failed to get course sections');
      }
    } catch (error) {
      logger.error('Error getting course sections:', error);
      throw error;
    }
  }

  // ==================== QUESTION API PLUGIN ====================

  /**
   * Tạo câu hỏi mới sử dụng plugin local_questionapi
   * @param {number} courseId - ID của course
   * @param {object} questionData - Dữ liệu câu hỏi
   * @returns {object} Thông tin câu hỏi đã tạo
   */
  async createQuestionWithPlugin(courseId, questionData) {
    try {
      logger.info(`Creating question with plugin for course ${courseId}: ${questionData.name}`);

      const result = await this.callWebService('local_questionapi_create_question', {
        courseid: courseId,
        categoryid: questionData.categoryid || 0,
        questiontype: questionData.questiontype || 'multichoice',
        name: questionData.name,
        questiontext: questionData.questiontext,
        defaultmark: questionData.defaultmark || 1.0,
        answers: JSON.stringify(questionData.answers || [])
      });

      if (result && result.questionid) {
        logger.info(`Question created successfully: ${result.name} (ID: ${result.questionid})`);
        return {
          questionid: result.questionid,
          courseid: result.courseid,
          categoryid: result.categoryid,
          name: result.name,
          questiontype: result.questiontype,
          message: result.message
        };
      } else {
        throw new Error('Failed to create question - no question ID returned');
      }
    } catch (error) {
      logger.error('Error creating question with plugin:', {
        courseId,
        questionName: questionData.name,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Thêm câu hỏi vào quiz
   */
  async addQuestionToQuizWithPlugin(quizId, questionId, page = 1, maxmark = 1.0) {
    try {
      logger.info(`Adding question ${questionId} to quiz ${quizId}`);

      const result = await this.callWebService('local_questionapi_add_question_to_quiz', {
        quizid: quizId,
        questionid: questionId,
        page: page,
        maxmark: maxmark
      });

      if (result && result.success) {
        logger.info(`Question added to quiz successfully`);
        return result;
      } else {
        throw new Error('Failed to add question to quiz');
      }
    } catch (error) {
      logger.error('Error adding question to quiz:', error);
      throw error;
    }
  }

  /**
   * Xóa quiz trong course
   * @param {number} quizId - ID của quiz (cmid)
   * @returns {boolean} Thành công hay không
   */
  async deleteQuiz(quizId) {
    try {
      // Sử dụng core_course_delete_modules để xóa module quiz
      await this.callWebService('core_course_delete_modules', {
        'cmids[0]': quizId
      });

      logger.info(`✓ Quiz deleted successfully: ID ${quizId}`);
      return true;
    } catch (error) {
      logger.error(`✗ Error deleting quiz ${quizId}:`, error);
      throw error;
    }
  }

  /**
   * Lấy danh sách tất cả quiz trong course
   * @param {number} courseId - Course ID
   * @returns {array} Danh sách quiz modules
   */
  async getCourseQuizzes(courseId) {
    try {
      const contents = await this.getCourseContents(courseId);

      const quizzes = [];
      contents.forEach(section => {
        if (section.modules && section.modules.length > 0) {
          section.modules.forEach(module => {
            if (module.modname === 'quiz') {
              quizzes.push({
                id: module.id, // cmid
                instance: module.instance, // quiz id
                name: module.name,
                section: section.section,
                sectionName: section.name
              });
            }
          });
        }
      });

      logger.info(`Found ${quizzes.length} quizzes in course ${courseId}`);
      return quizzes;
    } catch (error) {
      logger.error(`Error getting quizzes for course ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Xóa tất cả quiz trong course
   * @param {number} courseId - Course ID
   * @returns {object} Kết quả xóa
   */
  async deleteAllQuizzesInCourse(courseId) {
    try {
      const quizzes = await this.getCourseQuizzes(courseId);

      if (quizzes.length === 0) {
        logger.info(`No quizzes found in course ${courseId}`);
        return {
          success: true,
          message: 'No quizzes to delete',
          deletedCount: 0
        };
      }

      let deletedCount = 0;
      const errors = [];

      for (const quiz of quizzes) {
        try {
          await this.deleteQuiz(quiz.id);
          deletedCount++;
          logger.info(`✓ Deleted quiz "${quiz.name}" (ID: ${quiz.id}) from course ${courseId}`);
        } catch (error) {
          errors.push({
            quizId: quiz.id,
            quizName: quiz.name,
            error: error.message
          });
          logger.error(`✗ Failed to delete quiz "${quiz.name}" (ID: ${quiz.id}):`, error);
        }
      }

      return {
        success: errors.length === 0,
        totalQuizzes: quizzes.length,
        deletedCount,
        errorsCount: errors.length,
        errors: errors.slice(0, 10) // Giới hạn số lỗi trả về
      };
    } catch (error) {
      logger.error(`Error deleting all quizzes in course ${courseId}:`, error);
      throw error;
    }
  }
}
export default new MoodleService();