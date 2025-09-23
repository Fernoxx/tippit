#!/bin/bash

# Script to push changes directly to main branch
# Usage: ./scripts/push-to-main.sh "commit message"

set -e

# Check if commit message is provided
if [ -z "$1" ]; then
    echo "Error: Please provide a commit message"
    echo "Usage: ./scripts/push-to-main.sh \"commit message\""
    exit 1
fi

# Ensure we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "Error: You must be on the main branch to use this script"
    echo "Current branch: $CURRENT_BRANCH"
    echo "Run: git checkout main"
    exit 1
fi

# Add all changes
git add -A

# Commit with provided message
git commit -m "$1"

# Push directly to main
git push origin main

echo "✅ Successfully pushed to main branch!"
echo "🚀 Deployment will start automatically via GitHub Actions"