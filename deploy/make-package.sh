#!/usr/bin/env bash
# ── ساخت بستهٔ استقرار نسخهٔ سوم (مهر+) — اجرا در سندباکس/لوکال ──
# خروجی: deploy/sarresid-r3.tar.gz (کد بدون دیتابیس و node_modules)
set -e
cd "$(dirname "$0")/.."
STAMP=$(date +%Y%m%d-%H%M)
OUT=deploy/sarresid-r3-$STAMP.tar.gz
tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=db \
    --exclude=upload --exclude=tool-results --exclude=agent-ctx --exclude=download \
    --exclude=skills --exclude=examples --exclude=tests --exclude=deploy \
    --exclude=dev.log --exclude=server.log --exclude=.zscripts \
    -czf "$OUT" .
echo "✓ $OUT ($(du -h "$OUT" | cut -f1))"
echo "  سپس این فایل را به سرور منتقل و deploy-r3.sh را اجرا کنید (راهنما: deploy/README-DEPLOY.md)"
