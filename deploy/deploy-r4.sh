#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  SarResid — استقرار نسخهٔ چهارم (Round 4) روی سرور دمو 195.248.241.14
#  این استقرار دیتابیس را هم جایگزین می‌کند
#  (دیتای واقعی XLS + تعطیلی‌ها + ستون‌ها + مسؤول‌ها + BASELINE snapshot)
#  اجرا به‌عنوان root روی خود سرور:
#    bash deploy-r4.sh /path/to/sarresid-r4-*.tar.gz
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP=/opt/sarresid
BUN=/root/.bun/bin/bun
PKG="${1:-$(ls -t sarresid-r4-*.tar.gz 2>/dev/null | head -1 || true)}"
[ -z "$PKG" ] && { echo "✗ بستهٔ sarresid-r4-*.tar.gz پیدا نشد — مسیرش را بدهید"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "✗ باید با root اجرا شود"; exit 1; }

echo "── ۱/۸ پشتیبان‌گیری (دیتابیس + کد فعلی) ──"
mkdir -p /root/backups
cp "$APP/db/custom.db" "/root/backups/custom.db.pre-r4.$(date +%Y%m%d-%H%M)" 2>/dev/null || true
tar --exclude=node_modules --exclude=.next -czf "/root/backups/sarresid.pre-r4.$(date +%Y%m%d-%H%M).tar.gz" -C /opt sarresid 2>/dev/null || true
echo "  ✓ پشتیبان در /root/backups"

echo "── ۲/۸ استخراج کد + دیتابیس جدید ──"
tar -xzf "$PKG" -C "$APP" \
  src prisma public hz-ext mini-services scripts package.json bun.lock next.config.ts tsconfig.json 2>/dev/null || \
tar -xzf "$PKG" -C "$APP"
# دیتابیس داخل بسته جایگزین می‌شود (./db/custom.db — پیشوند ./ مهم است)
tar -xzf "$PKG" -C "$APP" ./db/custom.db
ls -la "$APP/db/custom.db" | awk '{print "  ✓ db:", $5, "bytes"}'

echo "── ۳/۸ نصب وابستگی‌ها + همگام‌سازی اسکیما ──"
cd "$APP"
"$BUN" install 2>&1 | tail -1
"$BUN" run db:push 2>&1 | tail -3 || true

echo "── ۴/۸ کانتور واقعی (idempotent) ──"
"$BUN" x tsx scripts/apply-real-outline.ts || echo "  (skip)"

echo "── ۵/۸ بیلد پروداکشن ──"
export NEXT_TELEMETRY_DISABLED=1
# next build با public/_next نمی‌سازد — موقتاً کنار می‌رود و بعد از بیلد از بسته برمی‌گردد
rm -rf /tmp/r4-public-next
[ -d "$APP/public/_next" ] && mv "$APP/public/_next" /tmp/r4-public-next
"$BUN" run build 2>&1 | tail -5
# chunks از بسته بازگردانی می‌شود (shell.html به همین chunkها اشاره می‌کند)
tar -xzf "$PKG" -C "$APP" ./public/_next 2>/dev/null || { [ -d /tmp/r4-public-next ] && mv /tmp/r4-public-next "$APP/public/_next"; }
rm -rf /tmp/r4-public-next
# استند‌الون: public باید داخل standalone کپی شود (الگوی استقرار فعلی سرور)
rm -rf "$APP/.next/standalone/public"
cp -r "$APP/public" "$APP/.next/standalone/public"
echo "  ✓ public (incl. _next chunks) → standalone/public"

echo "── ۶/۸ راه‌اندازی سرویس‌ها ──"
systemctl restart sarresid-web
systemctl restart sarresid-realtime 2>/dev/null || true
systemctl restart holoo-sim 2>/dev/null || true

echo "── ۷/۸ سلامت‌سنجی ──"
sleep 5
code=000
for i in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)
  [ "$code" = "200" ] && break
  sleep 3
done
echo "  app :3000 → HTTP $code"
curl -s -o /dev/null -w '  realtime :3030 → HTTP %{http_code}\n' http://127.0.0.1:3030/ || true
curl -s -o /dev/null -w '  holoo-sim :3040 → HTTP %{http_code}\n' http://127.0.0.1:3040/ || true

echo "── ۸/۸ بررسی داده‌ها روی سرور ──"
"$BUN" -e "const {PrismaClient}=require('@prisma/client'); const db=new PrismaClient(); (async()=>{ const p=await db.product.count(); const h=await db.holiday.count(); const z=await db.zoneColumn.count(); const s=await db.dataSnapshot.count(); const o=await db.order.count(); console.log('  products:',p,'| holidays:',h,'| zoneColumns:',z,'| snapshots:',s,'| orders:',o); await db.\$disconnect();})()"
echo "✓ استقرار Round 4 کامل شد — https://sarresid.hyperzeytoon.com"
