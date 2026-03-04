# Expense Manager PWA (React + Tailwind + PHP + MySQL)

Production-grade, mobile-first personal finance manager with:

- Multi-account support
- Income, expense, transfer tracking
- Monthly budgets and alerts
- Rule-based smart insights
- Recharts analytics
- Infinite scroll transactions
- CSV export
- Dark mode + settings persistence
- JWT access + refresh auth
- PWA install + service worker + offline page

## STEP 1 — Folder Structure

```text
nikhilwealthmanager/
  api/
    auth/
    accounts/
    categories/
    transactions/
    budgets/
    insights/
    settings/
  backend/
    api/
      auth/
      accounts/
      categories/
      transactions/
      budgets/
      insights/
      settings/
    config/
    middleware/
    services/
    utils/
    sql/
  frontend/
    public/
    src/
      app/
      components/
      features/
      hooks/
      services/
      utils/
```

`/api/*` are public wrappers. Business logic is in `/backend/*`.

## STEP 2 — Database Schema

SQL file:

- [backend/sql/schema.sql](backend/sql/schema.sql)

Tables:

- `users`
- `accounts`
- `categories`
- `transactions`
- `budgets`
- `user_settings`
- `refresh_tokens`

Includes:

- indexes and foreign keys
- required transaction fields (`running_balance`, `reference_type`, `reference_id`)
- sample seed data

Demo user:

- Email: `demo@example.com`
- Password: `Password@123`

## STEP 3 — Backend Core Setup

Implemented:

- environment loader (`backend/config/env.php`)
- PDO database config (`backend/config/database.php`)
- request/response utils
- JWT utility
- pagination utility
- global error handler
- CORS middleware
- basic file-based rate limiting middleware
- auth middleware

Main bootstrap:

- [backend/bootstrap.php](backend/bootstrap.php)

## STEP 4 — Auth System

Endpoints:

- `POST /api/auth/register.php`
- `POST /api/auth/login.php`
- `POST /api/auth/refresh.php`
- `POST /api/auth/logout.php`
- `GET /api/auth/me.php`

Security:

- `password_hash` / `password_verify`
- short-lived access token (`ACCESS_TOKEN_TTL`)
- refresh token rotation (`refresh_tokens` table)
- auth middleware + rate limiting

## STEP 5 — Accounts & Categories

Accounts:

- `GET /api/accounts/list.php`
- `POST /api/accounts/create.php`
- `PUT /api/accounts/update.php`
- `DELETE /api/accounts/delete.php`
- `GET /api/accounts/summary.php`

Categories:

- `GET /api/categories/list.php`
- `POST /api/categories/create.php`
- `PUT /api/categories/update.php`
- `DELETE /api/categories/delete.php`
- `POST /api/categories/seed-defaults.php`

## STEP 6 — Transactions Engine

Endpoints:

- `GET /api/transactions/list.php`
- `POST /api/transactions/create.php`
- `PUT /api/transactions/update.php`
- `DELETE /api/transactions/delete.php`
- `GET /api/transactions/monthly-summary.php`
- `GET /api/transactions/category-summary.php`
- `GET /api/transactions/export-csv.php`

Capabilities:

- atomic balance updates with DB transactions
- reverse-and-reapply logic on update/delete
- search + advanced filters
- pagination for infinite scroll
- remembered filters
- CSV export

## STEP 7 — Budgets System

Endpoints:

- `POST /api/budgets/set.php`
- `GET /api/budgets/vs-actual.php`
- `GET /api/budgets/list.php`
- `GET /api/budgets/alerts.php`
- `DELETE /api/budgets/delete.php`

Includes:

- monthly budget per category
- budget utilization %
- over-budget warnings

## STEP 8 — Insights Engine

Endpoint:

- `GET /api/insights/monthly.php`

Rule-based examples included:

- food spend increase vs last month
- budget exceeded alerts
- income drop vs previous month
- top spending category insight

## STEP 9 — React App Shell

Frontend stack:

- React + Vite
- Tailwind CSS
- React Router
- Axios

Shell features:

- max-width 480px mobile-first layout
- sticky header
- bottom tab navigation
- floating add FAB
- touch-friendly cards and spacing
- pull-to-refresh (simulated)
- toast notifications
- error boundary

## STEP 10 — All Screens

Auth:

- Login
- Register

Main:

- Dashboard
- Transactions (with infinite scroll, search, filters, add/edit)
- Budgets
- Accounts
- Categories
- Settings (dark mode, currency, profile)

## STEP 11 — Charts & Analytics

Backend analytics endpoint:

- `GET /api/insights/analytics.php`

Returns:

- monthly income vs expense
- category pie data
- daily trend (last 30 days)
- budget utilization
- top spending categories

Frontend charts (Recharts):

- monthly bar chart
- category pie chart
- spending trend line chart

## STEP 12 — PWA Setup

Configured with `vite-plugin-pwa`:

- manifest (generated + static manifest)
- service worker (`dist/sw.js`)
- install prompt UI
- offline fallback page (`frontend/public/offline.html`)
- static asset caching

Key files:

- [frontend/vite.config.js](frontend/vite.config.js)
- [frontend/public/manifest.json](frontend/public/manifest.json)
- [frontend/public/offline.html](frontend/public/offline.html)

## STEP 13 — Final Integration

All layers wired:

- frontend axios base URL defaults to `http://localhost/nikhilwealthmanager/api`
- JWT + refresh flow integrated in axios interceptors
- backend wrappers under `/api/*` map to `/backend/api/*`
- user settings persisted (dark mode, currency, filters)

## STEP 14 — Testing Checklist

Run through:

1. Register a new user and confirm default categories/account are created.
2. Login and refresh page to verify session restore.
3. Create accounts and categories.
4. Add income, expense, transfer transactions.
5. Edit and delete transactions; verify balances remain correct.
6. Use transaction filters + search; reload page to verify filter memory.
7. Scroll transactions list to validate infinite load.
8. Export CSV and verify file contents.
9. Set monthly budgets and verify utilization and alerts.
10. Check dashboard insights + all 3 charts.
11. Toggle dark mode and currency in settings and reload.
12. Test refresh token flow by waiting for access token expiry.
13. Build frontend and verify PWA install prompt.
14. Open app offline and validate fallback page/service worker cache.

---

## Local Setup (XAMPP/WAMP)

1. Start Apache and MySQL.
2. Import DB schema from `backend/sql/schema.sql` in phpMyAdmin.
3. Create env files:

```bash
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

4. Install frontend dependencies:

```bash
cd frontend
npm install
```

5. Run frontend dev server:

```bash
npm run dev
```

6. Open app:

- Frontend: `http://localhost:5173`
- Backend API base: `http://localhost/nikhilwealthmanager/api`

### If you upgraded from the previous version

Run the safe migration (keeps existing data) before login:

```bash
C:\xampp\mysql\bin\mysql.exe -u root expense_manager < backend\sql\migrate_v2_safe.sql
```

Or import [backend/sql/migrate_v2_safe.sql](backend/sql/migrate_v2_safe.sql) in phpMyAdmin.

## Build PWA

```bash
cd frontend
npm run build
npm run preview
```

Generated artifacts:

- `frontend/dist/`
- service worker: `frontend/dist/sw.js`

## Shared Hosting Deployment

1. Upload project backend and API folders to hosting root (for example `public_html`):
   - `/api`
   - `/backend`
2. Copy `backend/.env.example` to `backend/.env` and set production DB + JWT values.
3. Import `backend/sql/schema.sql` into hosting MySQL.
4. Build frontend locally (`npm run build`).
5. Upload `frontend/dist/*` contents into hosting web root (`public_html`).
6. Ensure SPA fallback rewrite (Apache `.htaccess`) is configured so non-API routes serve `index.html`.
7. Keep `/api/*` excluded from SPA rewrites.
8. Use HTTPS in production and set `APP_CORS_ORIGINS` to your frontend domain.

## Environment Files

Backend example:

- [backend/.env.example](backend/.env.example)

Forgot password mail settings (backend `.env`):

```env
MAIL_FROM_EMAIL=no-reply@yourdomain.com
MAIL_FROM_NAME=Hysab Kytab
MAIL_TRANSPORT=auto
RESEND_API_KEY=
MAIL_LOG_FALLBACK=0
```

- For live email delivery without local SMTP, set `MAIL_TRANSPORT=resend` and add `RESEND_API_KEY`.
- Keep `MAIL_FROM_EMAIL` as a verified sender/domain in your mail provider.
- For local testing without email delivery, set `MAIL_LOG_FALLBACK=1` and check `backend/storage/error.log`.

Frontend example:

- [frontend/.env.example](frontend/.env.example)
