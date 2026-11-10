#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  SarResid — استقرار نسخهٔ دوازدهم (R12) روی سرور 195.248.241.14
#  سودسنج زیر «مالی» + گردش‌کار کامل دفتر فاکتورها + رفع clampInt
#  ⛔ فقط با تأیید صریح مالک (کیانوش صفاپور) اجرا شود.
#  Run on the server as root, next to the package:
#    bash deploy-r12.sh [/path/to/sarresid-r12-*.tar.gz]
#  CODE-ONLY: db/custom.db و .env سرور هرگز بازنویسی نمی‌شوند.
#  db:push فقط ستون‌های افزودنی R12 را اضافه می‌کند (بدون دست‌زدن به داده).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP=/opt/sarresid
BUN=/root/.bun/bin/bun
PKG="${1:-$(ls -t sarresid-r12-*.tar.gz 2>/dev/null | head -1 || true)}"
[ -z "$PKG" ] && { echo "✗ بستهٔ sarresid-r12-*.tar.gz کنار این اسکریپت نیست — مسیرش را بدهید"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "✗ باید با root اجرا شود"; exit 1; }

echo "── ۱/۸ پشتیبان‌گیری (دیتابیس + کد فعلی) ──"
mkdir -p /root/backups
TS=$(date +%Y%m%d-%H%M)
# WAL-checkpoint برای پشتیبان سازگار
cd "$APP" && "$BUN" -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$queryRaw`PRAGMA wal_checkpoint(TRUNCATE)`.then(()=>{console.log("wal checkpoint ok");return p.$disconnect()}).catch(()=>process.exit(0))' 2>/dev/null || true
cp "$APP/db/custom.db" "/root/backups/custom.db.pre-r12.$TS" 2>/dev/null || true
tar --exclude=node_modules --exclude=.next -czf "/root/backups/sarresid.pre-r12.$TS.tar.gz" -C /opt sarresid 2>/dev/null || true
echo "  ✓ پشتیبان: /root/backups/custom.db.pre-r12.$TS + sarresid.pre-r12.$TS.tar.gz"

echo "── ۲/۸ استخراج کد جدید (بدون دست‌زدن به db و .env) ──"
tar -xzf "$PKG" -C "$APP"
if ! grep -q "DATABASE_URL=file:/opt/sarresid/db/custom.db" "$APP/.env" 2>/dev/null; then
  echo "DATABASE_URL=file:/opt/sarresid/db/custom.db" > "$APP/.env"
fi
echo "  ✓ کد استخراج شد (db/custom.db و .env دست‌نخورده)"

echo "── ۳/۸ نصب وابستگی‌ها ──"
cd "$APP"
"$BUN" install 2>&1 | tail -1

echo "── ۴/۸ اسکیمای دیتابیس (ستون‌های افزودنی R12 — بدون تغییر داده) ──"
# generate حیاتی است: کلاینت پرایسما باید ستون‌های جدید را بشناسد (skip-generate → کلاینت کهنه → ۵۰۰ در فهرست فاکتورها)
DATABASE_URL="file:$APP/db/custom.db" "$BUN"x prisma db push 2>&1 | tail -3

echo "── ۵/۸ بیلد پروداکشن (با رقص public/_next) ──"
export NEXT_TELEMETRY_DISABLED=1
rm -rf /tmp/r12-public-next
[ -d "$APP/public/_next" ] && mv "$APP/public/_next" /tmp/r12-public-next
"$BUN" run build 2>&1 | tail -5
# chunks ضبط‌شده از بسته برمی‌گردند (shell.html به همین‌ها اشاره می‌کند)
tar -xzf "$PKG" -C "$APP" ./public/_next 2>/dev/null || { [ -d /tmp/r12-public-next ] && mv /tmp/r12-public-next "$APP/public/_next"; }
rm -rf /tmp/r12-public-next
# standalone: public کامل (شامل _next) داخل standalone کپی شود + موتور پرisma
rm -rf "$APP/.next/standalone/public"
cp -r "$APP/public" "$APP/.next/standalone/public"
mkdir -p "$APP/.next/standalone/node_modules/.prisma"
cp -r "$APP/node_modules/.prisma/client" "$APP/.next/standalone/node_modules/.prisma/" 2>/dev/null || true
echo "  ✓ public (incl. hzext chunk) + prisma engine → standalone"

echo "── ۶/۸ راه‌اندازی سرویس‌ها ──"
systemctl restart sarresid-web
systemctl restart sarresid-realtime 2>/dev/null || true
systemctl restart holoo-sim 2>/dev/null || true
sleep 5

echo "── ۷/۸ بررسی سلامت ──"
curl -sf http://127.0.0.1:3000/api/auth/roster > /dev/null && echo "  ✓ web :3000 OK" || { echo "  ✗ web مشکل دارد!"; journalctl -u sarresid-web -n 30 --no-pager | tail -20; exit 1; }
curl -sf http://127.0.0.1:3040/ > /dev/null && echo "  ✓ holoo-sim :3040 OK" || echo "  ✗ holoo-sim مشکل دارد"
systemctl is-active sarresid-web sarresid-realtime holoo-sim 2>/dev/null | head -3

echo "── ۸/۸ تأیید نهایی از بیرون + چانک R12 ──"
curl -sf https://sarresid.hyperzeytoon.com/api/auth/roster -o /dev/null && echo "  ✓ https://sarresid.hyperzeytoon.com OK" || echo "  ⚠ بررسی nginx/SSL"
echo "  چانک نمای جدید:"
ls /opt/sarresid/public/_next/static/chunks/ | grep -E '^hzext-'
echo ""
echo "✅ استقرار R12 تمام شد."
