#!/usr/bin/env bash
set -e

BASEDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"; pwd)"
cd "$BASEDIR"

echo ""
echo "======================================"
echo " Allusion Venue Booking System Setup "
echo "======================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed. Please install Node.js 18+ first."
  exit 1
fi

echo "[1/5] Installing backend dependencies..."
cd backend && npm install && cd ..

echo "[2/5] Installing frontend dependencies..."
cd frontend && npm install && cd ..

echo "[3/5] Building frontend..."
cd frontend && npm run build && cd ..

echo "[4/5] Creating logs directory..."
mkdir -p logs

echo "[5/5] Checking environment file..."
if [ ! -f backend/.env ]; then
  cp .env.example backend/.env
  echo ""
  echo "  Created backend/.env from template."
  echo "  IMPORTANT: Edit backend/.env with your actual credentials before starting!"
  echo ""
else
  echo "  backend/.env exists - skipping creation."
fi

echo ""
echo "======================================"
echo " Setup Complete! "
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Edit backend/.env with your credentials"
echo "  2. Read slack-setup-guide.md to configure Slack"
echo "  3. Read stripe-setup-guide.md to configure Stripe webhook"
echo "  4. Start the server:"
echo "     npx pm2 start ecosystem.config.js"
echo "     npx pm2 save"
echo "     npx pm2 startup"
echo ""
echo "  Or for development:"
echo "     cd backend && npm run dev   (in one terminal)"
echo "     cd frontend && npm run dev  (in another terminal)"
echo ""
