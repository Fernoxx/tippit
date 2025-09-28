#!/bin/bash

echo "🏗️ Building Ecion App for Railway Deployment"

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