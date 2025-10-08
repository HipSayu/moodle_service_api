import { logger } from './logger.js';

// Class để xử lý lỗi
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

// Middleware xử lý lỗi cho Express
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log lỗi
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Lỗi validation MongoDB
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new AppError(message, 400);
  }

  // Lỗi SQL Server
  if (err.code === 'ELOGIN') {
    error = new AppError('Database authentication failed', 500);
  }

  if (err.code === 'ETIMEOUT') {
    error = new AppError('Database connection timeout', 500);
  }

  // Lỗi Moodle API
  if (err.message && err.message.includes('Moodle API Error')) {
    error = new AppError(err.message, 400);
  }

  // Lỗi axios
  if (err.response) {
    error = new AppError(`External API Error: ${err.response.status}`, 502);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    timestamp: new Date().toISOString()
  });
};

// Handler cho Promise rejection không được bắt
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (err, promise) => {
    logger.error('Unhandled Promise Rejection:', err);
    process.exit(1);
  });
};

// Handler cho Exception không được bắt
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });
};

// Hàm wrapper cho async functions
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Hàm retry cho các operations có thể fail
const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`Operation failed, attempt ${i + 1}/${maxRetries}:`, error.message);
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
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