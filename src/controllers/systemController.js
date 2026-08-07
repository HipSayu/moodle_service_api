import databaseService from "../services/databaseService.js";
import moodleService from "../services/moodleService.js";
import schedulerService from "../services/schedulerService.js";
import { ok, fail } from "../utils/response.js";

// Kiểm tra kết nối SQL Server và Moodle
const health = async (req, res) => {
  const services = { database: false, moodle: false };

  try {
    services.database = Boolean(await databaseService.checkConnection());
  } catch {
    services.database = false;
  }

  try {
    services.moodle = Boolean(await moodleService.checkConnection());
  } catch {
    services.moodle = false;
  }

  const healthy = services.database && services.moodle;

  return res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? "Tất cả dịch vụ hoạt động bình thường" : "Có dịch vụ không kết nối được",
    data: { status: healthy ? "ok" : "degraded", services },
    timestamp: new Date().toISOString(),
  });
};

const schedulerStatus = async (req, res) =>
  ok(res, {
    message: "Trạng thái scheduler",
    data: schedulerService.getJobStatus(),
  });

const schedulerStart = async (req, res) => {
  const result = schedulerService.start();
  return result.started
    ? ok(res, { message: "Đã bật scheduler", data: result })
    : fail(res, { message: `Không bật được scheduler: ${result.reason}`, data: result });
};

const schedulerStop = async (req, res) => {
  const result = schedulerService.stop();
  return result.stopped
    ? ok(res, { message: "Đã dừng scheduler", data: result })
    : fail(res, { message: `Không dừng được scheduler: ${result.reason}`, data: result });
};

// Chạy job ngay. Job đồng bộ toàn bộ chạy rất lâu nên trả về 202 và
// để job chạy nền, tránh treo request cho tới khi xong.
const schedulerRunJob = async (req, res) => {
  const { jobName } = req.params;

  if (!schedulerService.hasJob(jobName)) {
    return fail(res, {
      message: `Không có job tên "${jobName}". Job hợp lệ: ${schedulerService.knownJobs().join(", ")}`,
      status: 404,
    });
  }

  if (schedulerService.isCurrentlyRunning(jobName)) {
    return fail(res, { message: `Job ${jobName} đang chạy`, status: 409 });
  }

  // Kích hoạt nhưng không await, lỗi đã được log bên trong service
  schedulerService.runJobNow(jobName).catch(() => {});

  return ok(res, {
    message: `Đã kích hoạt job ${jobName}, theo dõi tiến độ ở logs/sync-*.log`,
    data: { jobName, startedAt: new Date().toISOString() },
    status: 202,
  });
};

export default {
  health,
  schedulerStatus,
  schedulerStart,
  schedulerStop,
  schedulerRunJob,
};
