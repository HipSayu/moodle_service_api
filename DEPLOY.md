# Deployment Guide for Moodle Sync API

## 🚀 Quick Deploy to Server

### 1. Push Code to Repository
```bash
# Stage all changes
git add .

# Commit changes
git commit -m "feat: Add Docker support and client IP API

- Add Dockerfile with Node.js 18 Alpine
- Add docker-compose.yml for production deployment
- Add nginx reverse proxy configuration
- Add client IP API endpoint (/api/client-ip)
- Add docker management script
- Update README with Docker instructions"

# Push to repository
git push origin build_test_docker
```

### 2. Server Preparation
```bash
# On your server, ensure Docker and Docker Compose are installed
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to docker group (optional)
sudo usermod -aG docker $USER
```

### 3. Deploy on Server
```bash
# Clone repository
git clone <your-repo-url> moodle-sync-api
cd moodle-sync-api

# Switch to your branch
git checkout build_test_docker

# Copy and configure environment
cp .env.example .env
nano .env  # Edit with your server configuration

# Start services
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f app
```

### 4. Verify Deployment
```bash
# Test health endpoint
curl http://your-server-ip/api/health

# Test client IP endpoint
curl http://your-server-ip/api/client-ip

# Check logs
docker-compose logs app
docker-compose logs nginx
```

## 🔧 Environment Configuration for Server

Create `.env` file on server with:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# SQL Server Configuration (update with server IPs)
SQL_SERVER=your-sql-server-ip
SQL_DATABASE=university_db
SQL_USERNAME=your-username
SQL_PASSWORD=your-password
SQL_PORT=1433
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=false

# Moodle Configuration
MOODLE_URL=https://your-moodle-site.com
MOODLE_TOKEN=your-moodle-token
MOODLE_SERVICE=moodle_mobile_app

# Sync Configuration
SYNC_INTERVAL_MINUTES=60
ENABLE_AUTO_SYNC=true

# Logging
LOG_LEVEL=info
LOG_MAX_FILES=30
LOG_MAX_SIZE=10m
```

## 📊 Monitoring & Maintenance

### View Logs
```bash
# Application logs
docker-compose logs -f app

# Nginx logs
docker-compose logs -f nginx

# System logs
docker-compose logs
```

### Update Deployment
```bash
# Pull latest changes
git pull origin build_test_docker

# Rebuild and restart
docker-compose down
docker-compose up --build -d
```

### Backup Data
```bash
# Backup logs and sync data
docker run --rm -v moodle-sync-api_logs:/data -v $(pwd):/backup alpine tar czf /backup/backup-$(date +%Y%m%d).tar.gz -C /data .
```

## 🔒 Security Considerations

1. **Firewall**: Only open necessary ports (80, 443)
2. **SSL**: Configure SSL certificates in nginx
3. **Environment Variables**: Never commit `.env` to repository
4. **Updates**: Regularly update Docker images
5. **Monitoring**: Set up log monitoring and alerts

## 🚨 Troubleshooting

### Common Issues:

1. **Port conflicts**: Check if ports 80, 443, 3000 are available
2. **Database connection**: Verify SQL Server is accessible from server
3. **Moodle connection**: Test Moodle Web Service connectivity
4. **Permissions**: Ensure Docker has proper permissions

### Debug Commands:
```bash
# Check container status
docker-compose ps

# Enter container
docker-compose exec app sh

# Check network
docker network ls
docker network inspect moodle-sync-api_moodle-network

# View detailed logs
docker-compose logs --tail=100 app
```