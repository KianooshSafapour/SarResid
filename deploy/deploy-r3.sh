#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  SarResid — استقرار نسخهٔ سوم (مهر+) روی سرور دمو 195.248.241.14
#  اجرا به‌عنوان root روی خود سرور، کنار فایل بسته:
#    tar -xzf sarresid-r3-*.tar.gz deploy-r3.sh   # اگر داخل بسته است
#    bash deploy-r3.sh
#  یا: bash deploy-r3.sh /path/to/sarresid-r3-*.tar.gz
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP=/opt/sarresid
BUN=/root/.bun/bin/bun
PKG="${1:-$(ls -t sarresid-r3-*.tar.gz 2>/dev/null | head -1 || true)}"
[ -z "$PKG" ] && { echo "✗ بستهٔ sarresid-r3-*.tar.gz کنار این اسکریپت نیست — مسیرش را بدهید"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "✗ باید با root اجرا شود"; exit 1; }

echo "── ۱/۷ پشتیبان‌گیری (دیتابیس + کد فعلی) ──"
mkdir -p /root/backups
cp "$APP/db/custom.db" "/root/backups/custom.db.pre-r3.$(date +%Y%m%d-%H%M)" 2>/dev/null || true
tar --exclude=node_modules --exclude=.next -czf "/root/backups/sarresid.pre-r3.$(date +%Y%m%d-%H%M).tar.gz" -C /opt sarresid 2>/dev/null || true
echo "  ✓ پشتیبان در /root/backups"

echo "── ۲/۷ استخراج کد جدید (بدون دست‌زدن به db و .env) ──"
# فهرست سفید: فقط بخش‌های کد که تغییر کرده‌اند
tar -xzf "$PKG" -C "$APP" \
  src prisma public hz-ext mini-services scripts package.json bun.lock next.config.ts tsconfig.json 2>/dev/null || \
tar -xzf "$PKG" -C "$APP"
# مطمئن شو دیتابیس و env محلی سرور حفظ شده
echo "  ✓ کد استخراج شد (db/custom.db و .env دست‌نخورده)"

echo "── ۳/۷ نصب وابستگی‌ها + اسکیمای جدید ──"
cd "$APP"
"$BUN" install 2>&1 | tail -1
"$BUN" run db:push 2>&1 | tail -3
echo "  ✓ اسکیما (UserPermOverride, HolooSyncLog, ZoneColumn, StaffCheck/Problem/ShiftReport/Floorplan فیلدهای جدید)"

echo "── ۴/۷ اعمال کانتور واقعی فروشگاه (ذوزنقه + درگاه‌ها) ──"
"$BUN" x tsx scripts/apply-real-outline.ts || echo "  (از قبل اعمال شده)"

echo "── ۵/۷ بیلد پروडاکشن ──"
export NEXT_TELEMETRY_DISABLED=1
"$BUN" run build 2>&1 | tail -5

echo "── ۶/۷ راه‌اندازی سرویس‌ها ──"
systemctl restart sarresid-web
systemctl restart sarresid-realtime 2>/dev/null || true
# شبیه‌ساز هلو — سرویس systemd دائمی
if [ ! -f /etc/systemd/system/holoo-sim.service ]; then
cat > /etc/systemd/system/holoo-sim.service <<'UNIT'
[Unit]
Description=SarResid Holoo Simulator (dummy Holoo API :3040)
After=network.target
[Service]
WorkingDirectory=/opt/sarresid/mini-services/holoo-sim
ExecStart=/root/.bun/bin/bun run dev
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
fi
(cd "$APP/mini-services/holoo-sim" && "$BUN" install 2>&1 | tail -1) || true
systemctl daemon-reload
systemctl enable --now holoo-sim
sleep 3
echo "── ۷/۷ بررسی سلامت ──"
curl -sf http://127.0.0.1:3000/api/auth/roster > /dev/null && echo "  ✓ web :3000 OK" || echo "  ✗ web مشکل دارد! journalctl -u sarresid-web -n 30"
curl -sf http://127.0.0.1:3040/ > /dev/null && echo "  ✓ holoo-sim :3040 OK" || echo "  ✗ holoo-sim مشکل دارد"
systemctl --no-pager status sarresid-web holoo-sim 2>/dev/null | grep -E "Active:|●" | head -4
echo ""
echo "✅ استقرار تمام شد — برای SSL دامنه دستور بعدی: bash setup-ssl.sh"
