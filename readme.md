# 🎓 SaaS Certificate Management — Backend API

> **Node.js + PostgreSQL** backend for a multi-branch certificate management system. Handles certificate lifecycle (create → migrate → reserve → print → reprint), medal stock tracking, user authentication, and automated backups.

---

## 📋 Table of Contents

- [Tech Stack](#-tech-stack)
- [Architecture Overview](#-architecture-overview)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the App](#-running-the-app)
- [Running Tests](#-running-tests)
- [API Overview](#-api-overview)
- [Authentication & Authorization](#-authentication--authorization)
- [Certificate Lifecycle](#-certificate-lifecycle)
- [Medal Stock System](#-medal-stock-system)
- [Backup & Restore](#-backup--restore)
- [Cron Jobs](#-cron-jobs)
- [Security Features](#-security-features)
- [Known Issues & Tech Debt](#-known-issues--tech-debt)
- [Deployment Checklist](#-deployment-checklist)
- [Contributing](#-contributing)

---

## 🛠 Tech Stack

| Layer            | Technology                                  |
| ---------------- | ------------------------------------------- |
| Runtime          | Node.js (≥ 18.x)                            |
| Framework        | Express.js                                  |
| Database         | PostgreSQL (≥ 14)                           |
| DB Client        | `pg` + `pg-pool`                            |
| Authentication   | JWT (Access Token) + Refresh Token rotation |
| Password Hashing | bcrypt (cost factor 10)                     |
| File Uploads     | Multer                                      |
| Logging          | Winston                                     |
| Scheduling       | node-cron                                   |
| Security         | Helmet, express-rate-limit, CORS            |
| Testing          | Jest + Supertest                            |
| DB Backup        | pg_dump / pg_restore (child process)        |

---

## 🏗 Architecture Overview

This is a **single-instance MVC-style REST API**. There is no message queue, no Redis, and no horizontal scaling — by design, for the current scale (100–200 users). The application is structured as follows:

```
Client → Express Middleware Stack → Router → Controller → Service/Model → PostgreSQL
```

**Middleware Stack (in order):**

1. `morgan` — HTTP request logging
2. `helmet` — Security headers
3. `cors` — Cross-origin policy
4. `express.json()` — Body parsing
5. `cookie-parser` — Cookie parsing (for refresh token)
6. `ipWhitelistMiddleware` — IP allowlist (admin routes)
7. `rateLimitMiddleware` — Global rate limiting (in-memory store)
8. `authLimiter` — Auth-specific rate limit
9. `bruteForceMiddleware` — Login brute force protection (PostgreSQL-backed)
10. `authenticateToken` — JWT verification

**Key design decisions:**

- Rate limiting uses **in-memory store** — acceptable for single-instance, must be migrated to Redis before horizontal scaling.
- Brute force protection is **PostgreSQL-backed** (`login_attempts` table) — survives restarts, but cleanup cron must handle multi-instance conflicts if ever scaled.
- Refresh tokens use **UPSERT (ON CONFLICT user_id)** — one active refresh token per user, atomic update.
- Certificate reservation uses **`SELECT FOR UPDATE`** inside a transaction to prevent race conditions.
- Medal stock uses **pre-check + double-check inside transaction** to handle concurrent requests safely.

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js          # pg-pool setup, query wrapper with logging
│   │   └── jwt.js               # JWT sign/verify with env secret validation
│   ├── controller/              # HTTP layer — parse req, call service, send res
│   │   ├── authController.js
│   │   ├── backupController.js
│   │   ├── branchController.js
│   │   ├── certificateController.js
│   │   └── ...
│   ├── database/
│   │   └── init_database.sql    # Full schema + superadmin seed (run ONCE)
│   │   └── seed_development.sql # Dev/test seed data
│   ├── middleware/
│   │   ├── authMiddleware.js         # JWT verification
│   │   ├── bruteForceMiddleware.js   # Login attempt tracking
│   │   ├── ipWhitelistMiddleware.js  # CIDR-based IP allowlist
│   │   ├── rateLimitMiddleware.js    # express-rate-limit (in-memory)
│   │   └── uploadMiddleware.js       # Multer — UUID filename, mime+ext validation
│   ├── models/                  # Raw SQL queries — no ORM
│   │   ├── certificateModel.js
│   │   ├── certificateMigrationModel.js  # ⚠️ Contains duplicate CertificateModel class
│   │   ├── medalStockModel.js
│   │   ├── studentModel.js
│   │   └── teacherModel.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── backupRoutes.js
│   │   ├── branchRoutes.js
│   │   ├── certificateRoutes.js
│   │   └── healthRoutes.js       # /live, /ready, /health (Kubernetes-ready)
│   ├── services/                # Business logic layer
│   │   ├── authService.js            # Login, token rotation, password change
│   │   ├── backupService.js          # pg_dump / pg_restore with path traversal guard
│   │   ├── certificateTeacherService.js
│   │   ├── certificateLogService.js
│   │   └── ...
│   └── utils/
│       ├── certificateCronJob.js     # Releases expired reservations
│       └── fileCleanUpJob.js         # Removes orphaned uploaded files
├── __tests__/
│   ├── api/
│   │   ├── auth.test.js
│   │   ├── backup.test.js
│   │   ├── branch.test.js
│   │   └── certificate.test.js
│   └── helpers/
│       └── testDatabase.js      # Test DB init helper (uses init_database.sql)
├── app.js                       # Express app setup (no listen)
├── server.js                    # HTTP server + graceful shutdown
├── package.json
└── .env.example                 # ← Copy this to .env and fill in values
```

---

## 🗄 Database Schema

The schema lives in `src/database/init_database.sql`. Run it **once** on a fresh database. It is idempotent (`DROP TABLE IF EXISTS ... CASCADE` at the top) but **will wipe all data** on re-run.

### Table Overview

```
branches                    → Multi-level branch hierarchy (head + sub branches)
users                       → superAdmin / admin / teacher roles
login_attempts              → Brute force protection counter
refresh_tokens              → One active token per user (UNIQUE user_id)
divisions                   → Certificate program divisions
sub_divisions               → Sub-categories under divisions (with age range)
modules                     → Modules belonging to divisions
teacher_branches            → Many-to-many: teachers ↔ branches
teacher_divisions           → Many-to-many: teachers ↔ divisions
certificates                → The physical certificates (in_stock → reserved → printed)
certificate_reservations    → Holds a certificate for a teacher (expires_at TTL)
certificate_migrations      → Audit log of certificate branch transfers
certificate_prints          → Print records (multiple rows allowed — reprint history)
certificate_pdfs            → Uploaded PDF file metadata per print
certificate_logs            → Full audit log (bulk_create, migrate, reserve, print, reprint)
students                    → Student registry (unique by LOWER(name) + branch)
branch_medal_stock          → One row per branch, CHECK quantity >= 0
medal_stock_logs            → Medal movement audit (add, migrate_in, migrate_out, consume)
database_backups            → Metadata for pg_dump backup files
```

### Critical Schema Notes

| Constraint                                                     | Reason                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `refresh_tokens.user_id` is UNIQUE                             | Enables atomic UPSERT — one active refresh token per user |
| `certificate_prints` has **no** UNIQUE on `certificate_id`     | Intentional — reprints insert new rows, not updates       |
| `students` has UNIQUE index on `(LOWER(name), head_branch_id)` | Case-insensitive duplicate prevention                     |
| `branch_medal_stock.quantity CHECK >= 0`                       | Database-level protection against negative stock          |
| `certificate_logs.certificate_id` allows NULL                  | Preserved for historical records after soft deletes       |

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18.x
- PostgreSQL ≥ 14
- `pg_dump` and `pg_restore` available in PATH (for backup feature)

### Installation

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd backend
npm install

# 2. Copy and fill environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables section)

# 3. Initialize the database (run ONCE on a fresh DB)
psql -U <your_user> -d <your_database> -f src/database/init_database.sql

# 4. (Optional) Seed development data
psql -U <your_user> -d <your_database> -f src/database/seed_development.sql
```

After running `init_database.sql`, verify you see:

```
DATABASE INITIALIZED SUCCESSFULLY
✔ branches
✔ users
... (all 19 tables listed)
✔ refresh_tokens has UNIQUE(user_id) — atomic UPSERT ready
✔ certificate_prints allows multiple rows per certificate (reprint history enabled)
```

If you see any `✘` warnings, **do not proceed** until they are resolved.

---

## ⚙️ Environment Variables

Create a `.env` file in the project root. **Never commit `.env` to version control.**

```env
# ── App ──────────────────────────────────────────────
NODE_ENV=development          # development | production | test
PORT=3000

# ── Database ─────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=certificate_db
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_POOL_MAX=20                # Max pool connections (default 20)

# ── JWT ──────────────────────────────────────────────
JWT_SECRET=your_very_long_random_secret_here_min_32_chars
JWT_ACCESS_EXPIRES=15m        # Access token lifetime
JWT_REFRESH_EXPIRES=7d        # Refresh token lifetime

# ── CORS ─────────────────────────────────────────────
# ⚠️ MUST be set to your actual domain in production. Never use * in production.
CORS_ORIGIN=http://localhost:5173

# ── File Upload ───────────────────────────────────────
UPLOAD_DIR=./uploads          # Directory for uploaded PDFs
MAX_FILE_SIZE_MB=10

# ── Backup ───────────────────────────────────────────
BACKUP_DIR=./backups          # Directory for pg_dump backup files
BACKUP_RETENTION_DAYS=30      # Auto-delete backups older than N days

# ── IP Whitelist ─────────────────────────────────────
# Comma-separated IPs or CIDR ranges (leave empty to disable)
IP_WHITELIST=127.0.0.1,192.168.1.0/24

# ── Logging ──────────────────────────────────────────
LOG_DIR=./logs
```

### Test Environment

For running tests, create a separate `.env.test` file:

```env
NODE_ENV=test
DB_HOST=localhost
DB_PORT=5432
DB_NAME=certificate_db_test   # ← Use a SEPARATE test database!
DB_USER=postgres
DB_PASSWORD=your_password_here
JWT_SECRET=test_secret_at_least_32_characters_long
```

> ⚠️ **Critical:** The test suite drops and recreates all tables on every run via `init_database.sql`. Always use a dedicated test database — never point `DB_NAME` in `.env.test` at your development or production database.

---

## ▶️ Running the App

```bash
# Development (with auto-reload via nodemon)
npm run dev

# Production
npm start

# Health check (once running)
curl http://localhost:3000/api/health/live
curl http://localhost:3000/api/health/ready
```

---

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Run a specific test file
npx jest __tests__/api/auth.test.js

# Run with coverage report
npx jest --coverage

# Run in watch mode (during development)
npx jest --watch
```

### Test Coverage

| Suite                 | Test Cases | Coverage Area                                           |
| --------------------- | ---------- | ------------------------------------------------------- |
| `auth.test.js`        | 18         | Login, refresh, change password/username, logout        |
| `backup.test.js`      | 31         | Create, list, download, delete, restore, path traversal |
| `branch.test.js`      | 19         | CRUD, tree structure, medal stock init, toggle head     |
| `certificate.test.js` | 12         | Full lifecycle, reprint history, stock management       |

### Common Test Errors

**`SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`**

The test database connection is failing because `DB_PASSWORD` is missing or undefined in your test environment.

Fix:

1. Ensure `.env.test` exists with a valid `DB_PASSWORD`
2. Ensure Jest loads the test env file. Check `jest.config.js`:

```js
// jest.config.js
module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.js"],
};
```

```js
// jest.setup.js
require("dotenv").config({ path: ".env.test" });
```

---

## 🌐 API Overview

All endpoints are prefixed with `/api`. Authentication is via `Authorization: Bearer <access_token>` header, except where noted.

### Auth — `/api/auth`

| Method  | Path               | Auth | Description                                      |
| ------- | ------------------ | ---- | ------------------------------------------------ |
| `POST`  | `/login`           | ❌   | Login, returns access + refresh tokens           |
| `POST`  | `/refresh`         | ❌   | Refresh access token via cookie                  |
| `GET`   | `/me`              | ✅   | Get current user profile                         |
| `POST`  | `/logout`          | ✅   | Revoke refresh token                             |
| `PATCH` | `/change-password` | ✅   | Change password (requires current password)      |
| `PATCH` | `/change-username` | ✅   | Change username (requires password confirmation) |

### Branches — `/api/branches`

| Method   | Path                 | Role       | Description                       |
| -------- | -------------------- | ---------- | --------------------------------- |
| `GET`    | `/`                  | All        | Get all branches (tree structure) |
| `GET`    | `/heads`             | All        | Get head branches only            |
| `GET`    | `/:id`               | All        | Get branch by ID                  |
| `POST`   | `/`                  | superAdmin | Create branch (head or sub)       |
| `PUT`    | `/:id`               | superAdmin | Update branch                     |
| `PATCH`  | `/:id/toggle-active` | superAdmin | Activate/deactivate branch        |
| `PATCH`  | `/:id/toggle-head`   | superAdmin | Promote/demote head branch        |
| `DELETE` | `/:id`               | superAdmin | Delete branch                     |

### Certificates — `/api/certificates`

| Method | Path               | Role    | Description                              |
| ------ | ------------------ | ------- | ---------------------------------------- |
| `POST` | `/bulk-create`     | admin   | Bulk create certificates for a branch    |
| `GET`  | `/stock`           | admin   | Get stock summary                        |
| `GET`  | `/stock/alerts`    | admin   | Get low-stock alerts                     |
| `POST` | `/migrate`         | admin   | Transfer certificates between branches   |
| `POST` | `/reserve`         | teacher | Reserve a certificate (max 5 active)     |
| `POST` | `/release`         | teacher | Release a reservation                    |
| `POST` | `/print`           | teacher | Print a reserved certificate             |
| `POST` | `/reprint`         | teacher | Reprint a previously printed certificate |
| `GET`  | `/my-reservations` | teacher | Get own active reservations              |
| `GET`  | `/:id/history`     | admin   | Get full print history for a certificate |

### Backup — `/api/backup`

| Method   | Path            | Role                | Description                                          |
| -------- | --------------- | ------------------- | ---------------------------------------------------- |
| `POST`   | `/create`       | admin (head branch) | Create pg_dump backup                                |
| `GET`    | `/list`         | admin (head branch) | List backups for own branch                          |
| `GET`    | `/download/:id` | admin (head branch) | Download backup file                                 |
| `DELETE` | `/:id`          | admin (head branch) | Delete backup record + file                          |
| `POST`   | `/restore`      | admin (head branch) | Restore from backup (requires password confirmation) |

### Health — `/api/health`

| Method | Path      | Description                                  |
| ------ | --------- | -------------------------------------------- |
| `GET`  | `/live`   | Liveness probe (always 200 if process is up) |
| `GET`  | `/ready`  | Readiness probe (checks DB connection)       |
| `GET`  | `/health` | Full status (DB pool, uptime, environment)   |

> ⚠️ The `/health` endpoint exposes internal system information. Consider protecting it behind an internal network or IP whitelist before production.

---

## 🔐 Authentication & Authorization

### Token Flow

```
Login → Access Token (15m, in response body)
      + Refresh Token (7d, in httpOnly cookie)

API Request → Authorization: Bearer <access_token>

Token Expired → POST /api/auth/refresh (sends cookie automatically)
              → New Access Token + New Refresh Token (rotation)

Logout → Refresh token revoked in DB → cannot refresh again
```

### Token Storage (Frontend)

- **Access Token** — store in memory (JavaScript variable), never in localStorage
- **Refresh Token** — sent as `httpOnly` cookie automatically, no JS access

### Roles & Permissions

| Role         | Access                                                                   |
| ------------ | ------------------------------------------------------------------------ |
| `superAdmin` | Full access — branch management, all admin functions across all branches |
| `admin`      | Branch-scoped — manage certificates, teachers, backups for own branch    |
| `teacher`    | Reserve, print, and reprint certificates assigned to them                |

### Brute Force Protection

Login attempts are tracked in the `login_attempts` table. After **5 failed attempts**, the account is locked for **15 minutes**. This is PostgreSQL-backed and survives server restarts. A cleanup cron job removes stale records periodically.

---

## 📜 Certificate Lifecycle

```
bulk_create → [in_stock]
                  ↓ migrate (admin transfers to another branch)
             [in_stock @ new branch]
                  ↓ reserve (teacher picks up, TTL expires_at)
             [reserved]
                  ↓ print (teacher fills in student info)
             [printed]
                  ↓ reprint (creates NEW row in certificate_prints, is_reprint=true)
             [printed] (status unchanged, history row added)
```

### Important Reprint Behavior

Reprints do **not** update the existing `certificate_prints` row. They insert a **new row** with `is_reprint = true`. This means:

- `certificate_prints` can have multiple rows per `certificate_id`
- To get the latest print info: `SELECT ... ORDER BY printed_at DESC LIMIT 1`
- There is **no UNIQUE constraint** on `certificate_prints(certificate_id)` — this is intentional
- Reprints do **not** consume medal stock

### Reservation Rules

- A teacher may hold **maximum 5 active reservations** simultaneously
- Reservations have a TTL (`expires_at`). Expired reservations are automatically released by the `certificateCronJob`
- A certificate must be in `reserved` status by the requesting teacher to be printed

---

## 🏅 Medal Stock System

Each branch has a row in `branch_medal_stock`. Medal stock is consumed when a certificate is printed with `medal_included = true`.

Transfers between branches use the `transferStock()` function which:

1. Deducts from source branch (`migrate_out` log)
2. Adds to destination branch (`migrate_in` log)
3. Both operations run inside a single **transaction**

The `quantity >= 0` CHECK constraint at the database level prevents negative stock even in race conditions.

---

## 💾 Backup & Restore

Backups are created using `pg_dump` as a child process. The backup file is stored locally in `BACKUP_DIR`.

### Security Notes

- **Path traversal protection**: All file operations validate that the resolved path is within `BACKUP_DIR`. A backup record with a manipulated `file_path` cannot escape the backup directory.
- `PGPASSWORD` is passed via the child process environment — this is the standard pattern but be aware it may appear in system process listings on some OS configurations.
- Restore requires the admin's **current password** as confirmation before executing.

### Retention

Backups older than `BACKUP_RETENTION_DAYS` days are automatically deleted by the file cleanup cron job.

---

## ⏰ Cron Jobs

Cron jobs are initialized in `server.js` **after** the database connection is confirmed.

| Job                  | Schedule             | Function                                                                    |
| -------------------- | -------------------- | --------------------------------------------------------------------------- |
| `certificateCronJob` | Every 15 minutes     | Release expired reservations, update certificate status back to `in_stock`  |
| `fileCleanUpJob`     | Every day at 2:00 AM | Delete orphaned uploaded files not referenced in DB; delete expired backups |

> ⚠️ **Multi-instance warning:** If you ever run more than one instance (horizontal scaling), both cron jobs will run on every instance simultaneously. This will cause duplicate processing and race conditions. Implement leader election (e.g., via a Redis lock or a `pg_try_advisory_lock`) before scaling horizontally.

---

## 🔒 Security Features

| Feature          | Implementation                                               |
| ---------------- | ------------------------------------------------------------ |
| Helmet           | Security headers (CSP, HSTS, etc.)                           |
| CORS             | Configurable origin via `CORS_ORIGIN` env                    |
| Rate Limiting    | `express-rate-limit` (in-memory) — 100 req/15min default     |
| Auth Rate Limit  | Stricter limit on `/api/auth/*` routes                       |
| Brute Force      | PostgreSQL-backed login attempt counter with lockout         |
| JWT              | Short-lived access tokens (15m) + rotating refresh tokens    |
| Refresh Token    | httpOnly cookie, hashed in DB (`SHA-256`)                    |
| Password Hashing | bcrypt cost factor 10                                        |
| File Upload      | UUID filenames, MIME type + file extension double validation |
| Path Traversal   | Backup file paths validated against `BACKUP_DIR`             |
| IP Whitelist     | CIDR-range support for admin route protection                |
| Input Validation | express-validator on all endpoints                           |

---

## ⚠️ Known Issues & Tech Debt

These are non-blocking for current scale but should be addressed before scaling:

### High Priority

| Issue                               | Location                 | Fix                                                               |
| ----------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| **`CORS_ORIGIN` defaults to `*`**   | `app.js`                 | Set to specific domain before production deployment               |
| **`/api/health` exposes internals** | `healthRoutes.js`        | Protect behind IP whitelist or internal network                   |
| **Rate limiter is in-memory**       | `rateLimitMiddleware.js` | Migrate to Redis store (`rate-limit-redis`) before multi-instance |

### Medium Priority

| Issue                                  | Location                                       | Fix                                                     |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| **Cron jobs run on every instance**    | `certificateCronJob.js`, `fileCleanUpJob.js`   | Add `pg_try_advisory_lock` or Redis leader election     |
| **`fs.writeFileSync` in health check** | `healthRoutes.js`                              | Replace with async `fs.promises.writeFile`              |
| **`fs.readdirSync` in file cleanup**   | `fileCleanUpJob.js`                            | Replace with async readdir for large upload directories |
| **Duplicate `CertificateModel` class** | `certificateMigrationModel.js`                 | Import from `certificateModel.js` instead of redefining |
| **Hardcoded `LIMIT 10`**               | `certificateModel.js` → `getPrintStatistics()` | Make configurable or paginated                          |

### Low Priority

| Issue                            | Location              | Fix                                                                           |
| -------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| **`pg_dump` PGPASSWORD in env**  | `backupService.js`    | Consider `.pgpass` file or pg connection string with SSL for cleaner approach |
| **No magic bytes check for PDF** | `uploadMiddleware.js` | Add `%PDF-` header check for stricter PDF validation                          |
| **No compression middleware**    | `app.js`              | Add `compression` package for response compression                            |

---

## ✅ Deployment Checklist

Before going live, verify the following:

```
Environment
  [ ] NODE_ENV=production
  [ ] JWT_SECRET is at least 64 random characters
  [ ] CORS_ORIGIN set to your actual frontend domain (not *)
  [ ] DB_PASSWORD set and strong
  [ ] BACKUP_RETENTION_DAYS configured

Security
  [ ] /api/health endpoint protected (IP whitelist or internal network only)
  [ ] UPLOAD_DIR and BACKUP_DIR are outside web root
  [ ] HTTPS is configured (reverse proxy: nginx / Caddy)
  [ ] trust proxy configured correctly (already set in app.js)

Database
  [ ] init_database.sql has been run on production DB
  [ ] Superadmin default password (admin123) has been changed
  [ ] Database is backed up before first deploy

Infrastructure
  [ ] Server has at least 2 CPU cores, 2 GB RAM
  [ ] pg_dump and pg_restore are available in PATH
  [ ] Log directory is writable
  [ ] Upload and backup directories are writable
  [ ] Systemd / PM2 process manager configured for auto-restart
```

---

## 👥 Contributing

### Branch Naming

```
feature/short-description
fix/short-description
chore/short-description
```

### Before Submitting a PR

1. Run tests: `npm test` — all 81 tests must pass
2. Verify no `.env` files are committed
3. Update this README if you add new environment variables, endpoints, or cron jobs
4. If you modify the database schema, update `init_database.sql` and document the change in the CHANGELOG comment block at the top of that file

### Code Style

- No ORM — all queries are raw SQL in `src/models/`
- Business logic lives in `src/services/`, not controllers
- Controllers only parse requests and format responses
- All database mutations involving multiple tables **must** use transactions
- Every transaction that modifies certificate or medal state **must** write to the corresponding audit log table

---

_Last updated: February 2026_
