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

  /**
   * Convert Vietnamese characters to ASCII equivalent
   * @param {string} str - String to convert
   * @returns {string} ASCII string
   */
  static removeVietnameseTones(str) {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str;
  }

  /**
   * Save enrollment results for a single course to CSV file
   * @param {Array} results - Array of enrollment results for a course
   * @param {string} courseCode - Course code for filename
   * @param {string} courseName - Course name for logging
   * @returns {Promise<string>} Path to created CSV file
   */
  static async saveCourseEnrollmentToCSV(results, courseCode, courseName) {
    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const csvDir = path.join(__dirname, "../../logs/csv/enrollments");
      if (!fs.existsSync(csvDir)) {
        fs.mkdirSync(csvDir, { recursive: true });
      }
      
      // Convert Vietnamese to ASCII first, then sanitize
      const asciiCourseName = this.removeVietnameseTones(courseName);
      const safeCourseCode = courseCode.replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeCourseName = asciiCourseName.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/\s+/g, "_");
      const csvFilePath = path.join(csvDir, `${safeCourseCode}_${safeCourseName}_${timestamp}.csv`);
      
      syncLogger.info(`Creating CSV for: ${courseCode} - ${courseName}`);
      syncLogger.info(`Safe filename: ${safeCourseCode}_${safeCourseName}_${timestamp}.csv`);

      const csvWriter = createObjectCsvWriter({
        path: csvFilePath,
        header: [
          { id: "MaSinhVien", title: "Mã Sinh Viên" },
          { id: "HoTenSinhVien", title: "Họ Tên Sinh Viên" },
          { id: "TrangThai", title: "Trạng Thái" },
          { id: "LoiChiTiet", title: "Lỗi Chi Tiết" },
          { id: "ThoiGian", title: "Thời Gian" },
        ],
        encoding: "utf8",
      });

      await csvWriter.writeRecords(results);
      syncLogger.info(`Saved enrollment for course ${courseCode} to CSV: ${csvFilePath}`);
      return csvFilePath;
    } catch (error) {
      syncLogger.error(`Failed to save enrollment for course ${courseCode} to CSV:`, error);
      throw error;
    }
  }
}

export default CSVHelper;
