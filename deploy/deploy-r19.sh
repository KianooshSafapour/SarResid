#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  SarResid R18 — استقرار فروشگاه آنلاین hyperzeytoon.com
#  فاز A: به‌روزرسانی ساررسید (مدل‌های فروشگاه + /api/shop/* + /shop-ops)
#  فاز B: ویترین :3100 (/opt/hyperzeytoon-store) + systemd storefront-web
#  فاز C: nginx + گواهی Let's Encrypt برای hyperzeytoon.com (+www)
#  ⛔ فقط با تأیید صریح مالک. STAGING=1 → staging.hyperzeytoon.com (بدون www).
#  Run on the server as root:
#    CONFIRM=YES bash deploy-r19.sh [/path/to/sarresid-r19-*.tar.gz]
#  CODE-ONLY: db/custom.db و .env ساررسید هرگز بازنویسی نمی‌شوند.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
APP=/opt/sarresid
STORE=/opt/hyperzeytoon-store
BUN=/root/.bun/bin/bun
DOMAIN="${DOMAIN:-hyperzeytoon.com}"
EXTRA_DOMAIN="www.$DOMAIN"
if [ "${STAGING:-0}" = "1" ]; then DOMAIN=staging.hyperzeytoon.com; EXTRA_DOMAIN=""; fi
PKG="${1:-$(ls -t /root/sarresid-r19-*.tar.gz sarresid-r19-*.tar.gz 2>/dev/null | head -1 || true)}"
[ -z "$PKG" ] && { echo "✗ بستهٔ sarresid-r19-*.tar.gz پیدا نشد"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "✗ باید با root اجرا شود"; exit 1; }
[ "${CONFIRM:-}" = "YES" ] || { echo "⛔ CONFIRM=YES بدهید تا استقرار شروع شود (پشتیبان گرفته می‌شود اما سرویس ری‌استارت می‌خورد)"; exit 1; }

echo "═══ فاز A: ساررسید R18 (مدل‌های فروشگاه — افزودنی، بدون تغییر داده) ═══"
TS=$(date +%Y%m%d-%H%M)
mkdir -p /root/backups
cd "$APP"
"$BUN" -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$queryRaw`PRAGMA wal_checkpoint(TRUNCATE)`.then(()=>p.$disconnect()).catch(()=>process.exit(0))' 2>/dev/null || true
cp "$APP/db/custom.db" "/root/backups/custom.db.pre-r19.$TS"
echo "  ✓ پشتیبان DB: /root/backups/custom.db.pre-r19.$TS"

tar -xzf "$PKG" -C "$APP" ./src ./prisma ./package.json ./bun.lock ./tsconfig.json ./next.config.ts ./mini-services ./scripts 2>/dev/null
grep -q "DATABASE_URL=file:/opt/sarresid/db/custom.db" "$APP/.env" 2>/dev/null || echo "DATABASE_URL=file:/opt/sarresid/db/custom.db" > "$APP/.env"
cd "$APP" && "$BUN" install 2>&1 | tail -1

echo "── اسکیمای افزودنی فروشگاه (ShopCustomer/ShopOrder/…) ──"
DATABASE_URL="file:$APP/db/custom.db" "$BUN"x prisma db push 2>&1 | tail -3

echo "── تنظیمات پیش‌فرض فروشگاه (devOtp=نوشده فقط اگر غایب؛ روی سرور خاموش) ──"
cd "$APP" && SHOP_DEV_OTP=false "$BUN" scripts/seed-shop-settings.ts

echo "── بیلد پروداکشن (با رقص public/_next) ──"
export NEXT_TELEMETRY_DISABLED=1
rm -rf /tmp/r19-public-next
[ -d "$APP/public/_next" ] && mv "$APP/public/_next" /tmp/r19-public-next
cd "$APP" && "$BUN" run build 2>&1 | tail -3
tar -xzf "$PKG" -C "$APP" ./public/_next 2>/dev/null || { [ -d /tmp/r19-public-next ] && mv /tmp/r19-public-next "$APP/public/_next"; }
rm -rf /tmp/r19-public-next
rm -rf "$APP/.next/standalone/public"
cp -r "$APP/public" "$APP/.next/standalone/public"
mkdir -p "$APP/.next/standalone/node_modules/.prisma"
cp -r "$APP/node_modules/.prisma/client" "$APP/.next/standalone/node_modules/.prisma/" 2>/dev/null || true

systemctl restart sarresid-web
sleep 5
curl -sf http://127.0.0.1:3000/api/auth/roster > /dev/null && echo "  ✓ ساررسید :3000 OK" || { journalctl -u sarresid-web -n 30 --no-pager | tail -20; exit 1; }
read_svc_token() ( cd "$APP" 2>/dev/null && "$BUN" -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.setting.findUnique({where:{key:"shop:apiToken"}}).then(r=>{if(r)console.log(r.value);return p.$disconnect()}).catch(()=>process.exit(0))' 2>/dev/null | head -1 )
SVC_TOKEN_OR_EMPTY="$(read_svc_token)"
: "${SVC_TOKEN_OR_EMPTY:=}"
curl -sf http://127.0.0.1:3000/api/shop/config -H "x-shop-service: $SVC_TOKEN_OR_EMPTY" > /dev/null && echo "  ✓ /api/shop/config OK" || { echo "  ✗ shop API مشکل دارد!"; exit 1; }

echo "═══ فاز B: ویترین روی :3100 ═══"
mkdir -p "$STORE"
cd "$STORE"
rm -rf src public package.json next.config.ts tsconfig.json bun.lock .next
tar -xzf "$PKG" -C "$STORE" ./storefront
mv storefront/* . && rmdir storefront
"$BUN" install 2>&1 | tail -1

# توکن سرویس ویترین↔API — یکتا؛ در هر دو سمت ذخیره می‌شود
SVC_TOKEN=$("$BUN" -e 'const c=require("crypto");console.log(c.randomBytes(24).toString("hex"))')
cd "$APP" && "$BUN" -e "
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  await p.setting.upsert({where:{key:'shop:apiToken'},create:{key:'shop:apiToken',value:process.argv[1]},update:{value:process.argv[1]}});
  await p.\$disconnect();
})()" "$SVC_TOKEN"
cat > "$STORE/.env" <<EOF
SHOP_API_BASE=http://127.0.0.1:3000
SHOP_SERVICE_TOKEN=$SVC_TOKEN
EOF

echo "── بیلد ویترین ──"
cd "$STORE" && export NEXT_TELEMETRY_DISABLED=1 && "$BUN"x next build 2>&1 | tail -3
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/public
cp .env .next/standalone/.env

cat > /etc/systemd/system/storefront-web.service <<EOF
[Unit]
Description=Hyper Zeytoon storefront (Next.js standalone :3100)
After=network.target sarresid-web.service

[Service]
Type=simple
WorkingDirectory=/opt/hyperzeytoon-store/.next/standalone
Environment=NODE_ENV=production
Environment=PORT=3100
Environment=HOSTNAME=0.0.0.0
EnvironmentFile=/opt/hyperzeytoon-store/.env
ExecStart=/root/.bun/bin/bun server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now storefront-web
systemctl restart storefront-web
sleep 4
curl -sf http://127.0.0.1:3100/ > /dev/null && echo "  ✓ ویترین :3100 OK" || { journalctl -u storefront-web -n 30 --no-pager | tail -20; exit 1; }
curl -sf http://127.0.0.1:3100/api/shop/config -H "x-shop-service: $SVC_TOKEN" > /dev/null && echo "  ✓ پروکسی ویترین→ساررسید OK" || { echo "  ✗ پروکسی مشکل دارد (توکن سرویس را بررسی کنید)"; exit 1; }

echo "═══ فاز C: nginx + گواهی $DOMAIN ═══"
mkdir -p /var/www/letsencrypt
# ACME برای دامنهٔ ریشه (الگوی 00-acme)
cat > /etc/nginx/sites-available/hyperzeytoon-store <<EOF
# ── hyperzeytoon.com — فروشگاه آنلاین (ACME + 80→443 + vhost) ──
server {
    listen 80;
    server_name $DOMAIN ${EXTRA_DOMAIN:+$EXTRA_DOMAIN };
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
ln -sf /etc/nginx/sites-available/hyperzeytoon-store /etc/nginx/sites-enabled/hyperzeytoon-store
nginx -t && systemctl reload nginx

# گواهی — acme.sh (خودکار تمدید؛ سرور certbot ندارد)
ACME="/root/.acme.sh/acme.sh"
CERT_SRC="/root/.acme.sh/${DOMAIN}_ecc"
if [ ! -d "$CERT_SRC" ]; then
  DOMARGS="-d $DOMAIN"
  [ -n "$EXTRA_DOMAIN" ] && DOMARGS="$DOMARGS -d $EXTRA_DOMAIN"
  "$ACME" --issue $DOMARGS -w /var/www/letsencrypt --keylength ec-256 2>&1 | tail -3
fi
[ -d "$CERT_SRC" ] || { echo "✗ گواهی صادر نشد — DNS دامنه را چک کنید"; exit 1; }
"$ACME" --install-cert -d "$DOMAIN" --ecc   --fullchain-file /etc/nginx/ssl/hyperzeytoon-store.crt   --key-file /etc/nginx/ssl/hyperzeytoon-store.key   --reloadcmd "systemctl reload nginx" 2>&1 | tail -1

cat > /etc/nginx/sites-available/hyperzeytoon-store <<EOF
# ── $DOMAIN — فروشگاه آنلاین هایپر زیتون → :3100 ──
server {
    listen 80;
    server_name $DOMAIN ${EXTRA_DOMAIN:+$EXTRA_DOMAIN };
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    http2 on;
    server_name $DOMAIN ${EXTRA_DOMAIN:+$EXTRA_DOMAIN };

    ssl_certificate     /etc/nginx/ssl/hyperzeytoon-store.crt;
    ssl_certificate_key /etc/nginx/ssl/hyperzeytoon-store.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    client_max_body_size 10m;

    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/javascript image/svg+xml;
    gzip_min_length 1024;

    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    location /_next/static/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 120s;
    }
}
EOF
nginx -t && systemctl reload nginx
echo "  ✓ nginx vhost $DOMAIN فعال شد"

echo "── تأیید نهایی ───"
sleep 2
curl -sf "https://$DOMAIN/" -o /dev/null && echo "  ✓ https://$DOMAIN OK" || echo "  ⚠ https://$DOMAIN باز نشد (certbot/nginx را بررسی کنید)"
curl -sf "https://$DOMAIN/api/shop/config" | head -c 120 && echo ""
echo ""
echo "── وضعیت اتصال هلو (بدون راز) ──"
cd "$APP" && "$BUN" -e "
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const rows=await p.setting.findMany({where:{key:{in:['holoo:enabled','holoo:useMock','holoo:username','holoo:baseUrl','holoo:mockUrl']}}});
  const m=Object.fromEntries(rows.map(r=>[r.key,r.value]));
  console.log('  holoo:enabled =', m['holoo:enabled']??'(نشانده نشده)', '| useMock =', m['holoo:useMock']??'true');
  if((m['holoo:enabled']??'false')!=='true') console.log('  ⚠ اتصال هلو خاموش است — فاکتور سفارش‌های آنلاین صف می‌شود تا از تنظیمات هلو فعال شود');
  await p.\$disconnect();
})()"
echo ""
echo "✅ استقرار R18 تمام شد."
echo "   فروشگاه: https://$DOMAIN  |  پنل سفارش کارکنان: https://sarresid.hyperzeytoon.com/shop-ops"
echo "   بستهٔ بعدی کنترل‌ها: docs/ECOMMERCE-DEPLOY.md (بخش پس از استقرار)"
