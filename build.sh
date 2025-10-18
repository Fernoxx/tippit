#!/bin/bash

echo "🏗️ Building Ecion Backend for Railway Deployment"

# Set Node.js version for Railway
export NODE_VERSION=18.20.5

# Only install backend dependencies  
echo "📦 Installing backend dependencies..."
cd backend-only

# Use npm install instead of npm ci for faster builds
npm install --production --frozen-lockfile

echo "✅ Backend build complete - ready for Railway deployment"