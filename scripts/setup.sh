#!/usr/bin/env bash
set -euo pipefail

echo "=== VPS Snapshot Manager Setup ==="

# Check for pnpm
if ! command -v pnpm &>/dev/null; then
  echo "Installing pnpm..."
  corepack enable && corepack prepare pnpm@latest --activate
fi

# Check for rclone
if ! command -v rclone &>/dev/null; then
  echo "Installing rclone..."
  curl https://rclone.org/install.sh | sudo bash
fi

# Generate APP_SECRET if .env doesn't exist
if [ ! -f .env ]; then
  echo "Generating .env..."
  SECRET=$(openssl rand -hex 32)
  cp .env.example .env
  sed -i.bak "s/your-64-hex-character-secret-here/${SECRET}/" .env && rm -f .env.bak
  echo ".env created with a random APP_SECRET"
fi

# Create required directories
mkdir -p data tmp

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Run DB migrations
echo "Running database migrations..."
pnpm db:generate
pnpm db:migrate

echo ""
echo "=== Setup complete! ==="
echo "Run 'pnpm dev' to start in development mode"
echo "Run 'docker compose up -d' to start in production mode"
