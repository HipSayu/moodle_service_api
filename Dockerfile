# Moodle Sync — đồng bộ EDU_NUCE (SQL Server) sang Moodle, kèm giao diện quản trị.
FROM node:22-alpine

# tzdata để giờ trong log và lịch đồng bộ tự động đúng giờ Việt Nam
RUN apk add --no-cache tzdata

ENV TZ=Asia/Ho_Chi_Minh \
    NODE_ENV=production \
    PORT=4207

WORKDIR /app

# Cài thư viện trước để Docker giữ cache: chỉ sửa code thì không phải cài lại
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js ./
COPY src ./src
COPY public ./public

# Log, file CSV/Excel kết quả đồng bộ, báo cáo đều ghi vào /app/logs.
# Gắn thư mục này ra ngoài (volume) để không mất khi cập nhật container.
RUN mkdir -p logs && chown -R node:node /app/logs
USER node

EXPOSE 4207

# Dùng /api (chỉ báo service còn sống) thay vì /api/health: Moodle hay SQL Server
# tạm mất kết nối không phải lỗi của container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api" > /dev/null || exit 1

CMD ["node", "index.js"]
