# Holoo Tunnel (store → cloud)

The store's internet is behind **CGNAT** (WAN `100.92.131.195`), so the modem cannot
port-forward the in-store Holoo web service. Instead an **outbound SSH reverse tunnel**
carries it to the cloud server:

```
SarResid (cloud :3000) → http://127.0.0.1:8081/TncHoloo/api
        → (SSH reverse tunnel, user holoo-tunnel, key-only, no-shell)
        → store machine running tunnel.cmd → http://192.168.1.121:5000/TncHoloo/api  (real TncHoloo)
```

Facts discovered (2026-10-31):
- Real Holoo server = `192.168.1.121` (the only LAN host with the API on **port 5000** + SQL Server 1433).
  The old default `192.168.1.10:8080` was wrong; the official installer's `application.properties`
  also says `server.port=5000`.
- API contract verified live (Spring JSON, `/TncHoloo/api/Login` responds with the documented
  Persian error envelope). Real username/password/dbname still needed **from Holoo Apex**
  (defaults admin/admin/Holoo1 do NOT match) — enter them in SarResid → Settings → Holoo and set
  `baseUrl = http://127.0.0.1:8081/TncHoloo/api`, `useMock = false`.

Setup on the store machine (any always-on Windows PC; the Holoo PC itself is ideal):
1. Copy `deploy/holoo-tunnel/` (this folder) to `C:\holoo-tunnel\` on that machine.
2. (Admin CMD) `schtasks /Create /TN "HolooTunnel" /TR "C:\holoo-tunnel\tunnel.cmd" /SC ONSTART /RU SYSTEM /F`
   then `schtasks /Run /TN "HolooTunnel"`.
3. Verify on the server: `curl -m 8 -X POST http://127.0.0.1:8081/TncHoloo/api/Login -H 'content-type: application/json' -d '{"userinfo":{"username":"x","userpass":"eHg=","dbname":"Holoo1"}}'`
   — a Persian JSON error means the tunnel is up.

Security: user `holoo-tunnel` on the server is key-only, `nologin` shell, `restrict,port-forwarding`
authorized_keys prefix, TTY/X11 denied — it can do nothing but hold this tunnel.

Bonus API surface found by reverse-engineering `TNCHolooWebService-1.0.jar` (beyond the PDF):
`/android/product/prices|lastSellPrice|pic-info|pic-data/{id}|customCode|deliveryTime`,
`/android/customer/check`, `/android/settings…`, coupon/category/websocket modules — client helpers
are in `src/lib/holoo.ts` (experimental until tested with real credentials).
