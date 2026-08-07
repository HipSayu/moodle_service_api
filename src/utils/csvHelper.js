import { createObjectCsvWriter } from "csv-writer";
import { syncLogger } from "./logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_ROOT = path.join(__dirname, "../../logs/csv");

// Tiêu đề cột tiếng Việt cho các khóa hay dùng.
// Khóa nào không có ở đây thì lấy nguyên tên khóa làm tiêu đề.
const COLUMN_TITLES = {
  MaSinhVien: "Mã Sinh Viên",
  HoTenSinhVien: "Họ Tên Sinh Viên",
  MaGiangVien: "Mã Giảng Viên",
  MaNhanSu: "Mã Nhân Sự",
  HoTenGiangVien: "Họ Tên Giảng Viên",
  LoaiGiangVien: "Loại Giảng Viên",
  HoDem: "Họ Đệm",
  Ten: "Tên",
  Email: "Email",
  NguyenQuan: "Nguyên Quán",
  MaLopHocPhan: "Mã Lớp Học Phần",
  TenLopHoc: "Tên Lớp Học",
  TenMonHoc: "Tên Môn Học",
  TenDot: "Tên Đợt",
  ShortName: "Shortname Moodle",
  MoodleUserId: "Moodle User ID",
  MoodleCourseId: "Moodle Course ID",
  HanhDong: "Hành Động",
  TrangThai: "Trạng Thái",
  LoiChiTiet: "Lỗi Chi Tiết",
  ThoiGian: "Thời Gian",
};

class CSVHelper {
  // Bỏ dấu tiếng Việt để tên file an toàn trên mọi hệ điều hành
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

  static safeName(value) {
    return this.removeVietnameseTones(String(value ?? ""))
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60);
  }

  static timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  }

  static ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  // Ghi mảng object ra CSV. Cột suy ra từ khóa của bản ghi đầu tiên.
  // subDir: thư mục con trong logs/csv (ví dụ "enrollments")
  static async saveRows(rows, fileName, subDir = "") {
    try {
      if (!rows || rows.length === 0) {
        syncLogger.info(`Không có dữ liệu để ghi CSV: ${fileName}`);
        return null;
      }

      const dir = this.ensureDir(
        subDir ? path.join(CSV_ROOT, subDir) : CSV_ROOT
      );
      const filePath = path.join(dir, `${fileName}_${this.timestamp()}.csv`);

      const header = Object.keys(rows[0]).map((key) => ({
        id: key,
        title: COLUMN_TITLES[key] || key,
      }));

      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header,
        encoding: "utf8",
      });

      await csvWriter.writeRecords(rows);
      syncLogger.info(`Đã ghi ${rows.length} dòng ra CSV: ${filePath}`);
      return filePath;
    } catch (error) {
      syncLogger.error(`Ghi CSV ${fileName} thất bại:`, error);
      return null; // Lỗi ghi CSV không được làm hỏng cả tác vụ đồng bộ
    }
  }

  // Ghi CSV riêng cho từng lớp học phần
  static async saveCourseRows(rows, courseCode, courseName, subDir) {
    const fileName = `${this.safeName(courseCode)}_${this.safeName(courseName)}`;
    return this.saveRows(rows, fileName, subDir);
  }
}

export default CSVHelper;
