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
│   │   ├── firebase.json    # Firebase hosting configuration
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

The `firebase.json` file is pre-configured with:
- Public directory: `dist/public`
- SPA rewrites for client-side routing
- Cache headers for static assets

## Backend Deployment (Render)

### Prerequisites
- Render account
- PostgreSQL database (Supabase recommended)

### Build Steps

1. **Set environment variables in Render:**
   Copy from `artifacts/api-server/.env.example`:
   ```
   DATABASE_URL=postgresql://...
   SESSION_SECRET=your-secret-key
   PORT=8080
   ALLOWED_ORIGINS=https://your-firebase-app.web.app,https://your-firebase-app.firebaseapp.com
   NODE_ENV=production
   ```

2. **Build the backend:**
   ```bash
   cd artifacts/api-server
   pnpm run build
   ```

3. **Deploy to Render:**
   - Connect your GitHub repository
   - Set build command: `cd artifacts/api-server && pnpm run build`
   - Set start command: `cd artifacts/api-server && pnpm run start`
   - Add environment variables

### CORS Configuration

The backend is configured to accept requests from specific origins via the `ALLOWED_ORIGINS` environment variable. For production, include your Firebase hosting URLs:
```
ALLOWED_ORIGINS=https://your-app.web.app,https://your-app.firebaseapp.com
```

## Local Development

### Frontend
```bash
cd artifacts/website-builder
cp .env.example .env
# Edit .env to set VITE_API_URL=http://localhost:8080
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

### Modified Files:
1. `artifacts/api-server/src/app.ts` - Removed frontend serving, added CORS configuration
2. `artifacts/api-server/package.json` - Added @types/connect-pg-simple
3. `artifacts/website-builder/src/main.tsx` - Added API base URL configuration
4. `artifacts/website-builder/vite.config.ts` - Removed proxy configuration
5. `artifacts/website-builder/package.json` - Added optional dependencies for Windows

### Created Files:
1. `artifacts/website-builder/firebase.json` - Firebase hosting configuration
2. `artifacts/website-builder/.env.example` - Frontend environment variables template
3. `artifacts/api-server/.env.example` - Backend environment variables template
4. `DEPLOYMENT.md` - This deployment guide

## Important Notes

1. **Session Management**: The backend uses session-based authentication with PostgreSQL session store. Ensure your database is accessible from your hosting platform.

2. **CORS**: Always update `ALLOWED_ORIGINS` when deploying to new domains to prevent CORS errors.

3. **Environment Variables**: Never commit `.env` files. Use the provided `.env.example` files as templates.

4. **Database**: The backend expects a PostgreSQL database. Supabase is recommended for easy setup.

5. **Build Outputs**: 
   - Frontend builds to `artifacts/website-builder/dist/public`
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
