# منصة بناء المواقع - Website Builder Platform

## Overview

A full-stack Arabic-language platform where clients can order website creation services. Clients can register, submit orders, choose packages, and track progress. Admins have a complete control panel.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/website-builder) — RTL Arabic UI
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Session**: express-session + connect-pg-simple (PostgreSQL-backed, persistent across restarts)
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Features

- **Landing page** with hero, features, packages, and testimonials
- **User registration/login** (fullName, phone, email, username, password)
- **Order form** with site type, packages, custom budget, currency (EGP/SAR), payment methods
- **My Orders page** for customers to track order status
- **Testimonials page** 
- **Admin dashboard** with stats, user/order/package/payment/testimonial management

## Admin Credentials

- **Username**: admin
- **Password**: admin123

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## DB Schema

- **users** — fullName, phone, email, username, passwordHash, role (client/admin)
- **packages** — name, description, priceEgp, priceSar, features, isActive
- **payment_methods** — name, details, isActive
- **testimonials** — clientName, comment, rating, imageUrl, isActive
- **orders** — userId, siteName, siteType, details, packageId, customBudget, currency, paymentMethodId, status, depositPaid, finalPaid, totalAmount, notes

## Seeded Data

- Admin user: admin/admin123
- 3 packages: Basic (1500 EGP), Medium (3500 EGP), Advanced (7000 EGP)
- 4 payment methods: Vodafone Cash, InstaPay, Bank Transfer, STC Pay
- 5 testimonials

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
