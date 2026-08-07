# Moodle SQL Server Sync Service

Service đồng bộ dữ liệu đào tạo từ **SQL Server (EDU_NUCE)** sang **Moodle** qua Web Service API,
kèm nhóm API xuất báo cáo khóa điểm ra Excel.

## Nguyên tắc thiết kế

1. **Mọi điều kiện lọc truyền từ ngoài vào.** Học kỳ (`tenDot`), mã sinh viên, mã giảng viên,
   mã lớp học phần, đợt báo cáo (`idDot`) đều nằm trong request body/query — không hardcode trong SQL.
2. **Chạy lại được nhiều lần.** Đối tượng đã tồn tại trên Moodle thì bỏ qua, không tạo trùng,
   không ghi đè thay đổi thủ công.
3. **Một endpoint, hai phạm vi.** Không có tham số ở URL → chạy cả đợt. Có tham số → chạy một đối tượng.
4. **Response thống nhất** cho mọi endpoint.

## Cài đặt

```bash
npm install
cp .env.example .env    # rồi điền thông tin kết nối
npm start               # hoặc npm run dev
```

Mở **http://localhost:3000** để dùng giao diện, hoặc gọi thẳng API ở `/api/*`.

Kiểm tra nhanh không cần DB/Moodle:

```bash
npm run smoke
```

## Giao diện

Trang quản trị tĩnh trong `public/`, Express tự phục vụ ở `/`. Không cần build,
không phụ thuộc thư viện ngoài nên chạy được cả khi máy chủ không có internet.

Ô **Học kỳ (tenDot)** ở thanh trên áp dụng cho mọi thao tác và được nhớ lại giữa các lần mở trang.

**Tab Đồng bộ** — mỗi nghiệp vụ một thẻ, hai nút: *Toàn bộ đợt* (có hỏi xác nhận) và
*Một đối tượng* (nhập mã). Khi chạy có bộ đếm giây, mọi nút bị khóa để tránh gọi chồng.
Kết quả hiện ngay dưới: số liệu tổng/thành công/bỏ qua/lỗi, bảng lỗi, chi tiết từng dòng,
đường dẫn file CSV. Các lần chạy xếp chồng, mới nhất lên trên.

**Tab Dữ liệu Core** — đọc trực tiếp từ SQL Server: sinh viên, giảng viên, lớp học phần,
đăng ký học phần, phân công giảng dạy, điểm, khoa/bộ môn.

Khung **Lọc theo trường** cho phép thêm bao nhiêu điều kiện tùy ý, mỗi điều kiện gồm
trường + toán tử + giá trị (ví dụ `Điểm tổng kết` `lớn hơn hoặc bằng` `8`). Danh sách trường
và toán tử lấy động từ `/api/data/:dataset/fields`, nên thêm cột mới ở backend là giao diện
tự có ngay, không phải sửa gì. Kèm theo là chọn cột sắp xếp, chiều sắp xếp và số dòng tối đa.

**Tab Dữ liệu Moodle** — ba khung nhìn:
- *Khóa học*: toàn bộ khóa học, xem `shortname` để đối chiếu với `<MaLopHocPhan>_<TenDot>`
- *Người dùng*: tìm theo tiêu chí Moodle (`auth`, `idnumber`, `email`, `username`…), mặc định `auth=manual` là các tài khoản do service tạo
- *Thành viên lớp*: nhập Moodle course ID rồi lọc theo vai trò — Moodle không phân loại sinh viên/giảng viên ở cấp hệ thống mà theo vai trò trong từng khóa học

Mọi bảng đều có ô lọc, phân trang 50 dòng và nút **Tải CSV** (xuất đúng phần đang lọc, kèm BOM để Excel đọc đúng tiếng Việt).

## Khuôn response

```json
{
  "success": true,
  "message": "Mô tả kết quả",
  "data": { },
  "timestamp": "2026-08-06T10:00:00.000Z"
}
```

Kết quả của tác vụ đồng bộ luôn có các trường:

| Trường | Ý nghĩa |
|---|---|
| `total` | Số bản ghi lấy được từ SQL Server |
| `succeeded` | Số bản ghi xử lý thành công |
| `skipped` | Bỏ qua (đã tồn tại trên Moodle, hoặc thiếu dữ liệu phụ thuộc) |
| `failed` | Số bản ghi lỗi |
| `errors` | Chi tiết lỗi, tối đa 50 bản ghi |
| `details` | Chi tiết từng dòng — chỉ có khi lọc theo một đối tượng cụ thể |
| `csvFile` / `csvFiles` | Đường dẫn file CSV kết quả trong `logs/csv/` |

Mã HTTP:

| Mã | Khi nào |
|---|---|
| 200 | Thành công, không có bản ghi lỗi |
| 202 | Đã nhận job chạy nền (scheduler) |
| 207 | Chạy xong nhưng có bản ghi lỗi (`failed > 0`) |
| 400 | Thiếu hoặc sai tham số |
| 404 | Không tìm thấy dữ liệu nguồn / endpoint |
| 409 | Job đang chạy |
| 502 | Moodle trả lỗi |
| 503 | Không kết nối được SQL Server hoặc Moodle |

## Danh sách API

`tenDot` **bắt buộc** với mọi endpoint đồng bộ, gửi trong body (JSON hoặc form).

### Hệ thống

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/health` | Kiểm tra kết nối SQL Server + Moodle |
| GET | `/api/scheduler/status` | Trạng thái scheduler |
| POST | `/api/scheduler/start` | Bật scheduler |
| POST | `/api/scheduler/stop` | Dừng scheduler |
| POST | `/api/scheduler/jobs/:jobName/run` | Chạy job ngay (chạy nền, trả 202) |

### Đồng bộ SQL Server → Moodle

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/sync/students` | Toàn bộ sinh viên của đợt |
| POST | `/api/sync/students/:maSinhVien` | Một sinh viên |
| POST | `/api/sync/teachers` | Toàn bộ giảng viên của đợt |
| POST | `/api/sync/teachers/:maGiangVien` | Một giảng viên (mã hoặc email) |
| POST | `/api/sync/categories` | Khoa / bộ môn → category Moodle |
| POST | `/api/sync/courses` | Tạo lớp học phần chưa có |
| POST | `/api/sync/courses/:maLopHocPhan` | Một lớp học phần |
| POST | `/api/sync/grades` | Điểm tổng kết → assignment cuối kỳ |
| POST | `/api/sync/all` | Chạy tuần tự cả 5 bước |

### Đăng ký vào lớp

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/enrollments/students` | Đăng ký toàn bộ sinh viên của đợt |
| POST | `/api/enrollments/students/:maSinhVien` | Một sinh viên vào các lớp của mình |
| POST | `/api/enrollments/teachers` | Đăng ký toàn bộ giảng viên của đợt |
| POST | `/api/enrollments/teachers/:maGiangVien` | Một giảng viên vào các lớp của mình |

Body tùy chọn: `maLopHocPhan` để giới hạn trong một lớp.
Người đã có mặt trong lớp với đúng vai trò sẽ bị bỏ qua.

Vai trò trên Moodle: sinh viên = 5, giảng viên chính = 3, trợ giảng = 4 (`IsTroGiang = 1`).

### Đọc dữ liệu SQL Server — lọc được theo mọi trường

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/data` | Danh sách tập dữ liệu + danh sách toán tử |
| GET | `/api/data/:dataset/fields` | Các trường lọc được của một tập dữ liệu |
| GET | `/api/data/:dataset` | Truy vấn dữ liệu |

Tập dữ liệu: `students`, `teachers`, `courses`, `student-enrollments`,
`teacher-enrollments`, `grades`, `categories`.

**Cú pháp lọc.** Mỗi trường trong `fields` đều lọc được, viết theo một trong hai cách:

```
?MaSinhVien=1653965              toán tử mặc định theo kiểu cột
?DiemTongKet__gte=8              chỉ định toán tử
?DiemTongKet__gte=5&DiemTongKet__lte=8     một trường, nhiều điều kiện
```

Các điều kiện nối với nhau bằng `AND`.

| Toán tử | Ý nghĩa | | Toán tử | Ý nghĩa |
|---|---|---|---|---|
| `eq` | bằng | | `lt` / `lte` | nhỏ hơn / nhỏ hơn hoặc bằng |
| `ne` | khác | | `in` | thuộc danh sách, `A,B,C` |
| `contains` | chứa | | `isnull` | rỗng |
| `startswith` / `endswith` | bắt đầu / kết thúc bằng | | `notnull` | khác rỗng |
| `gt` / `gte` | lớn hơn / lớn hơn hoặc bằng | | | |

Toán tử mặc định: cột chuỗi → `contains`, cột số/ngày → `eq`.

**Sắp xếp và phân trang:** `?sort=<Trường>&order=asc|desc&limit=1000&offset=0`.
Mặc định `limit=1000`, tối đa `50000`. Response trả `total` (tổng số dòng khớp bộ lọc)
và `returned` (số dòng thực nhận) để biết còn dữ liệu chưa lấy.

**An toàn:** tên trường và tên cột sắp xếp phải nằm trong danh sách trắng của dataset,
giá trị luôn đi qua tham số hóa. Trường lạ, toán tử lạ, giá trị sai kiểu đều bị chặn ở 400
trước khi chạm tới SQL.

```bash
# Sinh viên có email HUCE, sắp xếp theo mã giảm dần
curl -G localhost:3000/api/data/students \
  --data-urlencode 'tenDot=HK1 2026-2027' \
  --data-urlencode 'Email__endswith=@huce.edu.vn' \
  --data-urlencode 'sort=MaSinhVien' --data-urlencode 'order=desc'

# Điểm từ 8 đến 9 của các lớp 67
curl -G localhost:3000/api/data/grades \
  --data-urlencode 'tenDot=HK1 2026-2027' \
  --data-urlencode 'DiemTongKet__gte=8' \
  --data-urlencode 'DiemTongKet__lte=9' \
  --data-urlencode 'TenLopHoc__startswith=67'

# Lớp học phần chưa gán bộ môn
curl -G localhost:3000/api/data/courses \
  --data-urlencode 'tenDot=HK1 2026-2027' \
  --data-urlencode 'IDToBoMon__isnull='
```

### Báo cáo khóa điểm

Gộp 5 endpoint cũ thành một, chọn biến thể bằng tham số:

```
GET /api/reports/locked-grades?idDot=298&merge=true&late=false&download=true
```

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `idDot` | *(bắt buộc)* | ID đợt |
| `merge` | `true` | Gộp các lớp học ghép chung lịch thành một dòng |
| `late` | `false` | `true` → thêm cột `NopMuon` thay vì chỉ lọc lớp nộp muộn |
| `download` | `false` | `true` → tải file Excel về luôn |

File Excel lưu trong `logs/reports/`.

### Moodle

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/moodle/site-info` | Thông tin site + quyền của token |
| GET | `/api/moodle/functions` | Danh sách function token được gọi |
| GET | `/api/moodle/courses?limit=10` | Danh sách khóa học |
| GET | `/api/moodle/users?key=auth&value=manual` | Tìm người dùng theo tiêu chí Moodle |
| GET | `/api/moodle/courses/:courseId/users?roleid=5` | Thành viên khóa học, lọc theo vai trò |
| GET | `/api/moodle/courses/:courseId/quizzes` | Quiz trong một khóa học |
| POST | `/api/moodle/courses/:courseId/quizzes` | Tạo quiz trong một khóa học |
| DELETE | `/api/moodle/courses/:courseId/quizzes` | Xóa quiz của một khóa học |
| POST | `/api/moodle/final-quizzes` | Tạo quiz cuối kỳ cho mọi khóa học |
| DELETE | `/api/moodle/quizzes` | **Xóa mọi quiz trên mọi khóa học** — cần `confirm=true` |

## Ví dụ

```bash
# Thứ tự chuẩn cho một học kỳ mới
curl -X POST localhost:3000/api/sync/categories
curl -X POST localhost:3000/api/sync/students  -H 'Content-Type: application/json' -d '{"tenDot":"HK1 2026-2027"}'
curl -X POST localhost:3000/api/sync/teachers  -H 'Content-Type: application/json' -d '{"tenDot":"HK1 2026-2027"}'
curl -X POST localhost:3000/api/sync/courses   -H 'Content-Type: application/json' -d '{"tenDot":"HK1 2026-2027"}'
curl -X POST localhost:3000/api/enrollments/students -H 'Content-Type: application/json' -d '{"tenDot":"HK1 2026-2027"}'
curl -X POST localhost:3000/api/enrollments/teachers -H 'Content-Type: application/json' -d '{"tenDot":"HK1 2026-2027"}'

# Xử lý một trường hợp lẻ
curl -X POST localhost:3000/api/sync/teachers/01025            -H 'Content-Type: application/json' -d '{"tenDot":"HK1 2026-2027"}'
curl -X POST localhost:3000/api/enrollments/teachers/01025     -H 'Content-Type: application/json' -d '{"tenDot":"HK1 2026-2027"}'

# Báo cáo
curl -o report.xlsx 'localhost:3000/api/reports/locked-grades?idDot=298&late=true&download=true'
```

## Cấu trúc mã nguồn

```
index.js
public/                     Giao diện quản trị (HTML/CSS/JS thuần)
src/
  app.js                    Khởi tạo Express, static, middleware, shutdown
  config/index.js           Đọc .env
  routes/index.js           Khai báo toàn bộ endpoint
  controllers/              Đọc tham số request, gọi service, trả response
  services/
    datasets.js             Khai báo tập dữ liệu + danh sách trắng cột lọc được
    databaseService.js      Truy vấn SQL Server + xuất báo cáo Excel
    moodleService.js        Bọc Moodle Web Service API
    syncToMoodleService.js  Nghiệp vụ đồng bộ
    schedulerService.js     Cron job
  utils/
    response.js             Khuôn response chung
    requestParams.js        Lấy và ép kiểu tham số request
    errorHandler.js         Middleware lỗi, retry
    logger.js               Winston, log xoay theo ngày
    csvHelper.js            Ghi CSV kết quả
tests/                      Smoke test không cần DB/Moodle
logs/                       Log, CSV kết quả, báo cáo Excel
```

## Phụ thuộc phía Moodle

Ngoài các function chuẩn (`core_user_*`, `core_course_*`, `enrol_manual_enrol_users`,
`mod_assign_*`), service cần các plugin tự viết cài sẵn trên Moodle:

- `local_sectionapi` — tạo/sửa/xóa section
- `local_quizapi` — tạo quiz
- `local_assignmentapi` — tạo assignment
- `local_questionapi` — tạo câu hỏi
- `local_customws` — tạo quiz (đường dẫn cũ)

## Còn tồn đọng

- **Không có xác thực.** Bất kỳ ai truy cập được cổng 3000 đều gọi được mọi endpoint,
  kể cả `DELETE /api/moodle/quizzes`. Chỉ chạy service trong mạng nội bộ đã chặn sẵn.
- **`MOODLE_TOKEN` và mật khẩu SQL từng bị commit vào git** ở các file `.env.example.*` cũ.
  Các file đó đã được thay bằng placeholder, nhưng lịch sử git vẫn còn — cần đổi mật khẩu
  và thu hồi token.
- `syncFromMoodleService.js` (đồng bộ điểm Moodle → SQL) dùng schema không tồn tại,
  đã gỡ khỏi routes, giữ lại để làm tiếp sau.
- `moodleService.getAssignments()` tự enroll tài khoản token làm giảng viên vào khóa học
  trước khi đọc — cần thiết để có quyền, nhưng làm bẩn danh sách thành viên.
