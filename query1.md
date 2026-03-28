WITH LichThi AS (
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
        dtk.SiSo AS SiSoLopHocPhan,
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
         AND DATEDIFF(day, lt.NgayThi, a.NgayTao) > 14
    )
    SELECT *
    FROM CTE
    WHERE rn = 1;