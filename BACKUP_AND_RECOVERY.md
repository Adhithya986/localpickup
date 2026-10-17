# Backup, Disaster Recovery & Retention Guide

## 1. Executive Summary

In a multi-tenant self-pickup platform, database consistency and document retention are paramount.
LocalPickup utilizes **SQLite** configured in **Write-Ahead Logging (WAL)** mode (`PRAGMA journal_mode = WAL;`).

> [!CAUTION]
> **Never copy active SQLite database files directly in WAL mode.**
> Simply copying `localpickup.db` while active writers or transactions are underway can produce a corrupt or inconsistent snapshot because crucial transactions reside in `localpickup.db-wal`. 
>
> LocalPickup uses SQLite's native `VACUUM INTO` command, which flushes WAL pages, acquires an atomic snapshot lock, verifies page consistency, and writes a clean, standalone database file.

---

## 2. Backup Strategy & Automation

### What is Included in Every Backup?
1. **SQLite Database Snapshot**: Generated using native `VACUUM INTO '<destination>.db'`.
2. **Customer Uploaded Documents**: All print files residing in `uploads/` are synchronized.
3. **Cryptographic Manifest**: `manifest.json` containing:
   - ISO-8601 timestamp.
   - Database file size in bytes.
   - SHA-256 cryptographic checksum of the database snapshot.
   - Count of preserved print documents.
   - Source paths and schema version.

### Executing a Backup Manually
Run the backup script from the backend directory:
```bash
cd backend
npm run backup
```

Sample output:
```text
[Backup] Initiating SQLite VACUUM INTO snapshot...
[Backup] Successfully created consistent snapshot at: /var/lib/localpickup/backups/backup_2026-10-16T18-18-25-675Z
[Backup] DB SHA-256 Checksum: 05f5bacf2d4ff43bd8e05a22f76f196f873f2bcf1280552b7c5dba8e1fdf9e4a
[Backup] Preserved documents count: 226
```

### Automated Daily Scheduled Backups (Cron)
Add a cron job under the `www-data` or administrative service user:
```bash
sudo crontab -u www-data -e
```

```cron
# Run consistent backup daily at 02:00 AM UTC
0 2 * * * cd /var/www/localpickup/backend && /usr/bin/npm run backup >> /var/log/localpickup/backup.log 2>&1

# Prune backups older than 30 days every Sunday at 03:00 AM
0 3 * * 0 find /var/lib/localpickup/backups -maxdepth 1 -name "backup_*" -type d -mtime +30 -exec rm -rf {} +
```

---

## 3. Backup Verification & Test Restoration

To guarantee disaster readiness, backups must be tested regularly **without overwriting or interrupting the live production database**.

### Running an Isolated Test Restoration
LocalPickup provides an automated verification script that:
1. Locates the most recent snapshot directory.
2. Re-computes and verifies the SHA-256 database checksum against `manifest.json`.
3. Opens the snapshot in an isolated `node:sqlite` instance.
4. Executes `PRAGMA integrity_check;` to verify B-Tree integrity.
5. Verifies relational readability by checking record counts (`users`, `shops`, `orders`, `products`).
6. Restores data and uploads to an isolated test destination (`backups/test_restore.db`).

Execute test restoration:
```bash
cd backend
npm run restore:verify
```

Output:
```text
[Restore] Inspecting backup: /var/lib/localpickup/backups/backup_2026-10-16T18-18-25-675Z
[Restore] Target destination: /var/lib/localpickup/backups/test_restore.db
[Restore] SHA-256 Checksum verified successfully (05f5bacf2d4ff43bd8e05a22f76f196f873f2bcf1280552b7c5dba8e1fdf9e4a)
[Restore] PRAGMA integrity_check result: ok
[Restore] Verified records -> Users: 464, Shops: 177, Orders: 431, Products: 192
[Restore] Restored 226 print documents to: /var/lib/localpickup/backups/test_restore_uploads
[Restore] Restoration and validation successfully completed.
```

---

## 4. Disaster Recovery Runbook (Live Database Restoration)

In the event of hardware failure, catastrophic data loss, or server migration:

### Step 1: Stop the Application Service
Ensure no writers are active:
```bash
sudo systemctl stop localpickup-backend
```

### Step 2: Identify the Target Backup
List available verified snapshots:
```bash
ls -lt /var/lib/localpickup/backups/
```
Choose the desired snapshot folder, e.g., `/var/lib/localpickup/backups/backup_2026-10-16T18-18-25-675Z`.

### Step 3: Archive Current Database (Safety Step)
```bash
sudo mv /var/lib/localpickup/data/localpickup.db /var/lib/localpickup/data/localpickup.db.damaged.$(date +%s)
# Remove lingering WAL and shared memory files if present
sudo rm -f /var/lib/localpickup/data/localpickup.db-wal
sudo rm -f /var/lib/localpickup/data/localpickup.db-shm
```

### Step 4: Restore the Snapshot Database and Files
```bash
# Copy the verified snapshot database
sudo cp /var/lib/localpickup/backups/backup_2026-10-16T18-18-25-675Z/localpickup.db /var/lib/localpickup/data/localpickup.db

# Synchronize print documents
sudo rsync -av /var/lib/localpickup/backups/backup_2026-10-16T18-18-25-675Z/uploads/ /var/lib/localpickup/uploads/

# Ensure ownership permissions
sudo chown -R www-data:www-data /var/lib/localpickup/data
sudo chown -R www-data:www-data /var/lib/localpickup/uploads
sudo chmod 660 /var/lib/localpickup/data/localpickup.db
```

### Step 5: Start Service and Verify
```bash
sudo systemctl start localpickup-backend
curl -f http://127.0.0.1:5000/api/health
```

---

## 5. Document Retention & File Safety Policy

1. **Active Orders**: Documents attached to orders in `Pending`, `Accepted`, `Preparing`, or `Ready` statuses must **never** be deleted.
2. **Completed Orders**: Print documents are retained for 30 days following pickup completion to allow for customer reprints or shop dispute resolution.
3. **Retention Cleanup Job**: A daily scheduled purge deletes files older than 30 days whose parent order is in `Completed` or `Cancelled` status.
4. **Referential Safety**: Deleting a file from disk updates the `print_jobs.file_path` reference cleanly without deleting or corrupting the parent order history or financial audit log.
