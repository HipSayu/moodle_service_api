import sql from "mssql";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config/index.js";
import { logger, syncLogger } from "../utils/logger.js";
import { OPERATORS, DEFAULT_OPERATOR, getDataset, listDatasets } from "./datasets.js";
import { AppError } from "../utils/errorHandler.js";

// Giới hạn số dòng trả về mỗi lần truy vấn dataset
const DEFAULT_QUERY_LIMIT = 1000;
const MAX_QUERY_LIMIT = 50000;

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

  // ==================== TRUY VẤN DỮ LIỆU ĐÀO TẠO ====================
  // Mọi điều kiện lọc (học kỳ, mã sinh viên, mã giảng viên, mã lớp học phần)
  // đều truyền từ ngoài vào, không hardcode trong SQL.

  // Bắt buộc phải có tenDot, tránh việc lỡ quét toàn bộ dữ liệu mọi học kỳ
  requireTenDot(tenDot) {
    if (!tenDot || !tenDot.toString().trim()) {
      throw new AppError("Thiếu tenDot (tên đợt/học kỳ), ví dụ: HK1 2026-2027");
    }
    return `%${tenDot.toString().trim()}%`;
  }


  // IDDot cho báo cáo khóa điểm, bắt buộc truyền từ ngoài vào
  requireIdDot(idDot) {
    const parsed = parseInt(idDot, 10);
    if (!Number.isInteger(parsed)) {
      throw new AppError("Thiếu hoặc sai idDot (ID đợt), ví dụ: 298");
    }
    return parsed;
  }

  // ==================== TRUY VẤN DATASET TỔNG QUÁT ====================
  // Cho phép lọc/sắp xếp theo BẤT KỲ cột nào có trong danh sách trắng của dataset.
  // Câu gốc được bọc lại: SELECT * FROM (<sql gốc>) q WHERE <bộ lọc>
  // nên tên cột lọc chính là tên cột đầu ra.

  // Ép kiểu giá trị lọc theo kiểu cột đã khai báo
  castFilterValue(value, type) {
    if (type === "number") {
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new AppError(`Giá trị "${value}" không phải số`);
      }
      return n;
    }

    if (type === "date") {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new AppError(`Giá trị "${value}" không phải ngày hợp lệ`);
      }
      return d;
    }

    if (type === "bool") {
      return ["true", "1", "yes"].includes(String(value).toLowerCase());
    }

    return String(value);
  }

  // Dựng mệnh đề WHERE từ danh sách bộ lọc đã được kiểm tra tên cột
  buildFilterClause(dataset, filters, parameters) {
    const clauses = [];
    let index = 0;

    for (const filter of filters) {
      const column = dataset.columns.find((c) => c.name === filter.field);
      if (!column) {
        throw new AppError(
          `Không lọc được theo trường "${filter.field}". Trường hợp lệ: ${dataset.columns
            .map((c) => c.name)
            .join(", ")}`
        );
      }

      const opName = filter.op || DEFAULT_OPERATOR[column.type] || "eq";
      const operator = OPERATORS[opName];
      if (!operator) {
        throw new AppError(
          `Toán tử "${opName}" không hợp lệ. Toán tử hợp lệ: ${Object.keys(OPERATORS).join(", ")}`
        );
      }

      // Tên cột đã đối chiếu với danh sách trắng nên an toàn khi ghép vào SQL
      const columnRef = `q.[${column.name}]`;

      // IS NULL / IS NOT NULL không cần tham số
      if (operator.needsValue === false) {
        clauses.push(operator.sql(columnRef));
        continue;
      }

      if (filter.value === null || filter.value === undefined || filter.value === "") {
        throw new AppError(`Bộ lọc "${filter.field}" thiếu giá trị`);
      }

      // IN nhận danh sách phân tách bởi dấu phẩy
      if (operator.multi) {
        const values = String(filter.value)
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);

        if (values.length === 0) {
          throw new AppError(`Bộ lọc "${filter.field}" thiếu giá trị`);
        }

        const names = values.map((v) => {
          const name = `f${index++}`;
          parameters[name] = this.castFilterValue(v, column.type);
          return `@${name}`;
        });

        clauses.push(`${columnRef} IN (${names.join(", ")})`);
        continue;
      }

      const name = `f${index++}`;
      const raw = this.castFilterValue(filter.value, column.type);
      parameters[name] = operator.wrap ? operator.wrap(raw) : raw;
      clauses.push(operator.sql(columnRef, `@${name}`));
    }

    return clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  }

  /**
   * Truy vấn một dataset với bộ lọc động.
   * @param {string} name    tên dataset
   * @param {object} options { tenDot, filters, sort, order, limit, offset }
   *   filters: [{ field, op, value }]
   * @returns {object} { items, total, returned, limit, offset, sort, order }
   */
  async queryDataset(name, options = {}) {
    const dataset = getDataset(name);
    if (!dataset) {
      throw new AppError(
        `Không có dataset "${name}". Dataset hợp lệ: ${listDatasets()
          .map((d) => d.name)
          .join(", ")}`
      );
    }

    const {
      tenDot = null,
      idKhoaHoc = null,
      filters = [],
      sort = null,
      order = "asc",
      limit = DEFAULT_QUERY_LIMIT,
      offset = 0,
    } = options;

    const parameters = {};
    if (dataset.requireTenDot) {
      parameters.tenDot = this.requireTenDot(tenDot);
    }

    // -1 nghĩa là không lọc khóa. Dùng số thay cho NULL để tham số luôn cùng kiểu.
    if (dataset.khoaHocFilter) {
      const parsed = parseInt(idKhoaHoc, 10);
      parameters.idKhoaHoc = Number.isInteger(parsed) ? parsed : -1;
    }

    const where = this.buildFilterClause(dataset, filters, parameters);

    // Cột sắp xếp cũng phải nằm trong danh sách trắng
    const sortColumn = sort
      ? dataset.columns.find((c) => c.name === sort)
      : dataset.columns.find((c) => c.name === dataset.defaultSort) || dataset.columns[0];

    if (sort && !sortColumn) {
      throw new AppError(`Không sắp xếp được theo trường "${sort}"`);
    }

    const direction = String(order).toLowerCase() === "desc" ? "DESC" : "ASC";
    const safeLimit = Math.min(
      Math.max(parseInt(limit, 10) || DEFAULT_QUERY_LIMIT, 1),
      MAX_QUERY_LIMIT
    );
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const inner = `SELECT * FROM (${dataset.sql}) q${where}`;

    // Đếm tổng số dòng khớp bộ lọc trước khi phân trang
    const countResult = await this.executeQuery(
      `SELECT COUNT(*) AS total FROM (${inner}) c`,
      parameters
    );
    const total = countResult.recordset[0]?.total ?? 0;

    const pageResult = await this.executeQuery(
      `${inner} ORDER BY q.[${sortColumn.name}] ${direction} OFFSET ${safeOffset} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`,
      parameters
    );

    return {
      items: pageResult.recordset,
      total,
      returned: pageResult.recordset.length,
      limit: safeLimit,
      offset: safeOffset,
      sort: sortColumn.name,
      order: direction.toLowerCase(),
    };
  }

  // Lấy toàn bộ dòng khớp bộ lọc, dùng cho các tác vụ đồng bộ (không phân trang)
  async queryDatasetAll(name, options = {}) {
    const first = await this.queryDataset(name, { ...options, limit: MAX_QUERY_LIMIT, offset: 0 });

    if (first.total <= first.returned) {
      return first.items;
    }

    // Vượt quá MAX_QUERY_LIMIT thì lấy tiếp các trang còn lại
    const items = [...first.items];
    let offset = first.returned;

    while (offset < first.total) {
      const next = await this.queryDataset(name, {
        ...options,
        limit: MAX_QUERY_LIMIT,
        offset,
      });
      if (next.returned === 0) break;
      items.push(...next.items);
      offset += next.returned;
    }

    return items;
  }

  // ==================== WRAPPER CHO TÁC VỤ ĐỒNG BỘ ====================
  // Các hàm dưới đây là lối tắt quen thuộc cho service đồng bộ,
  // bên trong vẫn dùng chung queryDatasetAll ở trên.

  buildFilters(map) {
    return Object.entries(map)
      .filter(([, spec]) => spec.value !== null && spec.value !== undefined && spec.value !== "")
      .map(([field, spec]) => ({ field, op: spec.op || "eq", value: spec.value }));
  }

  // ==================== KHÓA (K70, K71...) ====================

  // Danh sách khóa có lớp trong một đợt, kèm số lớp để biết khóa nào đang chạy
  async getCohorts({ tenDot } = {}) {
    return this.queryDatasetAll("cohorts", { tenDot });
  }

  // Rút số khóa từ một chuỗi bất kỳ: "70", "K70", "Khóa 70 (2025)" -> 70.
  // Tên khóa trong DM_KhoaHoc không theo chuẩn nào nên phải dò kiểu này.
  cohortNumber(text) {
    const value = String(text ?? "").trim();
    if (/^\d{1,3}$/.test(value)) return parseInt(value, 10);

    const matched = value.match(/kh[oó]a\s*(\d{1,3})|(?:^|\s)k\s*(\d{1,3})/i);
    return matched ? parseInt(matched[1] ?? matched[2], 10) : null;
  }

  // Đổi thứ người dùng nhập thành đúng một khóa trong đợt.
  //   idKhoaHoc: chọn chính xác theo id (giao diện dùng cách này)
  //   khoaHoc:   chuỗi tự do "70" / "K70" / "Khóa 70 (2025)"
  // Không tìm ra hoặc khớp nhiều khóa thì báo lỗi kèm danh sách để người dùng chọn lại.
  // Không bao giờ đoán bừa vì đoán sai là đồng bộ nhầm nguyên một khóa.
  async resolveCohortFilter({ tenDot, khoaHoc = null, idKhoaHoc = null } = {}) {
    const hasId = idKhoaHoc !== null && idKhoaHoc !== undefined && String(idKhoaHoc).trim() !== "";
    const hasText = khoaHoc !== null && khoaHoc !== undefined && String(khoaHoc).trim() !== "";

    if (!hasId && !hasText) return { idKhoaHoc: null, tenKhoaHoc: null };

    const cohorts = await this.getCohorts({ tenDot });

    if (cohorts.length === 0) {
      throw new AppError(`Đợt "${tenDot}" không có khóa nào`, 404);
    }

    const pick = (cohort) => ({
      idKhoaHoc: cohort.IDKhoaHoc,
      tenKhoaHoc: cohort.TenKhoaHoc,
    });

    const describe = (list) =>
      list.map((c) => `${c.IDKhoaHoc}=${c.TenKhoaHoc}`).join("; ");

    if (hasId) {
      const wanted = parseInt(idKhoaHoc, 10);
      const found = cohorts.find((c) => c.IDKhoaHoc === wanted);
      if (found) return pick(found);

      throw new AppError(
        `Đợt "${tenDot}" không có khóa id ${idKhoaHoc}. Các khóa trong đợt: ${describe(cohorts)}`
      );
    }

    const input = String(khoaHoc).trim();
    const lower = input.toLowerCase();

    // 1. Trùng đúng tên khóa
    const exact = cohorts.filter((c) => String(c.TenKhoaHoc ?? "").toLowerCase() === lower);
    if (exact.length === 1) return pick(exact[0]);

    // 2. Cùng số khóa: "70" khớp "Khóa 70 (2025)", "K71" khớp "K71"
    const number = this.cohortNumber(input);
    if (number !== null) {
      const sameNumber = cohorts.filter((c) => this.cohortNumber(c.TenKhoaHoc) === number);
      if (sameNumber.length === 1) return pick(sameNumber[0]);
      if (sameNumber.length > 1) {
        throw new AppError(
          `"${input}" khớp ${sameNumber.length} khóa trong đợt "${tenDot}", chọn lại theo id: ${describe(sameNumber)}`
        );
      }
    }

    // 3. Chứa chuỗi người dùng nhập
    const contains = cohorts.filter((c) =>
      String(c.TenKhoaHoc ?? "").toLowerCase().includes(lower)
    );
    if (contains.length === 1) return pick(contains[0]);
    if (contains.length > 1) {
      throw new AppError(
        `"${input}" khớp ${contains.length} khóa trong đợt "${tenDot}", chọn lại theo id: ${describe(contains)}`
      );
    }

    throw new AppError(
      `Không tìm thấy khóa "${input}" trong đợt "${tenDot}". Các khóa trong đợt: ${describe(cohorts)}`
    );
  }

  async getStudents({ tenDot, maSinhVien = null, idKhoaHoc = null } = {}) {
    return this.queryDatasetAll("students", {
      tenDot,
      idKhoaHoc,
      filters: this.buildFilters({ MaSinhVien: { value: maSinhVien } }),
    });
  }

  async getTeachers({ tenDot, maGiangVien = null, idKhoaHoc = null } = {}) {
    // Cho phép truyền mã hoặc email nên tra cả hai cột
    if (!maGiangVien) {
      return this.queryDatasetAll("teachers", { tenDot, idKhoaHoc });
    }

    const byCode = await this.queryDatasetAll("teachers", {
      tenDot,
      idKhoaHoc,
      filters: [{ field: "MaNhanSu", op: "eq", value: maGiangVien }],
    });
    if (byCode.length > 0) return byCode;

    return this.queryDatasetAll("teachers", {
      tenDot,
      idKhoaHoc,
      filters: [{ field: "Email", op: "eq", value: maGiangVien }],
    });
  }

  async getCourses({ tenDot, maLopHocPhan = null, idKhoaHoc = null } = {}) {
    return this.queryDatasetAll("courses", {
      tenDot,
      idKhoaHoc,
      filters: this.buildFilters({ MaLopHocPhan: { value: maLopHocPhan } }),
    });
  }

  async getStudentEnrollments({
    tenDot,
    maSinhVien = null,
    maLopHocPhan = null,
    idKhoaHoc = null,
  } = {}) {
    if (maSinhVien) {
      const byCode = await this.queryDatasetAll("student-enrollments", {
        tenDot,
        idKhoaHoc,
        filters: this.buildFilters({
          MaSinhVien: { value: maSinhVien },
          MaLopHocPhan: { value: maLopHocPhan },
        }),
      });
      if (byCode.length > 0) return byCode;

      return this.queryDatasetAll("student-enrollments", {
        tenDot,
        idKhoaHoc,
        filters: this.buildFilters({
          Email: { value: maSinhVien },
          MaLopHocPhan: { value: maLopHocPhan },
        }),
      });
    }

    return this.queryDatasetAll("student-enrollments", {
      tenDot,
      idKhoaHoc,
      filters: this.buildFilters({ MaLopHocPhan: { value: maLopHocPhan } }),
    });
  }

  async getTeacherEnrollments({
    tenDot,
    maGiangVien = null,
    maLopHocPhan = null,
    idKhoaHoc = null,
  } = {}) {
    if (maGiangVien) {
      const byCode = await this.queryDatasetAll("teacher-enrollments", {
        tenDot,
        idKhoaHoc,
        filters: this.buildFilters({
          MaGiangVien: { value: maGiangVien },
          MaLopHocPhan: { value: maLopHocPhan },
        }),
      });
      if (byCode.length > 0) return byCode;

      return this.queryDatasetAll("teacher-enrollments", {
        tenDot,
        idKhoaHoc,
        filters: this.buildFilters({
          Email: { value: maGiangVien },
          MaLopHocPhan: { value: maLopHocPhan },
        }),
      });
    }

    return this.queryDatasetAll("teacher-enrollments", {
      tenDot,
      idKhoaHoc,
      filters: this.buildFilters({ MaLopHocPhan: { value: maLopHocPhan } }),
    });
  }

  async getGrades({
    tenDot,
    maLopHocPhan = null,
    tenLopHoc = null,
    maSinhVien = null,
    idKhoaHoc = null,
  } = {}) {
    return this.queryDatasetAll("grades", {
      tenDot,
      idKhoaHoc,
      filters: this.buildFilters({
        MaLopHocPhan: { value: maLopHocPhan },
        TenLopHoc: { value: tenLopHoc, op: "contains" },
        MaSinhVien: { value: maSinhVien },
      }),
    });
  }

  async getCategories() {
    return this.queryDatasetAll("categories", {});
  }

  async exportLockedGradeAuditReport(idDot) {
    try {
      idDot = this.requireIdDot(idDot);
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
      WHERE d.IDDot = @idDot
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
        AND lhpvg.IDDot = @idDot
      JOIN dbo.DM_GiangVien gv WITH (NOLOCK) 
        ON gv.Id = lhpvg.IDGiangVien
      JOIN HRM_NUCE.dbo.NS_NhanSu c ON a.NguoiTao = c.IDNhanSu
      LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm 
        ON tbm.IDToBoMon = gv.IDToBoMonTmp
      LEFT JOIN View_Khoa k 
        ON k.Id = gv.IDKhoa
      LEFT JOIN LichThi lt ON lt.MaLopHocPhan = b.MaLopHocPhan AND lt.rn = 1
      LEFT JOIN View_LichThiTrongDanhSachThiKetThuc dtk ON dtk.MaLopHocPhan = b.MaLopHocPhan AND dtk.IDDot = @idDot
      WHERE 
        b.IDDot = @idDot
         AND (
           lt.NgayThi IS NULL
           OR DATEDIFF(day, lt.NgayThi, a.NgayTao) >= 14
         )
    )
    SELECT *
    FROM CTE
    WHERE rn = 1;`;

      const result = await this.executeQuery(query, { idDot });
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
          WHERE a.IDDot = @idDot AND a.IsHocBu != 1
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
          WHERE IDDot = @idDot AND IsTamNgung = 0
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

      const mappingResult = await this.executeQuery(mappingQuery, { idDot });

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
          GiangVienGiangDay:
            Array.from(entry.teachers).join(", ") ||
            entry.baseRow.GiangVienGiangDay,
          TenMonHoc:
            Array.from(entry.subjects).join(", ") || entry.baseRow.TenMonHoc,
          SiSoLopHocPhan:
            Array.from(entry.classSizes).join(", ") ||
            entry.baseRow.SiSoLopHocPhan,
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
        `locked_grade_audit_${timestamp}.xlsx`,
      );

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Report");

      const columns =
        mergedRecords.length > 0
          ? Object.keys(mergedRecords[0]).map((key) => ({
              header: key,
              key,
              width: Math.max(String(key).length + 2, 18),
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
        count: mergedRecords.length,
      };
    } catch (error) {
      logger.error("Error exporting locked grade audit report:", error);
      throw error;
    }
  }

  async exportLockedGradeAuditReportNoMerge(idDot) {
    try {
      idDot = this.requireIdDot(idDot);
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
      WHERE d.IDDot = @idDot
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
        AND lhpvg.IDDot = @idDot
      JOIN dbo.DM_GiangVien gv WITH (NOLOCK) 
        ON gv.Id = lhpvg.IDGiangVien
      JOIN HRM_NUCE.dbo.NS_NhanSu c ON a.NguoiTao = c.IDNhanSu
      LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm 
        ON tbm.IDToBoMon = gv.IDToBoMonTmp
      LEFT JOIN View_Khoa k 
        ON k.Id = gv.IDKhoa
      LEFT JOIN LichThi lt ON lt.MaLopHocPhan = b.MaLopHocPhan AND lt.rn = 1
      LEFT JOIN View_LichThiTrongDanhSachThiKetThuc dtk ON dtk.MaLopHocPhan = b.MaLopHocPhan AND dtk.IDDot = @idDot
      WHERE 
        b.IDDot = @idDot
         AND (
           lt.NgayThi IS NULL
           OR DATEDIFF(day, lt.NgayThi, a.NgayTao) >= 14
         )
    )
    SELECT *
    FROM CTE
    WHERE rn = 1;`;

      const result = await this.executeQuery(query, { idDot });
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
        `locked_grade_audit_nomerge_${timestamp}.xlsx`,
      );

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("ReportNoMerge");

      const columns =
        records.length > 0
          ? Object.keys(records[0]).map((key) => ({
              header: key,
              key,
              width: Math.max(String(key).length + 2, 18),
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
        count: records.length,
      };
    } catch (error) {
      logger.error(
        "Error exporting locked grade audit report (no merge):",
        error,
      );
      throw error;
    }
  }

  async exportLockedGradeAuditReportLate(idDot) {
    try {
      idDot = this.requireIdDot(idDot);
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
      WHERE d.IDDot = @idDot
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
        AND lhpvg.IDDot = @idDot
      JOIN dbo.DM_GiangVien gv WITH (NOLOCK) 
        ON gv.Id = lhpvg.IDGiangVien
      JOIN HRM_NUCE.dbo.NS_NhanSu c ON a.NguoiTao = c.IDNhanSu
      LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm 
        ON tbm.IDToBoMon = gv.IDToBoMonTmp
      LEFT JOIN View_Khoa k 
        ON k.Id = gv.IDKhoa
      LEFT JOIN LichThi lt ON lt.MaLopHocPhan = b.MaLopHocPhan AND lt.rn = 1
      LEFT JOIN View_LichThiTrongDanhSachThiKetThuc dtk ON dtk.MaLopHocPhan = b.MaLopHocPhan AND dtk.IDDot = @idDot
      WHERE 
        b.IDDot = @idDot
    )
    SELECT *
    FROM CTE
    WHERE rn = 1;`;

      const result = await this.executeQuery(query, { idDot });
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
          WHERE a.IDDot = @idDot AND a.IsHocBu != 1
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
          WHERE IDDot = @idDot AND IsTamNgung = 0
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

      const mappingResult = await this.executeQuery(mappingQuery, { idDot });

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
              lateFlags: new Set(),
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
            GiangVienGiangDay:
              Array.from(entry.teachers).join(", ") ||
              entry.baseRow.GiangVienGiangDay,
            TenMonHoc:
              Array.from(entry.subjects).join(", ") || entry.baseRow.TenMonHoc,
            SiSoLopHocPhan:
              Array.from(entry.classSizes).join(", ") ||
              entry.baseRow.SiSoLopHocPhan,
            NopMuon: entry.lateFlags.has(1),
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
        `locked_grade_audit_late_${timestamp}.xlsx`,
      );

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("ReportLate");

      const columns =
        mergedRecords.length > 0
          ? Object.keys(mergedRecords[0]).map((key) => ({
              header: key,
              key,
              width: Math.max(String(key).length + 2, 18),
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
        count: mergedRecords.length,
      };
    } catch (error) {
      logger.error("Error exporting locked grade audit late report:", error);
      throw error;
    }
  }

  async exportLockedGradeAuditReportLateNoMerge(idDot) {
    try {
      idDot = this.requireIdDot(idDot);
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
      WHERE d.IDDot = @idDot
    ),

    SourceKD AS (
      SELECT
        kd.Id,
        kd.IDLopHocPhan,
        kd.DaKhoaDiemKetThuc,
        kd.NgayCapNhat,
        kd.NgayTao,
        lhp.MaLopHocPhan,
        lhp.MaHocPhan,
        lhp.TenMonHoc,
        lhp.TenLopHoc,
        ns.HoDem + ' ' + ns.Ten AS HoTenNS,
        ns.MaNhanSu,
        t.NgayTao AS TrackingNgayTao,
        DaKhoaDiemQuaTrinh_Old = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 0),':') x WHERE x.idx = 1),0) AS BIT),
        DaKhoaDiemQuaTrinh_New = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 2),':') x WHERE x.idx = 1),0) AS BIT),
        DaKhoaDiemKetThuc_Old = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 1),':') x WHERE x.idx = 1),0) AS BIT),
        DaKhoaDiemKetThuc_New = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 3),':') x WHERE x.idx = 1),0) AS BIT),
        t.Status,
        kd.Nhom,
        DaKhoaDiemTH_Old = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 5),':') x WHERE x.idx = 1),0) AS BIT),
        DaKhoaDiemTH_New = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 7),':') x WHERE x.idx = 1),0) AS BIT),
        DaKhoaDiemTL_Old = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 6),':') x WHERE x.idx = 1),0) AS BIT),
        DaKhoaDiemTL_New = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 8),':') x WHERE x.idx = 1),0) AS BIT),
        GhiChu = CAST((SELECT TOP 1 x.value FROM dbo.Fn_Split_Nvar((SELECT TOP 1 x.value FROM dbo.Fn_Split_Nvar(t.Value,';') x WHERE x.idx = 10),':') x WHERE x.idx = 1) AS NVARCHAR(MAX)),
        IDHTTracking = t.Id
      FROM dbo.DT_KhoaDiem kd
      INNER JOIN dbo.View_TKB_LopHocPhan lhp ON lhp.Id = kd.IDLopHocPhan
      INNER JOIN dbo.HT_Tracking t ON t.PrimaryKey = kd.Id AND t.TableName = 'DT_KhoaDiem'
      LEFT JOIN dbo.View_NhanSu ns ON ns.Id = t.NguoiTao
      WHERE lhp.IDDot = @idDot
        AND ((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 4),':') x WHERE x.idx = 1) = ''
             OR kd.Nhom = (SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx = 4),':') x WHERE x.idx = 1))
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

        nsHr.HoDem + ' ' + nsHr.Ten
        AS UserKhoaDiemKetThuc,

        CONVERT(varchar(23), a.NgayCapNhat, 121)
        AS NgayCapNhat,

        CONVERT(varchar(23), a.NgayTao, 121)
        AS NgayTao,

        ROW_NUMBER() OVER (
          PARTITION BY a.IDLopHocPhan
          ORDER BY a.NgayCapNhat DESC
        ) AS rn

    FROM SourceKD a

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
        AND lhpvg.IDDot = @idDot
    ) AS teacherAgg

    LEFT JOIN HRM_NUCE.dbo.NS_NhanSu nsHr
      ON nsHr.MaNhanSu = a.MaNhanSu

    LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm
      ON tbm.IDToBoMon = teacherAgg.IDToBoMonTmp

    LEFT JOIN View_Khoa k
      ON k.Id = teacherAgg.IDKhoa

    WHERE b.IDDot = @idDot
)

SELECT *
FROM CTE
WHERE rn = 1;`;

      const result = await this.executeQuery(query, { idDot });
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
        `locked_grade_audit_late_nomerge_${timestamp}.xlsx`,
      );

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("ReportLateNoMerge");

      const columns =
        orderedRecords.length > 0
          ? Object.keys(orderedRecords[0]).map((key) => ({
              header: key,
              key,
              width: Math.max(String(key).length + 2, 18),
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
      logger.info(
        `Locked grade audit late no-merge report saved to ${filePath}`,
      );

      return {
        filePath,
        count: orderedRecords.length,
      };
    } catch (error) {
      logger.error(
        "Error exporting locked grade audit late report (no merge):",
        error,
      );
      throw error;
    }
  }

  // Kiểm tra kết nối
}

export default new DatabaseService();
