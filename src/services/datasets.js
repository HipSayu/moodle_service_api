// Đăng ký các tập dữ liệu đọc được từ SQL Server.
//
// Mỗi dataset khai báo:
//   - sql(params): câu truy vấn gốc, nhận @tenDot và @idKhoaHoc (nếu khoaHocFilter)
//   - khoaHocFilter: lọc theo khóa (K70, K71...) ngay trong câu gốc, truyền -1 là lấy mọi khóa
//   - columns: DANH SÁCH TRẮNG các cột được phép lọc/sắp xếp
//
// Bộ lọc được áp ở câu bao ngoài (`SELECT * FROM (<sql>) q WHERE ...`) nên
// tên cột dùng để lọc chính là tên cột đầu ra. Chỉ tên nằm trong `columns`
// mới được ghép vào SQL, giá trị luôn đi qua tham số hóa.

const STUDENTS_SQL = `
  SELECT DISTINCT
    sv.MaSinhVien,
    sv.HoDem,
    sv.Ten,
    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
    sv.Email,
    sv.NguyenQuan,
    sv.NgayCapNhat AS NgayCapNhatSinhVien
  FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
  INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
  INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
  INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
  INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
  INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
  WHERE dkhp.IDTrangThaiDangKy IN (1,2,3)
    AND d.TenDot LIKE @tenDot
    AND (@idKhoaHoc = -1 OR lhoc.IDKhoaHoc = @idKhoaHoc)
`;

const TEACHERS_SQL = `
  SELECT DISTINCT
    gv.MaGiangVien AS MaNhanSu,
    gv.HoDem,
    gv.Ten,
    gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien,
    gv.Email,
    gv.NgayCapNhat AS NgayCapNhatGiangVien
  FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
  INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
  INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
  INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
  INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
  INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
  INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
  INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
  INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
  WHERE d.TenDot LIKE @tenDot
    AND (@idKhoaHoc = -1 OR lhoc.IDKhoaHoc = @idKhoaHoc)
`;

const COURSES_SQL = `
  SELECT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    lhoc.TenLopHoc,
    d.TenDot,
    lhp.Id AS IDLopHocPhan,
    mh.IDToBoMon,
    mh.SoTietLyThuyet,
    mh.SoTietThucHanh,
    lhoc.IDKhoaHoc,
    kh.TenKhoaHoc,
    lhoc.NgayCapNhat
  FROM dbo.TKB_MonHoc AS mh WITH (NOLOCK)
  INNER JOIN dbo.TKB_LopHoc AS lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
  INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
  LEFT JOIN dbo.DM_KhoaHoc kh WITH (NOLOCK) ON kh.Id = lhoc.IDKhoaHoc
  INNER JOIN dbo.TKB_LopHocPhan AS lhp WITH (NOLOCK) ON lhp.IDMonHoc = mh.Id
  WHERE d.TenDot LIKE @tenDot
    AND (@idKhoaHoc = -1 OR lhoc.IDKhoaHoc = @idKhoaHoc)
`;

const STUDENT_ENROLLMENTS_SQL = `
  SELECT DISTINCT
    lhp.MaLopHocPhan,
    lhoc.TenLopHoc,
    mh.TenMonHoc,
    d.TenDot,
    sv.MaSinhVien,
    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
    sv.Email,
    lhoc.IDKhoaHoc,
    kh.TenKhoaHoc
  FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
  INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
  INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
  INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
  INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
  INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
  LEFT JOIN dbo.DM_KhoaHoc kh WITH (NOLOCK) ON kh.Id = lhoc.IDKhoaHoc
  WHERE dkhp.IDTrangThaiDangKy IN (1,2,3)
    AND d.TenDot LIKE @tenDot
    AND (@idKhoaHoc = -1 OR lhoc.IDKhoaHoc = @idKhoaHoc)
`;

const TEACHER_ENROLLMENTS_SQL = `
  SELECT DISTINCT
    lhp.MaLopHocPhan,
    lhoc.TenLopHoc,
    mh.TenMonHoc,
    d.TenDot,
    gv.MaGiangVien,
    gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien,
    gv.Email,
    lhgv.IsTroGiang,
    lhoc.IDKhoaHoc,
    kh.TenKhoaHoc
  FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
  INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
  INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
  INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
  INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
  INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
  INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
  INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
  INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
  LEFT JOIN dbo.DM_KhoaHoc kh WITH (NOLOCK) ON kh.Id = lhoc.IDKhoaHoc
  WHERE d.TenDot LIKE @tenDot
    AND (@idKhoaHoc = -1 OR lhoc.IDKhoaHoc = @idKhoaHoc)
`;

const GRADES_SQL = `
  SELECT
    sv.MaSinhVien,
    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
    kq.DiemTongKet,
    mh.MaMonHoc,
    mh.TenMonHoc,
    lhp.MaLopHocPhan,
    lhoc.TenLopHoc,
    d.TenDot,
    kq.IDSinhVien,
    kq.Id AS IDKetQuaHocTap,
    mh.Id AS IDMonHoc,
    lhp.Id AS IDLopHocPhan,
    lhoc.IDKhoaHoc,
    kh.TenKhoaHoc,
    kq.NgayCapNhat
  FROM dbo.TKB_LopHocPhan AS lhp WITH (NOLOCK)
  INNER JOIN dbo.DT_DangKyHocPhan AS dk WITH (NOLOCK) ON lhp.Id = dk.IDLopHocPhan
  INNER JOIN dbo.TKB_MonHoc AS mh WITH (NOLOCK) ON lhp.IDMonHoc = mh.Id
  INNER JOIN dbo.TKB_LopHoc AS lhoc WITH (NOLOCK) ON mh.IDLopHoc = lhoc.Id
  INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
  LEFT JOIN dbo.DM_KhoaHoc kh WITH (NOLOCK) ON kh.Id = lhoc.IDKhoaHoc
  INNER JOIN dbo.DT_KetQuaHocTapMonHoc AS kq WITH (NOLOCK)
    ON kq.IDLopHocPhan = lhp.Id AND kq.IDSinhVien = dk.IDSinhVien
  INNER JOIN dbo.DT_SinhVien AS sv WITH (NOLOCK) ON kq.IDSinhVien = sv.Id
  WHERE dk.IDTrangThaiDangKy IN (1,2,3)
    AND d.TenDot LIKE @tenDot
    AND (@idKhoaHoc = -1 OR lhoc.IDKhoaHoc = @idKhoaHoc)
`;

const COHORTS_SQL = `
  SELECT
    kh.Id AS IDKhoaHoc,
    kh.TenKhoaHoc,
    kh.Nam AS NamKhoaHoc,
    d.TenDot,
    COUNT(DISTINCT lhoc.Id) AS SoLopHoc,
    COUNT(DISTINCT lhp.Id) AS SoLopHocPhan
  FROM dbo.TKB_LopHoc lhoc WITH (NOLOCK)
  INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
  INNER JOIN dbo.DM_KhoaHoc kh WITH (NOLOCK) ON kh.Id = lhoc.IDKhoaHoc
  LEFT JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.IDLopHoc = lhoc.Id
  LEFT JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.IDMonHoc = mh.Id
  WHERE d.TenDot LIKE @tenDot
  GROUP BY kh.Id, kh.TenKhoaHoc, kh.Nam, d.TenDot
`;

const CATEGORIES_SQL = `SELECT * FROM TMP_DsBoMonKhoa`;

const col = (name, type = "string", label = null) => ({ name, type, label });

const DATASETS = {
  students: {
    label: "Sinh viên",
    requireTenDot: true,
    khoaHocFilter: true,
    sql: STUDENTS_SQL,
    defaultSort: "MaSinhVien",
    columns: [
      col("MaSinhVien", "string", "Mã sinh viên"),
      col("HoDem", "string", "Họ đệm"),
      col("Ten", "string", "Tên"),
      col("HoTenSinhVien", "string", "Họ tên"),
      col("Email", "string", "Email"),
      col("NguyenQuan", "string", "Nguyên quán"),
      col("NgayCapNhatSinhVien", "date", "Ngày cập nhật"),
    ],
  },

  teachers: {
    label: "Giảng viên",
    requireTenDot: true,
    khoaHocFilter: true,
    sql: TEACHERS_SQL,
    defaultSort: "MaNhanSu",
    columns: [
      col("MaNhanSu", "string", "Mã giảng viên"),
      col("HoDem", "string", "Họ đệm"),
      col("Ten", "string", "Tên"),
      col("HoTenGiangVien", "string", "Họ tên"),
      col("Email", "string", "Email"),
      col("NgayCapNhatGiangVien", "date", "Ngày cập nhật"),
    ],
  },

  courses: {
    label: "Lớp học phần",
    requireTenDot: true,
    khoaHocFilter: true,
    sql: COURSES_SQL,
    defaultSort: "MaLopHocPhan",
    columns: [
      col("MaLopHocPhan", "string", "Mã lớp học phần"),
      col("TenMonHoc", "string", "Tên môn học"),
      col("TenLopHoc", "string", "Tên lớp học"),
      col("TenDot", "string", "Tên đợt"),
      col("IDLopHocPhan", "number", "ID lớp học phần"),
      col("IDToBoMon", "number", "ID bộ môn"),
      col("SoTietLyThuyet", "number", "Số tiết lý thuyết"),
      col("SoTietThucHanh", "number", "Số tiết thực hành"),
      col("IDKhoaHoc", "number", "ID khóa"),
      col("TenKhoaHoc", "string", "Khóa"),
      col("NgayCapNhat", "date", "Ngày cập nhật"),
    ],
  },

  "student-enrollments": {
    label: "Đăng ký học phần",
    requireTenDot: true,
    khoaHocFilter: true,
    sql: STUDENT_ENROLLMENTS_SQL,
    defaultSort: "MaLopHocPhan",
    columns: [
      col("MaLopHocPhan", "string", "Mã lớp học phần"),
      col("TenLopHoc", "string", "Tên lớp học"),
      col("TenMonHoc", "string", "Tên môn học"),
      col("TenDot", "string", "Tên đợt"),
      col("MaSinhVien", "string", "Mã sinh viên"),
      col("HoTenSinhVien", "string", "Họ tên sinh viên"),
      col("Email", "string", "Email"),
      col("IDKhoaHoc", "number", "ID khóa"),
      col("TenKhoaHoc", "string", "Khóa"),
    ],
  },

  "teacher-enrollments": {
    label: "Phân công giảng dạy",
    requireTenDot: true,
    khoaHocFilter: true,
    sql: TEACHER_ENROLLMENTS_SQL,
    defaultSort: "MaLopHocPhan",
    columns: [
      col("MaLopHocPhan", "string", "Mã lớp học phần"),
      col("TenLopHoc", "string", "Tên lớp học"),
      col("TenMonHoc", "string", "Tên môn học"),
      col("TenDot", "string", "Tên đợt"),
      col("MaGiangVien", "string", "Mã giảng viên"),
      col("HoTenGiangVien", "string", "Họ tên giảng viên"),
      col("Email", "string", "Email"),
      col("IsTroGiang", "number", "Là trợ giảng (1/0)"),
      col("IDKhoaHoc", "number", "ID khóa"),
      col("TenKhoaHoc", "string", "Khóa"),
    ],
  },

  grades: {
    label: "Điểm tổng kết",
    requireTenDot: true,
    khoaHocFilter: true,
    sql: GRADES_SQL,
    defaultSort: "MaSinhVien",
    columns: [
      col("MaSinhVien", "string", "Mã sinh viên"),
      col("HoTenSinhVien", "string", "Họ tên sinh viên"),
      col("DiemTongKet", "number", "Điểm tổng kết"),
      col("MaMonHoc", "string", "Mã môn học"),
      col("TenMonHoc", "string", "Tên môn học"),
      col("MaLopHocPhan", "string", "Mã lớp học phần"),
      col("TenLopHoc", "string", "Tên lớp học"),
      col("TenDot", "string", "Tên đợt"),
      col("IDSinhVien", "number", "ID sinh viên"),
      col("IDKetQuaHocTap", "number", "ID kết quả"),
      col("IDMonHoc", "number", "ID môn học"),
      col("IDLopHocPhan", "number", "ID lớp học phần"),
      col("IDKhoaHoc", "number", "ID khóa"),
      col("TenKhoaHoc", "string", "Khóa"),
      col("NgayCapNhat", "date", "Ngày cập nhật"),
    ],
  },

  cohorts: {
    label: "Khóa trong đợt",
    requireTenDot: true,
    sql: COHORTS_SQL,
    defaultSort: "TenKhoaHoc",
    columns: [
      col("IDKhoaHoc", "number", "ID khóa"),
      col("TenKhoaHoc", "string", "Khóa"),
      col("NamKhoaHoc", "number", "Năm nhập học"),
      col("TenDot", "string", "Tên đợt"),
      col("SoLopHoc", "number", "Số lớp học"),
      col("SoLopHocPhan", "number", "Số lớp học phần"),
    ],
  },

  categories: {
    label: "Khoa / Bộ môn",
    requireTenDot: false,
    sql: CATEGORIES_SQL,
    defaultSort: "TenPhongBan",
    columns: [
      col("IDBoMon", "number", "ID bộ môn"),
      col("TenBoMon", "string", "Tên bộ môn"),
      col("TenPhongBan", "string", "Tên khoa / phòng ban"),
    ],
  },
};

// Toán tử được phép, ánh xạ sang SQL.
// needsValue = false nghĩa là không sinh tham số (IS NULL / IS NOT NULL).
const OPERATORS = {
  eq: { label: "bằng", sql: (c, p) => `${c} = ${p}` },
  ne: { label: "khác", sql: (c, p) => `${c} <> ${p}` },
  contains: { label: "chứa", sql: (c, p) => `${c} LIKE ${p}`, wrap: (v) => `%${v}%` },
  startswith: { label: "bắt đầu bằng", sql: (c, p) => `${c} LIKE ${p}`, wrap: (v) => `${v}%` },
  endswith: { label: "kết thúc bằng", sql: (c, p) => `${c} LIKE ${p}`, wrap: (v) => `%${v}` },
  gt: { label: "lớn hơn", sql: (c, p) => `${c} > ${p}` },
  gte: { label: "lớn hơn hoặc bằng", sql: (c, p) => `${c} >= ${p}` },
  lt: { label: "nhỏ hơn", sql: (c, p) => `${c} < ${p}` },
  lte: { label: "nhỏ hơn hoặc bằng", sql: (c, p) => `${c} <= ${p}` },
  in: { label: "thuộc danh sách", multi: true },
  isnull: { label: "rỗng", sql: (c) => `${c} IS NULL`, needsValue: false },
  notnull: { label: "khác rỗng", sql: (c) => `${c} IS NOT NULL`, needsValue: false },
};

// Toán tử mặc định khi người dùng chỉ truyền Field=value
const DEFAULT_OPERATOR = { string: "contains", number: "eq", date: "eq", bool: "eq" };

const getDataset = (name) => DATASETS[name] || null;
const listDatasets = () =>
  Object.entries(DATASETS).map(([name, d]) => ({
    name,
    label: d.label,
    requireTenDot: d.requireTenDot,
    khoaHocFilter: Boolean(d.khoaHocFilter),
    columns: d.columns.length,
  }));

export { DATASETS, OPERATORS, DEFAULT_OPERATOR, getDataset, listDatasets };
