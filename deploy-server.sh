#!/bin/bash

# Moodle Sync API - Server Deployment Script
# Run this script on your server to deploy the application

set -e

echo "🚀 Starting Moodle Sync API deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="moodle-sync-api"
DOCKER_IMAGE="hiepsayu/moodle-sync-api:latest"
APP_DIR="/opt/$APP_NAME"

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}This script should not be run as root. Please run as a regular user with sudo access.${NC}"
   exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker not found. Installing Docker...${NC}"
    sudo apt update
    sudo apt install -y docker.io docker-compose
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker installed. Please log out and log back in, then run this script again.${NC}"
    exit 0
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Docker Compose not found. Installing...${NC}"
    sudo apt install -y docker-compose
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Create application directory
echo -e "${YELLOW}Creating application directory...${NC}"
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

cd $APP_DIR

# Create docker-compose.yml
echo -e "${YELLOW}Creating docker-compose.yml...${NC}"
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  app:
    image: hiepsayu/moodle-sync-api:latest
    container_name: moodle-sync-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      # Database configuration - UPDATE THESE VALUES
      - SQL_SERVER=your-sql-server-ip
      - SQL_DATABASE=university_db
      - SQL_USERNAME=your-username
      - SQL_PASSWORD=your-password
      - SQL_PORT=1433
      - SQL_ENCRYPT=true
      - SQL_TRUST_SERVER_CERTIFICATE=false
      # Moodle configuration - UPDATE THESE VALUES
      - MOODLE_URL=https://your-moodle-site.com
      - MOODLE_TOKEN=your-moodle-token
      - MOODLE_SERVICE=moodle_mobile_app
      # Sync configuration
      - SYNC_INTERVAL_MINUTES=60
      - ENABLE_AUTO_SYNC=true
      # Logging configuration
      - LOG_LEVEL=info
      - LOG_MAX_FILES=30
      - LOG_MAX_SIZE=10m
    volumes:
      - ./logs:/app/logs
      - ./lastSync.json:/app/lastSync.json
    networks:
      - moodle-network
    depends_on:
      - nginx

  nginx:
    image: nginx:alpine
    container_name: moodle-sync-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./logs/nginx:/var/log/nginx
    networks:
      - moodle-network
    depends_on:
      - app

networks:
  moodle-network:
    driver: bridge

volumes:
  logs:
    driver: local
EOF

# Create nginx directory and configuration
echo -e "${YELLOW}Creating nginx configuration...${NC}"
mkdir -p nginx/ssl

cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    # Basic settings
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=health:10m rate=1r/s;

    upstream moodle_api {
        server app:3000;
    }

    server {
        listen 80;
        server_name _;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer-when-downgrade" always;
        add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

        # API endpoints
        location /api/ {
            # Rate limiting for API calls
            limit_req zone=api burst=20 nodelay;

            # Proxy settings
            proxy_pass http://moodle_api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;

            # Timeout settings
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Health check endpoint (less restrictive rate limiting)
        location /api/health {
            limit_req zone=health burst=5 nodelay;

            proxy_pass http://moodle_api;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Root endpoint
        location / {
            proxy_pass http://moodle_api;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Static files (if any)
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            proxy_pass http://moodle_api;
        }

        # Deny access to hidden files
        location ~ /\. {
            deny all;
        }
    }
}
EOF

# Create .env file template
echo -e "${YELLOW}Creating .env template...${NC}"
cat > .env.example << 'EOF'
# Server Configuration
PORT=3000
NODE_ENV=production

# SQL Server Configuration
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

# Logging Configuration
LOG_LEVEL=info
LOG_MAX_FILES=30
LOG_MAX_SIZE=10m
EOF

# Pull Docker images
echo -e "${YELLOW}Pulling Docker images...${NC}"
docker pull $DOCKER_IMAGE
docker pull nginx:alpine

# Create logs directory
mkdir -p logs

echo -e "${GREEN}✅ Deployment files created successfully!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Edit the .env file with your actual configuration:"
echo "   nano .env"
echo ""
echo "2. Start the application:"
echo "   docker-compose up -d"
echo ""
echo "3. Check status:"
echo "   docker-compose ps"
echo "   docker-compose logs -f app"
echo ""
echo "4. Test the API:"
echo "   curl http://localhost/api/health"
echo "   curl http://localhost/api/client-ip"
echo ""
echo -e "${GREEN}🎉 Deployment preparation complete!${NC}"