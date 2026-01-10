# API Student Sync - Ví dụ Response

## Endpoint
```
POST /api/sync/students
```

## Mô tả
API đồng bộ sinh viên từ SQL Server sang Moodle với các tính năng:
- Theo dõi trạng thái đồng bộ của từng sinh viên (thành công/lỗi)
- Lưu chi tiết lỗi cho các sinh viên không đồng bộ được
- Xuất kết quả ra file CSV với đầy đủ thông tin

## Response Example

### Thành công
```json
{
  "success": true,
  "message": "Student sync completed",
  "data": {
    "success": true,
    "total": 100,
    "synced": 95,
    "errors": 5,
    "errorDetails": [
      {
        "MaSinhVien": "SV001",
        "Ten": "Nam",
        "HoDem": "Nguyen Van",
        "Email": "sv001@huce.edu.vn",
        "error": "Email already exists in Moodle"
      },
      {
        "MaSinhVien": "SV025",
        "Ten": "Hoa",
        "HoDem": "Tran Thi",
        "Email": "sv025@huce.edu.vn",
        "error": "Invalid email format"
      }
    ],
    "csvFile": "C:\\Hieppn\\moodle_service_api\\logs\\csv\\sync_students_2026-01-09T14-30-25.csv"
  }
}
```

## CSV File Format

File CSV sẽ được lưu trong thư mục `logs/csv/` với tên dạng: `sync_students_YYYY-MM-DDTHH-mm-ss.csv`

### Cột trong file CSV:
| Cột | Mô tả |
|-----|-------|
| Mã Sinh Viên | Mã số sinh viên |
| Họ Đệm | Họ và tên đệm |
| Tên | Tên |
| Email | Email sinh viên |
| Nguyên Quán | Địa chỉ nguyên quán |
| Trạng Thái | "Thành công" hoặc "Lỗi" |
| Lỗi Chi Tiết | Thông tin lỗi (nếu có) |
| Thời Gian | Thời gian đồng bộ (ISO format) |

### Ví dụ nội dung CSV:
```csv
Mã Sinh Viên,Họ Đệm,Tên,Email,Nguyên Quán,Trạng Thái,Lỗi Chi Tiết,Thời Gian
SV001,Nguyen Van,Nam,sv001@huce.edu.vn,Hanoi,Lỗi,Email already exists in Moodle,2026-01-09T14:30:25.123Z
SV002,Tran Thi,Hoa,sv002@huce.edu.vn,Hanoi,Thành công,,2026-01-09T14:30:26.456Z
SV003,Le Van,Tung,sv003@huce.edu.vn,Hai Phong,Thành công,,2026-01-09T14:30:27.789Z
```

## Cách sử dụng

### Request
```bash
curl -X POST http://localhost:3000/api/sync/students
```

### hoặc với Postman
- Method: POST
- URL: http://localhost:3000/api/sync/students
- Headers: Content-Type: application/json

## Lưu ý
- Mỗi lần gọi API sẽ tạo một file CSV mới với timestamp
- Các file CSV được lưu trong `logs/csv/`
- Response trả về danh sách đầy đủ các sinh viên bị lỗi trong `errorDetails`
- Đường dẫn file CSV được trả về trong field `csvFile`
