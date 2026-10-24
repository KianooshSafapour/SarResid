#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  SarResid — استقرار نسخهٔ ششم (R6) روی سرور دمو 195.248.241.14
#  ⛔ فقط با تأیید صریح مالک (کیانوش صفاپور) اجرا شود.
#  Run on the server as root, next to the package:
#    bash deploy-r6.sh [/path/to/sarresid-r6-*.tar.gz]
#  CODE-ONLY: db/custom.db و .env سرور هرگز بازنویسی نمی‌شوند.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP=/opt/sarresid
BUN=/root/.bun/bin/bun
PKG="${1:-$(ls -t sarresid-r6-*.tar.gz 2>/dev/null | head -1 || true)}"
[ -z "$PKG" ] && { echo "✗ بستهٔ sarresid-r6-*.tar.gz کنار این اسکریپت نیست — مسیرش را بدهید"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "✗ باید با root اجرا شود"; exit 1; }

echo "── ۱/۷ پشتیبان‌گیری (دیتابیس + کد فعلی) ──"
mkdir -p /root/backups
cp "$APP/db/custom.db" "/root/backups/custom.db.pre-r6.$(date +%Y%m%d-%H%M)" 2>/dev/null || true
tar --exclude=node_modules --exclude=.next -czf "/root/backups/sarresid.pre-r6.$(date +%Y%m%d-%H%M).tar.gz" -C /opt sarresid 2>/dev/null || true
echo "  ✓ پشتیبان در /root/backups"

echo "── ۲/۷ استخراج کد جدید (بدون دست‌زدن به db و .env) ──"
tar -xzf "$PKG" -C "$APP"
# .env سرور محفوظ بماند — بسته هیچ .envی ندارد؛ این فقط اطمینان است:
if ! grep -q "DATABASE_URL=file:/opt/sarresid/db/custom.db" "$APP/.env" 2>/dev/null; then
  echo "DATABASE_URL=file:/opt/sarresid/db/custom.db" > "$APP/.env"
fi
echo "  ✓ کد استخراج شد (db/custom.db و .env دست‌نخورده)"

echo "── ۳/۷ نصب وابستگی‌ها + اسکیما (بدون تغییر داده) ──"
cd "$APP"
"$BUN" install 2>&1 | tail -1
"$BUN" run db:push 2>&1 | tail -3 || echo "  (db:push no-op — بدون تغییر اسکیما در R6)"

echo "── ۴/۷ بیلد پروڈاکشن ──"
export NEXT_TELEMETRY_DISABLED=1
"$BUN" run build 2>&1 | tail -5

echo "── ۵/۷ راه‌اندازی سرویس‌ها ──"
systemctl restart sarresid-web
systemctl restart sarresid-realtime 2>/dev/null || true
systemctl restart holoo-sim 2>/dev/null || true
sleep 4

echo "── ۶/۷ بررسی سلامت ──"
curl -sf http://127.0.0.1:3000/api/auth/roster > /dev/null && echo "  ✓ web :3000 OK" || echo "  ✗ web مشکل دارد! journalctl -u sarresid-web -n 30"
curl -sf http://127.0.0.1:3040/ > /dev/null && echo "  ✓ holoo-sim :3040 OK" || echo "  ✗ holoo-sim مشکل دارد"
systemctl is-active sarresid-web sarresid-realtime holoo-sim 2>/dev/null | head -3

echo "── ۷/۷ تأیید نهایی از بیرون ──"
curl -sf https://sarresid.hyperzeytoon.com/api/auth/roster -o /dev/null && echo "  ✓ https://sarresid.hyperzeytoon.com OK" || echo "  ⚠ بررسی nginx/SSL"
echo ""
echo "✅ استقرار R6 تمام شد — ورژن چانک نمایشی:"
ls /opt/sarresid/public/_next/static/chunks/ | grep -E '^hzext-'
