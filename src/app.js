import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import { logger } from './utils/logger.js';
import {
  errorHandler,
  handleUnhandledRejection,
  handleUncaughtException
} from './utils/errorHandler.js';
import apiRoutes from './routes/index.js';
import schedulerService from './services/schedulerService.js';
import databaseService from './services/databaseService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../public');

class App {
  constructor() {
    this.app = express();
    this.server = null;
  }

  initializeMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Log mỗi request kèm thời gian xử lý
    this.app.use((req, res, next) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
          durationMs: Date.now() - startedAt,
          ip: req.ip
        });
      });
      next();
    });
  }

  initializeRoutes() {
    // Giao diện quản trị, truy cập ở http://localhost:<port>/
    this.app.use(express.static(PUBLIC_DIR));

    // Thông tin service
    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        message: 'Moodle SQL Server Sync Service',
        data: {
          version: '2.0.0',
          environment: config.nodeEnv,
          apiPrefix: '/api'
        },
        timestamp: new Date().toISOString()
      });
    });

    this.app.use('/api', apiRoutes);

    // 404 cho đường dẫn không tồn tại
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: `Không có endpoint ${req.method} ${req.originalUrl}`,
        data: null,
        timestamp: new Date().toISOString()
      });
    });

    // Middleware xử lý lỗi phải đăng ký sau cùng
    this.app.use(errorHandler);
  }

  async initializeDatabase() {
    await databaseService.connect();
    logger.info('Đã kết nối SQL Server');
  }

  // Scheduler không phải thành phần bắt buộc, lỗi ở đây không chặn service
  initializeScheduler() {
    try {
      schedulerService.init();
      if (config.sync.enableAutoSync) {
        schedulerService.start();
      }
    } catch (error) {
      logger.error('Khởi tạo scheduler thất bại:', error);
    }
  }

  async initialize() {
    logger.info('Đang khởi tạo ứng dụng...');

    handleUnhandledRejection();
    handleUncaughtException();

    this.initializeMiddleware();
    this.initializeRoutes();

    await this.initializeDatabase();
    this.initializeScheduler();

    logger.info('Khởi tạo ứng dụng thành công');
  }

  async start() {
    try {
      await this.initialize();

      this.server = this.app.listen(config.port, () => {
        logger.info(`Service chạy ở cổng ${config.port}`, {
          environment: config.nodeEnv,
          autoSync: config.sync.enableAutoSync,
          tenDot: config.sync.tenDot || null
        });
      });
    } catch (error) {
      logger.error('Khởi động service thất bại:', error);
      process.exit(1);
    }
  }

  async stop() {
    logger.info('Đang dừng service...');

    try {
      schedulerService.stop();
    } catch {
      // scheduler chưa chạy thì bỏ qua
    }

    try {
      await databaseService.disconnect();
    } catch (error) {
      logger.error('Đóng kết nối SQL Server lỗi:', error);
    }

    if (this.server) {
      this.server.close(() => {
        logger.info('Service đã dừng');
        process.exit(0);
      });

      // Không chờ mãi nếu còn kết nối treo
      setTimeout(() => process.exit(0), 10000).unref();
    } else {
      process.exit(0);
    }
  }

  handleShutdown() {
    ['SIGTERM', 'SIGINT'].forEach((signal) => {
      process.on(signal, () => {
        logger.info(`Nhận ${signal}, dừng service`);
        this.stop();
      });
    });
  }
}

export default App;
