import sql from "mssql";
import config from "../config/index.js";
import { logger, syncLogger } from "../utils/logger.js";

class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }
  //DONE 
  // Health check endpoint
  async checkConnection() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const result = await this.executeQuery("SELECT 1 as test");
      return result.recordset.length > 0;
    } catch (error) {
      logger.error("Database connection check failed:", error);
      return false;
    }
  }

  // DONE
  // Kết nối database SQLServer
  async connect() {
    try {
      if (this.pool) {
        await this.pool.close();
      }

      this.pool = await sql.connect(config.sqlServer);
      this.isConnected = true;
      logger.info("Connected to SQL Server successfully");

      return this.pool;
    } catch (error) {
      this.isConnected = false;
      logger.error("Failed to connect to SQL Server:", error);
      throw error;
    }
  }

  // DONE
  // Ngắt kết nối khi không chạy
  async disconnect() {
    try {
      if (this.pool) {
        await this.pool.close();
        this.pool = null;
        this.isConnected = false;
        logger.info("Disconnected from SQL Server");
      }
    } catch (error) {
      logger.error("Error disconnecting from SQL Server:", error);
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
      Object.keys(parameters).forEach((key) => {
        request.input(key, parameters[key]);
      });

      const result = await request.query(query);
      return result;
    } catch (error) {
      logger.error("Error executing query:", error);
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
                    sv.NgayCapNhat AS DateUpdateSV,
                    lhoc.TenLopHoc
                    FROMbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
                    INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
                    INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
                    INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
                    INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
                    WHERE sv.email LIKE '%70@st%' 
                  `;
      const parameters = {};
      if (lastSyncDate) {
        query += " AND sv.NgayCapN dhat > @lastSyncDate";
        parameters.lastSyncDate = lastSyncDate;
      }
      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error("Error getting students:", error);
      throw error;
    }
  }

  // Danh sách Categories, danh sách các bộ môn, khoa
  // DONE
  async getCategory(lastSyncDate = null) {
    try {
      let query = `
       SELECT * FROM TMP_DsBoMonKhoa
      `;

      const parameters = {};

      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error("Error getting students:", error);
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
        query += " AND updated_at > @lastSyncDate";
        parameters.lastSyncDate = lastSyncDate;
      }

      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error("Error getting students:", error);
      throw error;
    }
  }

  // Lấy danh sách khóa học
  // DONE
  async getCourses(lastSyncDate = null) {
    try {
      
      let query2 = `
        SELECT mh.TenMonHoc,lhoc.TenLopHoc, d.TenDot, lhp.Id AS IDLopHocPhan, mh.IDToBoMon, lhoc.NgayCapNhat, mh.SoTietThucHanh, mh.SoTietLyThuyet,
        lhp.MaLopHocPhan
        FROM dbo.TKB_MonHoc AS mh
        INNER JOIN dbo.TKB_LopHoc as lhoc ON lhoc.Id = mh.IDLopHoc
        INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
        INNER JOIN  dbo.TKB_LopHocPhan as lhp ON lhp.IDMonHoc= mh.ID
        WHERE lhoc.TenLopHoc LIKE '70%'
`;
      const parameters = {};
      if (lastSyncDate) {
        query2 += `
          AND lhoc.NgayCapNhat > @lastSyncDate
        `;
        parameters.lastSyncDate = lastSyncDate;
      }

      const result = await this.executeQuery(query2, parameters);
      return result.recordset;
    } catch (error) {
      logger.error("Error getting courses:", error);
      throw error;
    }
  }

  // Lấy danh sách giảng Viên
  // Done
  async getTeachers(lastSyncDate = null) {
    try {
      let query = `
        SELECT DISTINCT 
        gv.MaGiangVien AS MaNhanSu, gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien, gv.Email,gv.Ten,gv.NgayCapNhat AS DateUpdateTeacher,gv.HoDem,
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

      if (lastSyncDate) {
        query += "WHERE gv.NgayCapNhat > @lastSyncDate";
        parameters.lastSyncDate = lastSyncDate;
      }
      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error("Error getting teachers from HRM_NUCE:", error);
      throw error;
    }
  }

  // Lấy danh sách đăng ký khóa học
  // DONE
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
        WHERE dkhp.IDTrangThaiDangKy IN (1,2,3) AND lhoc.TenLopHoc LIKE '%70%'
      `;
      const parameters = {};
      if (courseId) {
        query += "AND lhp.MaLopHocPhan = @courseId";
        parameters.courseId = courseId;
      }
      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error("Error getting course enrollments:", error);
      throw error;
    }
  }

  async getTeacherCourseEnrollments(courseId = null, lastSyncDate = null) {
    try {
      let query = `
       SELECT DISTINCT lhp.MaLopHocPhan, lhoc.TenLopHoc, mh.TenMonHoc,
       gv.MaGiangVien, gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien, gv.Email, lhgv.IsTroGiang
        FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
        INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
        INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
        INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
        INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
        INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
        INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
        INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
        WHERE lhoc.TenLopHoc LIKE '70%'
      `;
      const parameters = {};
      if (courseId) {
        query += " AND lhp.MaLopHocPhan = @courseId";
        parameters.courseId = courseId;
      }
      if (lastSyncDate) {
        query += " AND gv.NgayCapNhat > @lastSyncDate";
        parameters.lastSyncDate = lastSyncDate;
      }
      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error("Error getting teacher course enrollments:", error);
      throw error;
    }
  }

  async getGrades(lastSyncDate = null) {
    try {
      let query = `SELECT kq.IDSinhVien, 
                    sv.MaSinhVien,
                    sv.HoDem + ' '+sv.Ten as HoVaTen,
                    kq.Id AS IDKetQuaHocTap, 
                    kq.DiemTongKet, mh.TenMonHoc, 
                    mh.MaMonHoc, 
                    mh.Id AS IDMonHoc,
                    lh.TenLopHoc, 
                    lhp.Id AS IdLopHocPhan,
                    lhp.MaLopHocPhan,
                    kq.NgayCapNhat
                  FROM dbo.TKB_LopHocPhan AS lhp 
                  INNER JOIN dbo.DT_DangKyHocPhan AS dk ON lhp.Id = dk.IDLopHocPhan 
                  INNER JOIN dbo.TKB_MonHoc AS mh ON lhp.IDMonHoc = mh.Id 
                  INNER JOIN dbo.TKB_LopHoc AS lh ON mh.IDLopHoc = lh.Id 
                  INNER JOIN dbo.DT_KetQuaHocTapMonHoc AS kq ON kq.IDLopHocPhan = lhp.Id AND kq.IDSinhVien = dk.IDSinhVien
                  INNER JOIN dbo.DT_SinhVien AS sv ON kq.IDSinhVien = sv.Id
                  WHERE (dk.IDTrangThaiDangKy IN (1, 2, 3)) AND lh.TenLopHoc LIKE '70'
`;
      const parameters = {};

      if (lastSyncDate) {
        query += " AND gv.NgayCapNhat > @lastSyncDate";
        parameters.lastSyncDate = lastSyncDate;
      }
      const result = await this.executeQuery(query, parameters);
      return result.recordset;
    } catch (error) {
      logger.error("Error getting teachers from HRM_NUCE:", error);
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
           SELECT kq.IDSinhVien, 
	sv.MaSinhVien,
	sv.HoDem + ' '+sv.Ten as HoVaTen,
	kq.Id AS IDKetQuaHocTap, 
	kq.DiemTongKet, mh.TenMonHoc, 
	mh.MaMonHoc, 
	mh.Id AS IDMonHoc,
	lh.TenLopHoc, 
	lhp.Id AS IdLopHocPhan,
	kq.NgayCapNhat
FROM dbo.TKB_LopHocPhan AS lhp 
INNER JOIN dbo.DT_DangKyHocPhan AS dk ON lhp.Id = dk.IDLopHocPhan 
INNER JOIN dbo.TKB_MonHoc AS mh ON lhp.IDMonHoc = mh.Id 
INNER JOIN dbo.TKB_LopHoc AS lh ON mh.IDLopHoc = lh.Id 
INNER JOIN dbo.DT_KetQuaHocTapMonHoc AS kq ON kq.IDLopHocPhan = lhp.Id AND kq.IDSinhVien = dk.IDSinhVien
INNER JOIN dbo.DT_SinhVien AS sv ON kq.IDSinhVien = sv.Id
WHERE (dk.IDTrangThaiDangKy IN (1, 2, 3)) AND lh.TenLopHoc LIKE '66CS2'
          `;

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
      logger.error("Error updating grades:", error);
      throw error;
    }
  }

  // Kiểm tra kết nối
}

export default new DatabaseService();
