# Moodle SQL Server Sync Service

Service đồng bộ dữ liệu giữa SQL Server và Moodle thông qua Web Service API.

## 🚀 Chạy với Docker (Khuyến nghị)

### Yêu cầu
- Docker và Docker Compose đã được cài đặt

### Cài đặt và chạy

1. **Clone repository và cấu hình:**
   ```bash
   git clone <repository-url>
   cd moodle_service_api
   cp .env.example .env
   ```

2. **Chỉnh sửa file `.env`:**
   ```bash
   # Cập nhật thông tin SQL Server, Moodle theo môi trường của bạn
   nano .env
   ```

4. **Chạy ứng dụng:**
   ```bash
   # Production mode
   docker-compose up -d

   # Development mode (với hot reload)
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

### Development với Hot Reload

Để phát triển với hot reload, sử dụng file override:

```bash
# Chạy ở development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Xem logs development
docker-compose -f docker-compose.yml -f docker-compose.dev.yml logs -f app
```

File `docker-compose.dev.yml` sẽ:
- Mount source code vào container
- Set NODE_ENV=development
- Cho phép truy cập trực tiếp vào port 3000

4. **Kiểm tra trạng thái:**
   ```bash
   # Kiểm tra containers đang chạy
   docker-compose ps

   # Xem logs
   docker-compose logs -f app
   docker-compose logs -f nginx
   ```

### Cấu trúc Docker

- **App Container**: Chạy Node.js application trên port 3000
- **Nginx Container**: Reverse proxy trên port 80/443
- **Networks**: Isolated network cho internal communication
- **Volumes**: Persistent storage cho logs và sync data

### Quản lý Docker

Sử dụng script `docker.sh` để quản lý containers dễ dàng:

```bash
# Chạy services
./docker.sh up

# Xem logs
./docker.sh logs app
./docker.sh logs nginx

# Vào container để debug
./docker.sh shell app

# Test API
./docker.sh test

# Dừng và dọn dẹp
./docker.sh down
./docker.sh clean
```

Các lệnh có sẵn:
- `build` - Build lại images
- `up` - Khởi động services
- `down` - Dừng services
- `restart` - Restart services
- `logs [service]` - Xem logs
- `status` - Trạng thái services
- `shell [service]` - Vào shell container
- `clean` - Dọn dẹp containers và volumes
- `update` - Cập nhật code và rebuild
- `test` - Test API endpoints

## 📦 Cài đặt thủ công (Development)

1. Clone repository
2. Cài đặt dependencies:
   ```bash
   npm install
   ```

3. Tạo file `.env` từ `.env.example` và cấu hình:
   ```bash
   cp .env.example .env
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