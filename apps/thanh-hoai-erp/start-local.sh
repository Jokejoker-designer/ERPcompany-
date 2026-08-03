#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "=== Thanh Hoài ERP Công trình ==="
if [ ! -d node_modules ]; then
  echo "→ npm install…"
  npm install
fi
echo "→ Dev server http://127.0.0.1:8080  (ERP /app · POS /pos)"
echo "  Login demo: giamdoc / xem màn hình đăng nhập"
npm run dev -- --host 0.0.0.0 --port 8080
