import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import { syncLogger } from "./logger.js";
import CSVHelper, { COLUMN_TITLES } from "./csvHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXCEL_ROOT = path.join(__dirname, "../../logs/excel");

// Màu theo trạng thái, để mở file ra là thấy ngay dòng nào lỗi
const STATUS_COLORS = {
  "Thành công": { font: "FF1F8A4C", fill: "FFE8F5EC" },
  "Tạo mới": { font: "FF1F8A4C", fill: "FFE8F5EC" },
  "Cập nhật": { font: "FF1F5F9E", fill: "FFEAF1F8" },
  "Bỏ qua": { font: "FF6B7684", fill: "FFF2F3F5" },
  "Đã tồn tại": { font: "FF6B7684", fill: "FFF2F3F5" },
  Lỗi: { font: "FFC0392B", fill: "FFFBEAE8" },
};

const HEADER_FILL = "FF1F5F9E";
const MIN_WIDTH = 12;
const MAX_WIDTH = 55;

class ExcelHelper {
  // Nhãn cột: dùng chung từ điển với CSV để hai file khớp nhau
  static title(key) {
    return COLUMN_TITLES[key] || key;
  }

  // Đếm số dòng theo từng trạng thái, dùng cho sheet Tổng hợp
  static countBy(rows, key) {
    const counts = new Map();
    for (const row of rows) {
      const value = row[key];
      if (value === undefined || value === null || value === "") continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
  }

  static styleHeader(sheet) {
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    header.alignment = { vertical: "middle", horizontal: "left" };
    header.height = 22;
  }

  // Giãn cột theo nội dung thực tế, chặn trên để không có cột rộng cả màn hình
  static autoFitColumns(sheet) {
    sheet.columns.forEach((column) => {
      let widest = String(column.header || "").length;

      column.eachCell({ includeEmpty: false }, (cell) => {
        const length = String(cell.value ?? "").length;
        if (length > widest) widest = length;
      });

      column.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widest + 2));
    });
  }

  /**
   * Ghi một workbook cho cả lần chạy:
   *   - sheet "Tổng hợp": số dòng theo trạng thái + theo lớp (nếu có groupBy)
   *   - sheet "Chi tiết": toàn bộ bản ghi, có lọc và cố định dòng tiêu đề
   *
   * @param {array}  rows      Dữ liệu, cột lấy từ khóa của bản ghi đầu tiên
   * @param {string} fileName  Tên file (chưa gồm timestamp và đuôi)
   * @param {object} options   subDir, groupBy, meta (các dòng thông tin ở đầu sheet Tổng hợp)
   */
  static async saveRows(rows, fileName, { subDir = "", groupBy = null, meta = {} } = {}) {
    try {
      if (!rows || rows.length === 0) {
        syncLogger.info(`Không có dữ liệu để ghi Excel: ${fileName}`);
        return null;
      }

      const dir = CSVHelper.ensureDir(
        subDir ? path.join(EXCEL_ROOT, subDir) : EXCEL_ROOT
      );
      const filePath = path.join(
        dir,
        `${fileName}_${CSVHelper.timestamp()}.xlsx`
      );

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Moodle Sync Service";
      workbook.created = new Date();

      // ---------- Sheet Tổng hợp ----------
      const summary = workbook.addWorksheet("Tổng hợp");
      summary.columns = [
        { header: "Mục", key: "muc", width: 42 },
        { header: "Giá trị", key: "giaTri", width: 22 },
      ];
      this.styleHeader(summary);

      summary.addRow({ muc: "Tác vụ", giaTri: fileName });
      summary.addRow({ muc: "Thời điểm", giaTri: new Date().toLocaleString("vi-VN") });
      for (const [key, value] of Object.entries(meta)) {
        summary.addRow({ muc: key, giaTri: value });
      }
      summary.addRow({ muc: "Tổng số dòng", giaTri: rows.length });
      summary.addRow({});

      const statusCounts = this.countBy(rows, "TrangThai");
      if (statusCounts.size > 0) {
        const title = summary.addRow({ muc: "THEO TRẠNG THÁI" });
        title.font = { bold: true };

        for (const [status, count] of statusCounts) {
          const row = summary.addRow({ muc: status, giaTri: count });
          const color = STATUS_COLORS[status];
          if (color) row.getCell(1).font = { color: { argb: color.font } };
        }
      }

      const actionCounts = this.countBy(rows, "HanhDong");
      if (actionCounts.size > 0) {
        summary.addRow({});
        const title = summary.addRow({ muc: "THEO HÀNH ĐỘNG" });
        title.font = { bold: true };

        for (const [action, count] of actionCounts) {
          summary.addRow({ muc: action, giaTri: count });
        }
      }

      // Thống kê theo lớp: lớp nào lỗi nhiều thì nhìn ra ngay
      if (groupBy && rows[0][groupBy] !== undefined) {
        summary.addRow({});
        const title = summary.addRow({ muc: `THEO ${this.title(groupBy).toUpperCase()}` });
        title.font = { bold: true };

        const groups = this.countBy(rows, groupBy);
        for (const [name, count] of groups) {
          summary.addRow({ muc: name, giaTri: count });
        }
      }

      // ---------- Sheet Chi tiết ----------
      const detail = workbook.addWorksheet("Chi tiết", {
        views: [{ state: "frozen", ySplit: 1 }],
      });

      const keys = Object.keys(rows[0]);
      detail.columns = [
        { header: "STT", key: "__stt", width: 6 },
        ...keys.map((key) => ({ header: this.title(key), key })),
      ];

      rows.forEach((row, index) => {
        const added = detail.addRow({ __stt: index + 1, ...row });

        const color = STATUS_COLORS[row.TrangThai] || STATUS_COLORS[row.HanhDong];
        if (color) {
          added.eachCell({ includeEmpty: false }, (cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: color.fill },
            };
          });

          const statusIndex = keys.indexOf("TrangThai");
          if (statusIndex >= 0) {
            const cell = added.getCell(statusIndex + 2); // +1 cột STT, +1 vì cột đánh số từ 1
            cell.font = { bold: true, color: { argb: color.font } };
          }
        }
      });

      this.styleHeader(detail);
      this.autoFitColumns(detail);
      detail.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: detail.columns.length },
      };

      await workbook.xlsx.writeFile(filePath);
      syncLogger.info(`Đã ghi ${rows.length} dòng ra Excel: ${filePath}`);
      return filePath;
    } catch (error) {
      // Ghi file lỗi không được làm hỏng cả tác vụ đồng bộ
      syncLogger.error(`Ghi Excel ${fileName} thất bại:`, error);
      return null;
    }
  }
}

export default ExcelHelper;
