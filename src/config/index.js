import dotenv from 'dotenv';
dotenv.config();

const config = {
  // Server
  port: process.env.PORT || 4207,
  nodeEnv: process.env.NODE_ENV || 'development',

  // SQL Server
  sqlServer: {
    server: process.env.SQL_SERVER || 'localhost',
    database: process.env.SQL_DATABASE || 'university_db',
    user: process.env.SQL_USERNAME || 'sa',
    password: process.env.SQL_PASSWORD || '',
    port: parseInt(process.env.SQL_PORT || '1433'),
    options: {
      encrypt: process.env.SQL_ENCRYPT === 'true',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
      connectionTimeout: 30000,
      requestTimeout: 30000
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  },

  // Moodle Web Service
  moodle: {
    url: process.env.MOODLE_URL || 'https://your-moodle-site.com',
    token: process.env.MOODLE_TOKEN || 'your_token',
    service: process.env.MOODLE_SERVICE || 'moodle_mobile_app'
  },

  // Đồng bộ tự động.
  // Các API nhận tenDot từ request; riêng scheduler không có request
  // nên phải lấy học kỳ từ biến môi trường SYNC_TEN_DOT.
  sync: {
    enableAutoSync: process.env.ENABLE_AUTO_SYNC === 'true',
    tenDot: process.env.SYNC_TEN_DOT || '',

    // Sinh viên trong DT_SinhVien khá nhiều em trống Email. Thiếu email thì
    // dựng theo mẫu <MaSinhVien>@<domain> để vẫn tạo được tài khoản Moodle.
    studentEmailDomain: process.env.STUDENT_EMAIL_DOMAIN || '.st.huce.edu.vn',

    // Shortname khóa học Moodle: <MaLopHocPhan>_<MaCoSo>_<TenDot>.
    // Cơ sở chính được bỏ khỏi shortname để giữ nguyên tên của hơn 11.000 khóa học
    // đã đồng bộ từ trước; chỉ cơ sở khác mới được gắn thêm mã.
    mainCampusId: parseInt(process.env.SHORTNAME_MAIN_CAMPUS_ID || '1', 10),
    alwaysCampusInShortname: process.env.SHORTNAME_ALWAYS_CAMPUS === 'true',
    cronTime: process.env.SYNC_CRON_TIME || '0 0 2 * * *',
    timezone: process.env.SYNC_TIMEZONE || 'Asia/Ho_Chi_Minh'
  },

  // Lịch sử chạy tác vụ (MongoDB). Bỏ trống MONGODB_URI thì không lưu lịch sử.
  mongo: {
    uri: process.env.MONGODB_URI || '',
    dbName: process.env.MONGODB_DB || 'sync_lms',
    // Số ngày giữ lịch sử, 0 = giữ mãi
    retentionDays: parseInt(process.env.HISTORY_RETENTION_DAYS || '0', 10) || 0
  },

  // Ghi kết quả từng lần chạy ra file CSV/Excel trong logs/ (đã có lịch sử MongoDB thay thế)
  exportFiles: process.env.EXPORT_FILES === 'true',

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: process.env.LOG_MAX_FILES || '30',
    maxSize: process.env.LOG_MAX_SIZE || '10m'
  }
};

export default config;
