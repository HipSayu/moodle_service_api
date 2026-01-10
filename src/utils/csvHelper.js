import { createObjectCsvWriter } from "csv-writer";
import { syncLogger } from "./logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CSVHelper {
  /**
   * Get CSV file name with timestamp
   * @param {string} type - Type of sync (students, teachers, etc.)
   * @returns {string} Full path to CSV file
   */
  static getCSVFileName(type) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const csvDir = path.join(__dirname, "../../logs/csv");
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir, { recursive: true });
    }
    return path.join(csvDir, `sync_${type}_${timestamp}.csv`);
  }

  /**
   * Save student sync results to CSV file
   * @param {Array} results - Array of sync results
   * @param {string} type - Type of sync (students, teachers, etc.)
   * @returns {Promise<string>} Path to created CSV file
   */
  static async saveSyncResultsToCSV(results, type) {
    try {
      const csvFilePath = this.getCSVFileName(type);

      const csvWriter = createObjectCsvWriter({
        path: csvFilePath,
        header: [
          { id: "MaSinhVien", title: "Mã Sinh Viên" },
          { id: "HoDem", title: "Họ Đệm" },
          { id: "Ten", title: "Tên" },
          { id: "Email", title: "Email" },
          { id: "NguyenQuan", title: "Nguyên Quán" },
          { id: "TrangThai", title: "Trạng Thái" },
          { id: "LoiChiTiet", title: "Lỗi Chi Tiết" },
          { id: "ThoiGian", title: "Thời Gian" },
        ],
        encoding: "utf8",
      });

      await csvWriter.writeRecords(results);
      syncLogger.info(`Saved sync results to CSV: ${csvFilePath}`);
      return csvFilePath;
    } catch (error) {
      syncLogger.error("Failed to save sync results to CSV:", error);
      throw error;
    }
  }

  /**
   * Save teacher sync results to CSV file
   * @param {Array} results - Array of sync results
   * @param {string} type - Type of sync
   * @returns {Promise<string>} Path to created CSV file
   */
  static async saveTeacherSyncResultsToCSV(results, type) {
    try {
      const csvFilePath = this.getCSVFileName(type);

      const csvWriter = createObjectCsvWriter({
        path: csvFilePath,
        header: [
          { id: "MaGiangVien", title: "Mã Giảng Viên" },
          { id: "HoDem", title: "Họ Đệm" },
          { id: "Ten", title: "Tên" },
          { id: "Email", title: "Email" },
          { id: "TrangThai", title: "Trạng Thái" },
          { id: "LoiChiTiet", title: "Lỗi Chi Tiết" },
          { id: "ThoiGian", title: "Thời Gian" },
        ],
        encoding: "utf8",
      });

      await csvWriter.writeRecords(results);
      syncLogger.info(`Saved teacher sync results to CSV: ${csvFilePath}`);
      return csvFilePath;
    } catch (error) {
      syncLogger.error("Failed to save teacher sync results to CSV:", error);
      throw error;
    }
  }

  /**
   * Save course sync results to CSV file
   * @param {Array} results - Array of sync results
   * @param {string} type - Type of sync
   * @returns {Promise<string>} Path to created CSV file
   */
  static async saveCourseSyncResultsToCSV(results, type) {
    try {
      const csvFilePath = this.getCSVFileName(type);

      const csvWriter = createObjectCsvWriter({
        path: csvFilePath,
        header: [
          { id: "MaLopHocPhan", title: "Mã Lớp Học Phần" },
          { id: "TenLopHoc", title: "Tên Lớp Học" },
          { id: "TenMonHoc", title: "Tên Môn Học" },
          { id: "TenDot", title: "Tên Đợt" },
          { id: "HanhDong", title: "Hành Động" },
          { id: "TrangThai", title: "Trạng Thái" },
          { id: "LoiChiTiet", title: "Lỗi Chi Tiết" },
          { id: "ThoiGian", title: "Thời Gian" },
        ],
        encoding: "utf8",
      });

      await csvWriter.writeRecords(results);
      syncLogger.info(`Saved course sync results to CSV: ${csvFilePath}`);
      return csvFilePath;
    } catch (error) {
      syncLogger.error("Failed to save course sync results to CSV:", error);
      throw error;
    }
  }

  /**
   * Save student enrollment sync results to CSV file
   * @param {Array} results - Array of sync results
   * @param {string} type - Type of sync
   * @returns {Promise<string>} Path to created CSV file
   */
  static async saveEnrollmentSyncResultsToCSV(results, type) {
    try {
      const csvFilePath = this.getCSVFileName(type);

      const csvWriter = createObjectCsvWriter({
        path: csvFilePath,
        header: [
          { id: "MaSinhVien", title: "Mã Sinh Viên" },
          { id: "HoTenSinhVien", title: "Họ Tên Sinh Viên" },
          { id: "MaLopHocPhan", title: "Mã Lớp Học Phần" },
          { id: "TenMonHoc", title: "Tên Môn Học" },
          { id: "TenLopHoc", title: "Tên Lớp Học" },
          { id: "TenDot", title: "Tên Đợt" },
          { id: "TrangThai", title: "Trạng Thái" },
          { id: "LoiChiTiet", title: "Lỗi Chi Tiết" },
          { id: "ThoiGian", title: "Thời Gian" },
        ],
        encoding: "utf8",
      });

      await csvWriter.writeRecords(results);
      syncLogger.info(`Saved enrollment sync results to CSV: ${csvFilePath}`);
      return csvFilePath;
    } catch (error) {
      syncLogger.error("Failed to save enrollment sync results to CSV:", error);
      throw error;
    }
  }
}

export default CSVHelper;
