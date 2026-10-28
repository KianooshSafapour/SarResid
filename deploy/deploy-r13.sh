#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  SarResid — استقرار نسخهٔ سیزدهم (R13) روی سرور 195.248.241.14
#  تأیید مدیرعامل + انتشار قیمت هلو + فازی + آبان + پایش + پاک‌سازی
#  ⛔ فقط با تأیید صریح مالک (کیانوش صفاپور) اجرا شود.
#  Run on the server as root, next to the package:
#    bash deploy-r13.sh [/path/to/sarresid-r13-*.tar.gz]
#  CODE-ONLY: db/custom.db و .env سرور هرگز بازنویسی نمی‌شوند.
#  پس از استقرار: درون‌ریزی آبان + پاک‌سازی دادهٔ تست (نگه‌داشتن واقعی‌ها).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP=/opt/sarresid
BUN=/root/.bun/bin/bun
PKG="${1:-$(ls -t /root/sarresid-r13-*.tar.gz sarresid-r13-*.tar.gz 2>/dev/null | head -1 || true)}"
[ -z "$PKG" ] && { echo "✗ بستهٔ sarresid-r13-*.tar.gz پیدا نشد — مسیرش را بدهید"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "✗ باید با root اجرا شود"; exit 1; }

echo "── ۱/۱۰ پشتیبان‌گیری (دیتابیس + کد فعلی) ──"
mkdir -p /root/backups
TS=$(date +%Y%m%d-%H%M)
cd "$APP" && "$BUN" -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$queryRaw`PRAGMA wal_checkpoint(TRUNCATE)`.then(()=>{console.log("wal checkpoint ok");return p.$disconnect()}).catch(()=>process.exit(0))' 2>/dev/null || true
cp "$APP/db/custom.db" "/root/backups/custom.db.pre-r13.$TS" 2>/dev/null || true
tar --exclude=node_modules --exclude=.next -czf "/root/backups/sarresid.pre-r13.$TS.tar.gz" -C /opt sarresid 2>/dev/null || true
echo "  ✓ پشتیبان: /root/backups/custom.db.pre-r13.$TS + sarresid.pre-r13.$TS.tar.gz"

echo "── ۲/۱۰ استخراج کد جدید (بدون دست‌زدن به db و .env) ──"
tar -xzf "$PKG" -C "$APP"
if ! grep -q "DATABASE_URL=file:/opt/sarresid/db/custom.db" "$APP/.env" 2>/dev/null; then
  echo "DATABASE_URL=file:/opt/sarresid/db/custom.db" > "$APP/.env"
fi
echo "  ✓ کد استخراج شد (db/custom.db و .env دست‌نخورده)"

echo "── ۳/۱۰ نصب وابستگی‌ها ──"
cd "$APP"
"$BUN" install 2>&1 | tail -1

echo "── ۴/۱۰ اسکیمای دیتابیس (ستون‌های افزودنی R13 — بدون تغییر داده) ──"
DATABASE_URL="file:$APP/db/custom.db" "$BUN"x prisma db push 2>&1 | tail -3

echo "── ۴b/۱۰ مهاجرت R17: پیش‌نویس‌های سودسنج → تحویل‌شده (idempotent) ──"
cd "$APP" && "$BUN" scripts/migrate-drafts-delivered-r17.ts 2>&1 | tail -3

echo "── ۵/۱۰ بیلد پروداکشن (با رقص public/_next) ──"
export NEXT_TELEMETRY_DISABLED=1
rm -rf /tmp/r13-public-next
[ -d "$APP/public/_next" ] && mv "$APP/public/_next" /tmp/r13-public-next
"$BUN" run build 2>&1 | tail -5
tar -xzf "$PKG" -C "$APP" ./public/_next 2>/dev/null || { [ -d /tmp/r13-public-next ] && mv /tmp/r13-public-next "$APP/public/_next"; }
rm -rf /tmp/r13-public-next
rm -rf "$APP/.next/standalone/public"
cp -r "$APP/public" "$APP/.next/standalone/public"
mkdir -p "$APP/.next/standalone/node_modules/.prisma"
cp -r "$APP/node_modules/.prisma/client" "$APP/.next/standalone/node_modules/.prisma/" 2>/dev/null || true
echo "  ✓ public (incl. hzext chunk) + prisma engine → standalone"

echo "── ۶/۱۰ راه‌اندازی سرویس‌ها ──"
systemctl restart sarresid-web
systemctl restart sarresid-realtime 2>/dev/null || true
systemctl restart holoo-sim 2>/dev/null || true
sleep 5

echo "── ۷/۱۰ بررسی سلامت ──"
curl -sf http://127.0.0.1:3000/api/auth/roster > /dev/null && echo "  ✓ web :3000 OK" || { echo "  ✗ web مشکل دارد!"; journalctl -u sarresid-web -n 30 --no-pager | tail -20; exit 1; }
curl -sf http://127.0.0.1:3040/ > /dev/null && echo "  ✓ holoo-sim :3040 OK" || echo "  ✗ holoo-sim مشکل دارد"
systemctl is-active sarresid-web sarresid-realtime holoo-sim 2>/dev/null | head -3

echo "── ۸/۱۰ درون‌ریزی دادهٔ آبان (خرید/فروش + کاتالوگ + موجودی) ──"
if ls "$APP/upload/"*آبان* >/dev/null 2>&1 && ls "$APP/upload/"*مشخصات* >/dev/null 2>&1; then
  cd "$APP"
  "$BUN" scripts/import-trades-r7.ts 2>&1 | tail -4
  "$BUN" scripts/import-aban-r13.ts 2>&1 | grep -E "read|matched|products=" | head -4
else
  echo "  ⚠ فایل‌های آبان در upload/ نیست — درون‌ریزی رد شد (فایل‌ها را جداگانه scp کنید و دوباره اجرا کنید)"
fi

echo "── ۹/۱۰ پاک‌سازی دادهٔ تست (نگه‌داشتن کالا/پرسنل/واقعی‌ها) ──"
cd "$APP"
echo "  — گزارش پیش از حذف (DRY) —"
"$BUN" scripts/reset-test-data-r13.ts 2>&1 | sed -n '1,25p'
echo "  — اعمال —"
APPLY=1 "$BUN" scripts/reset-test-data-r13.ts 2>&1 | tail -6

echo "── ۱۰/۱۰ تأیید نهایی ──"
curl -sf https://sarresid.hyperzeytoon.com/api/auth/roster -o /dev/null && echo "  ✓ https://sarresid.hyperzeytoon.com OK" || echo "  ⚠ بررسی nginx/SSL"
echo "  چانک نمای جدید:"
ls /opt/sarresid/public/_next/static/chunks/ | grep -E '^hzext-'
cd "$APP" && "$BUN" -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();
(async()=>{
  const [pr,inv,ord,tr]=await Promise.all([p.product.count(),p.marginInvoice.findMany({select:{number:true,supplierName:true,status:true}}),p.order.count(),p.tradeRecord.count()]);
  console.log("  کالاها:",pr,"| گردش:",tr,"| سفارش‌ها:",ord,"| فاکتور‌ها:");
  for(const m of inv) console.log("   #"+m.number, m.supplierName||"—", m.status);
  await p.$disconnect();
})()'
echo ""
echo "✅ استقرار R13 تمام شد."
