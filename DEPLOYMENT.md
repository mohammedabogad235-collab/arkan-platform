# Deployment Guide - Separated Frontend & Backend

This project has been restructured from a monolith to a separated architecture with independent frontend and backend deployments.

## Architecture Overview

- **Frontend**: React/Vite application hosted on Firebase Hosting
- **Backend**: Node/Express REST API hosted on Render (or similar platform)
- **Database**: PostgreSQL (Supabase)

## Project Structure

```
Web-Creation-Hub/
├── artifacts/
│   ├── website-builder/     # Frontend (React/Vite)
│   │   ├── .env.example     # Frontend environment variables
│   │   └── src/
│   │       └── main.tsx     # API base URL configuration
│   └── api-server/          # Backend (Node/Express)
│       ├── .env.example     # Backend environment variables
│       ├── src/
│       │   ├── app.ts       # Express app with CORS
│       │   └── index.ts     # Server entry point
│       └── dist/            # Build output
└── DEPLOYMENT.md            # This file
```

## Frontend Deployment (Firebase Hosting)

### Prerequisites
- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase project created

### Build Steps

1. **Set environment variables:**
   ```bash
   cd artifacts/website-builder
   cp .env.example .env
   ```
   
   Edit `.env` and set your backend API URL:
   ```
   VITE_API_URL=https://your-backend-api.com
   ```

   For a same-origin deployment where the website and API share one host, set `VITE_API_URL=/api` instead. This value is embedded in the frontend at build time.

2. **Build the frontend:**
   ```bash
   pnpm run build
   ```

3. **Deploy to Firebase:**
   ```bash
   firebase login
   firebase init hosting
   firebase deploy
   ```

### Firebase Configuration

The website builder outputs static files to `artifacts/website-builder/dist`. Configure the Firebase Hosting public directory to this `dist` directory and add SPA rewrites if you deploy the frontend separately. No Firebase hosting configuration file is currently present in the repository.

## Backend & Full-Stack Deployment (Render Web Service)

### Prerequisites
- Render account
- PostgreSQL database (Supabase recommended)

### Render Service Settings

When creating a **Web Service** on Render:

1. **Environment**: `Node`
2. **Build Command**:
   ```bash
   pnpm install --frozen-lockfile && pnpm run build
   ```
3. **Start Command**:
   ```bash
   node artifacts/api-server/dist/index.mjs
   ```
4. **Environment Variables**:
   ```env
   NODE_ENV=production
   PORT=10000
   DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
   SESSION_SECRET=<at-least-32-random-characters>
   PUBLIC_APP_URL=https://your-backend-domain.com
   FRONTEND_URL=https://your-frontend-domain.com
   ALLOWED_ORIGINS=https://your-frontend-domain.com,https://your-custom-domain.com
   ```

   `ALLOWED_ORIGINS` is a comma-separated list of exact frontend origins (scheme and hostname, without paths). Add every production frontend domain here. The backend also allows `PUBLIC_APP_URL` and `FRONTEND_URL`. In production the server refuses to start if `SESSION_SECRET` is missing or shorter than 32 characters; generate a unique random value and keep it only in the hosting provider's secret settings. Configure `NODE_VERSION=24` in Render.

   **Render's build command must not run `pnpm run db:push` or `drizzle-kit push --force`.** The API applies checked-in Drizzle migrations during startup. The repository has no Render service manifest, so verify and replace the command in the Render dashboard itself.

### How Full-Stack Single Deployment Works
- `pnpm run build` compiles both the React frontend (Vite + Tailwind CSS v4) into `artifacts/website-builder/dist` and the Express backend into `artifacts/api-server/dist`.
- `pnpm run start` launches the Express backend which serves all API endpoints on `/api/*` and static frontend assets + single-page app fallback for all other routes.
- `pnpm run start:standalone` is retained as a compatibility alias for the same secure API server. The legacy `server.js` entry point is disabled because it used a hard-coded administrator password.
- The root `pnpm run db:push` is a non-forced, development-only schema tool; it can still prompt for data-loss choices and must not be used as a production deployment step.

### Certificate serial-number constraint

The production startup migration checks for duplicate serial numbers before adding the unique index. It never truncates, edits, or deletes certificate rows. If duplicates exist, the migration stops with an explicit error and preserves all rows; do not bypass it with `--force`.

Before deploying this migration, take a database backup and run this read-only check against the intended staging/production database:

```sql
SELECT serial_number, COUNT(*) AS duplicate_count
FROM public.certificate_issues
GROUP BY serial_number
HAVING COUNT(*) > 1;

SELECT COUNT(*) AS null_serial_count
FROM public.certificate_issues
WHERE serial_number IS NULL;
```

If duplicates or null serials are found, stop deployment and resolve them with the certificate owner using a verified backup and an explicit mapping for old serials/QR verification. Never truncate the table or automatically rewrite serial numbers.

## Local Development

### Frontend
```bash
cd artifacts/website-builder
cp .env.example .env
# Edit .env to set VITE_API_URL=/api for same-origin development or the API origin for a separate backend.
pnpm run dev
```

### Backend
```bash
cd artifacts/api-server
cp .env.example .env
# Edit .env with your database URL
pnpm run build
pnpm run start
```

## Files Modified/Created

### Runtime paths
- API: `artifacts/api-server/src/app.ts` and `artifacts/api-server/src/index.ts`
- Website: `artifacts/website-builder/src` (Vite output: `artifacts/website-builder/dist`)
- Database schema and migrations: `lib/db/src/schema` and `lib/db/drizzle`
- API URL configuration: `VITE_API_URL` in the frontend build environment

## Important Notes

1. **Session Management**: The backend uses session-based authentication with PostgreSQL session store. Ensure your database is accessible from your hosting platform.

2. **CORS**: Set `ALLOWED_ORIGINS` to the exact frontend domains that need cookie-based API access. Do not use `*`.

3. **Environment Variables**: Never commit `.env` files or real credentials. Use the provided `.env.example` files as templates and configure secrets only in the hosting provider.

4. **Credential rotation**: If a real database, SMTP, session, Supabase, or Firebase credential was ever committed or shared, replace it at its provider immediately, update the deployment secret, and redeploy. Removing a credential from an example file does not invalidate the old credential.

5. **Database**: The backend expects a PostgreSQL database. Supabase is recommended for easy setup.

6. **Build Outputs**:
   - Frontend builds to `artifacts/website-builder/dist`
   - Backend builds to `artifacts/api-server/dist`

## Troubleshooting

### Frontend Build Errors
- Ensure all optional dependencies are installed: `pnpm install`
- Check that `VITE_API_URL` is set in `.env`

### Backend CORS Errors
- Verify `ALLOWED_ORIGINS` includes your frontend domain
- Check that credentials are enabled in CORS configuration

### Database Connection Issues
- Verify `DATABASE_URL` is correct and accessible
- Ensure PostgreSQL is accepting connections from your hosting platform

## Support

For issues related to:
- **Firebase**: https://firebase.google.com/support
- **Render**: https://render.com/docs
- **Supabase**: https://supabase.com/docs
