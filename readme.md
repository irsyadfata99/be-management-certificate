# SaaS Certificate Management System — Backend API

REST API untuk sistem manajemen sertifikat berbasis SaaS. Dibangun dengan **Node.js**, **Express**, dan **PostgreSQL**.

---

## Daftar Isi

- [Fitur](#fitur)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Prerequisites](#prerequisites)
- [Instalasi](#instalasi)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Menjalankan Server](#menjalankan-server)
- [Roles & Akses](#roles--akses)
- [API Endpoints](#api-endpoints)
- [Alur Kerja Sertifikat](#alur-kerja-sertifikat)
- [Database Schema](#database-schema)

---

## Fitur

- **Autentikasi JWT** — access token (15 menit) + refresh token (7 hari)
- **Role-based Access Control** — `superAdmin`, `admin`, `teacher`
- **Manajemen Branch** — hierarki head branch & sub branch
- **Manajemen Sertifikat** — bulk create, migrasi, reservasi (maks. 5 aktif / 24 jam), cetak
- **Manajemen Siswa** — dibuat otomatis saat cetak, dapat dicari dengan autocomplete
- **Logging & Export** — semua aksi sertifikat tercatat, export ke Excel
- **Cron Job** — auto-release reservasi yang expired setiap jam
- **Rate Limiting** — perlindungan terhadap brute-force dan spam request

---

## Tech Stack

| Komponen  | Teknologi          |
| --------- | ------------------ |
| Runtime   | Node.js >= 18      |
| Framework | Express.js         |
| Database  | PostgreSQL         |
| Auth      | JWT (jsonwebtoken) |
| Password  | bcryptjs           |
| Export    | ExcelJS            |
| Scheduler | node-cron          |
| Validasi  | express-validator  |

---

## Struktur Proyek

```
├── server.js
├── src/
│   ├── app.js
│   ├── config/
│   │   ├── database.js
│   │   └── jwt.js
│   ├── controller/
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── roleMiddleware.js
│   │   ├── rateLimitMiddleware.js
│   │   └── errorMiddleware.js
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   │   ├── jwtHelper.js
│   │   ├── responseHelper.js
│   │   ├── paginationHelper.js
│   │   └── certificateCronJob.js
│   └── database/
│       ├── migrations/
│       │   └── init_database.sql
│       └── seeds/
└── package.json
```

---

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 13

---

## Instalasi

**1. Clone repository dan install dependencies**

```bash
git clone <repository-url>
cd saas-certificate-backend
npm install
```

**2. Buat file environment**

```bash
cp .env.example .env
```

Edit `.env` dan isi semua nilai yang diperlukan (lihat bagian [Konfigurasi Environment](#konfigurasi-environment)).

**3. Setup database**

Buat database PostgreSQL, lalu jalankan migration:

```bash
psql -U postgres -f src/database/migrations/init_database.sql
```

**4. Seed super admin**

```bash
npm run seed
```

Perintah ini membuat akun super admin default:

- **Username:** `gem`
- **Password:** `admin123`

> ⚠️ Segera ganti password setelah login pertama.

---

## Konfigurasi Environment

Salin `.env.example` ke `.env` dan isi nilai berikut:

| Variable                 | Deskripsi            | Contoh                         |
| ------------------------ | -------------------- | ------------------------------ |
| `PORT`                   | Port server          | `5000`                         |
| `NODE_ENV`               | Environment          | `development` / `production`   |
| `DB_HOST`                | Host database        | `localhost`                    |
| `DB_PORT`                | Port database        | `5432`                         |
| `DB_NAME`                | Nama database        | `saas_certificate`             |
| `DB_USER`                | User database        | `postgres`                     |
| `DB_PASSWORD`            | Password database    | `yourpassword`                 |
| `JWT_ACCESS_SECRET`      | Secret access token  | _(string panjang acak)_        |
| `JWT_REFRESH_SECRET`     | Secret refresh token | _(string panjang acak)_        |
| `JWT_ACCESS_EXPIRES_IN`  | Durasi access token  | `15m`                          |
| `JWT_REFRESH_EXPIRES_IN` | Durasi refresh token | `7d`                           |
| `CORS_ORIGIN`            | Allowed CORS origin  | `*` / `https://yourdomain.com` |

**Generate JWT secret yang kuat:**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Menjalankan Server

```bash
# Development (dengan nodemon)
npm run dev

# Production
npm start
```

Server berjalan di `http://localhost:5000`

Health check: `GET http://localhost:5000/api/health`

---

## Roles & Akses

| Role         | Deskripsi           | Akses                                                      |
| ------------ | ------------------- | ---------------------------------------------------------- |
| `superAdmin` | Super administrator | Semua endpoint branch, dapat login ke semua fitur          |
| `admin`      | Admin head branch   | Kelola teacher, division, module, sertifikat di branch-nya |
| `teacher`    | Guru                | Reservasi & cetak sertifikat di branch yang ditugaskan     |

---

## API Endpoints

Base URL: `/api`

### Auth

| Method | Endpoint                | Role   | Deskripsi            |
| ------ | ----------------------- | ------ | -------------------- |
| POST   | `/auth/login`           | Public | Login                |
| GET    | `/auth/me`              | All    | Get profil sendiri   |
| PATCH  | `/auth/change-password` | All    | Ganti password       |
| PATCH  | `/auth/change-username` | All    | Ganti username       |
| POST   | `/auth/refresh`         | Public | Refresh access token |
| POST   | `/auth/logout`          | All    | Logout               |

### Branches

| Method | Endpoint                      | Role       | Deskripsi                   |
| ------ | ----------------------------- | ---------- | --------------------------- |
| GET    | `/branches`                   | superAdmin | List semua branch (tree)    |
| GET    | `/branches/heads`             | superAdmin | List head branch (dropdown) |
| GET    | `/branches/:id`               | superAdmin | Detail branch               |
| POST   | `/branches`                   | superAdmin | Buat branch baru            |
| PUT    | `/branches/:id`               | superAdmin | Update branch               |
| PATCH  | `/branches/:id/toggle-active` | superAdmin | Aktif/nonaktif branch       |
| PATCH  | `/branches/:id/toggle-head`   | superAdmin | Ubah tipe head/sub          |

> Saat membuat **head branch**, sistem otomatis membuat akun admin baru dan mengembalikan `temporaryPassword`.

### Divisions

| Method | Endpoint                                        | Role  | Deskripsi                             |
| ------ | ----------------------------------------------- | ----- | ------------------------------------- |
| GET    | `/divisions`                                    | admin | List division                         |
| POST   | `/divisions`                                    | admin | Buat division (beserta sub divisions) |
| PUT    | `/divisions/:id`                                | admin | Update division                       |
| PATCH  | `/divisions/:id/toggle-active`                  | admin | Aktif/nonaktif                        |
| DELETE | `/divisions/:id`                                | admin | Hapus division                        |
| POST   | `/divisions/:id/sub-divisions`                  | admin | Tambah sub division                   |
| PUT    | `/divisions/sub-divisions/:subId`               | admin | Update sub division                   |
| PATCH  | `/divisions/sub-divisions/:subId/toggle-active` | admin | Aktif/nonaktif sub division           |
| DELETE | `/divisions/sub-divisions/:subId`               | admin | Hapus sub division                    |

### Modules

| Method | Endpoint                     | Role  | Deskripsi      |
| ------ | ---------------------------- | ----- | -------------- |
| GET    | `/modules`                   | admin | List module    |
| POST   | `/modules`                   | admin | Buat module    |
| PUT    | `/modules/:id`               | admin | Update module  |
| PATCH  | `/modules/:id/toggle-active` | admin | Aktif/nonaktif |
| DELETE | `/modules/:id`               | admin | Hapus module   |

### Teachers

| Method | Endpoint                       | Role  | Deskripsi                        |
| ------ | ------------------------------ | ----- | -------------------------------- |
| GET    | `/teachers`                    | admin | List teacher                     |
| GET    | `/teachers/:id`                | admin | Detail teacher                   |
| POST   | `/teachers`                    | admin | Buat teacher (password otomatis) |
| PUT    | `/teachers/:id`                | admin | Update teacher                   |
| POST   | `/teachers/:id/reset-password` | admin | Reset password teacher           |
| PATCH  | `/teachers/:id/toggle-active`  | admin | Aktif/nonaktif                   |

### Certificates — Admin

| Method | Endpoint                     | Role  | Deskripsi                        |
| ------ | ---------------------------- | ----- | -------------------------------- |
| POST   | `/certificates/bulk-create`  | admin | Buat sertifikat massal           |
| GET    | `/certificates`              | admin | List sertifikat dengan filter    |
| GET    | `/certificates/stock`        | admin | Ringkasan stok per branch        |
| GET    | `/certificates/stock-alerts` | admin | Alert stok rendah                |
| POST   | `/certificates/migrate`      | admin | Migrasi sertifikat ke sub branch |
| GET    | `/certificates/statistics`   | admin | Statistik cetak                  |
| GET    | `/certificates/migrations`   | admin | Riwayat migrasi                  |

### Certificates — Teacher

| Method | Endpoint                        | Role    | Deskripsi                   |
| ------ | ------------------------------- | ------- | --------------------------- |
| GET    | `/certificates/available`       | teacher | Cek ketersediaan sertifikat |
| POST   | `/certificates/reserve`         | teacher | Reservasi sertifikat        |
| POST   | `/certificates/print`           | teacher | Cetak sertifikat            |
| POST   | `/certificates/:id/release`     | teacher | Batalkan reservasi          |
| GET    | `/certificates/my-reservations` | teacher | Reservasi aktif saya        |
| GET    | `/certificates/my-prints`       | teacher | Riwayat cetak saya          |

### Logs

| Method | Endpoint                    | Role          | Deskripsi           |
| ------ | --------------------------- | ------------- | ------------------- |
| GET    | `/certificates/logs`        | admin/teacher | Log aksi sertifikat |
| GET    | `/certificates/logs/export` | admin/teacher | Export log ke Excel |

### Students

| Method | Endpoint                      | Role  | Deskripsi                    |
| ------ | ----------------------------- | ----- | ---------------------------- |
| GET    | `/students/search?name=xxx`   | all   | Autocomplete pencarian siswa |
| GET    | `/students`                   | all   | List semua siswa             |
| GET    | `/students/:id`               | all   | Detail siswa                 |
| GET    | `/students/:id/history`       | all   | Riwayat sertifikat siswa     |
| GET    | `/students/statistics`        | all   | Statistik siswa              |
| PUT    | `/students/:id`               | admin | Update nama siswa            |
| PATCH  | `/students/:id/toggle-active` | admin | Aktif/nonaktif siswa         |

---

## Alur Kerja Sertifikat

```
superAdmin
  └── Buat Head Branch → Admin otomatis dibuat

Admin
  └── Buat Sertifikat (bulk-create) → Tersimpan di Head Branch
  └── Migrasi ke Sub Branch → Sertifikat pindah ke Sub Branch

Teacher
  └── Cek ketersediaan (available)
  └── Reservasi (reserve) → Status: reserved, berlaku 24 jam, maks. 5 aktif
  └── Cetak (print) → Input: nama siswa, module, tanggal PTC
              → Siswa otomatis dibuat/ditemukan
              → Status sertifikat: printed
              → Log tercatat

Cron Job (setiap jam)
  └── Auto-release reservasi yang expired → Status kembali: in_stock
```

### Status Sertifikat

| Status     | Deskripsi                          |
| ---------- | ---------------------------------- |
| `in_stock` | Tersedia di branch                 |
| `reserved` | Sedang direservasi oleh teacher    |
| `printed`  | Sudah dicetak                      |
| `migrated` | _(Legacy — tidak digunakan aktif)_ |

---

## Database Schema

### Tabel Utama

| Tabel                      | Deskripsi                               |
| -------------------------- | --------------------------------------- |
| `users`                    | Semua user (superAdmin, admin, teacher) |
| `branches`                 | Head branch & sub branch                |
| `divisions`                | Divisi pembelajaran                     |
| `sub_divisions`            | Sub divisi dengan rentang usia          |
| `modules`                  | Modul pembelajaran                      |
| `teacher_branches`         | Relasi many-to-many teacher ↔ branch    |
| `teacher_divisions`        | Relasi many-to-many teacher ↔ division  |
| `certificates`             | Inventaris sertifikat                   |
| `certificate_reservations` | Reservasi aktif (maks 24 jam)           |
| `certificate_prints`       | Record sertifikat yang sudah dicetak    |
| `certificate_migrations`   | Riwayat migrasi sertifikat antar branch |
| `certificate_logs`         | Log terpusat semua aksi sertifikat      |
| `students`                 | Data siswa                              |

Untuk skema lengkap, lihat `src/database/migrations/init_database.sql`.
