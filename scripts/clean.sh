#!/bin/bash
# Clean build artifacts and temporary files

set -e

echo "🧹 Cleaning build artifacts and temporary files..."

# Remove build output
if [ -d "dist" ]; then
  echo "  Removing dist/"
  rm -rf dist
fi

# Remove coverage files
if [ -d "coverage" ]; then
  echo "  Removing coverage/"
  rm -rf coverage
fi

# Remove test cache
if [ -d ".vitest" ]; then
  echo "  Removing .vitest/"
  rm -rf .vitest
fi

# Remove TypeScript build info
if [ -f "tsconfig.tsbuildinfo" ]; then
  echo "  Removing tsconfig.tsbuildinfo"
  rm tsconfig.tsbuildinfo
fi

echo "✅ Cleanup complete!"