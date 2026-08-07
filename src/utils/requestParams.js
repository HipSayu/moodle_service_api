// Lấy tham số từ request. Ưu tiên body (form/JSON), sau đó tới query string.
// Mọi điều kiện lọc của câu SQL đều đi qua đây thay vì hardcode trong service.

const getParam = (req, name) => {
  const value = req.body?.[name] ?? req.query?.[name];
  if (value === undefined || value === null) return null;

  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
};

// tenDot (tên đợt/học kỳ) là điều kiện bắt buộc của hầu hết truy vấn
const getTenDot = (req) => getParam(req, "tenDot");

// idDot dùng cho báo cáo khóa điểm, phải là số nguyên
const getIdDot = (req) => {
  const raw = getParam(req, "idDot");
  if (raw === null) return null;

  const parsed = parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

// Chuyển chuỗi "true"/"1" thành boolean
const getBool = (req, name, defaultValue = false) => {
  const raw = getParam(req, name);
  if (raw === null) return defaultValue;
  return ["true", "1", "yes"].includes(raw.toLowerCase());
};

const getInt = (req, name, defaultValue = null) => {
  const raw = getParam(req, name);
  if (raw === null) return defaultValue;

  const parsed = parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : defaultValue;
};

export { getParam, getTenDot, getIdDot, getBool, getInt };
