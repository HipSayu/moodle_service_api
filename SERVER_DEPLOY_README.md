# 🚀 Deploy Moodle Sync API lên Server

## Chuẩn bị Server

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Docker và Docker Compose
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker

# Thêm user vào group docker (tùy chọn)
sudo usermod -aG docker $USER
```

## Deploy Application

```bash
# Tải script deploy
wget https://raw.githubusercontent.com/HipSayu/moodle_service_api/build_test_docker/deploy-server.sh
chmod +x deploy-server.sh

# Chạy script deploy
./deploy-server.sh
```

## Cấu hình Environment

```bash
# Copy và chỉnh sửa file .env
cp .env.example .env
nano .env

# Cập nhật các thông tin:
# - SQL_SERVER: IP của SQL Server
# - MOODLE_URL: URL Moodle site
# - MOODLE_TOKEN: Web Service token
# - Database credentials
```

## Khởi động Services

```bash
# Khởi động ứng dụng
docker-compose up -d

# Kiểm tra trạng thái
docker-compose ps

# Xem logs
docker-compose logs -f app
docker-compose logs -f nginx
```

## Test API

```bash
# Test health check
curl http://your-server-ip/api/health

# Test client IP endpoint
curl http://your-server-ip/api/client-ip

# Test các API khác...
curl http://your-server-ip/api/moodle/functions
```

## Quản lý Application

```bash
# Dừng services
docker-compose down

# Cập nhật version mới
docker-compose pull
docker-compose up -d

# Restart services
docker-compose restart

# Xem logs real-time
docker-compose logs -f
```

## Troubleshooting

### Kiểm tra logs chi tiết
```bash
# Application logs
docker-compose logs app

# Nginx logs
docker-compose logs nginx

# Vào container để debug
docker-compose exec app sh
```

### Các vấn đề thường gặp

1. **Port conflicts**: Kiểm tra ports 80, 443, 3000 có bị chiếm không
2. **Database connection**: Kiểm tra SQL Server có thể truy cập từ server
3. **Moodle connection**: Test Web Service token
4. **Permissions**: Đảm bảo Docker có quyền truy cập files

### Firewall (UFW)
```bash
# Mở ports cần thiết
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22  # SSH
sudo ufw --force enable
```

## Monitoring

- **Health Check**: `GET /api/health`
- **Application Logs**: `./logs/application-*.log`
- **Nginx Logs**: `./logs/nginx/`
- **Docker Logs**: `docker-compose logs`

## Backup

```bash
# Backup logs và dữ liệu sync
tar -czf backup-$(date +%Y%m%d).tar.gz logs/ lastSync.json

# Backup database (nếu cần)
# mysqldump ... hoặc SQL Server backup
```

---

🎉 **Chúc mừng! Application đã được deploy thành công!**