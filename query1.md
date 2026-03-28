WITH CTE AS (
    SELECT 
        b.MaLopHocPhan,
        b.TenMonHoc,
        b.TenLopHoc,
        b.NgayKetThucTienDo,
        d.NgayThi,
        ns.HoDem + ' ' + ns.Ten AS GiangVienGiangDay,
        COALESCE(tbm.TenBoMon, ns.TenPhongBan) AS BoMonQuanLyGiangVien,
        k.TenKhoa AS KhoaQuanLyGiangVien,
        b.SiSo AS SiSoLopHocPhan,
        a.DaKhoaDiemKetThuc AS TrangThaiKhoaDiemKetThuc,
        a.NgayTao AS NgayKhoaDiemKetThucLanDau,
        c.HoDem + ' ' + c.Ten AS UserKhoaDiemKetThuc,
        ROW_NUMBER() OVER (
            PARTITION BY b.MaLopHocPhan
            ORDER BY a.NgayCapNhat DESC
        ) AS rn
    FROM DT_KhoaDiem a
    JOIN View_TKB_LopHocPhan b ON a.IDLopHocPhan = b.Id
    JOIN HRM_NUCE.dbo.NS_NhanSu c ON a.NguoiTao = c.IDNhanSu
    JOIN View_NhanSuHeThong ns ON ns.Id = c.IDNhanSu    
    LEFT JOIN View_HRM_ACL_ToBoMonQuanLy tbm ON tbm.MaNhanSu = ns.MaNhanSu AND tbm.IsBoMonChinh = 1
    LEFT JOIN View_Khoa k ON k.Id = ns.IDKhoa
    JOIN View_LichThiTrongDanhSachThiKetThuc d ON d.MaHocPhan = b.MaHocPhan 
    LEFT JOIN DTBD_TKB_LichHoc lh ON lh.IDLopHocPhan = b.Id
    WHERE 
        b.IDDot = 298
        AND DATEDIFF(day, d.NgayThi, a.NgayTao) > 14
        AND c.HoDem LIKE N'%Hoàng%' AND c.Ten LIKE N'%Thắng%'
)
SELECT *
FROM CTE
WHERE rn = 1;








select a.*,dbo.Fn_GetSiSoDangKy(IDLopHocPhan, NULL)  as sisoDangKy  ,b.IDQuyUocCotDiem
into  #tmp2
from [LinkedServerName].[EDU_NUCE].[dbo].View_TKB_LichHocGiangVien a
left join [LinkedServerName].[EDU_NUCE].[dbo].View_TKB_Lophocphan b on a.MaLopHocPhan = b.malophocphan and a.IDDot = b.IDDot
where a.IDDot = 298 and IsHocBu != 1

--drop table #tmp2
WITH LichTrungLap AS (
    SELECT 
        MaMonHoc,
        MaGiangVien,
        IDToBoMon,
        TenGiangVien,
SUM(SiSoDangKy) AS TongSiSoDangKy,
        STRING_AGG(MaLopHocPhan, ',') WITHIN GROUP (ORDER BY MaLopHocPhan) AS DanhSachMaLopHocPhan,
        STRING_AGG(TenLopHoc, ',') WITHIN GROUP (ORDER BY MaLopHocPhan) AS DanhSachTenLopHoc,
		IDQuyUocCotDiem
    FROM #tmp2
    WHERE IDDot IN (298) 
        AND IsTamNgung = 0
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
SELECT 
    MaGiangVien,
    TenGiangVien,
    IDToBoMon,
    null as TenBoMon,
	null as IDKhoaGV,
    null as TenKhoaGV,
    298 as IDDot,
    null as TenDot,
    MaMonHoc,
    null as TenMonHoc,
    DanhSachMaLopHocPhan,
    DanhSachTenLopHoc,
    null as SoTietLyThuyet,
    null as SoTietThucHanh,
    TongSiSoDangKy,
    null as IDTinhChatMonHoc,
    null as TenTinhChatMonHoc,
    0 AS Cot1,
    0 AS Cot2,
    1 AS Cot3,
    0 AS Cot4,
    1 AS Cot5,
    1 AS Cot6,
    '' AS GhiChu1,
    '' AS GhiChu2,
    '' AS GhiChu3,
    NULL AS CotNull1,
    NULL AS CotNull2,
    NULL AS CotNull3,
    NULL AS CotNull4,
	null as cotnull5,
	null as cotnull6,
	1 as cotnull7,
	IDQuyUocCotDiem
INTO #tmp3
FROM (
    SELECT *,
           ROW_NUMBER() OVER (
               PARTITION BY MaGiangVien, MaMonHoc, DanhSachMaLopHocPhan, DanhSachTenLopHoc
               ORDER BY MaMonHoc
           ) AS rn
    FROM LichTrungLap                                           
) AS sub
WHERE rn = 1;