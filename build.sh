#!/bin/bash

echo "🏗️ Building Ecion Backend for Railway Deployment"

# Set Node.js version for Railway
export NODE_VERSION=18.20.5

# Remove backup directories to speed up deployment (they're huge - 1.6GB+)
echo "🧹 Cleaning up backup directories..."
rm -rf backend-only-backup-* 2>/dev/null
rm -rf backend-only/backend-only-backup-* 2>/dev/null
rm -rf **/backend-only-backup-* 2>/dev/null

# Only install backend dependencies  
echo "📦 Installing backend dependencies..."
cd backend-only

# Use npm ci for faster, reproducible builds (uses lockfile)
npm ci --production --frozen-lockfile || npm install --production --frozen-lockfile

echo "✅ Backend build complete - ready for Railway deployment"