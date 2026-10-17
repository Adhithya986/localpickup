# Production Deployment Guide: LocalPickup SaaS

## 1. System Overview & Architecture

**LocalPickup** is a multi-tenant SaaS platform built for local stationery shops and digital printing centers offering counter self-pickup services.

- **Frontend**: React 19 SPA built with Vite and TypeScript (`frontend/dist`).
- **Backend**: Node.js Express 5 API written in TypeScript (`backend/dist`).
- **Database**: Embedded SQLite leveraging Node.js native `node:sqlite` (`DatabaseSync`) configured with Write-Ahead Logging (`WAL`) mode and foreign key enforcement.
- **File Storage**: Local filesystem storage with path traversal protection and role-based download authentication for customer print jobs.

---

## 2. Infrastructure Requirements

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 LTS / Debian 12 / RHEL 9 | Ubuntu 24.04 LTS |
| **Node.js Runtime** | Node.js v22.0.0+ | Node.js v24 LTS (native `node:sqlite`) |
| **CPU** | 1 vCPU | 2 vCPUs |
| **RAM** | 1 GB | 2 GB to 4 GB |
| **Disk Storage** | 20 GB SSD (NVMe preferred) | 50 GB+ SSD (depending on upload volume) |
| **Reverse Proxy** | Nginx 1.20+ or Caddy 2.7+ | Nginx with TLS 1.3 |

> [!IMPORTANT]
> **Filesystem Requirement for SQLite**: The directory containing `localpickup.db` must be on a local POSIX filesystem that supports atomic file locking (`fcntl`/`flock`). **Never** store SQLite database files on network shares (NFS, SMB, CIFS) as file locking semantics in WAL mode are unreliable across networks.

---

## 3. Environment Configuration

### Backend Environment Variables (`backend/.env`)

Copy `.env.example` to `backend/.env` on the production server. **Never commit `.env` to Git.**

```env
# Server Runtime
PORT=5000
NODE_ENV=staging # or production for live

# Authentication & Security
# Generate a cryptographically random secret on the target server using:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=generate_using_command_above_at_least_32_characters_long
JWT_EXPIRES_IN=7d

# CORS Allowed Origin (Staging or Production Frontend URL)
CORS_ORIGIN=https://staging.localpickup.yourdomain.com

# Document Storage & SQLite Paths (Ensure separate paths for staging vs production)
UPLOAD_DIR=/var/lib/localpickup/staging_uploads
DB_PATH=/var/lib/localpickup/data/localpickup_staging.db
DATABASE_PATH=/var/lib/localpickup/data/localpickup_staging.db
```

### Environment Security Validation:
1. `JWT_SECRET` must be at least 32 characters long. In both `NODE_ENV=production` and `NODE_ENV=staging`, the application refuses to start if `JWT_SECRET` is missing, too short, or contains placeholder keywords (`default`, `replace_with`).
2. `CORS_ORIGIN` strictly restricts cross-origin browser requests to the designated domain in both staging and production.
3. Express fingerprinting (`X-Powered-By`) is automatically stripped, and OWASP security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `CSP`) are injected by default.

---

## 4. Build & Installation Procedures

### 1. System Prerequisites
```bash
# Update package index and install build dependencies
sudo apt update && sudo apt install -y curl git build-essential nginx certbot python3-certbot-nginx

# Install Node.js 24 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node -v  # Must be >= 22.0.0
npm -v
```

### 2. Application Installation
```bash
# Clone the repository to the production directory
sudo mkdir -p /var/www/localpickup
sudo chown -R $USER:$USER /var/www/localpickup
git clone https://github.com/Adhithya986/localpickup.git /var/www/localpickup
cd /var/www/localpickup

# Create persistent storage directories
sudo mkdir -p /var/lib/localpickup/data
sudo mkdir -p /var/lib/localpickup/uploads
sudo chown -R $USER:$USER /var/lib/localpickup
```

### 3. Backend Build
```bash
cd /var/www/localpickup/backend
npm ci --omit=dev=false
npm run build
npm ci --omit=dev
```

### 4. Frontend Build
```bash
cd /var/www/localpickup/frontend
npm ci
npm run build
# The compiled production assets will be in /var/www/localpickup/frontend/dist
```

---

## 5. Process Management (systemd)

Create a systemd unit file to ensure the backend process starts on boot, automatically restarts on failures, and runs under an unprivileged user:

```bash
sudo nano /etc/systemd/system/localpickup-backend.service
```

```ini
[Unit]
Description=LocalPickup Multi-Tenant Backend API
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/localpickup/backend
EnvironmentFile=/var/www/localpickup/backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=localpickup-backend
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Ensure permissions and enable service:
```bash
sudo chown -R www-data:www-data /var/www/localpickup
sudo chown -R www-data:www-data /var/lib/localpickup
sudo systemctl daemon-reload
sudo systemctl enable localpickup-backend
sudo systemctl start localpickup-backend
sudo systemctl status localpickup-backend
```

---

## 6. Reverse Proxy Configuration (Nginx & TLS)

Create the Nginx site configuration:
```bash
sudo nano /etc/nginx/sites-available/localpickup
```

```nginx
server {
    server_name localpickup.yourdomain.com;

    # Client upload size limit (allows up to 30MB for document printing)
    client_max_body_size 30M;

    # Frontend compiled static SPA
    root /var/www/localpickup/frontend/dist;
    index index.html;

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # SPA routing: fallback all non-file routes to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }

    # Block public access to hidden files and internal storage
    location ~ /\. {
        deny all;
    }
}
```

Enable site and acquire SSL/TLS certificate via Let's Encrypt:
```bash
sudo ln -s /etc/nginx/sites-available/localpickup /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Provision free TLS certificate
sudo certbot --nginx -d localpickup.yourdomain.com
```

---

## 7. Database Migration Procedure

Database migrations run automatically during startup in `backend/src/database.ts` via `initDatabaseSync()`.
- Migrations are version-tracked in the `schema_migrations` table.
- Each migration runs idempotently and only once.
- On fresh deployments, schema 001 through 004 are applied sequentially.
- Existing records are preserved across updates.

---

## 8. Safe Update & Rollback Procedures

### Performing an Update
1. **Take an atomic snapshot backup before updating**:
   ```bash
   cd /var/www/localpickup/backend
   npm run backup
   ```
2. **Pull the latest release**:
   ```bash
   git pull origin main
   ```
3. **Rebuild both applications**:
   ```bash
   cd /var/www/localpickup/backend && npm ci && npm run build
   cd /var/www/localpickup/frontend && npm ci && npm run build
   ```
4. **Restart backend**:
   ```bash
   sudo systemctl restart localpickup-backend
   ```
5. **Verify health check**:
   ```bash
   curl -f http://127.0.0.1:5000/api/health
   ```

### Performing a Rollback
If a defect or regression is identified post-deployment:
1. Revert Git commit: `git checkout <previous_stable_commit>`.
2. Restore database and documents from the pre-deployment backup using `npm run restore:verify` or the disaster recovery runbook in `BACKUP_AND_RECOVERY.md`.
3. Rebuild and restart the services.
