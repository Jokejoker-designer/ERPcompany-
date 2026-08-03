#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

echo "══════════════════════════════════════════"
echo "  AnKhang POS · ERP thu nhỏ  v1.1.0"
echo "  Bản final — chạy local"
echo "══════════════════════════════════════════"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Chưa cài Node.js. Cần Node 18+ (https://nodejs.org)"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ Node quá cũ ($NODE_MAJOR). Cần >= 18"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "→ npm install (lần đầu)…"
  npm install
fi

echo "→ Dev server: http://localhost:5173"
echo "  (Ctrl+C để dừng)"
echo ""
npm run dev
