import { CronJob } from 'cron';
import config from '../config/index.js';
import { logger, syncLogger } from '../utils/logger.js';
import syncToMoodleService from './syncToMoodleService.js';

const JOB_SYNC_ALL = 'syncAllToMoodle';

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.runningFlags = {};
    this.lastRun = {};
    this.isRunning = false;
  }

  // Khởi tạo các scheduled job.
  // Scheduler không có request nên học kỳ phải lấy từ SYNC_TEN_DOT.
  init() {
    if (!config.sync.enableAutoSync) {
      logger.info('Auto sync đang tắt (ENABLE_AUTO_SYNC != true)');
      return;
    }

    if (!config.sync.tenDot) {
      logger.warn(
        'Auto sync đang bật nhưng thiếu SYNC_TEN_DOT trong .env, bỏ qua việc tạo job'
      );
      return;
    }

    try {
      const job = new CronJob(
        config.sync.cronTime,
        () => this.runSyncAll(),
        null,
        false,
        config.sync.timezone
      );

      this.jobs.set(JOB_SYNC_ALL, job);

      logger.info('Đã khởi tạo scheduler job', {
        job: JOB_SYNC_ALL,
        cronTime: config.sync.cronTime,
        tenDot: config.sync.tenDot,
        timezone: config.sync.timezone
      });
    } catch (error) {
      logger.error('Khởi tạo scheduler thất bại:', error);
      throw error;
    }
  }

  // Bật scheduler. Không chạy sync ngay để tránh block request gọi tới.
  start() {
    if (this.isRunning) {
      logger.warn('Scheduler đang chạy rồi');
      return { started: false, reason: 'already running' };
    }

    if (this.jobs.size === 0) {
      logger.warn('Không có job nào để chạy');
      return { started: false, reason: 'no jobs configured' };
    }

    this.jobs.forEach((job, name) => {
      job.start();
      logger.info(`Đã bật job: ${name}`);
    });

    this.isRunning = true;
    return { started: true, jobs: [...this.jobs.keys()] };
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler chưa chạy');
      return { stopped: false, reason: 'not running' };
    }

    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Đã dừng job: ${name}`);
    });

    this.isRunning = false;
    return { stopped: true };
  }

  isCurrentlyRunning(jobName) {
    return this.runningFlags[jobName] === true;
  }

  getJobStatus() {
    const jobs = {};

    this.jobs.forEach((job, name) => {
      jobs[name] = {
        cronTime: job.cronTime?.source,
        nextRun: job.nextDate?.()?.toISO?.() || null,
        isRunning: this.isCurrentlyRunning(name),
        lastRun: this.lastRun[name] || null
      };
    });

    return {
      schedulerRunning: this.isRunning,
      autoSyncEnabled: config.sync.enableAutoSync,
      tenDot: config.sync.tenDot || null,
      jobs
    };
  }

  // Tên job hợp lệ, không phụ thuộc vào việc cron job đã được tạo hay chưa
  hasJob(jobName) {
    return jobName === JOB_SYNC_ALL;
  }

  knownJobs() {
    return [JOB_SYNC_ALL];
  }

  async runJobNow(jobName) {
    if (!this.hasJob(jobName)) {
      throw new Error(`Không có job tên "${jobName}"`);
    }
    return this.runSyncAll();
  }

  // Chạy đồng bộ toàn bộ. Chặn chạy chồng nhau.
  async runSyncAll() {
    if (this.isCurrentlyRunning(JOB_SYNC_ALL)) {
      syncLogger.warn('Job đồng bộ toàn bộ đang chạy, bỏ qua lần này');
      return { skipped: true, reason: 'already running' };
    }

    if (!config.sync.tenDot) {
      throw new Error('Thiếu SYNC_TEN_DOT trong .env');
    }

    this.runningFlags[JOB_SYNC_ALL] = true;

    try {
      syncLogger.info(`Chạy job đồng bộ toàn bộ (đợt ${config.sync.tenDot})`);
      const result = await syncToMoodleService.syncAll({
        tenDot: config.sync.tenDot
      });
      this.lastRun[JOB_SYNC_ALL] = new Date().toISOString();
      syncLogger.info('Job đồng bộ toàn bộ hoàn tất', {
        failed: result.failed,
        durationMs: result.durationMs
      });
      return result;
    } catch (error) {
      syncLogger.error('Job đồng bộ toàn bộ thất bại:', error);
      throw error;
    } finally {
      this.runningFlags[JOB_SYNC_ALL] = false;
    }
  }
}

export default new SchedulerService();
