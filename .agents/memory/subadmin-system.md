---
name: Sub-admin system
description: How the sub-admin (مشرف فرعي) feature works — DB, API, and frontend
---

## DB columns added to `users` table
- `permissions TEXT` — nullable JSON array e.g. `["orders","users","finances"]`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE` — blocks login when false

## Role values
- `admin` — full access, sees all tabs including "مشرفون فرعيون"
- `subadmin` — limited access; NAV filtered to only permitted tabs
- `client` — regular user

## API routes (`/api/subadmins`)
- GET `/api/subadmins` — list all subadmins (admin only)
- POST `/api/subadmins` — create new subadmin (admin only)
- PATCH `/api/subadmins/:id` — update permissions/name/phone/email/password
- PATCH `/api/subadmins/:id/toggle` — toggle isActive
- DELETE `/api/subadmins/:id` — delete

## Login behavior
- Inactive users (`is_active = false`) get 403 "تم تعطيل هذا الحساب"
- Subadmins log in via regular `/login` page and land on admin panel

## Frontend
- `auth.tsx`: ProtectedRoute allows `subadmin` role into admin panel
- `admin.tsx`: NAV computed dynamically — main admin sees all tabs + "مشرفون فرعيون"; subadmin sees only tabs in their `permissions[]`
- `PERMISSIONS_LIST` in admin.tsx defines the 9 available permission keys

**Why:** User requested sub-admin management with per-permission control and activate/deactivate capability.
