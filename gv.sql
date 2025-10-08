USE [EDU_NUCE]
GO

/****** Object:  View [dbo].[View_TKB_LichHocGiangVien]    Script Date: 10/8/2025 2:30:04 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- Query lấy danh sách giảng viên của khóa học (tương tự query sinh viên)

SELECT DISTINCT
    lhp.MaLopHocPhan,
    lhoc.TenLopHoc,
    mh.TenMonHoc,
    gv.MaGiangVien,
    gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien,
    gv.Email,
    CASE WHEN lhgv.IsTroGiang = 1 THEN 'Trợ giảng' ELSE 'Giảng viên chính' END AS VaiTro
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
WHERE lhp.MaLopHocPhan = '60882503' -- Thay bằng mã lớp học phần cần tìm
ORDER BY lhgv.IsTroGiang, gv.MaGiangVien;

-- Query kiểm tra khóa học có giảng viên hay không

-- Cách 1: Kiểm tra nhanh xem khóa học có giảng viên không
SELECT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    CASE WHEN COUNT(lhgv.IDGiangVien) > 0 THEN 'Có giảng viên' ELSE 'Không có giảng viên' END AS TrangThaiGiangVien,
    COUNT(DISTINCT lhgv.IDGiangVien) AS SoLuongGiangVien,
    STRING_AGG(gv.MaGiangVien + ' - ' + gv.HoDem + ' ' + gv.Ten, ', ') AS DanhSachGiangVien
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
LEFT JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
LEFT JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
LEFT JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
LEFT JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
LEFT JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
WHERE lhp.MaLopHocPhan = '40880403' -- Thay bằng mã lớp học phần cần kiểm tra
GROUP BY lhp.MaLopHocPhan, mh.TenMonHoc;

-- Cách 2: Liệt kê chi tiết giảng viên của khóa học (nếu có)
SELECT
    'Giảng viên của khóa học' AS ThongTin,
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    gv.MaGiangVien,
    gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien,
    gv.Email,
    CASE WHEN lhgv.IsTroGiang = 1 THEN 'Trợ giảng' ELSE 'Giảng viên chính' END AS VaiTro
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
WHERE lhp.MaLopHocPhan = '40880403' -- Thay bằng mã lớp học phần cần kiểm tra
ORDER BY lhgv.IsTroGiang, gv.MaGiangVien;

-- Cách 3: Kiểm tra nhiều khóa học cùng lúc
SELECT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    COUNT(DISTINCT lhgv.IDGiangVien) AS SoGiangVien,
    CASE
        WHEN COUNT(DISTINCT lhgv.IDGiangVien) = 0 THEN '❌ Chưa có giảng viên'
        WHEN COUNT(DISTINCT lhgv.IDGiangVien) = 1 THEN '✅ Có 1 giảng viên'
        ELSE '✅ Có ' + CAST(COUNT(DISTINCT lhgv.IDGiangVien) AS VARCHAR) + ' giảng viên'
    END AS TrangThai
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
LEFT JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
LEFT JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
LEFT JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
LEFT JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
WHERE lhp.IsXepLich = 1 -- Chỉ kiểm tra lớp đã được xếp lịch
  AND lhp.MaLopHocPhan IN ('40880403', '40880404', '40880405') -- Thay bằng các mã lớp cần kiểm tra
GROUP BY lhp.MaLopHocPhan, mh.TenMonHoc
ORDER BY lhp.MaLopHocPhan;

-- Cách 1: Lấy giảng viên theo mã lớp học phần (DISTINCT để tránh duplicate)
SELECT DISTINCT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    gv.MaGiangVien,
    gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien,
    gv.Email,
    gv.SoDienThoai,
    lhgv.IsTroGiang,
    CASE WHEN lhgv.IsTroGiang = 1 THEN 'Trợ giảng' ELSE 'Giảng viên chính' END AS VaiTro
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
WHERE lhp.MaLopHocPhan = '40880403' -- Thay bằng mã lớp học phần cần tìm
ORDER BY lhgv.IsTroGiang, gv.MaGiangVien;

-- Cách 2: Lấy giảng viên với thông tin chi tiết về lịch học
SELECT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    gv.MaGiangVien,
    gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien,
    gv.Email,
    lh.Thu,
    lh.TuTiet,
    lh.DenTiet,
    lh.NgayBatDau,
    lh.NgayKetThuc,
    lhgv.IsTroGiang,
    CASE WHEN lhgv.IsTroGiang = 1 THEN 'Trợ giảng' ELSE 'Giảng viên chính' END AS VaiTro
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
WHERE lhp.MaLopHocPhan = '40880403' -- Thay bằng mã lớp học phần cần tìm
ORDER BY lh.Thu, lh.TuTiet, lhgv.IsTroGiang;

-- Cách 3: Thống kê số lượng giảng viên mỗi khóa học
SELECT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    COUNT(DISTINCT lhgv.IDGiangVien) AS TongSoGiangVien,
    COUNT(CASE WHEN lhgv.IsTroGiang = 0 THEN 1 END) AS SoGiangVienChinh,
    COUNT(CASE WHEN lhgv.IsTroGiang = 1 THEN 1 END) AS SoTroGiang,
    STRING_AGG(gv.MaGiangVien + ' (' + CASE WHEN lhgv.IsTroGiang = 1 THEN 'TG' ELSE 'GV' END + ')', ', ') AS DanhSachGiangVien
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
WHERE lhp.IsXepLich = 1 -- Chỉ lấy lớp đã được xếp lịch
GROUP BY lhp.MaLopHocPhan, mh.TenMonHoc
ORDER BY lhp.MaLopHocPhan;

-- Cách 4: Lấy tất cả khóa học và giảng viên của chúng
SELECT
    lhp.MaLopHocPhan,
    mh.TenMonHoc,
    gv.MaGiangVien,
    gv.HoDem + ' ' + gv.Ten AS HoTenGiangVien,
    lhgv.IsTroGiang
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds WITH (NOLOCK) ON ds.IDLopHocPhan = lhp.Id
INNER JOIN dbo.TKB_LopXepLichHoc lxl WITH (NOLOCK) ON lxl.Id = ds.IDLopXepLichHoc
INNER JOIN dbo.TKB_LichHoc lh WITH (NOLOCK) ON lh.IDLopXepLichHoc = lxl.Id
INNER JOIN dbo.TKB_LichHocGiangVien lhgv WITH (NOLOCK) ON lhgv.IDLichHoc = lh.Id
INNER JOIN dbo.DM_GiangVien gv WITH (NOLOCK) ON gv.Id = lhgv.IDGiangVien
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
WHERE lhp.IsXepLich = 1
ORDER BY lhp.MaLopHocPhan, lhgv.IsTroGiang, gv.MaGiangVien;

-- Query lấy thông tin giảng viên chi tiết
SELECT
    gv.Id,
    gv.MaGiangVien,
    gv.HoDem,
    gv.Ten,
    gv.HoDem + ' ' + gv.Ten AS HoTenDayDu,
    gv.GioiTinh,
    gv.NgaySinh,
    gv.Email,
    gv.SoDienThoai,
    gv.DiaChi,
    gv.IDTrinhDo,
    gv.IDChucVu,
    gv.IDKhoa,
    gv.TrangThai,
    td.TenTrinhDo,
    cv.TenChucVu,
    k.TenKhoa
FROM dbo.DM_GiangVien gv WITH (NOLOCK)
LEFT JOIN dbo.DM_TrinhDo td WITH (NOLOCK) ON gv.IDTrinhDo = td.Id
LEFT JOIN dbo.DM_ChucVu cv WITH (NOLOCK) ON gv.IDChucVu = cv.Id
LEFT JOIN dbo.DM_Khoa k WITH (NOLOCK) ON gv.IDKhoa = k.Id
ORDER BY gv.MaGiangVien;

ALTER VIEW [dbo].[View_TKB_LichHocGiangVien]
-- 09/12/2020 TranKhai: Bổ sung mh.SoTietTHBT
-- 15/12/2020 TranKhai: Bổ sung IDLopDanhNghia
-- 26/08/2022 TranKhai: INNER JOIN dbo.TKB_LichHocGiangVien
AS
	WITH tblDanhSachLopXepLichHoc AS
	(
		SELECT IDLopXepLichHoc, IDLopHocPhan, IsLopGhep = CAST(1 AS BIT)
		FROM (
			SELECT ds.IDLopXepLichHoc, ds.IDLopHocPhan, STT = ROW_NUMBER() OVER (PARTITION BY ds.IDLopXepLichHoc ORDER BY ds.IsLopHocPhanDaiDien DESC, ds.IDLopHocPhan)
			FROM (
				SELECT IDLopXepLichHoc
				FROM dbo.TKB_DanhSachLopXepLichHoc ds
				GROUP BY IDLopXepLichHoc
				HAVING COUNT(IDLopXepLichHoc) > 1
			) t
			INNER JOIN dbo.TKB_DanhSachLopXepLichHoc ds ON ds.IDLopXepLichHoc = t.IDLopXepLichHoc
		) t
		WHERE t.STT = 1

		UNION ALL

		SELECT IDLopXepLichHoc, IDLopHocPhan = MIN(IDLopHocPhan), IsLopGhep = CAST(0 AS BIT)
		FROM dbo.TKB_DanhSachLopXepLichHoc
		GROUP BY IDLopXepLichHoc
		HAVING COUNT(IDLopXepLichHoc) = 1
	)

SELECT l.Id, l.IDParentLichHoc, l.IDLopXepLichHoc, l.SiSo, l.Nhom, l.TuSiSo, l.Thu, l.TuTiet, l.DenTiet, l.NgayBatDau, l.NgayKetThuc, l.NgayBatDauHoc,
       l.NgayKetThucHoc, l.IsLyThuyet, l.IsLichBaiTap, l.IsHocCachTuan, l.IDPhong, l.IsTuChoiCapPhong, l.LyDoTuChoiCapPhong, l.IDKhoaCapPhong, l.GhiChu, l.IsLichGoc,
       l.IsHocBu, l.IsLichHocThaoLuan, l.TongTietDay, l.IDNguoiCapPhong, l.NgayCapPhong, l.NgayYeuCauCapPhong, l.IDNguoiYeuCauCapPhong, l.NgayHoanTat,
       l.IDNguoiYeuCauHoanTat, l.NgayYeuCauHoanTat, l.IDNguoiKyXacNhanHoanTat, l.NgayKyXacNhanHoanTat, l.IsKyXacNhanHoanTat, l.IsTamNgung,
       ------------
       lxl.IDDot, lxl.MaLopXepLichHoc AS MaLopHoc, lxl.TenLopXepLichHoc AS TenLopHoc, lxl.IDKhoaChuQuan, lxl.IDKhoaXepLich, lxl.IDKhoaCapGiangVien,
       lxl.IDNguoiYeuCauXepLich, lxl.NgayYeuCauXepLich, lxl.IDNguoiYeuCauCapGiangVien, lxl.NgayYeuCauCapGiangVien, lxl.SiSo AS SiSoLopXepLich,
       ------------
       ds.IDLopHocPhan, ds.IsLopGhep,
       ------------
       lhp.IDMonHoc, lhp.MaLopHocPhan, lhp.ThuTuLopHocPhan, lhp.IDTrangThaiLopHocPhan, lhp.SiSoToiThieu, lhp.SiSoToiDa, lhp.IDKhoaChuQuan AS IDKhoaChuQuanLHP,
       lhp.LopDuKien,
       ------------
       mh.IDLopHoc, mh.TenMonHoc, mh.SoTietLyThuyet, mh.SoTietThucHanh, mh.SoTietTHBT, mh.MaHocPhan, mh.SoTinChi, mh.MaMonHoc, mh.IDToBoMon,
       ------------
       lh.IDCoSo, lh.IDKhoaHoc, lh.IDHeDaoTao, lh.IDLoaiDaoTao, lh.IDNganh, lh.IDNghe, lh.HocKy, lh.SiSo AS SiSoLopHoc, lh.IsNienChe, lh.IDLopHocDanhNghia,
       ------------
       lhgv.IDGiangVien, IsNhieuGiangVien = CAST(0 AS BIT), lhgv.IsTroGiang,
       ------------
       gv.MaGiangVien, TenGiangVien = gv.HoDem + ' ' + gv.Ten,
       ------------
       p.MaPhong, p.TenPhong, l.IDPhuongThucGiangDay, lhp.IDTinhChatMonHoc
FROM dbo.TKB_LichHoc l
     INNER JOIN dbo.TKB_LopXepLichHoc lxl ON l.IDLopXepLichHoc = lxl.Id
     INNER JOIN tblDanhSachLopXepLichHoc AS ds ON lxl.Id = ds.IDLopXepLichHoc
     INNER JOIN dbo.TKB_LopHocPhan lhp ON ds.IDLopHocPhan = lhp.Id
     INNER JOIN dbo.TKB_MonHoc mh ON lhp.IDMonHoc = mh.Id
     INNER JOIN dbo.TKB_LopHoc lh ON mh.IDLopHoc = lh.Id
	 INNER JOIN dbo.TKB_LichHocGiangVien lhgv ON lhgv.IDLichHoc = l.Id	 
     --LEFT JOIN (
     --    SELECT IDLichHoc, MIN(IDGiangVien) AS IDGiangVien, (CASE WHEN COUNT(*) > 1 THEN CONVERT(BIT, 1) ELSE CONVERT(BIT, 0) END) AS IsNhieuGiangVien, IsTroGiang
     --    FROM dbo.TKB_LichHocGiangVien
     --    GROUP BY IDLichHoc, IsTroGiang
     --) AS lhgv ON l.Id = lhgv.IDLichHoc
     LEFT JOIN dbo.DM_GiangVien gv ON lhgv.IDGiangVien = gv.Id
     LEFT JOIN dbo.DM_Phong p ON l.IDPhong = p.Id;

GO
