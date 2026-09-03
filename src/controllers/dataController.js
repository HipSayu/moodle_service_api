import databaseService from "../services/databaseService.js";
import {
  getDataset,
  listDatasets,
  OPERATORS,
  DEFAULT_OPERATOR,
} from "../services/datasets.js";
import { ok, fail } from "../utils/response.js";
import { getTenDot, getParam, getInt } from "../utils/requestParams.js";

// Tham số không phải bộ lọc.
// khoaHoc/idKhoaHoc được áp ngay trong câu truy vấn gốc nên cũng không phải bộ lọc cột.
const RESERVED = new Set([
  "tenDot",
  "khoaHoc",
  "idKhoaHoc",
  "sort",
  "order",
  "limit",
  "offset",
  "format",
]);

/**
 * Tách bộ lọc từ query string.
 * Hỗ trợ hai cách viết:
 *   ?MaSinhVien=1653965          -> toán tử mặc định theo kiểu cột
 *   ?DiemTongKet__gte=8          -> chỉ định toán tử
 * Một trường có thể xuất hiện nhiều lần với toán tử khác nhau:
 *   ?DiemTongKet__gte=5&DiemTongKet__lte=8
 */
const parseFilters = (query) => {
  const filters = [];

  for (const [rawKey, rawValue] of Object.entries(query || {})) {
    if (RESERVED.has(rawKey)) continue;

    const [field, op] = rawKey.split("__");
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

    filters.push({ field, op: op || null, value });
  }

  return filters;
};

// GET /api/data — danh sách dataset có thể truy vấn
const listAll = async (req, res) =>
  ok(res, {
    message: `Có ${listDatasets().length} tập dữ liệu`,
    data: {
      datasets: listDatasets(),
      operators: Object.entries(OPERATORS).map(([name, o]) => ({
        name,
        label: o.label,
        needsValue: o.needsValue !== false,
        multi: Boolean(o.multi),
      })),
      defaultOperatorByType: DEFAULT_OPERATOR,
    },
  });

// GET /api/data/:dataset/fields — mô tả các trường lọc được
const describe = async (req, res) => {
  const dataset = getDataset(req.params.dataset);
  if (!dataset) {
    return fail(res, {
      message: `Không có tập dữ liệu "${req.params.dataset}"`,
      status: 404,
      data: { available: listDatasets().map((d) => d.name) },
    });
  }

  return ok(res, {
    message: `${dataset.label}: ${dataset.columns.length} trường lọc được`,
    data: {
      name: req.params.dataset,
      label: dataset.label,
      requireTenDot: dataset.requireTenDot,
      defaultSort: dataset.defaultSort,
      columns: dataset.columns.map((c) => ({
        name: c.name,
        label: c.label || c.name,
        type: c.type,
        defaultOperator: DEFAULT_OPERATOR[c.type] || "eq",
      })),
      operators: Object.entries(OPERATORS).map(([name, o]) => ({
        name,
        label: o.label,
        needsValue: o.needsValue !== false,
        multi: Boolean(o.multi),
      })),
    },
  });
};

// GET /api/data/:dataset — truy vấn dữ liệu, lọc được theo mọi trường
const query = async (req, res) => {
  const name = req.params.dataset;
  const dataset = getDataset(name);

  if (!dataset) {
    return fail(res, {
      message: `Không có tập dữ liệu "${name}"`,
      status: 404,
      data: { available: listDatasets().map((d) => d.name) },
    });
  }

  const tenDot = getTenDot(req);
  if (dataset.requireTenDot && !tenDot) {
    return fail(res, { message: `Thiếu tenDot cho tập dữ liệu "${name}"` });
  }

  // Khóa (K70, K71...) áp trong câu gốc, không phải bộ lọc cột đầu ra
  const khoaHoc = getParam(req, "khoaHoc");
  const idKhoaHocRaw = getParam(req, "idKhoaHoc");

  if ((khoaHoc || idKhoaHocRaw) && !dataset.khoaHocFilter) {
    return fail(res, {
      message: `Tập dữ liệu "${name}" không lọc được theo khóa`,
    });
  }

  const { idKhoaHoc } = await databaseService.resolveCohortFilter({
    tenDot,
    khoaHoc,
    idKhoaHoc: idKhoaHocRaw,
  });

  const result = await databaseService.queryDataset(name, {
    tenDot,
    idKhoaHoc,
    filters: parseFilters(req.query),
    sort: getParam(req, "sort"),
    order: getParam(req, "order") || "asc",
    limit: getInt(req, "limit"),
    offset: getInt(req, "offset", 0),
  });

  return ok(res, {
    message:
      `${dataset.label}: ${result.returned}/${result.total} dòng` +
      (result.total > result.returned
        ? ` (còn ${result.total - result.returned - result.offset} dòng chưa lấy)`
        : ""),
    data: { dataset: name, label: dataset.label, ...result },
  });
};

export default { listAll, describe, query };
