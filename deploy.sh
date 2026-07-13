#!/bin/bash
# deploy.sh — Atualiza frontend e reinicia backend
# Execute como root: sudo bash deploy.sh

set -e

APP_DIR="/home/canaa/Governança/PowerBI/bdr-commission"

echo "[1/4] Build frontend..."
cd "$APP_DIR/frontend"
npm run build

echo "[2/4] Copiando frontend para /var/www/bdr..."
cp -r "$APP_DIR/frontend/dist/." /var/www/bdr/
chown -R www-data:www-data /var/www/bdr

echo "[3/4] Build backend..."
cd "$APP_DIR/backend"
npm test
npm run build

echo "[4/4] Reiniciando backend..."
systemctl restart bdr-backend

echo ""
echo "Deploy concluído."
