import App from './src/app.js';
import { logger } from './src/utils/logger.js';

// Tạo và khởi chạy ứng dụng
const app = new App();

// Handle graceful shutdown
app.handleShutdown();

// Start the application
app.start().catch(error => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});