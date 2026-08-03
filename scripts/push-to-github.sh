#!/usr/bin/env bash
# Usage: REMOTE=https://github.com/USER/REPO.git ./scripts/push-to-github.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE="${REMOTE:-}"
if [ -z "$REMOTE" ]; then
  echo "Set REMOTE=https://github.com/Jokejoker-designer/ERPcompany-.git"
  exit 1
fi
if [ ! -d .git ]; then
  git init
  git add .
  git commit -m "feat: ERPcompany complete UI v1.2.0"
  git branch -M main
fi
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
echo "Ready. Review then: git push -u origin main"
