import { syncLogger } from "./logger.js";

// Bộ đếm tiến độ cho tác vụ chạy dài.
//
// Đồng bộ cả một khóa mất hàng phút, trước đây terminal chỉ có dòng "Bắt đầu..."
// rồi im lặng tới lúc xong nên không biết còn sống hay treo. Bộ đếm này in định kỳ
// số đã xử lý / tổng, phân loại kết quả, tốc độ và thời gian còn lại.

// 90000 -> "1m 30s"
const fmtDuration = (ms) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/**
 * @param {string} label   Tên tác vụ, hiện trong mọi dòng log
 * @param {number} total   Tổng số bản ghi sẽ xử lý
 * @param {object} options maxStep: tối đa bao nhiêu bản ghi thì in một dòng
 */
const createProgress = (label, total, { logger = syncLogger, maxStep = 100 } = {}) => {
  const started = Date.now();
  const counts = new Map();
  let processed = 0;

  // Nhắm khoảng 20 dòng tiến độ cho một lần chạy, nhưng không thưa hơn maxStep
  const step = Math.max(1, Math.min(maxStep, Math.ceil(total / 20)));

  const summary = () =>
    [...counts.entries()].map(([name, count]) => `${name} ${count}`).join(", ");

  logger.info(`>> [${label}] bắt đầu — ${total} bản ghi`);

  const report = () => {
    const elapsed = Date.now() - started;
    const rate = processed / Math.max(elapsed / 1000, 0.001);
    const remaining = total - processed;

    logger.info(
      `>> [${label}] ${processed}/${total} (${Math.round((processed / total) * 100)}%)` +
        ` | ${summary()}` +
        ` | ${rate.toFixed(1)}/s` +
        (remaining > 0 ? ` | còn ~${fmtDuration((remaining / Math.max(rate, 0.001)) * 1000)}` : "")
    );
  };

  return {
    // Đếm một bản ghi đã xử lý xong. status là nhãn tự do: "Tạo mới", "Bỏ qua", "Lỗi"...
    tick(status = "xong") {
      processed++;
      counts.set(status, (counts.get(status) || 0) + 1);

      if (processed === total || processed % step === 0) report();
    },

    // Đếm cả cụm cùng một trạng thái (ví dụ cả lớp bị bỏ qua vì thiếu khóa học)
    add(count, status) {
      for (let i = 0; i < count; i++) this.tick(status);
    },

    finish() {
      const elapsed = Date.now() - started;
      logger.info(
        `>> [${label}] XONG sau ${fmtDuration(elapsed)} — ${summary() || "không có bản ghi nào"}`
      );
      return elapsed;
    },
  };
};

export { createProgress, fmtDuration };
