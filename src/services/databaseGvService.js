import sql from 'mssql';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

class DatabaseGvService {
    constructor() {
        this.pool = null;
        this.isConnected = false;
        this.connectionConfig = {
            ...config.sqlServer_gv,
            database: 'HRM_NUCE' // Force database name
        };
    }

    async connect() {
        try {
            if (this.pool) {
                await this.pool.close();
            }

            // Tạo connection pool mới với config riêng
            this.pool = new sql.ConnectionPool(this.connectionConfig);
            await this.pool.connect();

            this.isConnected = true;
            logger.info(`Connected to HRM_NUCE database successfully`);

            return this.pool;
        } catch (error) {
            this.isConnected = false;
            logger.error('Failed to connect to HRM_NUCE database:', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.pool) {
                await this.pool.close();
                this.pool = null;
                this.isConnected = false;
                logger.info('Disconnected from HRM_NUCE database');
            }
        } catch (error) {
            logger.error('Error disconnecting from HRM_NUCE database:', error);
            throw error;
        }
    }

    async executeQuery(query, parameters = {}) {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const request = this.pool.request();

            // Add parameters to request
            Object.keys(parameters).forEach(key => {
                request.input(key, parameters[key]);
            });

            const result = await request.query(query);
            return result;
        } catch (error) {
            logger.error('Error executing query:', error);
            throw error;
        }
    }

    async getTeachers(lastSyncDate = null) {
        try {
            // let query = `
            //    SELECT Top 3 * FROM NS_NhanSu
            // `;

            let query = `SELECT DISTINCT lhp.MaLopHocPhan, lhoc.TenLopHoc, mh.TenMonHoc,
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
WHERE lhoc.TenLopHoc = '66CS2'
`

            const parameters = {};

            if (lastSyncDate) {
                query += ' AND NgayCapNhat > @lastSyncDate';
                parameters.lastSyncDate = lastSyncDate;
            }

            // query += ' ORDER BY NgayCapNhat DESC';

            const result = await this.executeQuery(query, parameters);
            return result.recordset;
        } catch (error) {
            logger.error('Error getting teachers from HRM_NUCE:', error);
            throw error;
        }
    }

    // Lấy danh sách tables để kiểm tra cấu trúc database
    async getTables() {
        try {
            const query = `
                SELECT TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            `;

            const result = await this.executeQuery(query);
            return result.recordset;
        } catch (error) {
            logger.error('Error getting tables:', error);
            throw error;
        }
    }

    // Kiểm tra kết nối
    async checkConnection() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const result = await this.executeQuery('SELECT 1 as test');
            return result.recordset.length > 0;
        } catch (error) {
            logger.error('HRM_NUCE database connection check failed:', error);
            return false;
        }
    }
}

export default new DatabaseGvService();