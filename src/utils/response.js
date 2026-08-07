// Chuẩn hóa response cho toàn bộ API.
// Mọi endpoint trả về cùng một khuôn để phía gọi xử lý thống nhất.

// Trả về thành công
const ok = (res, { message, data = null, status = 200 } = {}) =>
  res.status(status).json({
    success: true,
    message: message || "OK",
    data,
    timestamp: new Date().toISOString(),
  });

// Trả về lỗi
const fail = (res, { message, status = 400, data = null } = {}) =>
  res.status(status).json({
    success: false,
    message: message || "Request failed",
    data,
    timestamp: new Date().toISOString(),
  });

// Trả về kết quả của một tác vụ đồng bộ.
// Coi là thất bại khi có bản ghi lỗi, nhưng vẫn giữ nguyên số liệu chi tiết.
const syncResult = (res, { message, data }) => {
  const failed = data?.failed ?? 0;
  const total = data?.total ?? 0;

  // Không tìm thấy dữ liệu nguồn -> 404 để phân biệt với "chạy xong, không có gì để làm"
  if (total === 0 && data?.notFound) {
    return fail(res, { message, status: 404, data });
  }

  return res.status(failed > 0 ? 207 : 200).json({
    success: failed === 0,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

export { ok, fail, syncResult };
