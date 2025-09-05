#!/bin/bash
# Pre-commit hook script for quality checks

set -e

echo "🔍 Running pre-commit checks..."

# Run formatting
echo "  Formatting code..."
pnpm run format

# Run linting
echo "  Linting code..."
pnpm run lint

# Run type checking
echo "  Type checking..."
pnpm exec tsc --noEmit

# Stage formatted files
echo "  Staging formatted files..."
git add .

echo "✅ Pre-commit checks passed!"
