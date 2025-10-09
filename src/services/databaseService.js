import sql from 'mssql';
import config from '../config/index.js';
import { logger, syncLogger } from '../utils/logger.js';

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }
  // DONE
  async connect() {
    try {
      if (this.pool) {
        await this.pool.close();
      }

      this.pool = await sql.connect(config.sqlServer);
      this.isConnected = true;
      logger.info('Connected to SQL Server successfully');

      return this.pool;
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to SQL Server:', error);
      throw error;
    }
  }

  // DONE
  async disconnect() {
    try {
      if (this.pool) {
        await this.pool.close();
        this.pool = null;
        this.isConnected = false;
        logger.info('Disconnected from SQL Server');
      }
    } catch (error) {
      logger.error('Error disconnecting from SQL Server:', error);
      throw error;
    }
  }

  // DONE
  async executeQuery(query, parameters = {}) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const request = this.pool.request();

      // Add parameters to request
      Object.keys(parameters).forEach(key => {
        request.input(key, parameters[key]);
      });

      const result = await request.query(query);
      return result;
    } catch (error) {
      logger.error('Error executing query:', error);
      throw error;
    }
  }

  // DONE
  // Lấy danh sách sinh viên
  async getStudents(lastSyncDate = null) {
    try {
      let query = `SELECT DISTINCT
    sv.MaSinhVien,
    sv.HoDem,
    sv.Ten,
    sv.NguyenQuan,
    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
    sv.Email,
	sv.NgayCapNhat,
    lhoc.TenLopHoc
    FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
    INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
    INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
    INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
    INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
    WHERE lhoc.TenLopHoc LIKE '%66CS2%' `
      const parameters = {};

      if (lastSyncDate) {
        query += ' AND NgayCapNhat > @lastSyncDate';
        parameters.lastSyncDate = lastSyncDate;
      }

      // query += ' ORDER BY NgayCapNhat DESC';

      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting students:', error);
      throw error;
    }
  }

  // DONE
  // Danh sách Categories
  async getCategory(lastSyncDate = null) {
    try {
      let query = `
       SELECT * FROM TMP_DsBoMonKhoa
      `;

      const parameters = {};

      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting students:', error);
      throw error;
    }
  }

  // DONE
  // Test
  async getOneStudents(lastSyncDate = null) {
    try {
      let query = `
      SELECT TOP 10 
        *
      FROM DT_SinhVien;

      `;
      const parameters = {};

      if (lastSyncDate) {
        query += ' AND updated_at > @lastSyncDate';
        parameters.lastSyncDate = lastSyncDate;
      }

      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting students:', error);
      throw error;
    }
  }

  // Lấy danh sách khóa học
  async getCourses(lastSyncDate = null) {
    try {
      let query = `
SELECT
    lhp.Id AS IDLopHocPhan,
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    mh.IDLoaiMonHoc,
    mh.SoTietThucHanh,
    mh.SoTietLyThuyet,
    lhoc.TenLopHoc,
    lhoc.MaLopHoc,
    d.TenDot,
    mh.IDToBoMon,
    MAX(lhoc.NgayCapNhat) AS NgayCapNhatLopHoc,
    MAX(dkhp.NgayCapNhat) AS NgayCapNhatDangKyHocPhan,
    COUNT(dkhp.IDSinhVien) AS SoLuongSinhVien,
    CASE
        WHEN mh.SoTietThucHanh > mh.SoTietLyThuyet THEN N'Lớp đồ án'
        ELSE N'Lớp lý thuyết'
    END AS LoaiLopHoc,
    bm.TenBoMon,
    bm.TenPhongBan
    FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
    INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
    INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
    INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
    INNER JOIN dbo.TMP_DsBoMonKhoa bm WITH (NOLOCK) ON mh.IDToBoMon = bm.IDBoMon
    LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) 
        ON dkhp.IDLopHocPhan = lhp.Id
        AND dkhp.IDTrangThaiDangKy IN (1,2,3)
    WHERE lhp.IsXepLich = 1 
      AND lhoc.TenLopHoc LIKE '%66CS2%'
`;

      const parameters = {};

      if (lastSyncDate) {
        query += `
        AND (
            lhoc.NgayCapNhat > @lastSyncDate 
            OR dkhp.NgayCapNhat > @lastSyncDate
        )`;
        parameters.lastSyncDate = lastSyncDate;
      }

      query += `
      GROUP BY 
        lhp.Id, lhp.MaLopHocPhan, mh.TenMonHoc, lhoc.TenLopHoc, 
        lhoc.MaLopHoc, mh.IDLoaiMonHoc, d.TenDot, 
        mh.SoTietThucHanh, mh.SoTietLyThuyet, mh.IDToBoMon, 
        bm.TenBoMon, bm.TenPhongBan
      ORDER BY lhoc.TenLopHoc, lhp.MaLopHocPhan;
      `;


      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting courses:', error);
      throw error;
    }
  }

  // GiangVien
  async getTeachers(lastSyncDate = null) {
    try {
      // let query = `
      //    SELECT Top 3 * FROM NS_NhanSu
      // `;

      let query = `SELECT DISTINCT 
       gv.MaGiangVien AS MaNhanSu, gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien, gv.Email,gv.Ten,gv.NgayCapNhat,gv.HoDem,
       CASE WHEN lhgv.IsTroGiang = 1 THEN 'Trợ giảng' ELSE 'Giảng viên chính' END AS VaiTro
        FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
        INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
        INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
        INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
        INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
        INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
        INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
        INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
        WHERE lhoc.TenLopHoc LIKE '%66CS2%'
`
      const parameters = {};

      if (lastSyncDate) {
        query += ' AND NgayCapNhat > @lastSyncDate';
        parameters.lastSyncDate = lastSyncDate;
      }

      // query += ' ORDER BY NgayCapNhat DESC';

      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting teachers from HRM_NUCE:', error);
      throw error;
    }
  }

  // Lấy danh sách đăng ký khóa học
  async getStudentCourseEnrollments(courseId = null) {
    try {
      let query = `
       SELECT DISTINCT
    lhp.MaLopHocPhan,
	  lhoc.TenLopHoc,
    mh.TenMonHoc,
    sv.MaSinhVien,
    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
    sv.Email
    FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
    INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
    INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
    INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
    INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
    WHERE dkhp.IDTrangThaiDangKy IN (1,2,3)
      `;
      const parameters = {};
      if (courseId) {
        query += 'AND lhp.id = @courseId';
        parameters.courseId = courseId;
      }
      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting course enrollments:', error);
      throw error;
    }
  }

  async getTeacherCourseEnrollments(courseId = null) {
    try {
      let query = `
       SELECT DISTINCT lhp.MaLopHocPhan, lhoc.TenLopHoc, mh.TenMonHoc,
       gv.MaGiangVien, gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien, gv.Email,
       CASE WHEN lhgv.IsTroGiang = 1 THEN 'Trợ giảng' ELSE 'Giảng viên chính' END AS VaiTro
        FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
        INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
        INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
        INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
        INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
        INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
        INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
        INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
      `;
      const parameters = {};
      if (courseId) {
        query += 'WHERE lhp.id= @courseId';
        parameters.courseId = courseId;
      }
      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error('Error getting course enrollments:', error);
      throw error;
    }
  }

  // Cập nhật điểm từ Moodle
  async updateGrades(grades) {
    try {
      const transaction = new sql.Transaction(this.pool);
      await transaction.begin();

      try {
        for (const grade of grades) {
          const request = new sql.Request(transaction);

          const query = `
            MERGE Grades AS target
            USING (VALUES (@student_id, @course_id, @assignment_name, @grade, @max_grade, @grade_date, @moodle_grade_id)) 
            AS source (student_id, course_id, assignment_name, grade, max_grade, grade_date, moodle_grade_id)
            ON target.student_id = source.student_id 
               AND target.course_id = source.course_id 
               AND target.assignment_name = source.assignment_name
            WHEN MATCHED THEN
              UPDATE SET 
                grade = source.grade,
                max_grade = source.max_grade,
                grade_date = source.grade_date,
                moodle_grade_id = source.moodle_grade_id,
                updated_at = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (student_id, course_id, assignment_name, grade, max_grade, grade_date, moodle_grade_id, created_at, updated_at)
              VALUES (source.student_id, source.course_id, source.assignment_name, source.grade, source.max_grade, source.grade_date, source.moodle_grade_id, GETDATE(), GETDATE());
          `;
          request.input('student_id', sql.Int, grade.student_id);
          request.input('course_id', sql.Int, grade.course_id);
          request.input('assignment_name', sql.NVarChar, grade.assignment_name);
          request.input('grade', sql.Decimal(5, 2), grade.grade);
          request.input('max_grade', sql.Decimal(5, 2), grade.max_grade);
          request.input('grade_date', sql.DateTime, grade.grade_date);
          request.input('moodle_grade_id', sql.Int, grade.moodle_grade_id);

          await request.query(query);
        }

        await transaction.commit();
        logger.info(`Updated ${grades.length} grades successfully`);
        return { success: true, count: grades.length };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error updating grades:', error);
      throw error;
    }
  }

  // Kiểm tra kết nối
  async checkConnection() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const result = await this.executeQuery('SELECT 1 as test');
      return result.recordset.length > 0;
    } catch (error) {
      logger.error('Database connection check failed:', error);
      return false;
    }
  }
}

export default new DatabaseService();