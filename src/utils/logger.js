import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tạo format cho log
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Tạo format cho console
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
  })
);

// Transport cho file log thông thường
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(__dirname, '../../logs/application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: config.logging.maxFiles,
  maxSize: config.logging.maxSize,
  format: logFormat
});

// Transport cho file log lỗi
const errorFileRotateTransport = new DailyRotateFile({
  filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: config.logging.maxFiles,
  maxSize: config.logging.maxSize,
  level: 'error',
  format: logFormat
});

// Transport cho sync log
const syncFileRotateTransport = new DailyRotateFile({
  filename: path.join(__dirname, '../../logs/sync-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: config.logging.maxFiles,
  maxSize: config.logging.maxSize,
  format: logFormat
});

// Tạo logger chính
const logger = winston.createLogger({
  level: config.logging.level,
  transports: [
    // Console output
    new winston.transports.Console({
      format: consoleFormat
    }),
    // File outputs
    fileRotateTransport,
    errorFileRotateTransport
  ]
});

// Tạo logger riêng cho sync operations
const syncLogger = winston.createLogger({
  level: config.logging.level,
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    syncFileRotateTransport
  ]
});

// Event handlers cho file rotation
fileRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Log file rotated', { oldFilename, newFilename });
});

errorFileRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Error log file rotated', { oldFilename, newFilename });
});

syncFileRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Sync log file rotated', { oldFilename, newFilename });
});

export { logger, syncLogger };