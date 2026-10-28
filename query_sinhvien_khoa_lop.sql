/* ============================================================================
   DANH SÁCH SINH VIÊN THEO KHÓA / THEO LỚP DANH NGHĨA
   Chỉ đọc — toàn bộ file là SELECT, không INSERT/UPDATE/DELETE.

   Bảng dùng tới:
     DT_SinhVien            hồ sơ sinh viên (IDKhoaHoc, IDLopHoc, IDNganh...)
     DM_LopHoc              lớp danh nghĩa / lớp sinh hoạt (70CS1, 70IT1...)
     DM_KhoaHoc             khóa (K70, K71...)
     DM_Nganh               ngành
     DM_HeDaoTao            hệ đào tạo
     DM_LoaiHinhDT          loại hình đào tạo
     DM_TrangThaiSinhVien   trạng thái (1 = Đang học)

   LƯU Ý VỀ TÊN KHÓA: DM_KhoaHoc.TenKhoaHoc không theo chuẩn nào —
   có cả 'Khóa 70 (2025)', 'Khóa 69 (2024)' lẫn 'K71', '2024-07'.
   Vì vậy các query dưới lọc theo SỐ KHÓA ('70', '71') và bắt cả hai kiểu viết.
   Chắc ăn nhất là chạy Query 0 lấy đúng Id rồi lọc theo @IDKhoaHoc.
============================================================================ */


/* ---------------------------------------------------------------------------
   QUERY 0 — Tra danh sách khóa để lấy đúng Id
   Chạy cái này trước, xem TenKhoaHoc thực tế rồi mới lọc.
--------------------------------------------------------------------------- */
SELECT
    kh.Id                AS IDKhoaHoc,
    kh.TenKhoaHoc,
    kh.Nam               AS NamNhapHoc,
    kh.CachViet,
    COUNT(sv.Id)         AS SoSinhVien
FROM dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
LEFT JOIN dbo.DT_SinhVien AS sv WITH (NOLOCK)
       ON sv.IDKhoaHoc = kh.Id
      AND ISNULL(sv.IsDelete, 0) = 0
WHERE ISNULL(kh.IsDelete, 0) = 0
GROUP BY kh.Id, kh.TenKhoaHoc, kh.Nam, kh.CachViet
ORDER BY kh.Nam DESC, SoSinhVien DESC;
GO


/* ---------------------------------------------------------------------------
   QUERY 1 — TOÀN BỘ SINH VIÊN THEO KHÓA
   Đổi @SoKhoa thành '70' / '71'... hoặc gán thẳng @IDKhoaHoc lấy từ Query 0.
--------------------------------------------------------------------------- */
DECLARE @SoKhoa     VARCHAR(3) = '71';   -- '70', '71'... để NULL nếu lọc bằng @IDKhoaHoc
DECLARE @IDKhoaHoc  INT        = NULL;   -- ưu tiên hơn @SoKhoa nếu khác NULL
DECLARE @ChiDangHoc BIT        = 0;      -- 1 = chỉ lấy sinh viên đang học

SELECT
    sv.MaSinhVien,
    LTRIM(RTRIM(sv.HoDem + N' ' + sv.Ten))          AS HoTen,
    sv.HoDem,
    sv.Ten,
    CASE WHEN sv.GioiTinh = 1 THEN N'Nam' ELSE N'Nữ' END AS GioiTinh,
    sv.NgaySinh,
    sv.Email,
    sv.SoDienThoai,
    lop.MaLopChu                                    AS MaLop,
    lop.TenLop,
    kh.TenKhoaHoc                                   AS Khoa,
    kh.Nam                                          AS NamNhapHoc,
    ng.MaNganh,
    ng.TenNganh,
    hdt.TenHeDaoTao,
    lh.TenLoaiHinhDT,
    tt.TenTrangThai,
    sv.NamVao,
    sv.NgayNhapHoc,
    sv.Id                                           AS IDSinhVien,
    kh.Id                                           AS IDKhoaHoc,
    lop.Id                                          AS IDLopHoc
FROM dbo.DT_SinhVien AS sv WITH (NOLOCK)
INNER JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
        ON kh.Id = sv.IDKhoaHoc
LEFT JOIN dbo.DM_LopHoc AS lop WITH (NOLOCK)
       ON lop.Id = sv.IDLopHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)
       ON ng.Id = sv.IDNganh
LEFT JOIN dbo.DM_HeDaoTao AS hdt WITH (NOLOCK)
       ON hdt.Id = sv.IDHeDaoTao
LEFT JOIN dbo.DM_LoaiHinhDT AS lh WITH (NOLOCK)
       ON lh.Id = sv.IDLoaiHinhDT
LEFT JOIN dbo.DM_TrangThaiSinhVien AS tt WITH (NOLOCK)
       ON tt.Id = sv.TrangThai
WHERE ISNULL(sv.IsDelete, 0) = 0
  AND (
        (@IDKhoaHoc IS NOT NULL AND kh.Id = @IDKhoaHoc)
     OR (@IDKhoaHoc IS NULL AND (
              kh.TenKhoaHoc LIKE N'Khóa ' + @SoKhoa + '%'   -- 'Khóa 70 (2025)'
           OR kh.TenKhoaHoc = 'K' + @SoKhoa                 -- 'K71'
           OR kh.TenKhoaHoc = @SoKhoa                       -- '70'
         ))
      )
  AND (@ChiDangHoc = 0 OR sv.TrangThai = 1)
ORDER BY lop.MaLopChu, sv.MaSinhVien;
GO


/* ---------------------------------------------------------------------------
   QUERY 2 — TOÀN BỘ SINH VIÊN THEO LỚP DANH NGHĨA (70CS1, 70IT1...)

   Mã lớp nằm ở DM_LopHoc: MaLopChu là cột thường dùng, nhưng dữ liệu cũ có thể
   ghi ở MaLopSo hoặc TenLop nên WHERE dò cả ba cho chắc.
--------------------------------------------------------------------------- */
DECLARE @MaLop NVARCHAR(50) = N'70CS1';

SELECT
    sv.MaSinhVien,
    LTRIM(RTRIM(sv.HoDem + N' ' + sv.Ten))          AS HoTen,
    sv.HoDem,
    sv.Ten,
    CASE WHEN sv.GioiTinh = 1 THEN N'Nam' ELSE N'Nữ' END AS GioiTinh,
    sv.NgaySinh,
    sv.Email,
    sv.SoDienThoai,
    lop.MaLopChu                                    AS MaLop,
    lop.TenLop,
    lop.SiSo                                        AS SiSoLop,
    kh.TenKhoaHoc                                   AS Khoa,
    ng.MaNganh,
    ng.TenNganh,
    hdt.TenHeDaoTao,
    tt.TenTrangThai,
    sv.Id                                           AS IDSinhVien,
    lop.Id                                          AS IDLopHoc
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
INNER JOIN dbo.DT_SinhVien AS sv WITH (NOLOCK)
        ON sv.IDLopHoc = lop.Id
       AND ISNULL(sv.IsDelete, 0) = 0
LEFT JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
       ON kh.Id = sv.IDKhoaHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)
       ON ng.Id = sv.IDNganh
LEFT JOIN dbo.DM_HeDaoTao AS hdt WITH (NOLOCK)
       ON hdt.Id = sv.IDHeDaoTao
LEFT JOIN dbo.DM_TrangThaiSinhVien AS tt WITH (NOLOCK)
       ON tt.Id = sv.TrangThai
WHERE ISNULL(lop.IsDelete, 0) = 0
  AND (
        lop.MaLopChu = @MaLop
     OR lop.MaLopSo  = @MaLop
     OR lop.TenLop   = @MaLop
      )
ORDER BY sv.MaSinhVien;
GO


/* ---------------------------------------------------------------------------
   QUERY 2B — Nhiều lớp cùng lúc
--------------------------------------------------------------------------- */
SELECT
    lop.MaLopChu                                    AS MaLop,
    sv.MaSinhVien,
    LTRIM(RTRIM(sv.HoDem + N' ' + sv.Ten))          AS HoTen,
    sv.Email,
    sv.SoDienThoai,
    kh.TenKhoaHoc                                   AS Khoa,
    tt.TenTrangThai
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
INNER JOIN dbo.DT_SinhVien AS sv WITH (NOLOCK)
        ON sv.IDLopHoc = lop.Id
       AND ISNULL(sv.IsDelete, 0) = 0
LEFT JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
       ON kh.Id = sv.IDKhoaHoc
LEFT JOIN dbo.DM_TrangThaiSinhVien AS tt WITH (NOLOCK)
       ON tt.Id = sv.TrangThai
WHERE ISNULL(lop.IsDelete, 0) = 0
  AND lop.MaLopChu IN (N'70CS1', N'70IT1')          -- thêm bớt trong ngoặc
ORDER BY lop.MaLopChu, sv.MaSinhVien;
GO


/* ---------------------------------------------------------------------------
   QUERY 2C — Tất cả lớp của một khóa, kèm sĩ số thực tế
   Dùng để biết khóa 70 có những lớp danh nghĩa nào trước khi lọc từng lớp.
--------------------------------------------------------------------------- */
DECLARE @SoKhoaLop VARCHAR(3) = '70';

SELECT
    lop.Id                AS IDLopHoc,
    lop.MaLopChu          AS MaLop,
    lop.TenLop,
    kh.TenKhoaHoc         AS Khoa,
    ng.TenNganh,
    lop.SiSo              AS SiSoKhaiBao,
    COUNT(sv.Id)          AS SiSoThucTe
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
INNER JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
        ON kh.Id = lop.IDKhoaHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)
       ON ng.Id = lop.IDNganh
LEFT JOIN dbo.DT_SinhVien AS sv WITH (NOLOCK)
       ON sv.IDLopHoc = lop.Id
      AND ISNULL(sv.IsDelete, 0) = 0
WHERE ISNULL(lop.IsDelete, 0) = 0
  AND (
        kh.TenKhoaHoc LIKE N'Khóa ' + @SoKhoaLop + '%'
     OR kh.TenKhoaHoc = 'K' + @SoKhoaLop
      )
GROUP BY lop.Id, lop.MaLopChu, lop.TenLop, kh.TenKhoaHoc, ng.TenNganh, lop.SiSo
ORDER BY lop.MaLopChu;
GO


/* ---------------------------------------------------------------------------
   QUERY 3 — TOÀN BỘ LỚP DANH NGHĨA (mọi khóa)
   Bỏ comment các dòng trong phần LỌC để thu hẹp phạm vi khi cần.
--------------------------------------------------------------------------- */
SELECT
    lop.Id                AS IDLopHoc,
    lop.MaLopChu          AS MaLop,
    lop.MaLopSo,
    lop.TenLop,
    kh.TenKhoaHoc         AS Khoa,
    kh.Nam                AS NamNhapHoc,
    ng.MaNganh,
    ng.TenNganh,
    hdt.TenHeDaoTao,
    lh.TenLoaiHinhDT,
    lop.SiSo              AS SiSoKhaiBao,
    COUNT(sv.Id)          AS SiSoThucTe,
    SUM(CASE WHEN sv.TrangThai = 1 THEN 1 ELSE 0 END) AS SoDangHoc,
    lop.IsVisible,
    lop.NgayTao,
    lop.NgayCapNhat
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
LEFT JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
       ON kh.Id = lop.IDKhoaHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)
       ON ng.Id = lop.IDNganh
LEFT JOIN dbo.DM_HeDaoTao AS hdt WITH (NOLOCK)
       ON hdt.Id = lop.IDHeDaoTao
LEFT JOIN dbo.DM_LoaiHinhDT AS lh WITH (NOLOCK)
       ON lh.Id = lop.IDLoaiHinhDT
LEFT JOIN dbo.DT_SinhVien AS sv WITH (NOLOCK)
       ON sv.IDLopHoc = lop.Id
      AND ISNULL(sv.IsDelete, 0) = 0
WHERE ISNULL(lop.IsDelete, 0) = 0
  -- LỌC (bỏ dấu -- ở dòng cần dùng):
  -- AND lop.IsVisible = 1                                  -- chỉ lớp đang hiển thị
  -- AND kh.Nam >= 2023                                     -- từ khóa nhập học 2023 trở đi
  -- AND kh.TenKhoaHoc LIKE N'Khóa 70%'                     -- một khóa cụ thể
  -- AND lop.MaLopChu LIKE '70%'                            -- mã lớp bắt đầu bằng 70
  -- AND ng.TenNganh LIKE N'%Công nghệ thông tin%'          -- theo ngành
GROUP BY
    lop.Id, lop.MaLopChu, lop.MaLopSo, lop.TenLop,
    kh.TenKhoaHoc, kh.Nam,
    ng.MaNganh, ng.TenNganh,
    hdt.TenHeDaoTao, lh.TenLoaiHinhDT,
    lop.SiSo, lop.IsVisible, lop.NgayTao, lop.NgayCapNhat
ORDER BY kh.Nam DESC, lop.MaLopChu;
GO


/* ---------------------------------------------------------------------------
   QUERY 3B — Bản gọn: chỉ mã lớp và khóa, không đếm sĩ số (chạy nhanh)
--------------------------------------------------------------------------- */
SELECT
    lop.Id            AS IDLopHoc,
    lop.MaLopChu      AS MaLop,
    lop.TenLop,
    kh.TenKhoaHoc     AS Khoa,
    ng.TenNganh,
    lop.SiSo          AS SiSoKhaiBao
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
LEFT JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
       ON kh.Id = lop.IDKhoaHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)
       ON ng.Id = lop.IDNganh
WHERE ISNULL(lop.IsDelete, 0) = 0
ORDER BY kh.Nam DESC, lop.MaLopChu;
GO


/* ---------------------------------------------------------------------------
   QUERY 3C — Đếm số lớp danh nghĩa theo từng khóa
--------------------------------------------------------------------------- */
SELECT
    kh.Id             AS IDKhoaHoc,
    kh.TenKhoaHoc     AS Khoa,
    kh.Nam            AS NamNhapHoc,
    COUNT(lop.Id)     AS SoLop
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
LEFT JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
       ON kh.Id = lop.IDKhoaHoc
WHERE ISNULL(lop.IsDelete, 0) = 0
GROUP BY kh.Id, kh.TenKhoaHoc, kh.Nam
ORDER BY kh.Nam DESC, SoLop DESC;
GO


/* ---------------------------------------------------------------------------
   QUERY 4 — GÕ SỐ KHÓA -> RA HẾT LỚP DANH NGHĨA CỦA KHÓA ĐÓ
   Đổi @SoKhoa = '70' / '71' / '69'...

   Lọc theo lop.IDKhoaHoc (khóa được gán cho lớp), KHÔNG lọc theo tiền tố mã lớp,
   vì mã lớp không phải lúc nào cũng bắt đầu bằng số khóa (DQT90, LOPTC23...).
--------------------------------------------------------------------------- */
DECLARE @SoKhoa VARCHAR(3) = '70';

SELECT
    lop.MaLopChu          AS MaLop,
    lop.TenLop,
    kh.TenKhoaHoc         AS Khoa,
    ng.MaNganh,
    ng.TenNganh,
    hdt.TenHeDaoTao,
    lop.SiSo              AS SiSoKhaiBao,
    COUNT(sv.Id)          AS SiSoThucTe,
    SUM(CASE WHEN sv.TrangThai = 1 THEN 1 ELSE 0 END) AS SoDangHoc,
    lop.Id                AS IDLopHoc,
    kh.Id                 AS IDKhoaHoc
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
INNER JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
        ON kh.Id = lop.IDKhoaHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)
       ON ng.Id = lop.IDNganh
LEFT JOIN dbo.DM_HeDaoTao AS hdt WITH (NOLOCK)
       ON hdt.Id = lop.IDHeDaoTao
LEFT JOIN dbo.DT_SinhVien AS sv WITH (NOLOCK)
       ON sv.IDLopHoc = lop.Id
      AND ISNULL(sv.IsDelete, 0) = 0
WHERE ISNULL(lop.IsDelete, 0) = 0
  AND ISNULL(kh.IsDelete, 0) = 0
  AND (
        kh.TenKhoaHoc LIKE N'Khóa ' + @SoKhoa + '%'   -- 'Khóa 70 (2025)'
     OR kh.TenKhoaHoc = 'K' + @SoKhoa                 -- 'K70'
     OR kh.TenKhoaHoc = @SoKhoa                       -- '70'
      )
GROUP BY
    lop.Id, lop.MaLopChu, lop.TenLop,
    kh.Id, kh.TenKhoaHoc,
    ng.MaNganh, ng.TenNganh, hdt.TenHeDaoTao, lop.SiSo
ORDER BY lop.MaLopChu;
GO


/* ---------------------------------------------------------------------------
   QUERY 4B — Bản tối giản: chỉ danh sách mã lớp của khóa
--------------------------------------------------------------------------- */
DECLARE @SoKhoaMin VARCHAR(3) = '70';

SELECT lop.MaLopChu AS MaLop, lop.TenLop, lop.Id AS IDLopHoc
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
INNER JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
        ON kh.Id = lop.IDKhoaHoc
WHERE ISNULL(lop.IsDelete, 0) = 0
  AND (
        kh.TenKhoaHoc LIKE N'Khóa ' + @SoKhoaMin + '%'
     OR kh.TenKhoaHoc = 'K' + @SoKhoaMin
     OR kh.TenKhoaHoc = @SoKhoaMin
      )
ORDER BY lop.MaLopChu;
GO


/* ---------------------------------------------------------------------------
   QUERY 4C — Đối chiếu: lớp có mã bắt đầu bằng số khóa nhưng gán khóa khác
   Dùng để phát hiện lớp gán sai khóa (ví dụ mã '70...' nhưng IDKhoaHoc là K69).
--------------------------------------------------------------------------- */
DECLARE @SoKhoaCheck VARCHAR(3) = '70';

SELECT
    lop.MaLopChu          AS MaLop,
    lop.TenLop,
    kh.TenKhoaHoc         AS KhoaDangGan,
    kh.Nam                AS NamNhapHoc,
    lop.Id                AS IDLopHoc
FROM dbo.DM_LopHoc AS lop WITH (NOLOCK)
LEFT JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
       ON kh.Id = lop.IDKhoaHoc
WHERE ISNULL(lop.IsDelete, 0) = 0
  AND lop.MaLopChu LIKE @SoKhoaCheck + '%'
  AND (
        kh.Id IS NULL
     OR NOT (
              kh.TenKhoaHoc LIKE N'Khóa ' + @SoKhoaCheck + '%'
           OR kh.TenKhoaHoc = 'K' + @SoKhoaCheck
           OR kh.TenKhoaHoc = @SoKhoaCheck
        )
      )
ORDER BY lop.MaLopChu;
GO


/* ---------------------------------------------------------------------------
   QUERY 5 — TOÀN BỘ SINH VIÊN K71

   DB có 2 khóa mang số 71:
     id 63 = 'Khóa 71 (2026)'  -> khóa thật, 5.421 hồ sơ
     id 64 = 'K71'             -> 0 hồ sơ, dữ liệu thử
   Nên lọc thẳng theo id 63 cho chắc. Chạy QUERY 0 để đối chiếu lại nếu cần.

   Cột EmailMoodle dựng đúng logic của service đồng bộ: thiếu email thì lấy
   <MaSinhVien>@.st.huce.edu.vn (đổi theo STUDENT_EMAIL_DOMAIN trong .env).
--------------------------------------------------------------------------- */
DECLARE @IDKhoaHoc71  INT           = 63;
DECLARE @DomainEmail  NVARCHAR(100) = N'.st.huce.edu.vn';

SELECT
    sv.MaSinhVien,
    LTRIM(RTRIM(sv.HoDem + N' ' + sv.Ten))               AS HoTen,
    CASE WHEN sv.GioiTinh = 1 THEN N'Nam' ELSE N'Nữ' END AS GioiTinh,
    sv.NgaySinh,
    sv.Email                                             AS EmailGoc,
    LOWER(COALESCE(
        NULLIF(LTRIM(RTRIM(sv.Email)), N''),
        sv.MaSinhVien + N'@' + @DomainEmail
    ))                                                   AS EmailMoodle,
    CASE WHEN NULLIF(LTRIM(RTRIM(sv.Email)), N'') IS NULL
         THEN N'Tự sinh' ELSE N'' END                    AS EmailTuSinh,
    sv.SoDienThoai,
    lop.MaLopChu                                         AS MaLop,
    lop.TenLop,
    ng.MaNganh,
    ng.TenNganh,
    hdt.TenHeDaoTao,
    tt.TenTrangThai,
    kh.TenKhoaHoc                                        AS Khoa,
    sv.NgayNhapHoc,
    sv.Id                                                AS IDSinhVien
FROM dbo.DT_SinhVien AS sv WITH (NOLOCK)
INNER JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK)
        ON kh.Id = sv.IDKhoaHoc
LEFT JOIN dbo.DM_LopHoc AS lop WITH (NOLOCK)
       ON lop.Id = sv.IDLopHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)
       ON ng.Id = sv.IDNganh
LEFT JOIN dbo.DM_HeDaoTao AS hdt WITH (NOLOCK)
       ON hdt.Id = sv.IDHeDaoTao
LEFT JOIN dbo.DM_TrangThaiSinhVien AS tt WITH (NOLOCK)
       ON tt.Id = sv.TrangThai
WHERE ISNULL(sv.IsDelete, 0) = 0
  AND sv.IDKhoaHoc = @IDKhoaHoc71
ORDER BY lop.MaLopChu, sv.MaSinhVien;
GO


/* ---------------------------------------------------------------------------
   QUERY 5B — SINH VIÊN K71 SẼ THỰC SỰ ĐƯỢC ĐỒNG BỘ LÊN MOODLE
   Chỉ những em đã đăng ký học phần trong đợt (service đi qua DT_DangKyHocPhan
   nên em nào chưa đăng ký môn nào thì không được tạo tài khoản).
--------------------------------------------------------------------------- */
DECLARE @TenDot NVARCHAR(100) = N'%HK1 2026-2027%';

SELECT DISTINCT
    sv.MaSinhVien,
    LTRIM(RTRIM(sv.HoDem + N' ' + sv.Ten))               AS HoTen,
    LOWER(COALESCE(
        NULLIF(LTRIM(RTRIM(sv.Email)), N''),
        sv.MaSinhVien + N'@.st.huce.edu.vn'
    ))                                                   AS EmailMoodle,
    CASE WHEN NULLIF(LTRIM(RTRIM(sv.Email)), N'') IS NULL
         THEN N'Tự sinh' ELSE N'' END                    AS EmailTuSinh,
    lop.MaLopChu                                         AS MaLop,
    ng.TenNganh
FROM dbo.DT_DangKyHocPhan AS dkhp WITH (NOLOCK)
INNER JOIN dbo.DT_SinhVien AS sv WITH (NOLOCK)
        ON sv.Id = dkhp.IDSinhVien
INNER JOIN dbo.TKB_LopHocPhan AS lhp WITH (NOLOCK)
        ON lhp.Id = dkhp.IDLopHocPhan
INNER JOIN dbo.TKB_MonHoc AS mh WITH (NOLOCK)
        ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc AS lhoc WITH (NOLOCK)
        ON lhoc.Id = mh.IDLopHoc
INNER JOIN dbo.DM_Dot AS d WITH (NOLOCK)
        ON d.Id = lhoc.IDDot
LEFT JOIN dbo.DM_LopHoc AS lop WITH (NOLOCK)
       ON lop.Id = sv.IDLopHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)
       ON ng.Id = sv.IDNganh
WHERE dkhp.IDTrangThaiDangKy IN (1, 2, 3)
  AND d.TenDot LIKE @TenDot
  AND lhoc.IDKhoaHoc = 63          -- khóa của LỚP HỌC, đúng phạm vi service lọc
ORDER BY lop.MaLopChu, sv.MaSinhVien;
GO


/* ---------------------------------------------------------------------------
   QUERY 5C — Đếm nhanh: K71 có bao nhiêu em, bao nhiêu em thiếu email
--------------------------------------------------------------------------- */
SELECT
    COUNT(*)                                                              AS TongHoSo,
    SUM(CASE WHEN NULLIF(LTRIM(RTRIM(sv.Email)), N'') IS NULL THEN 1 ELSE 0 END) AS ThieuEmail,
    SUM(CASE WHEN NULLIF(LTRIM(RTRIM(sv.Email)), N'') IS NOT NULL THEN 1 ELSE 0 END) AS CoEmail,
    SUM(CASE WHEN sv.TrangThai = 1 THEN 1 ELSE 0 END)                     AS DangHoc
FROM dbo.DT_SinhVien AS sv WITH (NOLOCK)
WHERE ISNULL(sv.IsDelete, 0) = 0
  AND sv.IDKhoaHoc = 63;
GO


/* ---------------------------------------------------------------------------
   QUERY 6 — TOÀN BỘ SINH VIÊN NHẬP HỌC ĐỢT VỪA RỒI (Khóa 71 - 2026)

   KHÔNG auto-detect "khóa mới nhất" theo Nam DESC: DM_KhoaHoc có nhiều khóa
   cùng Nam=2026 (vd 'Khóa 71 (2026)' id 63 với 5498 SV, và '2026-04' id 67
   chỉ 90 SV - batch tuyển sinh bổ sung), ORDER BY Nam DESC không có tiebreaker
   nên có lúc ra nhầm batch nhỏ. Lọc thẳng theo tên khóa cho chắc.
--------------------------------------------------------------------------- */
DECLARE @IDKhoaMoiNhat INT = (
    SELECT TOP (1) Id FROM dbo.DM_KhoaHoc WHERE TenKhoaHoc = N'Khóa 71 (2026)' AND ISNULL(IsDelete, 0) = 0
);

SELECT
    sv.MaSinhVien,
    LTRIM(RTRIM(sv.HoDem + N' ' + sv.Ten)) AS HoTen,
    sv.Email,
    sv.SoDienThoai,
    lop.MaLopChu                          AS MaLop,
    ng.TenNganh,
    kh.TenKhoaHoc                         AS Khoa,
    sv.NgayNhapHoc
FROM dbo.DT_SinhVien AS sv WITH (NOLOCK)
INNER JOIN dbo.DM_KhoaHoc AS kh WITH (NOLOCK) ON kh.Id = sv.IDKhoaHoc
LEFT JOIN dbo.DM_LopHoc AS lop WITH (NOLOCK)  ON lop.Id = sv.IDLopHoc
LEFT JOIN dbo.DM_Nganh AS ng WITH (NOLOCK)    ON ng.Id = sv.IDNganh
WHERE sv.IDKhoaHoc = @IDKhoaMoiNhat
  AND ISNULL(sv.IsDelete, 0) = 0
ORDER BY lop.MaLopChu, sv.MaSinhVien;
GO
