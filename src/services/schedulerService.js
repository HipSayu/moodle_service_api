import { CronJob } from 'cron';
import config from '../config/index.js';
import { logger, syncLogger } from '../utils/logger.js';
import syncToMoodleService from '../services/syncToMoodleService.js';
import syncFromMoodleService from '../services/syncFromMoodleService.js';

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  // Khởi tạo các scheduled jobs
  init() {
    if (!config.sync.enableAutoSync) {
      logger.info('Auto sync is disabled');
      return;
    }

    try {
      // Job đồng bộ dữ liệu từ SQL Server sang Moodle (chạy mỗi giờ)
      const syncToMoodleJob = new CronJob(
        `0 0 */${config.sync.intervalMinutes} * * *`,
        () => this.runSyncToMoodle(),
        null,
        false,
        'Asia/Ho_Chi_Minh'
      );

      // Job đồng bộ điểm từ Moodle về SQL Server (chạy mỗi 30 phút)
      const syncFromMoodleJob = new CronJob(
        '0 */30 * * * *',
        () => this.runSyncFromMoodle(),
        null,
        false,
        'Asia/Ho_Chi_Minh'
      );

      // Job backup và maintenance (chạy lúc 2h sáng hàng ngày)
      const maintenanceJob = new CronJob(
        '0 0 2 * * *',
        () => this.runMaintenance(),
        null,
        false,
        'Asia/Ho_Chi_Minh'
      );

      this.jobs.set('syncToMoodle', syncToMoodleJob);
      this.jobs.set('syncFromMoodle', syncFromMoodleJob);
      this.jobs.set('maintenance', maintenanceJob);

      logger.info('Scheduler jobs initialized', {
        syncToMoodleInterval: `${config.sync.intervalMinutes} minutes`,
        syncFromMoodleInterval: '30 minutes',
        maintenanceTime: '2:00 AM daily'
      });
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
      throw error;
    }
  }

  // Bắt đầu tất cả scheduled jobs
  start() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    try {
      this.jobs.forEach((job, name) => {
        job.start();
        logger.info(`Started scheduled job: ${name}`);
      });

      this.isRunning = true;
      logger.info('Scheduler started successfully');
    } catch (error) {
      logger.error('Failed to start scheduler:', error);
      throw error;
    }
  }

  // Dừng tất cả scheduled jobs
  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    try {
      this.jobs.forEach((job, name) => {
        job.stop();
        logger.info(`Stopped scheduled job: ${name}`);
      });

      this.isRunning = false;
      logger.info('Scheduler stopped successfully');
    } catch (error) {
      logger.error('Failed to stop scheduler:', error);
      throw error;
    }
  }

  // Chạy đồng bộ từ SQL Server sang Moodle
  async runSyncToMoodle() {
    if (this.isCurrentlyRunning('syncToMoodle')) {
      syncLogger.warn('Sync to Moodle is already running, skipping...');
      return;
    }

    this.setRunningFlag('syncToMoodle', true);
    
    try {
      syncLogger.info('Starting scheduled sync to Moodle');
      
      const result = await syncToMoodleService.syncAllToMoodle();
      
      syncLogger.info('Scheduled sync to Moodle completed successfully', {
        duration: result.duration,
        totalErrors: result.totalErrors
      });

      // Gửi thông báo nếu có lỗi
      if (result.totalErrors > 0) {
        this.notifyErrors('Sync to Moodle', result);
      }
    } catch (error) {
      syncLogger.error('Scheduled sync to Moodle failed:', error);
      this.notifyErrors('Sync to Moodle', { error: error.message });
    } finally {
      this.setRunningFlag('syncToMoodle', false);
    }
  }

  // Chạy đồng bộ từ Moodle về SQL Server
  async runSyncFromMoodle() {
    if (this.isCurrentlyRunning('syncFromMoodle')) {
      syncLogger.warn('Sync from Moodle is already running, skipping...');
      return;
    }

    this.setRunningFlag('syncFromMoodle', true);
    
    try {
      syncLogger.info('Starting scheduled sync from Moodle');
      
      const result = await syncFromMoodleService.syncGradesFromMoodle();
      
      syncLogger.info('Scheduled sync from Moodle completed successfully', {
        totalGrades: result.total,
        updated: result.updated,
        errors: result.errors
      });

      // Gửi thông báo nếu có lỗi
      if (result.errors > 0) {
        this.notifyErrors('Sync from Moodle', result);
      }
    } catch (error) {
      syncLogger.error('Scheduled sync from Moodle failed:', error);
      this.notifyErrors('Sync from Moodle', { error: error.message });
    } finally {
      this.setRunningFlag('syncFromMoodle', false);
    }
  }

  // Chạy maintenance tasks
  async runMaintenance() {
    try {
      syncLogger.info('Starting scheduled maintenance');

      // Cleanup old logs (older than 30 days)
      // Đây là nơi có thể thêm logic cleanup logs, backup database, etc.
      
      syncLogger.info('Scheduled maintenance completed');
    } catch (error) {
      syncLogger.error('Scheduled maintenance failed:', error);
    }
  }

  // Kiểm tra xem job có đang chạy không
  isCurrentlyRunning(jobName) {
    return this.runningFlags && this.runningFlags[jobName] === true;
  }

  // Set trạng thái chạy của job
  setRunningFlag(jobName, isRunning) {
    if (!this.runningFlags) {
      this.runningFlags = {};
    }
    this.runningFlags[jobName] = isRunning;
  }

  // Gửi thông báo lỗi (có thể extend để gửi email, Slack, etc.)
  notifyErrors(operation, result) {
    logger.error(`Errors occurred during ${operation}:`, {
      operation,
      result,
      timestamp: new Date().toISOString()
    });

    // TODO: Implement email/Slack notifications here
    // Example:
    // await emailService.sendErrorNotification(operation, result);
    // await slackService.sendErrorMessage(operation, result);
  }

  // Lấy trạng thái của tất cả jobs
  getJobStatus() {
    const status = {};
    
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        lastDate: job.lastDate(),
        nextDate: job.nextDate(),
        cronTime: job.cronTime.source
      };
    });

    return {
      schedulerRunning: this.isRunning,
      jobs: status,
      runningFlags: this.runningFlags || {}
    };
  }

  // Chạy một job ngay lập tức
  async runJobNow(jobName) {
    switch (jobName) {
      case 'syncToMoodle':
        return await this.runSyncToMoodle();
      case 'syncFromMoodle':
        return await this.runSyncFromMoodle();
      case 'maintenance':
        return await this.runMaintenance();
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }
}

export default new SchedulerService();