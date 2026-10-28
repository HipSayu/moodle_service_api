import { AsyncLocalStorage } from "node:async_hooks";
import { MongoClient, ObjectId } from "mongodb";
import config from "../config/index.js";
import { logger } from "../utils/logger.js";
import { COLUMN_TITLES } from "../utils/csvHelper.js";

// Lịch sử chạy tác vụ lưu trong MongoDB:
//   runs        — mỗi lần chạy một bản ghi: ai chạy, tham số, phạm vi, thời gian, kết quả, lỗi, từng bước
//   run_details — từng dòng chi tiết của lần chạy (từng sinh viên, từng lớp...), lọc/tìm được
//
// MongoDB chỉ là nơi lưu vết: mất kết nối thì service vẫn đồng bộ bình thường,
// chỉ không ghi lịch sử, và tự thử kết nối lại.

const RUNS = "runs";
const DETAILS = "run_details";
const DETAIL_BATCH = 1000;
const MAX_STRING = 4000;
const MAX_ARRAY = 200;
const RECONNECT_MS = 60000;

// Mảng lớn trong kết quả trả về đã được lưu riêng thành từng dòng ở run_details
const HEAVY_KEYS = new Set(["details", "items", "rows", "csvFiles"]);

// Trường rút ra từ mỗi dòng chi tiết để lọc và tìm kiếm nhanh
const STATUS_KEYS = ["TrangThai", "HanhDong"];
const CODE_KEYS = ["MaSinhVien", "MaGiangVien", "MaNhanSu", "MaNguoiDung", "MaLopHocPhan", "CourseId"];
const NAME_KEYS = ["HoTenSinhVien", "HoTenGiangVien", "HoTen", "TenMonHoc"];
const COURSE_KEYS = ["ShortName", "shortname", "MaLopHocPhan"];
const ERROR_KEYS = ["LoiChiTiet", "error"];

const CATEGORY_RULES = [
  [/^\/enrollments\/cleanup/, "cleanup"],
  [/^\/enrollments\//, "enroll"],
  [/^\/sync\//, "sync"],
  [/^\/moodle\/courses\/merge/, "merge"],
  [/^\/moodle\//, "moodle"],
  [/^\/reports\//, "report"],
  [/^\/scheduler\//, "system"],
];

// Tên tác vụ khi gọi thẳng API (giao diện tự gửi tên qua header X-Task-Title)
const DEFAULT_TITLES = [
  [/^\/sync\/categories/, "Đồng bộ khoa / bộ môn"],
  [/^\/sync\/students\/by-class/, "Tài khoản sinh viên theo lớp danh nghĩa"],
  [/^\/sync\/students/, "Tài khoản sinh viên"],
  [/^\/sync\/teachers/, "Tài khoản giảng viên"],
  [/^\/sync\/courses\/full/, "Tạo lớp học phần + ghi danh"],
  [/^\/sync\/courses/, "Tạo khóa học"],
  [/^\/sync\/grades/, "Đồng bộ điểm"],
  [/^\/sync\/all/, "Đồng bộ toàn bộ"],
  [/^\/enrollments\/students/, "Ghi danh sinh viên"],
  [/^\/enrollments\/teachers/, "Ghi danh giảng viên"],
  [/^\/enrollments\/cleanup-campus/, "Dọn ghi danh nhầm cơ sở"],
  [/^\/moodle\/courses\/merge/, "Gộp lớp"],
  [/quizzes/, "Quiz"],
  [/^\/reports\//, "Báo cáo khóa điểm"],
  [/^\/scheduler\//, "Lịch đồng bộ tự động"],
];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pick = (row, keys) => {
  for (const key of keys) {
    const v = row?.[key];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
};

// Cắt bớt trước khi lưu: chuỗi quá dài, mảng quá lớn, khóa MongoDB không nhận ($ đầu, dấu chấm)
function compact(value, { dropHeavy = false, depth = 0 } = {}) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value !== "object" || value instanceof Date || value instanceof ObjectId) return value;
  if (depth > 6) return "[…]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((v) => compact(v, { dropHeavy, depth: depth + 1 }));
  }

  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined || (dropHeavy && HEAVY_KEYS.has(key))) continue;
    const safeKey = key.replace(/^\$/, "_").replace(/\./g, "_");
    out[safeKey] = compact(v, { dropHeavy, depth: depth + 1 });
  }
  return out;
}

function basicAuthUser(header) {
  const match = /^Basic\s+(.+)$/i.exec(header || "");
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const i = decoded.indexOf(":");
    return i > 0 ? decoded.slice(0, i) : null;
  } catch {
    return null;
  }
}

// Chỉ ghi lịch sử cho tác vụ làm thay đổi dữ liệu và báo cáo, bỏ qua các lần đọc
function isTracked(req) {
  const p = req.path;
  if (p.startsWith("/history")) return false;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return req.method === "GET" && p.startsWith("/reports/");
  }
  return p !== "/moodle/courses/merge/preview";
}

const ruleFor = (rules, path, fallback) => rules.find(([re]) => re.test(path))?.[1] ?? fallback;

const toClient = ({ _id, ...rest }) => ({ id: String(_id), ...rest });

function parseId(id) {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id) ? new ObjectId(id) : null;
}

// "2026-10-26" -> đầu ngày / cuối ngày theo giờ máy chủ
function dayBoundary(value, endOfDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setDate(d.getDate() + 1);
  return d;
}

class HistoryService {
  constructor() {
    this.als = new AsyncLocalStorage();
    this.client = null;
    this.db = null;
    this.runs = null;
    this.details = null;
    this.state = config.mongo.uri ? "disconnected" : "disabled";
    this.lastError = null;
    this.reconnectTimer = null;
  }

  get enabled() {
    return Boolean(this.db);
  }

  status() {
    return {
      configured: Boolean(config.mongo.uri),
      connected: this.enabled,
      state: this.state,
      database: config.mongo.dbName,
      error: this.lastError,
    };
  }

  // ==================== KẾT NỐI ====================

  async connect() {
    if (!config.mongo.uri) {
      this.state = "disabled";
      logger.info("Chưa cấu hình MONGODB_URI — không lưu lịch sử chạy");
      return false;
    }
    if (this.enabled) return true;

    this.state = "connecting";
    const client = new MongoClient(config.mongo.uri, {
      serverSelectionTimeoutMS: 5000,
      appName: "moodle-sync",
    });

    try {
      await client.connect();
      this.client = client;
      this.useDb(client.db(config.mongo.dbName));
      await this.ensureIndexes();
      logger.info(`Đã kết nối MongoDB, lưu lịch sử vào database "${config.mongo.dbName}"`);
      return true;
    } catch (error) {
      await client.close().catch(() => {});
      this.state = "error";
      this.lastError = error.message;
      logger.error(
        `Kết nối MongoDB thất bại, service vẫn chạy nhưng chưa lưu lịch sử. Thử lại sau ${RECONNECT_MS / 1000}s: ${error.message}`
      );
      this.scheduleReconnect();
      return false;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
    this.reconnectTimer.unref();
  }

  // Tách riêng để test truyền vào database giả
  useDb(db) {
    this.db = db;
    this.runs = db.collection(RUNS);
    this.details = db.collection(DETAILS);
    this.state = "connected";
    this.lastError = null;
  }

  async ensureIndexes() {
    const tasks = [
      this.runs.createIndex({ startedAt: -1 }),
      this.runs.createIndex({ category: 1, startedAt: -1 }),
      this.runs.createIndex({ status: 1, startedAt: -1 }),
      this.details.createIndex({ runId: 1, seq: 1 }),
      this.details.createIndex({ runId: 1, status: 1 }),
    ];

    const days = config.mongo.retentionDays;
    if (days > 0) {
      const ttl = { expireAfterSeconds: days * 86400 };
      tasks.push(this.runs.createIndex({ startedAt: 1 }, { ...ttl, name: "ttl_startedAt" }));
      tasks.push(this.details.createIndex({ createdAt: 1 }, { ...ttl, name: "ttl_createdAt" }));
    }

    const results = await Promise.allSettled(tasks);
    results
      .filter((r) => r.status === "rejected")
      .forEach((r) => logger.warn(`Tạo index MongoDB lỗi: ${r.reason?.message}`));
  }

  async close() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.client) await this.client.close().catch(() => {});
    this.client = null;
    this.db = null;
    this.state = config.mongo.uri ? "disconnected" : "disabled";
  }

  // ==================== GHI LỊCH SỬ ====================

  current() {
    return this.als.getStore() || null;
  }

  async startRun(info) {
    if (!this.enabled) return null;

    const doc = {
      _id: new ObjectId(),
      title: info.title,
      category: info.category || "other",
      trigger: info.trigger || "api",
      method: info.method || null,
      path: info.path || null,
      params: compact(info.params ?? null),
      scope: compact(info.scope || {}),
      actor: info.actor || null,
      ip: info.ip || null,
      userAgent: info.userAgent || null,
      status: "running",
      startedAt: new Date(),
      detailCount: 0,
      detailKinds: [],
    };

    try {
      await this.runs.insertOne(doc);
      return { id: doc._id, startedAt: doc.startedAt, seq: 0, count: 0, kinds: new Set(), finished: false };
    } catch (error) {
      logger.error(`Ghi lịch sử (bắt đầu) lỗi: ${error.message}`);
      return null;
    }
  }

  async finishRun(run, { httpStatus = 200, body = null } = {}) {
    if (!run || run.finished || !this.enabled) return;
    run.finished = true;

    const data = body?.data && typeof body.data === "object" ? body.data : {};

    try {
      // Tác vụ chỉ trả chi tiết trong response (gộp lớp, chạy một mã) thì lưu từ đó
      if (run.count === 0 && Array.isArray(data.details) && data.details.length) {
        await this.recordRowsTo(run, data.details, "result");
      }

      const ok = httpStatus >= 200 && httpStatus < 300 && body?.success !== false;
      const status = httpStatus === 207 ? "partial" : ok ? "success" : "failed";

      const summary = {};
      for (const key of ["total", "succeeded", "skipped", "failed", "created"]) {
        if (typeof data[key] === "number") summary[key] = data[key];
      }

      const finishedAt = new Date();
      await this.runs.updateOne(
        { _id: run.id },
        {
          $set: {
            status,
            httpStatus,
            message: body?.message ?? (ok ? "Hoàn tất" : null),
            summary,
            result: compact(data, { dropHeavy: true }),
            errorCount: Array.isArray(data.errors) ? data.errors.length : 0,
            finishedAt,
            durationMs: finishedAt - run.startedAt,
            detailCount: run.count,
            detailKinds: [...run.kinds],
          },
        }
      );
    } catch (error) {
      logger.error(`Ghi lịch sử (kết thúc) lỗi: ${error.message}`);
    }
  }

  // Lưu các dòng chi tiết vào lần chạy hiện tại (lấy theo ngữ cảnh request / job)
  async recordRows(rows, { kind = "rows" } = {}) {
    const run = this.current();
    if (!run || !this.enabled || !Array.isArray(rows) || !rows.length) return;
    await this.recordRowsTo(run, rows, kind);
  }

  async recordRowsTo(run, rows, kind) {
    run.kinds.add(kind);
    const createdAt = new Date();

    try {
      for (let i = 0; i < rows.length; i += DETAIL_BATCH) {
        const docs = rows.slice(i, i + DETAIL_BATCH).map((row) => ({
          runId: run.id,
          seq: ++run.seq,
          kind,
          status: pick(row, STATUS_KEYS),
          code: pick(row, CODE_KEYS),
          name: pick(row, NAME_KEYS),
          course: pick(row, COURSE_KEYS),
          error: pick(row, ERROR_KEYS),
          data: compact(row),
          createdAt,
        }));
        await this.details.insertMany(docs, { ordered: false });
        run.count += docs.length;
      }

      await this.runs.updateOne(
        { _id: run.id },
        { $set: { detailCount: run.count, detailKinds: [...run.kinds] } }
      );
    } catch (error) {
      logger.error(`Ghi chi tiết lịch sử lỗi: ${error.message}`);
    }
  }

  // Bọc một tác vụ không đi qua HTTP (job scheduler) thành một lần chạy riêng
  async track(info, fn, toOutcome) {
    const run = await this.startRun(info);
    try {
      const result = await this.als.run(run, fn);
      await this.finishRun(
        run,
        toOutcome ? toOutcome(result) : { httpStatus: 200, body: { success: true, data: result } }
      );
      return result;
    } catch (error) {
      await this.finishRun(run, { httpStatus: 500, body: { success: false, message: error.message } });
      throw error;
    }
  }

  // Middleware Express: mở một lần chạy cho mỗi request ghi dữ liệu, chạy handler
  // trong ngữ cảnh đó để recordRows() biết gắn chi tiết vào đâu.
  middleware() {
    return (req, res, next) => {
      if (!this.enabled || !isTracked(req)) return next();

      const begin = async () => {
        let title = null;
        try {
          title = req.get("x-task-title") ? decodeURIComponent(req.get("x-task-title")) : null;
        } catch {
          title = null;
        }

        const body = req.body && typeof req.body === "object" && Object.keys(req.body).length ? req.body : null;
        const query = Object.keys(req.query || {}).length ? req.query : null;

        const run = await this.startRun({
          title: title || ruleFor(DEFAULT_TITLES, req.path, `${req.method} ${req.path}`),
          category: ruleFor(CATEGORY_RULES, req.path, "other"),
          trigger: req.get("x-task-page") ? "ui" : "api",
          method: req.method,
          path: `/api${req.path}`,
          params: { body, query },
          scope: {
            tenDot: body?.tenDot ?? query?.tenDot,
            idKhoaHoc: body?.idKhoaHoc ?? query?.idKhoaHoc,
            khoaHoc: body?.khoaHoc ?? query?.khoaHoc,
            idDot: query?.idDot,
          },
          actor: basicAuthUser(req.get("authorization")),
          ip: (req.get("x-forwarded-for") || "").split(",")[0].trim() || req.ip,
          userAgent: req.get("user-agent") || null,
        });

        if (!run) return next();

        res.setHeader("X-Run-Id", String(run.id));

        const json = res.json.bind(res);
        res.json = (payload) => {
          this.finishRun(run, { httpStatus: res.statusCode, body: payload });
          return json(payload);
        };
        // Tải file (báo cáo) không đi qua res.json
        res.on("finish", () => this.finishRun(run, { httpStatus: res.statusCode, body: null }));

        this.als.run(run, next);
      };

      begin().catch(next);
    };
  }

  // ==================== ĐỌC LỊCH SỬ ====================

  async listRuns({ page = 1, limit = 50, category, status, q, from, to } = {}) {
    const filter = {};
    if (category) filter.category = category;
    if (status) filter.status = status;

    const start = dayBoundary(from, false);
    const end = dayBoundary(to, true);
    if (start || end) {
      filter.startedAt = {};
      if (start) filter.startedAt.$gte = start;
      if (end) filter.startedAt.$lt = end;
    }

    if (q) {
      const re = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ title: re }, { message: re }, { path: re }, { "scope.tenDot": re }, { actor: re }];
    }

    const [total, items] = await Promise.all([
      this.runs.countDocuments(filter),
      this.runs
        .find(filter, { projection: { result: 0, params: 0 } })
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);

    return { total, page, limit, items: items.map(toClient) };
  }

  async getRun(id) {
    const _id = parseId(id);
    if (!_id) return null;
    const doc = await this.runs.findOne({ _id });
    return doc ? toClient(doc) : null;
  }

  detailFilter(runId, { status, kind, q } = {}) {
    const filter = { runId };
    if (status) filter.status = status;
    if (kind) filter.kind = kind;
    if (q) {
      const re = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ code: re }, { name: re }, { course: re }, { error: re }];
    }
    return filter;
  }

  async listDetails(id, { page = 1, limit = 50, status, kind, q } = {}) {
    const runId = parseId(id);
    if (!runId) return null;

    const filter = this.detailFilter(runId, { status, kind, q });
    const countBase = kind ? { runId, kind } : { runId };

    const [total, items, statusCounts] = await Promise.all([
      this.details.countDocuments(filter),
      this.details
        .find(filter, { projection: { data: 1, seq: 1, kind: 1, status: 1 } })
        .sort({ seq: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.details
        .aggregate([{ $match: countBase }, { $group: { _id: "$status", count: { $sum: 1 } } }])
        .toArray(),
    ]);

    return {
      total,
      page,
      limit,
      statuses: statusCounts
        .map((s) => ({ status: s._id, count: s.count }))
        .sort((a, b) => b.count - a.count),
      items: items.map(({ _id, ...rest }) => rest),
    };
  }

  // Ghi thẳng CSV ra response, đọc dần từ MongoDB để không dồn cả lần chạy vào bộ nhớ
  async exportDetails(id, filters, res) {
    const runId = parseId(id);
    const run = runId ? await this.runs.findOne({ _id: runId }, { projection: { title: 1, startedAt: 1 } }) : null;
    if (!run) return false;

    const filter = this.detailFilter(runId, filters);

    // Cột lấy theo các dòng đầu, giữ đúng thứ tự xuất hiện
    const sample = await this.details.find(filter).sort({ seq: 1 }).limit(500).toArray();
    const keys = [];
    for (const doc of sample) {
      for (const key of Object.keys(doc.data || {})) if (!keys.includes(key)) keys.push(key);
    }

    const cell = (v) => {
      const text = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const stamp = new Date(run.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="lich-su-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`lich-su-${stamp}.csv`)}`
    );

    // BOM để Excel đọc đúng tiếng Việt
    res.write("﻿" + ["STT", ...keys.map((k) => COLUMN_TITLES[k] || k)].map(cell).join(",") + "\r\n");

    const cursor = this.details.find(filter).sort({ seq: 1 });
    let index = 0;
    for await (const doc of cursor) {
      const line = [++index, ...keys.map((k) => doc.data?.[k])].map(cell).join(",") + "\r\n";
      if (!res.write(line)) await new Promise((resolve) => res.once("drain", resolve));
    }

    res.end();
    return true;
  }
}

export default new HistoryService();
