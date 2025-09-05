#!/bin/bash
# Pre-commit hook script for quality checks

set -e

echo "🔍 Running pre-commit checks..."

# Run formatting
echo "  Formatting code..."
npm run format

# Run linting
echo "  Linting code..."
npm run lint

# Run type checking
echo "  Type checking..."
npx tsc --noEmit

# Stage formatted files
echo "  Staging formatted files..."
git add .

echo "✅ Pre-commit checks passed!"