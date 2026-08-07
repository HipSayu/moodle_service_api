import { logger } from './logger.js';

// Lỗi do request sai (thiếu tham số, trường không hợp lệ, giá trị sai kiểu...).
// Mặc định 400 vì đây là lỗi phía người gọi, không phải lỗi máy chủ.
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Suy ra mã HTTP từ loại lỗi
const resolveStatus = (err) => {
  if (err.statusCode) return err.statusCode;

  // Thiếu tham số bắt buộc do người gọi -> 400
  if (err.message?.startsWith('Thiếu')) return 400;

  // Lỗi kết nối / xác thực SQL Server
  if (['ELOGIN', 'ETIMEOUT', 'ESOCKET', 'ECONNCLOSED'].includes(err.code)) return 503;

  // Moodle trả lỗi nghiệp vụ
  if (err.message?.includes('Moodle API Error')) return 502;

  // Lỗi HTTP khi gọi Moodle
  if (err.response) return 502;

  return 500;
};

const errorHandler = (err, req, res, next) => {
  const status = resolveStatus(err);

  // Lỗi do request sai thì chỉ cần một dòng, không cần stack trace
  const logPayload = {
    message: err.message,
    status,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  };

  if (status >= 500) {
    logPayload.stack = err.stack;
    logger.error('Request lỗi:', logPayload);
  } else {
    logger.warn('Request không hợp lệ:', logPayload);
  }

  res.status(status).json({
    success: false,
    message: err.message || 'Lỗi máy chủ',
    data: null,
    timestamp: new Date().toISOString()
  });
};

// Không tắt tiến trình: một promise lỗi lẻ không được giết cả job đồng bộ đang chạy
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection:', reason);
  });
};

// Exception không bắt được thì trạng thái tiến trình không còn tin cậy -> thoát
// để process manager (pm2/systemd) khởi động lại.
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception, tiến trình sẽ thoát:', err);
    process.exit(1);
  });
};

// Bọc handler async để lỗi rơi về errorHandler thay vì treo request
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Thử lại thao tác có thể lỗi tạm thời, giãn cách tăng dần
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`Thao tác lỗi, lần thử ${i + 1}/${maxRetries}: ${error.message}`);

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
};

export {
  AppError,
  errorHandler,
  handleUnhandledRejection,
  handleUncaughtException,
  asyncHandler,
  retryOperation
};
