#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "[STARTUP] Iniciando servidor..."
exec /usr/bin/node dist/server.js
