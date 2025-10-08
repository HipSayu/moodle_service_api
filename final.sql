
-- Danh sách Sinh Viên và Lớp học
SELECT lhp.MaLopHocPhan, mh.TenMonHoc, sv.MaSinhVien, sv.HoDem + ' ' + sv.Ten AS HoTenSinhVien, sv.Email
FROM dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK)
INNER JOIN dbo.DT_SinhVien sv WITH (NOLOCK) ON sv.Id = dkhp.IDSinhVien
INNER JOIN dbo.TKB_LopHocPhan lhp WITH (NOLOCK) ON lhp.Id = dkhp.IDLopHocPhan
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
WHERE lhp.MaLopHocPhan = '40880403'
ORDER BY sv.MaSinhVien;



-- Danh sách các Khóa học chưa có loại lớp học
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
    COUNT(dkhp.IDSinhVien) AS SoLuongSinhVien
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDLopHocPhan = lhp.Id
    AND dkhp.IDTrangThaiDangKy IN (1,2,3)
WHERE lhp.IsXepLich = 1 AND lhoc.TenLopHoc='66CS2'
GROUP BY lhp.Id, lhp.MaLopHocPhan, mh.TenMonHoc, lhoc.TenLopHoc, lhoc.MaLopHoc,mh.IDLoaiMonHoc,d.TenDot,mh.SoTietThucHanh,mh.SoTietLyThuyet
ORDER BY lhoc.TenLopHoc, lhp.MaLopHocPhan;

-- Danh sách Khóa học đã có loại Lớp học

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
    COUNT(dkhp.IDSinhVien) AS SoLuongSinhVien,
    CASE
        WHEN mh.SoTietThucHanh > mh.SoTietLyThuyet THEN 'Lớp đồ án'
        ELSE 'Lớp lý thuyết'
    END AS LoaiLopHoc  -- Cột mới phân loại
FROM dbo.TKB_LopHocPhan lhp WITH (NOLOCK)
INNER JOIN dbo.TKB_MonHoc mh WITH (NOLOCK) ON mh.Id = lhp.IDMonHoc
INNER JOIN dbo.TKB_LopHoc lhoc WITH (NOLOCK) ON lhoc.Id = mh.IDLopHoc
INNER JOIN dbo.DM_Dot d WITH (NOLOCK) ON lhoc.IDDot = d.Id
LEFT JOIN dbo.DT_DangKyHocPhan dkhp WITH (NOLOCK) ON dkhp.IDLopHocPhan = lhp.Id
    AND dkhp.IDTrangThaiDangKy IN (1,2,3)
WHERE lhp.IsXepLich = 1 AND lhoc.TenLopHoc='66CS2'
GROUP BY lhp.Id, lhp.MaLopHocPhan, mh.TenMonHoc, lhoc.TenLopHoc, lhoc.MaLopHoc,mh.IDLoaiMonHoc,d.TenDot,mh.SoTietThucHanh,mh.SoTietLyThuyet
ORDER BY lhoc.TenLopHoc, lhp.MaLopHocPhan;


-- Giảng Viên Học Phần Khóa học

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




-- Khóa học chứa cả bộ môn
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



-- Categories
SELECT IDBoMon, TenBoMon, TenPhongBan FROM TMP_DsBoMonKhoa



-- Khóa học có cả ngày cập nhật
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

