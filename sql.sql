-- Query lấy tất cả danh sách khóa học

-- Lấy tất cả khóa học (lớp học phần) với thông tin chi tiết
SELECT
    lhp.Id AS IDLopHocPhan,
    lhp.MaLopHocPhan,
    lhp.IDDot,
    lhp.IDKhoaChuQuan,
    lhp.IsXepLich,
    lhp.LopDuKien,
    lhp.IDTrangThaiLopHocPhan,
    mh.Id AS IDMonHoc,
    mh.MaMonHoc,
    mh.MaHocPhan,
    mh.TenMonHoc,
    mh.SoTinChi,
    mh.SoTietLyThuyet,
    mh.SoTietThucHanh,
    mh.SoTietTHBT,
    lhoc.Id AS IDLopHoc,
    lhoc.MaLopHoc,
    lhoc.TenLopHoc,
    COUNT(dkhp.IDSinhVien) AS SoLuongSinhVienDangKy
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDLopHocPhan = lhp.Id
    AND dkhp.IDTrangThaiDangKy IN (1,2,3)
GROUP BY lhp.Id, lhp.MaLopHocPhan, lhp.IDDot, lhp.IDKhoaChuQuan, lhp.IsXepLich,
         lhp.LopDuKien, lhp.IDTrangThaiLopHocPhan, mh.Id, mh.MaMonHoc, mh.MaHocPhan,
         mh.TenMonHoc, mh.SoTinChi, mh.SoTietLyThuyet, mh.SoTietThucHanh, mh.SoTietTHBT,
         lhoc.Id, lhoc.MaLopHoc, lhoc.TenLopHoc
ORDER BY lhp.MaLopHocPhan;

-- Lấy khóa học đã được xếp lịch (đang hoạt động)
SELECT
    lhp.Id AS IDLopHocPhan,
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    mh.SoTinChi,
    lhoc.TenLopHoc,
    COUNT(dkhp.IDSinhVien) AS SoLuongSinhVien
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDLopHocPhan = lhp.Id
    AND dkhp.IDTrangThaiDangKy IN (1,2,3)
WHERE lhp.IsXepLich = 1  -- Chỉ lấy lớp đã được xếp lịch
GROUP BY lhp.Id, lhp.MaLopHocPhan, mh.TenMonHoc, mh.SoTinChi, lhoc.TenLopHoc
ORDER BY lhp.MaLopHocPhan;

-- Lấy khóa học theo khoa/chuyên ngành
SELECT
    lhp.Id AS IDLopHocPhan,
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    lhoc.TenLopHoc,
    lhoc.MaLopHoc,
    COUNT(dkhp.IDSinhVien) AS SoLuongSinhVien
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDLopHocPhan = lhp.Id
    AND dkhp.IDTrangThaiDangKy IN (1,2,3)
WHERE lhp.IsXepLich = 1
GROUP BY lhp.Id, lhp.MaLopHocPhan, mh.TenMonHoc, lhoc.TenLopHoc, lhoc.MaLopHoc
ORDER BY lhoc.TenLopHoc, lhp.MaLopHocPhan;

-- Cách 1: Lấy theo mã lớp học phần


ALTER VIEW [dbo].[View_TKB_LichHocSinhVien]
AS 
	WITH tblDangKyHocPhan AS
	(
	    SELECT dkhp.IDLopHocPhan, dkhp.NhomThucHanh, dkhp.IDTrangThaiDangKy,
			dkhp.IDSinhVien, sv.MaSinhVien, sv.HoDem, sv.Ten, IDLopHocDanhNghia = sv.IDLopHoc, sv.GioiTinh, sv.NgaySinh2, TrangThaiSV = sv.TrangThai
		FROM dbo.DT_SinhVien sv WITH (NOLOCK)
			INNER JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDSinhVien = sv.Id AND dkhp.IDTrangThaiDangKy IN (1,2,3)		
	)
    SELECT IDLichHoc = lh.Id, lh.NgayBatDau, lh.NgayKetThuc, lh.Thu, lh.TuTiet, lh.DenTiet, lh.IsLyThuyet, lh.Nhom, lh.IsHocBu, lh.IsHocCachTuan,
		SiSoLichHoc = lh.SiSo, lh.IsDeXuatTamNgung, lh.IsTamNgung, lh.IDPhong, IDKhoaChuQuanLH = lxl.IDKhoaChuQuan,
		IDLopHocPhan = lhp.Id, lhp.IDDot, lhp.MaLopHocPhan, IDKhoaChuQuanLHP = lhp.IDKhoaChuQuan, lhp.IsXepLich,
		IDMonHoc = mh.Id, mh.MaMonHoc, mh.MaHocPhan, mh.TenMonHoc, mh.SoTinChi, mh.SoTietLyThuyet, mh.SoTietThucHanh, mh.SoTietTHBT,
		IDLopHoc = lhoc.Id, lhoc.MaLopHoc, lhoc.TenLopHoc, lhp.LopDuKien, dkhp.TrangThaiSV, dkhp.IDTrangThaiDangKy,
		dkhp.IDSinhVien, dkhp.MaSinhVien, dkhp.HoDem, dkhp.Ten, dkhp.IDLopHocDanhNghia, dkhp.GioiTinh, dkhp.NgaySinh2,
		lhp.IDTrangThaiLopHocPhan, lh.IsCongBo
    FROM tblDangKyHocPhan dkhp WITH (NOLOCK)
		INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan AND lhp.IsXepLich = 1
		INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
		INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
		INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id AND (lh.Nhom IS NULL OR dkhp.NhomThucHanh = lh.Nhom) --AND lh.IsTamNgung = 0 05/11/2015 TranKhai Comment
		INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
		INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc

	UNION ALL

	SELECT IDLichHoc = lh.Id, lh.NgayBatDau, lh.NgayKetThuc, lh.Thu, lh.TuTiet, lh.DenTiet, lh.IsLyThuyet, lh.Nhom, lh.IsHocBu, lh.IsHocCachTuan,
		SiSoLichHoc = lh.SiSo, lh.IsDeXuatTamNgung, lh.IsTamNgung, lh.IDPhong, IDKhoaChuQuanLH = lh.IDKhoaChuQuan,
		lh.IDLopHocPhan, lh.IDDot, lh.MaLopHocPhan, lh.IDKhoaChuQuanLHP, IsXepLich = 1,
		lh.IDMonHoc, lh.MaMonHoc, lh.MaHocPhan, lh.TenMonHoc, lh.SoTinChi, lh.SoTietLyThuyet, lh.SoTietThucHanh, lh.SoTietTHBT,
		lh.IDLopHoc, lh.MaLopHoc, lh.TenLopHoc, lh.LopDuKien, TrangThaiSV = sv.TrangThai, IDTrangThaiDangKy = CAST(1 AS INT),
		IDSinhVien = sv.Id, sv.MaSinhVien, sv.HoDem, sv.Ten, lh.IDLopHocDanhNghia, sv.GioiTinh, sv.NgaySinh2,
		lh.IDTrangThaiLopHocPhan, lh.IsCongBo 
	FROM dbo.DT_SinhVienDangKyHocBu hb WITH (NOLOCK)
		INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = hb.IDSinhVien
		INNER JOIN dbo.View_TKB_LichHoc lh WITH (NOLOCK) ON lh.Id = hb.IDLichHocBu
GO








-- Lấy các danh sách Sinh Viên theo lớp học phần (LOẠI TRÙ DUPLICATE)

-- Cách 1: Sử dụng DISTINCT để loại bỏ duplicate
SELECT DISTINCT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    sv.MaSinhVien,
    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
    sv.Email
FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
WHERE lhp.MaLopHocPhan = '40880403'
  AND dkhp.IDTrangThaiDangKy IN (1,2,3) -- Chỉ lấy đăng ký hợp lệ
ORDER BY sv.MaSinhVien;

-- Cách 2: Sử dụng GROUP BY để loại bỏ duplicate và đếm số nhóm
SELECT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    sv.MaSinhVien,
    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
    sv.Email,
    COUNT(dkhp.NhomThucHanh) AS SoNhomThucHanh
FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
WHERE lhp.MaLopHocPhan = '40880403'
  AND dkhp.IDTrangThaiDangKy IN (1,2,3)
GROUP BY lhp.MaLopHocPhan, mh.TenMonHoc, sv.MaSinhVien, sv.HoDem, sv.Ten, sv.Email
ORDER BY sv.MaSinhVien;

-- Cách 3: Kiểm tra data duplicate trong bảng đăng ký (Toàn bộ hệ thống)
SELECT
    dkhp.IDSinhVien,
    sv.MaSinhVien,
    sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien,
    COUNT(*) AS SoLanDangKy,
    STRING_AGG(CAST(dkhp.NhomThucHanh AS VARCHAR), ', ') AS CacNhomThucHanh,
    STRING_AGG(lhp.MaLopHocPhan, ', ') AS CacLopHocPhan
FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
WHERE dkhp.IDTrangThaiDangKy IN (1,2,3)
GROUP BY dkhp.IDSinhVien, sv.MaSinhVien, sv.HoDem, sv.Ten
HAVING COUNT(*) > 1  -- Chỉ hiện thị sinh viên đăng ký nhiều lần
ORDER BY SoLanDangKy DESC, sv.MaSinhVien;

-- Thống kê tổng quan duplicate trong hệ thống
SELECT
    'Tổng số bản ghi đăng ký' AS ThongKe,
    COUNT(*) AS SoLuong
FROM dbo.DT_DangKyHocPhan WITH (NOLOCK)
WHERE IDTrangThaiDangKy IN (1,2,3)

UNION ALL

SELECT
    'Số sinh viên có đăng ký duplicate' AS ThongKe,
    COUNT(DISTINCT IDSinhVien) AS SoLuong
FROM (
    SELECT IDSinhVien
    FROM dbo.DT_DangKyHocPhan WITH (NOLOCK)
    WHERE IDTrangThaiDangKy IN (1,2,3)
    GROUP BY IDSinhVien
    HAVING COUNT(*) > 1
) AS DuplicateStudents

UNION ALL

SELECT
    'Tổng số sinh viên duy nhất' AS ThongKe,
    COUNT(DISTINCT IDSinhVien) AS SoLuong
FROM dbo.DT_DangKyHocPhan WITH (NOLOCK)
WHERE IDTrangThaiDangKy IN (1,2,3);

-- Query lấy danh sách khóa học theo lớp với phân loại
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
    COUNT(dkhp.IDSinhVien) AS SoLuongSinhVien,
    CASE
        WHEN mh.SoTietThucHanh > mh.SoTietLyThuyet THEN 'Lớp đồ án'
        ELSE 'Lớp lý thuyết'
    END AS LoaiLopHoc,
    bm.TenBoMon,
    bm.TenPhongBan
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
INNER JOIN dbo.TMP_DsBoMonKhoa bm WITH (NOLOCK) ON mh.IDToBoMon = bm.IDBoMon
LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDLopHocPhan = lhp.Id
    AND dkhp.IDTrangThaiDangKy IN (1,2,3)
WHERE lhp.IsXepLich = 1 AND lhoc.TenLopHoc='66CS2'
GROUP BY lhp.Id, lhp.MaLopHocPhan, mh.TenMonHoc, lhoc.TenLopHoc, lhoc.MaLopHoc,mh.IDLoaiMonHoc,d.TenDot,mh.SoTietThucHanh,mh.SoTietLyThuyet, mh.IDToBoMon, bm.TenBoMon, bm.TenPhongBan
ORDER BY lhoc.TenLopHoc, lhp.MaLopHocPhan;

-- Query lấy thông tin bộ môn và khoa
SELECT IDBoMon, TenBoMon, TenPhongBan FROM TMP_DsBoMonKhoa;

-- Query lấy thông tin môn học với bộ môn và khoa
SELECT DISTINCT
    lhp.Id AS LopHocPhanId,
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    lhoc.TenLopHoc,
    lhoc.MaLopHoc,
    CASE
        WHEN mh.IDLoaiMonHoc = 1 THEN 'LyThuyet'
        WHEN mh.SoTietThucHanh > 0 THEN 'ThucHanh'
        ELSE 'LyThuyet'
    END AS LoaiMonHoc,
    d.TenDot,
    COUNT(dkhp.IDSinhVien) AS SoLuongSinhVien,
    bm.TenBoMon,
    bm.TenPhongBan
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.DM_MonHoc mh WITH (NOLOCK) ON lhp.IDMonHoc = mh.Id
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
INNER JOIN dbo.TMP_DsBoMonKhoa bm WITH (NOLOCK) ON mh.IDToBoMon = bm.IDBoMon
LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDLopHocPhan = lhp.Id
    AND dkhp.IDTrangThaiDangKy IN (1,2,3)
WHERE lhp.IsXepLich = 1 AND lhoc.TenLopHoc='66CS2'
GROUP BY lhp.Id, lhp.MaLopHocPhan, mh.TenMonHoc, lhoc.TenLopHoc, lhoc.MaLopHoc,mh.IDLoaiMonHoc,d.TenDot,mh.SoTietThucHanh,mh.SoTietLyThuyet,bm.TenBoMon,bm.TenPhongBan
ORDER BY lhoc.TenLopHoc, lhp.MaLopHocPhan;

-- Query lấy khóa học theo lớp với phân loại và ngày cập nhật (sử dụng MAX để tránh duplicate)
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
LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDLopHocPhan = lhp.Id
    AND dkhp.IDTrangThaiDangKy IN (1,2,3)
WHERE lhp.IsXepLich = 1 AND lhoc.TenLopHoc='66CS2'
GROUP BY lhp.Id, lhp.MaLopHocPhan, mh.TenMonHoc, lhoc.TenLopHoc, lhoc.MaLopHoc,mh.IDLoaiMonHoc,d.TenDot,mh.SoTietThucHanh,mh.SoTietLyThuyet, mh.IDToBoMon, bm.TenBoMon, bm.TenPhongBan
ORDER BY lhoc.TenLopHoc, lhp.MaLopHocPhan;




--  Lấy lớp theo Liên thông
  SELECT DISTINCT
          lhp.MaLopHocPhan,
          lhoc.TenLopHoc,
          mh.TenMonHoc,
          d.TenDot 
          FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
          INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
          INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
          INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
          INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
          INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
          WHERE  d.TenDot LIKE '%HK2 2025-2026%' AND sv.IDLoaiHinhDT in(17,27)
