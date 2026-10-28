# Triển khai Moodle Sync lên máy chủ bằng Docker

Service chạy trong một container, cổng **4207**. Mô hình khuyến nghị:

```
Trình duyệt ──► nginx (cổng 80/443, bắt đăng nhập) ──► container moodle-sync (127.0.0.1:4207)
                                                            ├──► SQL Server EDU_NUCE (cổng 1433)
                                                            ├──► Moodle (HTTPS, web service token)
                                                            └──► MongoDB (cổng 27017, lưu lịch sử chạy)
```

> **Service không có đăng nhập.** Ai truy cập được cổng 4207 là gọi được mọi API, kể cả xóa lớp,
> xóa quiz. Không bao giờ mở thẳng cổng này ra Internet — luôn đặt sau nginx có đăng nhập
> (mục 6, cách A) hoặc chỉ mở trong mạng nội bộ đã chặn (cách B).

Các file liên quan trong repo:

| File | Vai trò |
|---|---|
| `Dockerfile` | Đóng gói service (Node 22 Alpine, chạy bằng user thường, giờ Việt Nam) |
| `docker-compose.yml` | Chạy container: cổng, thư mục log, tự khởi động lại, giới hạn dung lượng log |
| `.dockerignore` | Chỉ đưa code cần chạy vào image — `.env`, `logs/`, file SQL/CSV tra cứu không bị đóng gói |
| `.env.example` | Mẫu cấu hình, chép thành `.env` rồi điền |
| `deploy/nginx-moodle-sync.conf` | Cấu hình nginx mẫu: đăng nhập + timeout dài cho tác vụ đồng bộ |

---

## 1. Chuẩn bị máy chủ

Máy chủ Linux (khuyến nghị Ubuntu 22.04 / 24.04), tối thiểu 2 CPU, 2 GB RAM, 10 GB ổ đĩa.

**Kiểm tra máy chủ kết nối được tới SQL Server và Moodle** — đây là nguyên nhân lỗi hay gặp nhất:

```bash
nc -vz <dia-chi-sql-server> 1433        # phải báo "succeeded" / "open"
curl -I https://md.huce.edu.vn          # phải trả về HTTP 200/303
nc -vz 10.20.0.82 27017                 # MongoDB lưu lịch sử
```

Nếu `nc` báo timeout: nhờ quản trị mạng mở firewall từ IP máy chủ này tới SQL Server cổng 1433
(và MongoDB cổng 27017).

**Cài Docker** (bỏ qua nếu đã có, kiểm tra bằng `docker compose version`):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # cho phép chạy docker không cần sudo
# đăng xuất rồi đăng nhập lại SSH để quyền có hiệu lực
docker compose version            # phải in ra phiên bản v2.x
```

## 2. Đưa code lên máy chủ

```bash
sudo mkdir -p /opt/moodle-sync
sudo chown $USER:$USER /opt/moodle-sync
git clone https://github.com/HipSayu/moodle_service_api.git /opt/moodle-sync
cd /opt/moodle-sync
```

Máy chủ không vào được GitHub thì chép từ máy dev, **bỏ** `node_modules`, `logs`, `.env`:

```bash
# chạy trên máy dev (Git Bash / Linux)
rsync -av --exclude node_modules --exclude logs --exclude .env --exclude .git \
  ./ <user>@<ip-may-chu>:/opt/moodle-sync/
```

## 3. Tạo file cấu hình `.env`

```bash
cd /opt/moodle-sync
cp .env.example .env
nano .env
chmod 600 .env        # chỉ chủ file đọc được — trong đó có mật khẩu SQL và token Moodle
```

Các giá trị cần điền:

| Biến | Giá trị trên máy chủ | Ghi chú |
|---|---|---|
| `NODE_ENV` | `production` | Trong container luôn bị ghi đè thành `production` |
| `PORT` | `4207` | Trong container luôn là 4207; đổi cổng ngoài bằng `HOST_PORT` |
| `HOST_BIND` | `127.0.0.1` | `127.0.0.1` khi dùng nginx (cách A). `0.0.0.0` khi mở thẳng trong mạng nội bộ (cách B) |
| `HOST_PORT` | `4207` | Cổng trên máy chủ. Đổi nếu 4207 đã bị chương trình khác dùng |
| `SQL_SERVER` | IP / tên máy SQL Server | **Không dùng `localhost`** — trong container `localhost` là chính container. SQL Server cài cùng máy chủ thì ghi `host.docker.internal` |
| `SQL_DATABASE` | `EDU_NUCE` | |
| `SQL_USERNAME`, `SQL_PASSWORD` | tài khoản SQL | Nên dùng tài khoản chỉ có quyền đọc |
| `SQL_PORT` | `1433` | |
| `SQL_ENCRYPT`, `SQL_TRUST_SERVER_CERTIFICATE` | `true`, `true` | SQL Server đời cũ (2008/2012) báo lỗi TLS thì đặt `SQL_ENCRYPT=false` |
| `MOODLE_URL` | `https://md.huce.edu.vn` | Không có dấu `/` ở cuối |
| `MOODLE_TOKEN` | token web service | Lấy ở Moodle: *Site administration → Server → Web services → Manage tokens* |
| `MOODLE_SERVICE` | tên external service | |
| `ENABLE_AUTO_SYNC` | `false` | `true` để tự đồng bộ hằng đêm (xem mục 7) |
| `SYNC_TEN_DOT` | `HK1 2026-2027` | Học kỳ dùng cho đồng bộ tự động, phải khớp đúng tên đợt trong `DM_Dot` |
| `SYNC_CRON_TIME` | `0 0 2 * * *` | Giờ chạy tự động (giây phút giờ ngày tháng thứ) — mặc định 2h sáng |
| `STUDENT_EMAIL_DOMAIN` | `st.huce.edu.vn` | Email tự sinh cho sinh viên thiếu email |
| `MONGODB_URI` | `mongodb://<user>:<mat-khau>@10.20.0.82:27017/?authSource=admin` | Nơi lưu lịch sử chạy. Ký tự đặc biệt trong mật khẩu phải mã hóa URL: `@` → `%40`, `:` → `%3A`, `/` → `%2F`. Bỏ trống thì không lưu lịch sử |
| `MONGODB_DB` | `sync_lms` | Tên database, tự tạo khi ghi lần đầu |
| `HISTORY_RETENTION_DAYS` | `0` | Số ngày giữ lịch sử, `0` = giữ mãi. Đặt trước lần chạy đầu tiên (đổi sau phải xóa index `ttl_*` trong MongoDB) |
| `EXPORT_FILES` | `false` | `true` để vẫn ghi thêm file CSV/Excel kết quả vào `logs/` như trước |

> **Mật khẩu có ký tự `$`** phải viết thành `$$` trong `.env` (Docker Compose hiểu `$` là biến).
> Ví dụ mật khẩu `Abc$123` ghi là `SQL_PASSWORD=Abc$$123`.

## 4. Chuẩn bị thư mục `logs`

Container chạy bằng user thường (uid 1000), cần quyền ghi vào thư mục log trên máy chủ:

```bash
cd /opt/moodle-sync
mkdir -p logs
sudo chown -R 1000:1000 logs
```

Mọi thứ service ghi ra đều nằm ở đây và được giữ lại khi cập nhật:

| Thư mục | Nội dung |
|---|---|
| `logs/application-*.log`, `logs/error-*.log`, `logs/sync-*.log` | Log ứng dụng, log lỗi, tiến độ đồng bộ (tự xoay vòng theo ngày) |
| `logs/reports/` | File Excel báo cáo khóa điểm |
| `logs/excel/`, `logs/csv/` | Chỉ có khi đặt `EXPORT_FILES=true` |

Kết quả từng lần chạy (ai chạy, tham số, lỗi, chi tiết từng dòng) **không còn ghi ra file** mà lưu
trong MongoDB, xem ở menu **Lịch sử chạy** và tải CSV ngay tại đó.

## 5. Build và chạy

```bash
cd /opt/moodle-sync
docker compose up -d --build
```

Lần đầu mất vài phút để tải image Node và cài thư viện. Kiểm tra:

```bash
docker compose ps                          # cột STATUS phải là "Up ... (healthy)" sau khoảng 1 phút
docker compose logs -f                     # phải thấy dòng "Service chạy ở cổng 4207", Ctrl+C để thoát
curl http://127.0.0.1:4207/api/health      # "database":true, "moodle":true là kết nối tốt
                                           # "history":{"connected":true,...} là đã lưu được lịch sử
```

Log khởi động phải có dòng `Đã kết nối MongoDB, lưu lịch sử vào database "sync_lms"`.

Nếu STATUS là `Restarting` → xem mục 9.

## 6. Cho người dùng truy cập giao diện

### Cách A — qua nginx có đăng nhập (khuyến nghị)

Giữ `HOST_BIND=127.0.0.1` trong `.env` (cổng 4207 chỉ mở trong máy chủ).

```bash
sudo apt install -y nginx apache2-utils

# Tạo tài khoản đăng nhập (thêm người: bỏ -c ở các lần sau)
sudo htpasswd -c /etc/nginx/.htpasswd-moodle-sync admin

# Cấu hình nginx
sudo cp deploy/nginx-moodle-sync.conf /etc/nginx/sites-available/moodle-sync
sudo nano /etc/nginx/sites-available/moodle-sync      # sửa server_name thành tên miền / IP máy chủ
sudo ln -s /etc/nginx/sites-available/moodle-sync /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Mở firewall cho nginx (nếu máy chủ bật ufw)
sudo ufw allow 'Nginx Full'
```

Truy cập `http://<ten-mien-hoac-ip>/`, trình duyệt sẽ hỏi tài khoản vừa tạo.

**HTTPS** (khi có tên miền trỏ về máy chủ và máy chủ ra được Internet):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <ten-mien>
```

> Cấu hình mẫu đã đặt `proxy_read_timeout 3600s`. Thiếu dòng này, nginx cắt request sau 60 giây
> và giao diện báo lỗi 504 khi đồng bộ cả học kỳ, dù service vẫn chạy tiếp ở phía sau.

### Cách B — mở thẳng cổng 4207 trong mạng nội bộ

Chỉ dùng khi máy chủ nằm trong mạng nội bộ đã có firewall chặn từ ngoài vào.

```bash
# trong .env
HOST_BIND=0.0.0.0
```

```bash
docker compose up -d     # áp dụng lại cấu hình
```

Truy cập `http://<ip-may-chu>:4207/`.

> **Lưu ý: Docker tự mở cổng và đi vòng qua `ufw`.** Chạy `ufw deny 4207` không có tác dụng.
> Muốn giới hạn chỉ dải IP nội bộ được vào thì chặn ở chain `DOCKER-USER`, ví dụ chỉ cho dải
> `10.0.0.0/8`:
>
> ```bash
> sudo iptables -I DOCKER-USER -p tcp --dport 4207 ! -s 10.0.0.0/8 -j DROP
> sudo apt install -y iptables-persistent && sudo netfilter-persistent save   # giữ sau khi khởi động lại
> ```

## 7. Vận hành hằng ngày

| Việc | Lệnh (chạy trong `/opt/moodle-sync`) |
|---|---|
| Xem log trực tiếp | `docker compose logs -f --tail 200` |
| Khởi động lại | `docker compose restart` |
| Dừng / chạy lại | `docker compose down` / `docker compose up -d` |
| **Sửa `.env` rồi áp dụng** | `docker compose up -d` — **không dùng `restart`**, `restart` không đọc lại `.env` |
| Cập nhật code mới | `git pull && docker compose up -d --build` |
| Dọn image cũ sau khi cập nhật | `docker image prune -f` |
| Xóa file kết quả cũ hơn 90 ngày | `find logs/excel logs/csv logs/reports -type f -mtime +90 -delete` |

**Đồng bộ tự động mỗi học kỳ:** sửa `SYNC_TEN_DOT` sang học kỳ mới, `ENABLE_AUTO_SYNC=true`, rồi
`docker compose up -d`. Kiểm tra ở giao diện, trang **Kết nối & lịch tự động**: trạng thái "Đang bật"
và "Lần chạy tới" đúng giờ mong muốn.

Container tự chạy lại khi bị lỗi và khi máy chủ khởi động lại (`restart: unless-stopped`),
miễn là dịch vụ Docker được bật: `sudo systemctl enable docker`.

## 8. Máy chủ không vào được Internet

Build image ở máy có Internet rồi chép sang:

```bash
# máy có Internet, trong thư mục code
docker build -t moodle-sync:latest .
docker save moodle-sync:latest | gzip > moodle-sync.tar.gz
scp moodle-sync.tar.gz <user>@<ip-may-chu>:/opt/moodle-sync/

# trên máy chủ (đã có code, .env, logs như mục 2–4)
cd /opt/moodle-sync
docker load < moodle-sync.tar.gz
docker compose up -d          # KHÔNG thêm --build, dùng image vừa nạp
```

## 9. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `docker compose ps` báo `Restarting`, log có "Khởi động service thất bại" | Không kết nối được SQL Server — service thoát ngay khi khởi động | Kiểm tra `SQL_SERVER`, `SQL_PORT`, tài khoản; chạy `nc -vz <sql> 1433` trên máy chủ; SQL Server cùng máy thì dùng `host.docker.internal` |
| Log lỗi TLS / `self signed certificate` / `ssl` khi kết nối SQL | Chứng chỉ SQL Server hoặc SQL Server đời cũ | `SQL_TRUST_SERVER_CERTIFICATE=true`; vẫn lỗi thì `SQL_ENCRYPT=false` |
| Log `EACCES: permission denied ... /app/logs` | Thư mục `logs` thuộc root | `sudo chown -R 1000:1000 logs` rồi `docker compose up -d` |
| Giao diện báo `Moodle: Mất kết nối`, log "Invalid token" | Sai / hết hạn `MOODLE_TOKEN` | Tạo lại token trên Moodle, sửa `.env`, `docker compose up -d` |
| Đồng bộ cả học kỳ báo lỗi 504 sau 1 phút | nginx thiếu `proxy_read_timeout` | Dùng đúng `deploy/nginx-moodle-sync.conf`, `sudo nginx -t && sudo systemctl reload nginx` |
| `Bind for 127.0.0.1:4207 failed: port is already allocated` | Cổng 4207 đã bị chương trình khác dùng | `sudo ss -ltnp \| grep 4207` để xem; hoặc đổi `HOST_PORT` (nhớ sửa cả `proxy_pass` trong nginx) |
| Sửa `.env` mà không có tác dụng | Dùng `docker compose restart` | Dùng `docker compose up -d` |
| Trang Lịch sử báo "Chưa kết nối được MongoDB", log có "Kết nối MongoDB thất bại" | Sai `MONGODB_URI`, mật khẩu chưa mã hóa ký tự đặc biệt, hoặc firewall chặn 27017 | `nc -vz 10.20.0.82 27017`; kiểm tra `authSource=admin` và mã hóa mật khẩu (`@` → `%40`). Service vẫn đồng bộ bình thường và tự kết nối lại mỗi phút |
| Mật khẩu SQL đúng nhưng vẫn báo sai | Mật khẩu có `$` | Viết `$$` thay cho mỗi `$` trong `.env` |
| Giờ trong log lệch 7 tiếng | Thiếu múi giờ | Đã đặt `TZ=Asia/Ho_Chi_Minh` trong image và compose; build lại bằng `docker compose up -d --build` |

Xem nhanh lỗi gần nhất: `docker compose logs --tail 100` hoặc `tail -n 100 logs/error-$(date +%F).log`.

## 10. Bảo mật — kiểm tra trước khi bàn giao

- [ ] `.env` có quyền `600`, không chép vào git, không gửi qua chat.
- [ ] Cổng 4207 **không** truy cập được từ Internet (thử từ mạng ngoài: `curl http://<ip-cong-khai>:4207/api` phải không kết nối được).
- [ ] Giao diện đòi đăng nhập (cách A) hoặc chỉ mở cho dải IP nội bộ (cách B).
- [ ] Đã **đổi mật khẩu SQL và thu hồi `MOODLE_TOKEN` cũ** — các giá trị cũ từng bị commit vào git (xem README, mục *Còn tồn đọng*).
- [ ] Tài khoản SQL chỉ có quyền đọc nếu được.
