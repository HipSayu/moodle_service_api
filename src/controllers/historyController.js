import historyService from "../services/historyService.js";
import { ok, fail } from "../utils/response.js";
import { getParam, getInt } from "../utils/requestParams.js";

const MAX_PAGE_SIZE = 200;

// Chưa kết nối MongoDB thì trả 503 kèm trạng thái để giao diện hướng dẫn cấu hình
function requireEnabled(res) {
  if (historyService.enabled) return true;

  const status = historyService.status();
  fail(res, {
    message: status.configured
      ? `Chưa kết nối được MongoDB nên chưa có lịch sử: ${status.error || "đang kết nối"}`
      : "Chưa cấu hình MONGODB_URI nên không lưu lịch sử",
    status: 503,
    data: status,
  });
  return false;
}

const paging = (req) => ({
  page: Math.max(1, getInt(req, "page", 1)),
  limit: Math.min(MAX_PAGE_SIZE, Math.max(1, getInt(req, "limit", 50))),
});

const detailFilters = (req) => ({
  status: getParam(req, "status"),
  kind: getParam(req, "kind"),
  q: getParam(req, "q"),
});

// GET /api/history/status
const status = async (req, res) =>
  ok(res, { message: "Trạng thái lưu lịch sử", data: historyService.status() });

// GET /api/history/runs?page&limit&category&status&q&from&to
const listRuns = async (req, res) => {
  if (!requireEnabled(res)) return;

  const data = await historyService.listRuns({
    ...paging(req),
    category: getParam(req, "category"),
    status: getParam(req, "status"),
    q: getParam(req, "q"),
    from: getParam(req, "from"),
    to: getParam(req, "to"),
  });

  return ok(res, { message: `${data.total} lần chạy`, data });
};

// GET /api/history/runs/:id
const getRun = async (req, res) => {
  if (!requireEnabled(res)) return;

  const run = await historyService.getRun(req.params.id);
  if (!run) return fail(res, { message: "Không tìm thấy lần chạy", status: 404 });

  return ok(res, { message: run.title, data: run });
};

// GET /api/history/runs/:id/details?page&limit&status&kind&q
const listDetails = async (req, res) => {
  if (!requireEnabled(res)) return;

  const data = await historyService.listDetails(req.params.id, { ...paging(req), ...detailFilters(req) });
  if (!data) return fail(res, { message: "Mã lần chạy không hợp lệ", status: 404 });

  return ok(res, { message: `${data.total} dòng chi tiết`, data });
};

// GET /api/history/runs/:id/export?status&kind&q — CSV toàn bộ dòng khớp bộ lọc
const exportDetails = async (req, res) => {
  if (!requireEnabled(res)) return;

  const found = await historyService.exportDetails(req.params.id, detailFilters(req), res);
  if (!found) return fail(res, { message: "Không tìm thấy lần chạy", status: 404 });
};

export default { status, listRuns, getRun, listDetails, exportDetails };
