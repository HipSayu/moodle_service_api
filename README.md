# Moodle SQL Server Sync Service

Service đồng bộ dữ liệu giữa SQL Server và Moodle thông qua Web Service API.

## Tính năng

- Đồng bộ sinh viên từ SQL Server sang Moodle
- Đồng bộ giảng viên từ SQL Server sang Moodle  
- Đồng bộ khóa học từ SQL Server sang Moodle
- Đồng bộ điểm từ Moodle về SQL Server
- Lên lịch tự động đồng bộ
- Logging chi tiết
- API để kích hoạt đồng bộ thủ công

## Cài đặt

1. Clone repository
2. Cài đặt dependencies:
   ```bash
   npm install
   ```

3. Tạo file `.env` từ `.env.example` và cấu hình:
   ```bash
   copy .env.example .env
   ```

4. Cấu hình thông tin kết nối SQL Server và Moodle trong file `.env`

5. Chạy ứng dụng:
   ```bash
   npm start
   ```

## Cấu hình

### SQL Server
- Đảm bảo SQL Server đã được cấu hình để chấp nhận kết nối TCP/IP
- Tạo user có quyền đọc dữ liệu sinh viên, giảng viên, khóa học và ghi điểm

### Moodle
- Kích hoạt Web Services trong Moodle
- Tạo External Service với các functions cần thiết
- Tạo Token cho user có quyền thực hiện các thao tác cần thiết

## API Endpoints

- `GET /api/health` - Kiểm tra trạng thái service
- `POST /api/sync/students` - Đồng bộ sinh viên
- `POST /api/sync/teachers` - Đồng bộ giảng viên
- `POST /api/sync/courses` - Đồng bộ khóa học
- `POST /api/sync/grades` - Đồng bộ điểm
- `POST /api/sync/all` - Đồng bộ tất cả

## Cấu trúc Database

Service này giả định cấu trúc database như sau:

### SQL Server Tables
- `Students` - Thông tin sinh viên
- `Teachers` - Thông tin giảng viên
- `Courses` - Thông tin khóa học
- `Grades` - Điểm số

Chi tiết schema xem trong thư mục `docs/database-schema.md`