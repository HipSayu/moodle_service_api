import fs from "fs";
import databaseService from "../services/databaseService.js";
import { ok, fail } from "../utils/response.js";
import { getIdDot, getBool } from "../utils/requestParams.js";

// Báo cáo khóa điểm.
// Gộp 4 biến thể cũ vào một endpoint, chọn bằng tham số:
//   merge = true  -> gộp các lớp học ghép chung lịch thành một dòng
//   late  = true  -> chấm cả cột NopMuon thay vì chỉ lọc lớp nộp muộn
const exportLockedGrades = async (req, res) => {
  const idDot = getIdDot(req);
  if (!idDot) {
    return fail(res, { message: "Thiếu hoặc sai idDot (số nguyên), ví dụ 298" });
  }

  const merge = getBool(req, "merge", true);
  const late = getBool(req, "late", false);
  const download = getBool(req, "download", false);

  let report;
  let variant;

  if (late && merge) {
    variant = "late-merge";
    report = await databaseService.exportLockedGradeAuditReportLate(idDot);
  } else if (late && !merge) {
    variant = "late-nomerge";
    report = await databaseService.exportLockedGradeAuditReportLateNoMerge(idDot);
  } else if (!late && merge) {
    variant = "merge";
    report = await databaseService.exportLockedGradeAuditReport(idDot);
  } else {
    variant = "nomerge";
    report = await databaseService.exportLockedGradeAuditReportNoMerge(idDot);
  }

  if (download) {
    if (!fs.existsSync(report.filePath)) {
      return fail(res, {
        message: "Đã tạo báo cáo nhưng không tìm thấy file",
        status: 500,
        data: report,
      });
    }
    return res.download(report.filePath);
  }

  return ok(res, {
    message: `Đã tạo báo cáo khóa điểm (${variant}) với ${report.count} dòng`,
    data: { ...report, idDot, variant, merge, late },
  });
};

export default { exportLockedGrades };
