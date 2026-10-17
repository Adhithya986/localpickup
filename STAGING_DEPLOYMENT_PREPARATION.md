# Milestone 8: Staging Deployment Preparation Report

**Project**: LocalPickup — Multi-Tenant Campus & Neighborhood Self-Pickup SaaS  
**Milestone**: 8 — Staging Deployment Preparation  
**Target Environment**: Staging / Pre-Production  
**Date**: October 17, 2026  
**Final Classification**: **`C. Ready for manual staging deployment`**  

---

## 1. Executive Summary

Milestone 8 prepares **LocalPickup** for its initial isolated staging deployment. All automated test suites (141/141 tests across 36 suites) pass, backend TypeScript compiles cleanly with zero diagnostics, and the frontend Vite production build succeeds with optimized bundle sizes.

Crucial runtime safety checks have been introduced to ensure that setting `NODE_ENV=staging` enforces the exact same cryptographic, CORS, and diagnostic error-shielding safeguards as `NODE_ENV=production`. Staging uses completely isolated database and upload directories, preventing cross-contamination with live production data.

---

## 2. Files Inspected

The following repository artifacts, configuration templates, build descriptors, migration runners, and scripts were thoroughly inspected:

1. [DEPLOYMENT.md](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/DEPLOYMENT.md): Verified Linux deployment architecture, systemd service units, Nginx reverse proxy blocks, and SSL configuration.
2. [BACKUP_AND_RECOVERY.md](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/BACKUP_AND_RECOVERY.md): Inspected online hot-backup (`VACUUM INTO`) and isolated restore procedures.
3. [SECURITY_CHECKLIST.md](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/SECURITY_CHECKLIST.md): Inspected authentication, authorization, IDOR protections, and data isolation controls.
4. [.env.example](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/.env.example): Inspected base configuration keys and default parameters.
5. [backend/package.json](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/backend/package.json): Confirmed runtime (`node:sqlite` in Node.js 22+ / 24 LTS), build script (`tsc`), and test runners.
6. [frontend/package.json](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/frontend/package.json): Confirmed build script (`tsc -b && vite build`) and dependencies (React 19, Lucide, Tailwind).
7. [backend/src/config.ts](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/backend/src/config.ts): Inspected environment parsing, fatal exit interlocks, and fallback logic.
8. [backend/src/db/migrations.ts](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/backend/src/db/migrations.ts): Verified idempotent execution of migrations 001–004.
9. [backend/src/scripts/backup.ts](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/backend/src/scripts/backup.ts) & [restore.ts](file:///c:/Users/Akshaya/Downloads/Qproject%20-%20Copy/backend/src/scripts/restore.ts): Verified atomic database snapshotting and document archive procedures.

---

## 3. Files Changed & Hardening Measures

To prepare the codebase for staging deployment without risking production security or development ergonomics, the following files were modified:

### 1. `backend/src/config.ts`
- **Expanded Deployment Classification**: Added `"staging"` to valid `nodeEnv` union types (`"development" | "production" | "staging" | "test"`).
- **Enforced Production-Grade Security on Staging**: Defined `isDeployed = nodeEnv === "production" || nodeEnv === "staging"`.
- **Strict JWT Secret Enforcement**: In both staging and production, missing secrets, secrets shorter than 32 characters, or placeholder secrets (`default`, `replace_with`) immediately trigger a fatal error and `process.exit(1)` on startup.
- **Dedicated Staging Fallbacks**: Added isolated paths for staging database (`localpickup_staging.db`) and staging uploads directory (`staging_uploads`).

### 2. `backend/src/app.ts`
- **Staging CORS Restriction**: Configured CORS origin validation to strictly enforce whitelist checking whenever `isDeployed` is true (`staging` or `production`), preventing unauthorized cross-origin requests.

### 3. `backend/src/middleware/errorHandler.ts`
- **Error Stack Shielding**: Updated global error handler to withhold internal error messages and stack traces whenever `isDeployed` is true (`staging` or `production`), preventing internal system leakage to clients.

### 4. `backend/.env.staging.example`
- Created dedicated template documenting required variables for the staging environment with isolated paths and sanitized guidance.

### 5. `DEPLOYMENT.md`
- Replaced hardcoded example secret with cryptographically secure random generator command.
- Documented staging vs production isolated storage paths and environment flags.

### 6. `frontend/index.html`
- Updated title to `LocalPickup — Local Printing & Stationery Self-Pickup` and added descriptive meta tags for SEO and production readiness.

---

## 4. Build and Test Validation Results

All build and test executions were conducted against isolated test environments without affecting live databases.

### 1. Backend Production Compilation
- **Command**: `npm run build` (within `backend/`)
- **Tool**: TypeScript Compiler (`tsc`)
- **Result**: **SUCCESS** (Exit code: 0)
- **Artifacts**: Clean transpilation into `backend/dist/` (including `server.js`, `app.js`, `config.js`, etc.).

### 2. Frontend Production Compilation
- **Command**: `npm run build` (within `frontend/`)
- **Tool**: TypeScript (`tsc -b`) & Vite 6
- **Result**: **SUCCESS** (Exit code: 0)
- **Output Artifacts**:
  - `dist/index.html`: 0.69 kB (gzip: 0.40 kB)
  - `dist/assets/index-BUD2NOM8.css`: 11.01 kB (gzip: 2.87 kB)
  - `dist/assets/index-BFkQyXy2.js`: 407.39 kB (gzip: 119.82 kB)

### 3. Automated Test Suite Execution
- **Command**: `npm test` (within `backend/`)
- **Target**: Isolated test database (`localpickup.test.db`) and test uploads (`test_uploads/`)
- **Result**: **141 / 141 tests passing** across 36 test suites.
  - Multi-tenant tenant isolation: Passed
  - Role-based authorization (Customer, Shop Owner, Super Admin): Passed
  - Document authorization and anti-IDOR tests (6 distinct user personas): Passed
  - Inventory restoration and cancellation idempotency: Passed
  - Pricing and mixed-order checkout: Passed
  - SaaS subscription quotas: Passed
  - SQLite hot-backup verification: Passed

### 4. Live Database Verification
- Pre-test and post-test inspections confirmed **zero modifications** to live data:
  - Users: 701
  - Shops: 301
  - Orders: 619
  - Products: 271
  - Stored Documents: 331

---

## 5. Required Environment Variables

The table below outlines all environment variables required for the staging deployment. **No actual secrets are stored or displayed.**

| Variable | Required in Staging? | Purpose | Staging Value Example | Validation Rule |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | **YES** | Sets deployment mode | `staging` | Must be `staging`. Enforces strict JWT and CORS checks. |
| `PORT` | **YES** | Port for Express backend | `5000` | Valid TCP port (e.g., 5000 or 5001). |
| `JWT_SECRET` | **YES** | Signs authentication tokens | `[32+ byte cryptographically random hex]` | Mandatory. Must be $\ge 32$ chars, no placeholder words. |
| `JWT_EXPIRES_IN` | No (Default: 7d) | Token expiration duration | `7d` | Valid ms/time string. |
| `CORS_ORIGIN` | **YES** | Authorized frontend URL | `https://staging.localpickup.yourdomain.com` | Strict URL match. Web browsers blocked if mismatched. |
| `DB_PATH` | **YES** | Isolated staging SQLite path | `/var/lib/localpickup/data/localpickup_staging.db` | Must reside on local POSIX disk (no NFS). Separate from prod. |
| `DATABASE_PATH` | **YES** | Alias for `DB_PATH` | `/var/lib/localpickup/data/localpickup_staging.db` | Same as `DB_PATH`. |
| `UPLOAD_DIR` | **YES** | Isolated staging documents | `/var/lib/localpickup/staging_uploads` | Outside web root. Private directory. Separate from prod. |
| `VITE_API_URL` | Frontend Build | Backend API base URL | `/api` (reverse-proxied) or full URL | Configured at frontend build time. |

---

## 6. Staging Deployment Checklist & Operations Guide

### A. Server Requirements
- **OS**: Ubuntu 22.04 LTS or 24.04 LTS (recommended)
- **Node.js**: Node.js v22.0.0+ or v24 LTS (native `node:sqlite` requirement)
- **Memory**: Minimum 1 GB RAM, recommended 2 GB RAM
- **Disk**: 20 GB+ NVMe/SSD storage formatted with ext4/xfs
- **Reverse Proxy**: Nginx 1.20+ with TLS 1.3 support

### B. Directory Structure & Permissions
```bash
# Application code directory (owned by deployer/service user)
sudo mkdir -p /var/www/localpickup-staging
sudo chown -R localpickup:localpickup /var/www/localpickup-staging

# Isolated data and upload directories (strictly outside web root)
sudo mkdir -p /var/lib/localpickup/data
sudo mkdir -p /var/lib/localpickup/staging_uploads
sudo chown -R localpickup:localpickup /var/lib/localpickup
sudo chmod 700 /var/lib/localpickup/data
sudo chmod 700 /var/lib/localpickup/staging_uploads
```

### C. Build and Startup Commands

#### 1. Backend Build & Service Launch
```bash
cd /var/www/localpickup-staging/backend
# Install production dependencies and dev dependencies for build
npm ci
npm run build
# Prune dev dependencies
npm prune --production

# Verify migrations and start backend via Systemd
```

#### 2. Frontend Build
```bash
cd /var/www/localpickup-staging/frontend
npm ci
VITE_API_URL=/api npm run build
# Built files output to /var/www/localpickup-staging/frontend/dist
```

### D. Systemd Service Unit (`/etc/systemd/system/localpickup-staging.service`)
```ini
[Unit]
Description=LocalPickup SaaS Staging Backend
After=network.target

[Service]
Type=simple
User=localpickup
Group=localpickup
WorkingDirectory=/var/www/localpickup-staging/backend
Environment=NODE_ENV=staging
EnvironmentFile=/var/www/localpickup-staging/backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=localpickup-staging
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

To enable and run:
```bash
sudo systemctl daemon-reload
sudo systemctl enable localpickup-staging
sudo systemctl start localpickup-staging
```

### E. Nginx Reverse Proxy & Security Configuration
Create `/etc/nginx/sites-available/localpickup-staging.conf`:
```nginx
server {
    listen 80;
    server_name staging.localpickup.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.localpickup.yourdomain.com;

    # TLS Certificates (Certbot managed)
    ssl_certificate /etc/letsencrypt/live/staging.localpickup.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.localpickup.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend Static SPA
    root /var/www/localpickup-staging/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Allow upload of document print files (up to 25MB)
        client_max_body_size 25M;
        proxy_read_timeout 60s;
    }

    # Uploads are strictly served via authorized /api/orders/documents/:filename route
    # Block direct filesystem access to uploads
    location /uploads/ {
        deny all;
        return 404;
    }
}
```

### F. Health Checks & Verification
1. **HTTP Ping**:
   ```bash
   curl -i https://staging.localpickup.yourdomain.com/api/health
   # Expected response: 200 OK with {"status":"ok","timestamp":...}
   ```
2. **Startup Log Inspection**:
   ```bash
   sudo journalctl -u localpickup-staging -n 50 -f
   ```
   Confirm log outputs indicate:
   - Migrations executed cleanly.
   - WAL mode enabled.
   - Foreign key constraints enabled.
   - Server listening on port 5000.
3. **Document Access Protection**:
   Attempting unauthenticated access to uploaded documents directly returns 401 Unauthorized or 404 Not Found.

### G. Backup and Rollback Procedures
- **Staging Hot Backup**:
  ```bash
  npm run backup
  ```
  Generates an atomic snapshot using SQLite `VACUUM INTO` and archives staging upload documents.
- **Rollback Runbook**:
  1. Stop staging service: `sudo systemctl stop localpickup-staging`
  2. Restore code or previous git tag: `git checkout <previous_release_tag>`
  3. Rebuild backend and frontend.
  4. If database rollback is needed, run `npx ts-node src/scripts/restore.ts <backup_archive.tar.gz>` using the isolated staging path parameters.
  5. Restart service: `sudo systemctl start localpickup-staging`

---

## 7. Remaining Manual Tasks Prior to Staging Deployment

The codebase is fully packaged and verified. The following manual infrastructure steps must be performed on the target staging host:

1. **Host Provisioning**: Provision a staging VM/VPS (Ubuntu 22.04 or 24.04 LTS) with at least 1 GB RAM.
2. **DNS Configuration**: Create an `A` record for `staging.localpickup.yourdomain.com` pointing to the staging server's public IP.
3. **Node.js Installation**: Install Node.js 24 LTS via NodeSource repository.
4. **Directory Creation**: Create `/var/lib/localpickup/data` and `/var/lib/localpickup/staging_uploads` with permissions restricted to the application user (`chmod 700`).
5. **Secret Generation**: Generate a cryptographically secure 32-byte staging JWT secret using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and place it into `/var/www/localpickup-staging/backend/.env`.
6. **SSL Setup**: Execute `sudo certbot --nginx -d staging.localpickup.yourdomain.com` to obtain and auto-configure Let's Encrypt certificates.
7. **Manual Smoke Testing**: Execute the complete user journey (Customer ordering, Print job upload, Shop owner processing, Counter pickup verification) in the staging browser.

---

## 8. Known Operational Risks & Mitigations

1. **Node.js Runtime Dependency**:
   - *Risk*: Running on Node.js `< 22.0.0` will fail immediately because `node:sqlite` (`DatabaseSync`) is built into Node 22+.
   - *Mitigation*: Automated runtime version check in `backend/src/db/index.ts` logs an explicit error if Node `< 22` is detected.
2. **Network Filesystem Locking**:
   - *Risk*: SQLite WAL mode requires POSIX atomic locking. Hosting the database on NFS/CIFS causes corruption.
   - *Mitigation*: Staging documentation explicitly mandates local ext4/xfs SSD volumes.
3. **Upload Disk Capacity**:
   - *Risk*: Large customer print PDF uploads can consume server disk space.
   - *Mitigation*: Express upload limiter enforces 25MB maximum per file; staging disk monitoring alerts can be configured at 80% threshold.
4. **Reverse Proxy Body Size**:
   - *Risk*: Nginx default `client_max_body_size` is 1MB, which would reject legitimate customer document uploads.
   - *Mitigation*: Nginx configuration template explicitly includes `client_max_body_size 25M;`.

---

## 9. Final Classification

```
================================================================================
FINAL CLASSIFICATION: C. Ready for manual staging deployment
================================================================================
```

All prerequisites, configuration isolation safeguards, automated tests, and production compilation verifications are complete. No blocking defects or outstanding issues remain in the application codebase.
