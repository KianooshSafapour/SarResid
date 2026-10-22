#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  SarResid — نصب گواهی SSL رایگان (Let's Encrypt) برای
#  sarresid.hyperzeytoon.com روی 195.248.241.14
#  اجرا با root:  bash setup-ssl.sh
#  (سرور python3 ندارد → از acme.sh خالص-شل استفاده می‌کنیم)
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
DOMAIN=sarresid.hyperzeytoon.com
WEBROOT=/var/www/letsencrypt
NGX=/etc/nginx
BUN=/root/.bun/bin/bun

[ "$(id -u)" = 0 ] || { echo "✗ باید با root اجرا شود"; exit 1; }

echo "── ۱/۶ پیش‌نیازها ──"
command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl socat; }
command -v socat >/dev/null || apt-get install -y -qq socat || true
mkdir -p "$WEBROOT/.well-known/acme-challenge"
echo "  ✓ webroot: $WEBROOT"

echo "── ۲/۶ نصب acme.sh (اگر نبود) ──"
if [ ! -d /root/.acme.sh ]; then
  curl -s https://get.acme.sh | sh -s email=admin@hyperzeytoon.com
fi
export ACME=/root/.acme.sh/acme.sh
echo "  ✓ acme.sh آماده"

echo "── ۳/۶ افزودن مسیر challenge به nginx (بدون قطع سرویس) ──"
# بلوک server فعلی (۴۴۳ با گواهی self-signed) را می‌یابیم و مسیر ACME را اضافه می‌کنیم
if ! grep -q "letsencrypt" $NGX/sites-enabled/* 2>/dev/null && ! grep -q "letsencrypt" $NGX/nginx.conf 2>/dev/null; then
  CONF=$(grep -l "443" $NGX/sites-enabled/* 2>/dev/null | head -1)
  [ -z "$CONF" ] && CONF=$NGX/nginx.conf
  # سرور-بلوک ۸۰ جدا برای challenge (اگر ۸۰ همان فایل ۳۰۱ می‌کند، مسیر را مستثنا کن)
  cat > $NGX/sites-available/00-acme <<'NGINX'
# ── ACME challenge برای تمدید گواهی (sarresid) ──
server {
    listen 80;
    server_name sarresid.hyperzeytoon.com;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://$host$request_uri; }
}
NGINX
  ln -sf $NGX/sites-available/00-acme $NGX/sites-enabled/00-acme
  nginx -t && systemctl reload nginx
fi
echo "  ✓ مسیر challenge فعال"

echo "── ۴/۶ صدور گواهی (Let's Encrypt — webroot) ──"
"$ACME" --issue --server letsencrypt -d "$DOMAIN" -w "$WEBROOT" \
  --keylength ec-256 2>/dev/null || \
"$ACME" --issue -d "$DOMAIN" -w "$WEBROOT" --keylength ec-256 || {
  echo "✗ صدور ناموفق — اتصال ۸۰ از بیرون را بررسی کنید:"; echo "   curl -I http://$DOMAIN/.well-known/acme-challenge/test"; exit 1; }
echo "  ✓ گواهی صادر شد"

echo "── ۵/۶ نصب گواهی + پیکربندی nginx برای دامنه ──"
mkdir -p /etc/nginx/ssl
"$ACME" --install-cert -d "$DOMAIN" --ecc \
  --key-file /etc/nginx/ssl/sarresid-domain.key \
  --fullchain-file /etc/nginx/ssl/sarresid-domain.crt \
  --reloadcmd "systemctl reload nginx"
# سرور-بلوک ۴۴۳ با server_name دامنه + گواهی جدید (روی همان upstream)
cat > $NGX/sites-available/sarresid-domain <<'NGINX'
# ── sarresid.hyperzeytoon.com — گواهی معتبر Let's Encrypt ──
server {
    listen 443 ssl;
    http2 on;
    server_name sarresid.hyperzeytoon.com;
    ssl_certificate     /etc/nginx/ssl/sarresid-domain.crt;
    ssl_certificate_key /etc/nginx/ssl/sarresid-domain.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;

    # gateway همانند before: XTransformPort → mini-services
    map $arg_XTransformPort $upstream_port { default 3000; }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 300s;
    }
    location ~ ^/(socket\.io|api/realtime) {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
NGINX
# map باید در http{} باشد — اگر connection_upgrade تعریف نشده، اضافه کن
grep -q 'connection_upgrade' $NGX/nginx.conf || sed -i '1i map $http_upgrade $connection_upgrade { default upgrade; "" close; }' $NGX/nginx.conf
ln -sf $NGX/sites-available/sarresid-domain $NGX/sites-enabled/sarresid-domain
nginx -t && systemctl reload nginx
echo "  ✓ nginx با گواهی معتبر ری‌لود شد"

echo "── ۶/۶ تمدید خودکار + بررسی نهایی ──"
"$ACME" --cron 2>/dev/null | tail -1 || true
echo "── بررسی از بیرون (از سرور خودش): ──"
curl -sI "https://$DOMAIN/api/auth/roster" | head -3
echo ""
echo "✅ SSL فعال شد: https://$DOMAIN (Let's Encrypt + تمدید خودکار هر ۶۰ روز)"
echo "   نکته: بلوک قدیمی ۴۴۳ (self-signed با default_server) می‌ماند؛ دسترسی با IP هنوز با گواهی self-signed است."
