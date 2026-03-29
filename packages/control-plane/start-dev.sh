#!/usr/bin/env bash
# Run the control-plane from a WSL-native directory so native modules
# (better-sqlite3) compile against Linux instead of Windows.
set -e

WIN_SRC="/mnt/c/Users/mohak/Desktop/openclaw_for_everyone/packages/control-plane"
WSL_DIR="$HOME/.openclaw-control-plane"

echo "[start-dev] Syncing dist → $WSL_DIR"
mkdir -p "$WSL_DIR"
cp -r "$WIN_SRC/dist"           "$WSL_DIR/"
cp    "$WIN_SRC/package.json"   "$WSL_DIR/"

# Install (or update) native deps inside the WSL-native directory
if [ ! -d "$WSL_DIR/node_modules" ]; then
  echo "[start-dev] Installing dependencies (first run)..."
  npm install --prefix "$WSL_DIR" 2>&1 | tail -3
else
  echo "[start-dev] Dependencies already installed"
fi

# ---- data dirs ----
DATA_DIR="$WSL_DIR/.dev-data/control-plane"
TENANTS_DIR="$WSL_DIR/.dev-data/tenants"
mkdir -p "$DATA_DIR" "$TENANTS_DIR"

# ---- generate or reuse a dev JWT secret ----
SECRET_FILE="$DATA_DIR/.jwt-secret"
if [ ! -f "$SECRET_FILE" ]; then
  node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))" > "$SECRET_FILE"
  echo "[start-dev] Generated JWT secret → $SECRET_FILE"
fi
JWT_SECRET=$(cat "$SECRET_FILE")

echo ""
echo "=============================================="
echo "  OpenClaw Control Plane  (dev)"
echo "  API → http://localhost:3000"
echo "  Data → $DATA_DIR"
echo "=============================================="
echo ""

CONTROL_PLANE_JWT_SECRET="$JWT_SECRET" \
CONTROL_PLANE_PORT=3000 \
CONTROL_PLANE_DATA_DIR="$DATA_DIR" \
OPENCLAW_TENANTS_DIR="$TENANTS_DIR" \
OPENCLAW_BIN=node \
OPENCLAW_DIST_INDEX="/mnt/c/Users/mohak/Desktop/openclaw_for_everyone/dist/index.js" \
  node "$WSL_DIR/dist/index.js"
