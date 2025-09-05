#!/bin/bash
# Development environment setup script

set -e

echo "🚀 Setting up development environment for vite-plugin-cdp-mcp"

# Check Node.js version
echo "📋 Checking Node.js version..."
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
  echo "❌ Node.js 18+ is required. Current version: $(node -v)"
  exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
else
  echo "✅ Dependencies already installed"
fi

# Run type checking
echo "🔍 Running TypeScript type checking..."
npx tsc --noEmit

# Run linting
echo "🧹 Running linting checks..."
npm run check

echo "✅ Development environment setup complete!"
echo ""
echo "Available commands:"
echo "  npm run lint      - Run linter"
echo "  npm run format    - Format code"
echo "  npm run check     - Run all checks"
echo "  npm test          - Run tests"
echo "  npm run test:watch - Run tests in watch mode"