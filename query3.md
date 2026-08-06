SELECT kd.Id, kd.IDLopHocPhan, lhp.MaLopHocPhan, lhp.MaHocPhan, lhp.TenMonHoc, lhp.TenLopHoc, HoTenNS = ns.HoDem + ' ' + ns.Ten, ns.MaNhanSu, t.NgayTao,
		DaKhoaDiemQuaTrinh_Old = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 0),':')  x WHERE x.idx= 1),0) AS BIT),
		DaKhoaDiemQuaTrinh_New = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 2),':')  x WHERE x.idx= 1),0) AS BIT),
		DaKhoaDiemKetThuc_Old = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 1),':')  x WHERE x.idx= 1),0) AS BIT),
		DaKhoaDiemKetThuc_New = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 3),':')  x WHERE x.idx= 1),0) AS BIT),
		t.Status, kd.Nhom,
		DaKhoaDiemTH_Old = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 5),':')  x WHERE x.idx= 1),0) AS BIT),
		DaKhoaDiemTH_New = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 7),':')  x WHERE x.idx= 1),0) AS BIT),
		DaKhoaDiemTL_Old = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 6),':')  x WHERE x.idx= 1),0) AS BIT),
		DaKhoaDiemTL_New = CAST(ISNULL((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 8),':')  x WHERE x.idx= 1),0) AS BIT),
		GhiChu = CAST((SELECT TOP 1 x.value FROM dbo.Fn_Split_Nvar((SELECT TOP 1 x.value FROM dbo.Fn_Split_Nvar(t.Value,';') x WHERE x.idx = 10),':') x WHERE x.idx = 1) AS NVARCHAR(MAX)),
		IDHTTracking = t.Id
	FROM dbo.DT_KhoaDiem kd
		INNER JOIN dbo.View_TKB_LopHocPhan lhp ON lhp.Id = kd.IDLopHocPhan
		INNER JOIN dbo.HT_Tracking t ON	t.PrimaryKey = kd.Id AND t.TableName = 'DT_KhoaDiem'
		LEFT JOIN dbo.View_NhanSu ns ON ns.Id = t.NguoiTao
	WHERE lhp.IDDot = 298 
		AND ((SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 4),':')  x WHERE x.idx= 1) ='' OR
			  kd.Nhom = (SELECT TOP 1 x.value FROM dbo.Fn_Split((SELECT TOP 1 x.value FROM dbo.Fn_Split(t.Value,';') x WHERE x.idx= 4),':')  x WHERE x.idx= 1))