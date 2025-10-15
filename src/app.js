import express from 'express';
import config from './config/index.js';
import { logger } from './utils/logger.js';
import { 
  errorHandler, 
  handleUnhandledRejection, 
  handleUncaughtException 
} from './utils/errorHandler.js';
import apiRoutes from './routes/api.js';
import schedulerService from './services/schedulerService.js';
import databaseService from './services/databaseService.js';


class App {
  constructor() {
    this.app = express();
    this.server = null;
  }

  // Khởi tạo middleware
  initializeMiddleware() {
    // Body parser
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      next();
    });

    // Health check route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Moodle SQL Server Sync Service',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    // API routes
    this.app.use('/api', apiRoutes);

    // Scheduler status route
    this.app.get('/scheduler/status', (req, res) => {
      const status = schedulerService.getJobStatus();
      res.json({
        success: true,
        data: status
      });
    });

    // Manual job trigger routes
    this.app.post('/scheduler/run/:jobName', async (req, res) => {
      try {
        const { jobName } = req.params;
        await schedulerService.runJobNow(jobName);
        res.json({
          success: true,
          message: `Job ${jobName} executed successfully`
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
    });

    // Scheduler control routes
    this.app.post('/scheduler/start', async (req, res) => {
      try {
        await schedulerService.start();
        res.json({
          success: true,
          message: 'Scheduler started successfully'
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
    });

    this.app.post('/scheduler/stop', async (req, res) => {
      try {
        schedulerService.stop();
        res.json({
          success: true,
          message: 'Scheduler stopped successfully'
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    });

    // Error handling middleware
    this.app.use(errorHandler);
  }

  // Khởi tạo database connection
  async initializeDatabase() {
    try {
      await databaseService.connect();
      logger.info('Database connection established');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }


  // Khởi tạo scheduler
  async initializeScheduler() {
    try {
      schedulerService.init();
      schedulerService.start();
      logger.info('Scheduler initialized and started');
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
      // Không throw error ở đây vì scheduler không phải là critical
    }
  }

  // Khởi tạo error handlers
  initializeErrorHandlers() {
    handleUnhandledRejection();
    handleUncaughtException();
  }

  // Khởi tạo ứng dụng
  async initialize() {
    try {
      logger.info('Initializing application...');

      // Initialize middleware
      this.initializeMiddleware();

      // Initialize error handlers
      this.initializeErrorHandlers();

      // Initialize database
      await this.initializeDatabase();
      // Initialize scheduler
      // await this.initializeScheduler(); // Tắt tự động đồng bộ

      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  // Bắt đầu server
  async start() {
    try {
      await this.initialize();

      this.server = this.app.listen(config.port, () => {
        logger.info(`Server running on port ${config.port}`, {
          environment: config.nodeEnv,
          port: config.port,
          autoSync: config.sync.enableAutoSync
        });
        
        logger.info('Moodle SQL Server Sync Service started successfully');
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  // Dừng server gracefully
  async stop() {
    try {
      logger.info('Shutting down server...');

      // Stop scheduler
      // if (schedulerService) {
      //   schedulerService.stop();
      // }

      // Close database connection
      if (databaseService) {
        await databaseService.disconnect();
      }
     
      // Close server
      if (this.server) {
        this.server.close(() => {
          logger.info('Server stopped');
          process.exit(0);
        });
      }
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  // Handle graceful shutdown
  handleShutdown() {
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      this.stop();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      this.stop();
    });
  }
}
export default App;