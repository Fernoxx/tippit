# Admin Password Setup Guide

## Overview
The admin panel at `/admin` requires a password to access. Set the `ADMIN_PASSWORD` environment variable in both Vercel (frontend) and Railway (backend).

## Environment Variables

### Frontend (Vercel)
- **No environment variable needed** - Password is validated server-side only
- Password is never exposed in client-side code

### Backend (Railway)
- **Variable Name:** `ADMIN_PASSWORD`
- **Value:** Your admin password (e.g., `ecion2024` or a secure password)
- **Required:** Yes
- **Security:** This password is only stored server-side and never exposed to clients

## Setup Instructions

### Vercel Setup
- **No environment variables needed** - Password validation happens server-side only
- The frontend sends the entered password to the backend for validation

### Railway Setup
1. Go to your Railway project dashboard
2. Select your backend service
3. Go to **Variables** tab
4. Click **New Variable**
5. Add:
   - **Key:** `ADMIN_PASSWORD`
   - **Value:** Same password as Vercel (must match)
6. Click **Add**
7. Railway will automatically redeploy

## Security Notes
- Use a strong, unique password
- Never commit passwords to git
- Change default password (`ecion2024`) in production
- The password is checked on both frontend (login) and backend (API calls)

## Default Password
- **Development:** `ecion2024` (if env var not set)
- **Production:** Set via environment variables (recommended)

## Testing
1. Visit `https://ecion.vercel.app/admin`
2. Enter the password you set
3. You should be able to access the admin dashboard
