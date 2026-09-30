# Clarifi

Private service-operations workspace for estimating, client management, scheduling and job operations.

## Connected backend

- Supabase project: Clarifi / `jgbciyogyratfplofizv`
- Region: Canada Central
- PostgreSQL + Auth + RLS + Storage
- Real clients and jobs loaded from Supabase
- Client / technician / office workspace foundation
- Quote approval workflow foundation

## Local run

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set the Supabase publishable key.

## Vercel

Project configuration:

- Framework: Next.js
- Root Directory: `.`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `.next`
- Node.js: 22.x

Required Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The Clarifi Supabase database schema has already been applied to the live project.

## MVP flow

Login → Clients / Techs / Office → New Client / Request → Lead → standardized estimate → quote approval → Job → Schedule / Dispatch → Invoice.
