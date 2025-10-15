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
- Tạo External Service với các functions cần thiết:
  - `mod_quiz_add_instance` (tạo quiz)
  - `core_course_create_courses` (tạo khóa học)
  - `core_user_create_users` (tạo user)
  - `core_enrol_manual_enrol_users` (đăng ký user vào khóa học)
  - `gradereport_user_get_grade_items` (lấy điểm)
- Tạo Token cho user có quyền thực hiện các thao tác cần thiết
- Kiểm tra quyền của user trong Moodle (phải là admin hoặc có quyền quản lý khóa học)

### Debug Moodle Web Service
```bash
# Kiểm tra các functions có sẵn
curl http://localhost:3000/api/moodle/functions

# Test tạo quiz
node test-moodle-functions.js
```

### Đồng bộ tự động
- Mặc định tự động đồng bộ bị **TẮT**
- Để bật tự động đồng bộ, set `ENABLE_AUTO_SYNC=true` trong file `.env`
- Khi bật, hệ thống sẽ tự động đồng bộ mỗi 24 giờ lúc 2h sáng

## API Endpoints

### Đồng bộ dữ liệu
- `GET /api/health` - Kiểm tra trạng thái service
- `POST /api/sync/students` - Đồng bộ sinh viên
- `POST /api/sync/teachers` - Đồng bộ giảng viên
- `POST /api/sync/courses` - Đồng bộ khóa học
- `POST /api/sync/create-final-quiz` - Tạo bài kiểm tra cuối kỳ cho tất cả khóa học trong Moodle
- `POST /api/sync/grades` - Đồng bộ điểm
- `POST /api/sync/all` - Đồng bộ tất cả

### Quản lý Scheduler
- `GET /scheduler/status` - Kiểm tra trạng thái scheduler
- `POST /scheduler/run/:jobName` - Chạy job thủ công (jobName: syncAllToMoodle)
- `POST /scheduler/start` - Bật scheduler tự động
- `POST /scheduler/stop` - Tắt scheduler tự động

### Debug Moodle
- `GET /api/moodle/functions` - Lấy danh sách functions Moodle Web Service có sẵn
- `POST /api/test/create-quiz/:courseId` - Test tạo quiz trong khóa học cụ thể

## Cấu trúc Database

Service này giả định cấu trúc database như sau:

### SQL Server Tables
- `Students` - Thông tin sinh viên
- `Teachers` - Thông tin giảng viên
- `Courses` - Thông tin khóa học
- `Grades` - Điểm số

Chi tiết schema xem trong thư mục `docs/database-schema.md`