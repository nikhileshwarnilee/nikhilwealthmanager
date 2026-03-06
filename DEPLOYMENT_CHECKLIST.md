# React + PHP + MySQL Deployment Checklist

**Project:** Hysab Kytab / Expenses Manager
**Stack:** React (Vite) + Core PHP API + MySQL

This document explains the **standard deployment workflow** for this project so the application works correctly both **locally and on production hosting**.

---

# 1. Environment Configuration

## Frontend Production Environment

File:

```
frontend/.env.production
```

Contents:

```
VITE_APP_BASE=/expenses-manager/
VITE_API_BASE_URL=/expenses-manager/backend/api
```

Explanation:

* `VITE_APP_BASE` → Base path where React app is hosted.
* `VITE_API_BASE_URL` → URL used by frontend to call backend API.

Production URL example:

```
https://contysi.com/expenses-manager/
```

---

# 2. Backend Environment

File:

```
expenses-manager/.env
```

Example production configuration:

```
APP_ENV=production
APP_URL=https://contysi.com/expenses-manager

APP_NAME="Hysab Kytab"
APP_FRONTEND_URL=https://contysi.com/expenses-manager
APP_JWT_SECRET=YOUR_SECRET_KEY

APP_CORS_ORIGINS=https://contysi.com

DB_HOST=localhost
DB_PORT=3306
DB_NAME=fkwxcbmy_expensesmanager
DB_USER=fkwxcbmy_expensesmanager
DB_PASS=YOUR_DATABASE_PASSWORD

ACCESS_TOKEN_TTL=900
REFRESH_TOKEN_TTL=315360000
PASSWORD_RESET_TTL=1800

MAIL_FROM_EMAIL=nikhil@contysi.com
MAIL_FROM_NAME="Hysab Kytab"
MAIL_TRANSPORT=auto
RESEND_API_KEY=
MAIL_LOG_FALLBACK=1
```

---

# 3. Build React Frontend

Navigate to the frontend folder.

```
cd frontend
```

Run build command:

```
npm run build
```

This generates the production build in:

```
frontend/dist
```

---

# 4. Upload Build Files to Server

Delete existing files in:

```
public_html/contysi.com/website/expenses-manager/
```

Upload **contents of dist folder** (not the folder itself).

Correct server structure:

```
expenses-manager/
    index.html
    assets/
    manifest.json

    backend/
        api/
        config/
        database.php

    .env
```

---

# 5. Test Backend API

Open in browser:

```
https://contysi.com/expenses-manager/backend/api/login.php
```

Expected response:

```
{
 "success": false,
 "message": "Method not allowed."
}
```

If this appears → backend is working.

---

# 6. Test Application

Open application:

```
https://contysi.com/expenses-manager/
```

Open browser developer tools.

```
F12 → Network
```

Verify:

```
index.js → 200
index.css → 200
API requests → 200
```

---

# 7. Common Problems and Fixes

## React Assets 404

Cause:

```
VITE_APP_BASE incorrect
```

Fix:

```
VITE_APP_BASE=/expenses-manager/
```

Rebuild frontend.

---

## API 404

Cause:

```
VITE_API_BASE_URL incorrect
```

Fix:

```
VITE_API_BASE_URL=/expenses-manager/backend/api
```

Rebuild frontend.

---

## CORS Error

Fix `.env`:

```
APP_CORS_ORIGINS=https://contysi.com
```

---

## Database Connection Error

Verify database credentials in `.env`:

```
DB_HOST
DB_NAME
DB_USER
DB_PASS
```

---

# 8. When to Rebuild React

Run build again when:

* React UI changes
* React logic changes
* API base URL changes
* Environment variables change

Command:

```
npm run build
```

Upload new build.

---

# 9. When Rebuild Is Not Required

Rebuild **not needed** when only backend changes:

* PHP API logic
* Database queries
* Validation rules
* Backend bug fixes

Just upload updated backend files.

---

# 10. Ideal Production Project Structure

Server directory layout:

```
expenses-manager/
    index.html
    assets/

    backend/
        api/
        config/
        database.php

    .env
```

Architecture:

```
React (Frontend)
        ↓
PHP API (Backend)
        ↓
MySQL Database
```

---

# 11. Standard Deployment Workflow

Follow these steps for every deployment.

1. Update code locally.
2. Verify `.env.production`.
3. Run:

```
npm run build
```

4. Upload `dist` contents to server.
5. Verify server `.env`.
6. Test backend API.
7. Test application UI.

Deployment complete.

---

# 12. Local Development URLs

Frontend:

```
http://localhost:5173
```

Backend API:

```
http://localhost/nikhilwealthmanager/backend/api
```

---

# 13. Production URLs

Frontend:

```
https://contysi.com/expenses-manager/
```

Backend API:

```
https://contysi.com/expenses-manager/backend/api
```

---

# End of Document
