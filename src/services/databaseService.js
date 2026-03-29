import sql from "mssql";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config/index.js";
import { logger, syncLogger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      let query = `SELECT DISTINCT sv.MaSinhVien,
                    sv.HoDem,
                    sv.Ten,
                    sv.NguyenQuan,
                    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
                    sv.Email,
                    sv.NgayCapNhat AS DateUpdateSV
                    FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
                    INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
                    INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
                    INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
                    INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
                    INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
                    WHERE sv.MaSinhVien LIKE '017731' AND d.TenDot LIKE '%HK2 2025-2026%'
                    
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
        WHERE lhoc.TenLopHoc LIKE '67%'  AND d.TenDot LIKE '%HK2 2025-2026%'
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
          INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
          WHERE dkhp.IDTrangThaiDangKy IN (1,2,3) AND lhoc.TenLopHoc LIKE '%67%' AND d.TenDot LIKE '%HK2 2025-2026%'
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

  async getOneStudentCourseEnrollments(courseId = null) {
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
          INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
          WHERE dkhp.IDTrangThaiDangKy IN (1,2,3) AND d.TenDot LIKE '%HK2 2025-2026%' AND sv.MaSinhVien = '017731'
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
       INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
       WHERE lhoc.TenLopHoc LIKE '%67%' AND d.TenDot LIKE '%HK2 2025-2026%'
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

  async getTeacherCourseEnrollmentsOne(courseId = null, lastSyncDate = null) {
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
       INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
       WHERE d.TenDot LIKE '%HK2 2025-2026%' AND gv.MaGiangVien LIKE '%1017%'
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
                  WHERE (dk.IDTrangThaiDangKy IN (1, 2, 3)) AND lh.TenLopHoc LIKE '67'
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

  async exportLockedGradeAuditReport() {
    try {
        const query = `WITH LichThi AS (
      SELECT
        d.MaLopHocPhan,
        d.NgayThi,
        CONVERT(varchar(23), d.NgayThi, 121) AS NgayThiFormatted,
        ROW_NUMBER() OVER (
          PARTITION BY d.MaLopHocPhan
          ORDER BY d.NgayThi DESC
        ) AS rn
      FROM View_LichThiTrongDanhSachThiKetThuc d
      WHERE d.IDDot = 298
    ),
    CTE AS (
      SELECT 
        b.MaLopHocPhan,
        b.TenMonHoc,
        b.TenLopHoc AS LopHocPhan,
        CONVERT(varchar(23), b.NgayKetThucTienDo, 121) AS NgayKetThucHocPhan,
        lt.NgayThi,
        lt.NgayThiFormatted AS NgayThiDay,
        gv.HoDem + ' ' + gv.Ten AS GiangVienGiangDay,
        COALESCE(tbm.TenBoMon, 'Chưa gán bộ môn') AS BoMonQuanLyGiangVien,
        COALESCE(k.TenKhoa, 'Chưa gán khoa') AS KhoaQuanLyGiangVien,
        dbo.Fn_HUCEGetSiSoDangKy(b.Id, NULL) AS SiSoLopHocPhan,
        a.DaKhoaDiemKetThuc AS TrangThaiKhoaDiemKetThuc,
        CONVERT(varchar(23), a.NgayTao, 121) AS NgayKhoaDiemKetThucLanDau,
        c.HoDem + ' ' + c.Ten AS UserKhoaDiemKetThuc,
        ROW_NUMBER() OVER (
          PARTITION BY b.MaLopHocPhan
          ORDER BY a.NgayCapNhat DESC
        ) AS rn
      FROM DT_KhoaDiem a
      JOIN View_TKB_LopHocPhan b ON a.IDLopHocPhan = b.Id
      JOIN dbo.View_TKB_LopHocPhanGiangVien lhpvg WITH (NOLOCK) 
        ON lhpvg.MaLopHocPhan = b.MaLopHocPhan
        AND lhpvg.IDDot = 298
      JOIN dbo.DM_GiangVien gv WITH (NOLOCK) 
        ON gv.Id = lhpvg.IDGiangVien
      JOIN HRM_NUCE.dbo.NS_NhanSu c ON a.NguoiTao = c.IDNhanSu
      LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm 
        ON tbm.IDToBoMon = gv.IDToBoMonTmp
      LEFT JOIN View_Khoa k 
        ON k.Id = gv.IDKhoa
      LEFT JOIN LichThi lt ON lt.MaLopHocPhan = b.MaLopHocPhan AND lt.rn = 1
      LEFT JOIN View_LichThiTrongDanhSachThiKetThuc dtk ON dtk.MaLopHocPhan = b.MaLopHocPhan AND dtk.IDDot = 298
      WHERE 
        b.IDDot = 298
         AND (
           lt.NgayThi IS NULL
           OR DATEDIFF(day, lt.NgayThi, a.NgayTao) >= 14
         )
    )
    SELECT *
    FROM CTE
    WHERE rn = 1;`;

      const result = await this.executeQuery(query);
      const records = result.recordset || [];

      // Build merged-class mapping by reproducing the #tmp3 logic inline (no temp table dependency)
      const mappingQuery = `
        WITH tmp2 AS (
          SELECT a.MaMonHoc,
                 a.MaGiangVien,
                 a.IDToBoMon,
                 a.TenGiangVien,
                 a.MaLopHocPhan,
                 a.TenLopHoc,
                 a.NgayBatDau,
                 a.TuTiet,
                 a.DenTiet,
                 a.IDPhong,
                 a.IsTamNgung,
                 a.IDDot,
                 b.IDQuyUocCotDiem
          FROM [EDU_NUCE].[dbo].View_TKB_LichHocGiangVien a
          LEFT JOIN [EDU_NUCE].[dbo].View_TKB_Lophocphan b
            ON a.MaLopHocPhan = b.MaLopHocPhan AND a.IDDot = b.IDDot
          WHERE a.IDDot = 298 AND a.IsHocBu != 1
        ),
        LichTrungLap AS (
          SELECT 
            MaMonHoc,
            MaGiangVien,
            IDToBoMon,
            TenGiangVien,
            STRING_AGG(MaLopHocPhan, ',') WITHIN GROUP (ORDER BY MaLopHocPhan) AS DanhSachMaLopHocPhan,
            STRING_AGG(TenLopHoc, ',') WITHIN GROUP (ORDER BY MaLopHocPhan) AS DanhSachTenLopHoc
          FROM tmp2
          WHERE IDDot = 298 AND IsTamNgung = 0
          GROUP BY 
            MaMonHoc,
            MaGiangVien,
            IDToBoMon,
            TenGiangVien,
            NgayBatDau,
            TuTiet,
            DenTiet,
            IDPhong,
            IDQuyUocCotDiem
          HAVING COUNT(*) > 1
        )
        SELECT DanhSachMaLopHocPhan, DanhSachTenLopHoc
        FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY MaGiangVien, MaMonHoc, DanhSachMaLopHocPhan, DanhSachTenLopHoc
            ORDER BY MaMonHoc
          ) AS rn
          FROM LichTrungLap
        ) sub
        WHERE rn = 1;
      `;

      const mappingResult = await this.executeQuery(mappingQuery);

      const classMergeMap = (() => {
        if (!mappingResult || !mappingResult.recordset) return null;

        const map = new Map();
        mappingResult.recordset.forEach((row) => {
          const maList = (row.DanhSachMaLopHocPhan || "")
            .toString()
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .join(",");
          const tenList = (row.DanhSachTenLopHoc || "")
            .toString()
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .join(",");

          if (!maList) return;

          maList.split(",").forEach((ma) => {
            map.set(ma, { maList, tenList });
          });
        });

        return map.size > 0 ? map : null;
      })();

      const mergedRecords = (() => {
        if (!classMergeMap || classMergeMap.size === 0) return records;

        const grouped = new Map();

        for (const row of records) {
          const grouping = classMergeMap.get(row.MaLopHocPhan);
          const groupKey = grouping ? grouping.maList : row.MaLopHocPhan;

          if (!grouped.has(groupKey)) {
            grouped.set(groupKey, {
              baseRow: { ...row },
              maList: grouping?.maList,
              tenList: grouping?.tenList,
              teachers: new Set(),
              subjects: new Set(),
              classSizes: new Set()
            });
          }

          const entry = grouped.get(groupKey);
          if (row.GiangVienGiangDay) {
            entry.teachers.add(row.GiangVienGiangDay);
          }
          if (row.TenMonHoc) {
            entry.subjects.add(row.TenMonHoc);
          }
          if (row.SiSoLopHocPhan !== undefined && row.SiSoLopHocPhan !== null) {
            entry.classSizes.add(row.SiSoLopHocPhan);
          }
        }

        return Array.from(grouped.values()).map((entry) => ({
          ...entry.baseRow,
          MaLopHocPhan: entry.maList || entry.baseRow.MaLopHocPhan,
          LopHocPhan: entry.tenList || entry.baseRow.LopHocPhan,
          GiangVienGiangDay: Array.from(entry.teachers).join(", ") || entry.baseRow.GiangVienGiangDay,
          TenMonHoc: Array.from(entry.subjects).join(", ") || entry.baseRow.TenMonHoc,
          SiSoLopHocPhan: Array.from(entry.classSizes).join(", ") || entry.baseRow.SiSoLopHocPhan
        }));
      })();

      const reportsDir = path.join(__dirname, "../../logs/reports");
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filePath = path.join(
        reportsDir,
        `locked_grade_audit_${timestamp}.xlsx`
      );

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Report");

      const columns = mergedRecords.length > 0
        ? Object.keys(mergedRecords[0]).map((key) => ({
            header: key,
            key,
            width: Math.max(String(key).length + 2, 18)
          }))
        : [];

      sheet.columns = [{ header: "No", key: "__idx", width: 6 }, ...columns];

      mergedRecords.forEach((row, index) => {
        sheet.addRow({ __idx: index + 1, ...row });
      });

      if (sheet.rowCount === 0) {
        sheet.addRow({ __idx: 0 });
      }

      await workbook.xlsx.writeFile(filePath);
      logger.info(`Locked grade audit report saved to ${filePath}`);

      return {
        filePath,
        count: mergedRecords.length
      };
    } catch (error) {
      logger.error("Error exporting locked grade audit report:", error);
      throw error;
    }
  }

  async exportLockedGradeAuditReportNoMerge() {
    try {
        const query = `WITH LichThi AS (
      SELECT
        d.MaLopHocPhan,
        d.NgayThi,
        CONVERT(varchar(23), d.NgayThi, 121) AS NgayThiFormatted,
        ROW_NUMBER() OVER (
          PARTITION BY d.MaLopHocPhan
          ORDER BY d.NgayThi DESC
        ) AS rn
      FROM View_LichThiTrongDanhSachThiKetThuc d
      WHERE d.IDDot = 298
    ),
    CTE AS (
      SELECT 
        b.MaLopHocPhan,
        b.TenMonHoc,
        b.TenLopHoc AS LopHocPhan,
        CONVERT(varchar(23), b.NgayKetThucTienDo, 121) AS NgayKetThucHocPhan,
        lt.NgayThi,
        lt.NgayThiFormatted AS NgayThiDay,
        gv.HoDem + ' ' + gv.Ten AS GiangVienGiangDay,
        COALESCE(tbm.TenBoMon, 'Chưa gán bộ môn') AS BoMonQuanLyGiangVien,
        COALESCE(k.TenKhoa, 'Chưa gán khoa') AS KhoaQuanLyGiangVien,
        dbo.Fn_HUCEGetSiSoDangKy(b.Id, NULL) AS SiSoLopHocPhan,
        a.DaKhoaDiemKetThuc AS TrangThaiKhoaDiemKetThuc,
        CONVERT(varchar(23), a.NgayTao, 121) AS NgayKhoaDiemKetThucLanDau,
        c.HoDem + ' ' + c.Ten AS UserKhoaDiemKetThuc,
        ROW_NUMBER() OVER (
          PARTITION BY b.MaLopHocPhan
          ORDER BY a.NgayCapNhat DESC
        ) AS rn
      FROM DT_KhoaDiem a
      JOIN View_TKB_LopHocPhan b ON a.IDLopHocPhan = b.Id
      JOIN dbo.View_TKB_LopHocPhanGiangVien lhpvg WITH (NOLOCK) 
        ON lhpvg.MaLopHocPhan = b.MaLopHocPhan
        AND lhpvg.IDDot = 298
      JOIN dbo.DM_GiangVien gv WITH (NOLOCK) 
        ON gv.Id = lhpvg.IDGiangVien
      JOIN HRM_NUCE.dbo.NS_NhanSu c ON a.NguoiTao = c.IDNhanSu
      LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm 
        ON tbm.IDToBoMon = gv.IDToBoMonTmp
      LEFT JOIN View_Khoa k 
        ON k.Id = gv.IDKhoa
      LEFT JOIN LichThi lt ON lt.MaLopHocPhan = b.MaLopHocPhan AND lt.rn = 1
      LEFT JOIN View_LichThiTrongDanhSachThiKetThuc dtk ON dtk.MaLopHocPhan = b.MaLopHocPhan AND dtk.IDDot = 298
      WHERE 
        b.IDDot = 298
         AND (
           lt.NgayThi IS NULL
           OR DATEDIFF(day, lt.NgayThi, a.NgayTao) >= 14
         )
    )
    SELECT *
    FROM CTE
    WHERE rn = 1;`;

      const result = await this.executeQuery(query);
      const records = result.recordset || [];

      // Move NopMuon to the end of each row for clearer Excel ordering
      const orderedRecords = records.map((row) => {
        if (!row || !Object.prototype.hasOwnProperty.call(row, "NopMuon")) {
          return row;
        }

        const { NopMuon, ...rest } = row;
        return { ...rest, NopMuon };
      });

      const reportsDir = path.join(__dirname, "../../logs/reports");
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filePath = path.join(
        reportsDir,
        `locked_grade_audit_nomerge_${timestamp}.xlsx`
      );

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("ReportNoMerge");

      const columns = records.length > 0
        ? Object.keys(records[0]).map((key) => ({
            header: key,
            key,
            width: Math.max(String(key).length + 2, 18)
          }))
        : [];

      sheet.columns = [{ header: "No", key: "__idx", width: 6 }, ...columns];

      records.forEach((row, index) => {
        sheet.addRow({ __idx: index + 1, ...row });
      });

      if (sheet.rowCount === 0) {
        sheet.addRow({ __idx: 0 });
      }

      await workbook.xlsx.writeFile(filePath);
      logger.info(`Locked grade audit no-merge report saved to ${filePath}`);

      return {
        filePath,
        count: records.length
      };
    } catch (error) {
      logger.error("Error exporting locked grade audit report (no merge):", error);
      throw error;
    }
  }

  async exportLockedGradeAuditReportLate() {
    try {
        const query = `WITH LichThi AS (
      SELECT
        d.MaLopHocPhan,
        d.NgayThi,
        CONVERT(varchar(23), d.NgayThi, 121) AS NgayThiFormatted,
        ROW_NUMBER() OVER (
          PARTITION BY d.MaLopHocPhan
          ORDER BY d.NgayThi DESC
        ) AS rn
      FROM View_LichThiTrongDanhSachThiKetThuc d
      WHERE d.IDDot = 298
    ),
    CTE AS (
      SELECT 
        b.MaLopHocPhan,
        b.TenMonHoc,
        b.TenLopHoc AS LopHocPhan,
        CONVERT(varchar(23), b.NgayKetThucTienDo, 121) AS NgayKetThucHocPhan,
        lt.NgayThi,
        lt.NgayThiFormatted AS NgayThiDay,
        gv.HoDem + ' ' + gv.Ten AS GiangVienGiangDay,
        COALESCE(tbm.TenBoMon, 'Chưa gán bộ môn') AS BoMonQuanLyGiangVien,
        COALESCE(k.TenKhoa, 'Chưa gán khoa') AS KhoaQuanLyGiangVien,
        dbo.Fn_HUCEGetSiSoDangKy(b.Id, NULL) AS SiSoLopHocPhan,
        CASE 
          WHEN lt.NgayThi IS NULL THEN 1
          WHEN DATEDIFF(day, lt.NgayThi, a.NgayTao) >= 14 THEN 1
          ELSE 0
        END AS NopMuon,
        a.DaKhoaDiemKetThuc AS TrangThaiKhoaDiemKetThuc,
        CONVERT(varchar(23), a.NgayTao, 121) AS NgayKhoaDiemKetThucLanDau,
        c.HoDem + ' ' + c.Ten AS UserKhoaDiemKetThuc,
        CONVERT(varchar(23), a.NgayCapNhat, 121) AS NgayCapNhat,
        CONVERT(varchar(23), a.NgayTao, 121) AS NgayTao,
        ROW_NUMBER() OVER (
          PARTITION BY b.MaLopHocPhan
          ORDER BY a.NgayCapNhat DESC
        ) AS rn
      FROM DT_KhoaDiem a
      JOIN View_TKB_LopHocPhan b ON a.IDLopHocPhan = b.Id
      JOIN dbo.View_TKB_LopHocPhanGiangVien lhpvg WITH (NOLOCK) 
        ON lhpvg.MaLopHocPhan = b.MaLopHocPhan
        AND lhpvg.IDDot = 298
      JOIN dbo.DM_GiangVien gv WITH (NOLOCK) 
        ON gv.Id = lhpvg.IDGiangVien
      JOIN HRM_NUCE.dbo.NS_NhanSu c ON a.NguoiTao = c.IDNhanSu
      LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm 
        ON tbm.IDToBoMon = gv.IDToBoMonTmp
      LEFT JOIN View_Khoa k 
        ON k.Id = gv.IDKhoa
      LEFT JOIN LichThi lt ON lt.MaLopHocPhan = b.MaLopHocPhan AND lt.rn = 1
      LEFT JOIN View_LichThiTrongDanhSachThiKetThuc dtk ON dtk.MaLopHocPhan = b.MaLopHocPhan AND dtk.IDDot = 298
      WHERE 
        b.IDDot = 298
    )
    SELECT *
    FROM CTE
    WHERE rn = 1;`;

      const result = await this.executeQuery(query);
      const records = result.recordset || [];

      // Build merged-class mapping by reproducing the #tmp3 logic inline (no temp table dependency)
      const mappingQuery = `
        WITH tmp2 AS (
          SELECT a.MaMonHoc,
                 a.MaGiangVien,
                 a.IDToBoMon,
                 a.TenGiangVien,
                 a.MaLopHocPhan,
                 a.TenLopHoc,
                 a.NgayBatDau,
                 a.TuTiet,
                 a.DenTiet,
                 a.IDPhong,
                 a.IsTamNgung,
                 a.IDDot,
                 b.IDQuyUocCotDiem
          FROM [EDU_NUCE].[dbo].View_TKB_LichHocGiangVien a
          LEFT JOIN [EDU_NUCE].[dbo].View_TKB_Lophocphan b
            ON a.MaLopHocPhan = b.MaLopHocPhan AND a.IDDot = b.IDDot
          WHERE a.IDDot = 298 AND a.IsHocBu != 1
        ),
        LichTrungLap AS (
          SELECT 
            MaMonHoc,
            MaGiangVien,
            IDToBoMon,
            TenGiangVien,
            STRING_AGG(MaLopHocPhan, ',') WITHIN GROUP (ORDER BY MaLopHocPhan) AS DanhSachMaLopHocPhan,
            STRING_AGG(TenLopHoc, ',') WITHIN GROUP (ORDER BY MaLopHocPhan) AS DanhSachTenLopHoc
          FROM tmp2
          WHERE IDDot = 298 AND IsTamNgung = 0
          GROUP BY 
            MaMonHoc,
            MaGiangVien,
            IDToBoMon,
            TenGiangVien,
            NgayBatDau,
            TuTiet,
            DenTiet,
            IDPhong,
            IDQuyUocCotDiem
          HAVING COUNT(*) > 1
        )
        SELECT DanhSachMaLopHocPhan, DanhSachTenLopHoc
        FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY MaGiangVien, MaMonHoc, DanhSachMaLopHocPhan, DanhSachTenLopHoc
            ORDER BY MaMonHoc
          ) AS rn
          FROM LichTrungLap
        ) sub
        WHERE rn = 1;
      `;

      const mappingResult = await this.executeQuery(mappingQuery);

      const classMergeMap = (() => {
        if (!mappingResult || !mappingResult.recordset) return null;

        const map = new Map();
        mappingResult.recordset.forEach((row) => {
          const maList = (row.DanhSachMaLopHocPhan || "")
            .toString()
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .join(",");
          const tenList = (row.DanhSachTenLopHoc || "")
            .toString()
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .join(",");

          if (!maList) return;

          maList.split(",").forEach((ma) => {
            map.set(ma, { maList, tenList });
          });
        });

        return map.size > 0 ? map : null;
      })();

      const mergedRecords = (() => {
        if (!classMergeMap || classMergeMap.size === 0) return records;

        const grouped = new Map();

        for (const row of records) {
          const grouping = classMergeMap.get(row.MaLopHocPhan);
          const groupKey = grouping ? grouping.maList : row.MaLopHocPhan;

          if (!grouped.has(groupKey)) {
            grouped.set(groupKey, {
              baseRow: { ...row },
              maList: grouping?.maList,
              tenList: grouping?.tenList,
              teachers: new Set(),
              subjects: new Set(),
              classSizes: new Set(),
              lateFlags: new Set()
            });
          }

          const entry = grouped.get(groupKey);
          if (row.GiangVienGiangDay) {
            entry.teachers.add(row.GiangVienGiangDay);
          }
          if (row.TenMonHoc) {
            entry.subjects.add(row.TenMonHoc);
          }
          if (row.SiSoLopHocPhan !== undefined && row.SiSoLopHocPhan !== null) {
            entry.classSizes.add(row.SiSoLopHocPhan);
          }
          if (row.NopMuon !== undefined && row.NopMuon !== null) {
            entry.lateFlags.add(row.NopMuon ? 1 : 0);
          }
        }

        return Array.from(grouped.values()).map((entry) => {
          const base = { ...entry.baseRow };
          delete base.NopMuon;

          return {
            ...base,
            MaLopHocPhan: entry.maList || entry.baseRow.MaLopHocPhan,
            LopHocPhan: entry.tenList || entry.baseRow.LopHocPhan,
            GiangVienGiangDay: Array.from(entry.teachers).join(", ") || entry.baseRow.GiangVienGiangDay,
            TenMonHoc: Array.from(entry.subjects).join(", ") || entry.baseRow.TenMonHoc,
            SiSoLopHocPhan: Array.from(entry.classSizes).join(", ") || entry.baseRow.SiSoLopHocPhan,
            NopMuon: entry.lateFlags.has(1)
          };
        });
      })();

      const reportsDir = path.join(__dirname, "../../logs/reports");
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filePath = path.join(
        reportsDir,
        `locked_grade_audit_late_${timestamp}.xlsx`
      );

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("ReportLate");

      const columns = mergedRecords.length > 0
        ? Object.keys(mergedRecords[0]).map((key) => ({
            header: key,
            key,
            width: Math.max(String(key).length + 2, 18)
          }))
        : [];

      sheet.columns = [{ header: "No", key: "__idx", width: 6 }, ...columns];

      mergedRecords.forEach((row, index) => {
        sheet.addRow({ __idx: index + 1, ...row });
      });

      if (sheet.rowCount === 0) {
        sheet.addRow({ __idx: 0 });
      }

      await workbook.xlsx.writeFile(filePath);
      logger.info(`Locked grade audit late report saved to ${filePath}`);

      return {
        filePath,
        count: mergedRecords.length
      };
    } catch (error) {
      logger.error("Error exporting locked grade audit late report:", error);
      throw error;
    }
  }

  async exportLockedGradeAuditReportLateNoMerge() {
    try {
        const query = `WITH LichThi AS (
      SELECT
        d.IDLopHocPhan,
        d.MaLopHocPhan,
        d.NgayThi,
        CONVERT(varchar(23), d.NgayThi, 121) AS NgayThiFormatted,
        ROW_NUMBER() OVER (
          PARTITION BY d.MaLopHocPhan
          ORDER BY d.NgayThi DESC
        ) AS rn
      FROM View_LichThiTrongDanhSachThiKetThuc d
      WHERE d.IDDot = 298
    ),

    CTE AS (
      SELECT 
        b.MaLopHocPhan,

        b.TenMonHoc,

        b.TenLopHoc AS LopHocPhan,

        CONVERT(varchar(23), b.NgayKetThucTienDo, 121)
        AS NgayKetThucHocPhan,

        lt.NgayThi,

        lt.NgayThiFormatted AS NgayThiDay,

        COALESCE(teacherAgg.GiangVienGiangDay, 'Chưa có giảng viên')
        AS GiangVienGiangDay,

        COALESCE(tbm.TenBoMon, 'Chưa gán bộ môn')
        AS BoMonQuanLyGiangVien,

        COALESCE(k.TenKhoa, 'Chưa gán khoa')
        AS KhoaQuanLyGiangVien,

        dbo.Fn_HUCEGetSiSoDangKy(b.Id, NULL)
        AS SiSoLopHocPhan,

        CASE 
          WHEN lt.NgayThi IS NULL THEN 1
          WHEN DATEDIFF(day, lt.NgayThi, a.NgayTao) >= 14 THEN 1
          ELSE 0
        END AS NopMuon,

        a.DaKhoaDiemKetThuc
        AS TrangThaiKhoaDiemKetThuc,

        CONVERT(varchar(23), a.NgayTao, 121)
        AS NgayKhoaDiemKetThucLanDau,

        ns.HoDem + ' ' + ns.Ten
        AS UserKhoaDiemKetThuc,

        CONVERT(varchar(23), a.NgayCapNhat, 121)
        AS NgayCapNhat,

        CONVERT(varchar(23), a.NgayTao, 121)
        AS NgayTao,

        ROW_NUMBER() OVER (
          PARTITION BY a.IDLopHocPhan
          ORDER BY a.NgayCapNhat DESC
        ) AS rn

    FROM DT_KhoaDiem a

    JOIN View_TKB_LopHocPhan b
        ON a.IDLopHocPhan = b.Id

    LEFT JOIN LichThi lt
        ON lt.IDLopHocPhan = a.IDLopHocPhan
        AND lt.rn = 1

    OUTER APPLY (
      SELECT
        STRING_AGG(gv.HoDem + ' ' + gv.Ten, ', ') WITHIN GROUP (ORDER BY gv.HoDem, gv.Ten) AS GiangVienGiangDay,
        MIN(gv.IDToBoMonTmp) AS IDToBoMonTmp,
        MIN(gv.IDKhoa) AS IDKhoa
      FROM dbo.View_TKB_LopHocPhanGiangVien lhpvg WITH (NOLOCK)
      JOIN dbo.DM_GiangVien gv WITH (NOLOCK)
        ON gv.Id = lhpvg.IDGiangVien
      WHERE lhpvg.MaLopHocPhan = b.MaLopHocPhan
        AND lhpvg.IDDot = 298
    ) AS teacherAgg

    LEFT JOIN HRM_NUCE.dbo.NS_NhanSu ns
        ON ns.IDNhanSu = a.NguoiTao

    LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm
      ON tbm.IDToBoMon = teacherAgg.IDToBoMonTmp

    LEFT JOIN View_Khoa k
      ON k.Id = teacherAgg.IDKhoa

    WHERE b.IDDot = 298
)

SELECT *
FROM CTE
WHERE rn = 1;`;

      const result = await this.executeQuery(query);
      const records = result.recordset || [];

      // Move NopMuon to the end of each row so the column is last in Excel
      const orderedRecords = records.map((row) => {
        if (!row || !Object.prototype.hasOwnProperty.call(row, "NopMuon")) {
          return row;
        }

        const { NopMuon, ...rest } = row;
        return { ...rest, NopMuon };
      });

      const reportsDir = path.join(__dirname, "../../logs/reports");
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filePath = path.join(
        reportsDir,
        `locked_grade_audit_late_nomerge_${timestamp}.xlsx`
      );

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("ReportLateNoMerge");

      const columns = orderedRecords.length > 0
        ? Object.keys(orderedRecords[0]).map((key) => ({
            header: key,
            key,
            width: Math.max(String(key).length + 2, 18)
          }))
        : [];

      sheet.columns = [{ header: "No", key: "__idx", width: 6 }, ...columns];

      orderedRecords.forEach((row, index) => {
        sheet.addRow({ __idx: index + 1, ...row });
      });

      if (sheet.rowCount === 0) {
        sheet.addRow({ __idx: 0 });
      }

      await workbook.xlsx.writeFile(filePath);
      logger.info(`Locked grade audit late no-merge report saved to ${filePath}`);

      return {
        filePath,
        count: orderedRecords.length
      };
    } catch (error) {
      logger.error("Error exporting locked grade audit late report (no merge):", error);
      throw error;
    }
  }

  // Kiểm tra kết nối
}

export default new DatabaseService();
