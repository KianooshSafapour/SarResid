@echo off
rem ═══ تونل هلو: سیستم فروشگاه ← سرور ابری ═══
rem اتصال خروجی SSH (CGNAT اجازهٔ پورت-فوروارد نمی‌دهد) — پورت 8081 روی سرور را به وب‌سرویس هلو می‌رساند.
rem نصب به‌عنوان وظیفهٔ زمان‌بندی‌شدهٔ ویندوز (روی سیستم روشنِ فروشگاه، ترجیحاً همان رایانهٔ هلو):
rem   schtasks /Create /TN "HolooTunnel" /TR "C:\holoo-tunnel\tunnel.cmd" /SC ONSTART /RU SYSTEM /F
rem حذف: schtasks /Delete /TN "HolooTunnel" /F
setlocal
set KEY=%~dp0holoo_tunnel_key
:loop
ssh -i "%KEY%" -N ^
  -o ExitOnForwardFailure=yes ^
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 ^
  -o StrictHostKeyChecking=accept-new ^
  -o ConnectTimeout=15 ^
  -R 127.0.0.1:8081:192.168.1.121:5000 ^
  holoo-tunnel@195.248.241.14
rem اتصال قطع شد — ۵ ثانیه بعد تلاش دوباره
timeout /t 5 /nobreak >nul
goto loop
