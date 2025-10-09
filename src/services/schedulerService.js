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
      // Job đồng bộ full data từ SQL Server sang Moodle (chạy mỗi 24 giờ lúc 2h sáng)
      const syncAllToMoodleJob = new CronJob(
        '0 0 2 * * *',
        () => this.runSyncAllToMoodle(),
        null,
        false,
        'Asia/Ho_Chi_Minh'
      );

      this.jobs.set('syncAllToMoodle', syncAllToMoodleJob);

      logger.info('Scheduler jobs initialized', {
        syncAllToMoodleTime: '2:00 AM daily'
      });
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
      throw error;
    }
  }

  // Bắt đầu tất cả scheduled jobs
  async start() {
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

      // Chạy sync ngay lập tức khi start
      if (!this.isCurrentlyRunning('syncAllToMoodle')) {
        await this.runSyncAllToMoodle();
      }
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
      case 'syncAllToMoodle':
        return await this.runSyncAllToMoodle();
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }

  // Chạy sync all to Moodle
  async runSyncAllToMoodle() {
    try {
      if (this.isCurrentlyRunning('syncAllToMoodle')) {
        logger.warn('Sync all to Moodle is already running');
        return;
      }

      this.setRunningFlag('syncAllToMoodle', true);
      syncLogger.info('Starting scheduled sync all to Moodle');

      const result = await syncToMoodleService.syncAllToMoodle();

      syncLogger.info('Scheduled sync all to Moodle completed successfully', result);
      return result;
    } catch (error) {
      syncLogger.error('Scheduled sync all to Moodle failed:', error);
      this.notifyErrors('syncAllToMoodle', error);
      throw error;
    } finally {
      this.setRunningFlag('syncAllToMoodle', false);
    }
  }
}

export default new SchedulerService();