#!/bin/bash

echo "🏗️ Building Ecion App for Railway Deployment"

# Set Node.js version for Railway
export NODE_VERSION=19.9.0

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm ci

# Build frontend
echo "🔨 Building Next.js frontend..."
npm run build

# Install backend dependencies  
echo "📦 Installing backend dependencies..."
cd backend-only
npm ci

echo "✅ Build complete - ready for Railway deployment"