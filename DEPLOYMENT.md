# 🚀 استقرار سامانه هایپر زیتون روی سرور داخلی — راهنمای کامل
# Hyper Zeytoon Platform — Internal Server Deployment Guide

This guide deploys the platform on your own local server (LAN-only, no internet needed after setup).

---

## 0. What you are deploying

| Component | Tech | Port |
|---|---|---|
| Main platform (UI + API) | Next.js 16 (standalone build) + SQLite (Prisma) | 3000 |
| Real-time chat service | socket.io (Bun/Node) | 3003 |
| Database | SQLite file `db/custom.db` (simple backup = copy one file) | — |

> Why not PostgreSQL/Redis? Your scale (1 store, ~16 staff, thousands of records — not millions)
> runs perfectly on SQLite with zero administration. The Prisma data layer means you can switch
> to PostgreSQL later by changing **one line** in `prisma/schema.prisma` if you ever grow.

---

## 1. Requirements (on the internal server)

- Linux server (Ubuntu 22.04+ recommended) on the store LAN — a mini-PC is enough (4GB RAM)
- Docker **OR** Node.js 20+ / Bun 1.1+
- The project folder (copy it to the server, e.g. `/opt/hyper-zeytoon`)

---

## 2. Option A — Docker (recommended)

```bash
cd /opt/hyper-zeytoon
docker compose up -d --build
```

That's it. The compose file builds the Next.js app, starts the chat service,
mounts the database folder as a volume, and restarts containers automatically.

Access: `http://<server-ip>:3000` from any phone/desktop in the store LAN.

If you want the app on port 80 (no port number in the address), use the included
`deploy/Caddyfile` with the caddy service in docker-compose (uncomment it).

---

## 3. Option B — Bare metal (no Docker)

```bash
# 1) install bun (once)
curl -fsSL https://bun.sh/install | bash

# 2) install deps + create database
cd /opt/hyper-zeytoon
bun install
bun run db:push          # creates db/custom.db
bun run prisma/seed.ts   # optional: demo data + staff accounts (PIN 1234)

# 3) build once
bun run build

# 4) run (production)
bun run start            # serves on :3000

# 5) chat service (second terminal or systemd)
cd mini-services/chat-service && bun install && bun run dev
```

### systemd (auto-start on boot) — `/etc/systemd/system/hz-web.service`
```ini
[Unit]
Description=Hyper Zeytoon Web
After=network.target

[Service]
WorkingDirectory=/opt/hyper-zeytoon
ExecStart=/root/.bun/bin/bun run start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/hz-chat.service`
```ini
[Unit]
Description=Hyper Zeytoon Chat
After=network.target

[Service]
WorkingDirectory=/opt/hyper-zeytoon/mini-services/chat-service
ExecStart=/root/.bun/bin/bun run dev
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now hz-web hz-chat
```

---

## 4. Environment variables (`.env` in project root)

```env
DATABASE_URL="file:/opt/hyper-zeytoon/db/custom.db"
# optional: only if you change the reverse-proxy layout
NEXT_PUBLIC_SOCKET_URL="/?XTransformPort=3003"
```

---

## 5. Backups (important!)

The whole database is one file. Add a nightly cron on the server:

```bash
# /etc/cron.d/hz-backup
0 2 * * * root cp /opt/hyper-zeytoon/db/custom.db /opt/backups/custom-$(date +\%F).db && find /opt/backups -name "*.db" -mtime +30 -delete
```

---

## 6. Go-live checklist for the team

1. **Change PINs** — each staff logs in (پیش‌فرض ۱۲۳۴) → مدیریت سامانه → کاربران → ویرایش → رمز جدید
2. **Import real inventory** — export xls from Holoo → کالاها → «ورود از هلو (اکسل)»
3. **Enter real providers** — تأمین‌کنندگان → تأمین‌کننده جدید (companies they distribute → brand names)
4. **Set reorder levels** — edit each product «حد سفارش مجدد» so the red/yellow/green signals are meaningful
5. **First real order** — run the paper flow in parallel for 3 days (توصیه: اجرای موازی) and compare totals with Holoo before cutting over
6. **Holidays** — مدیریت سامانه → تعطیلات رسمی → «همگام‌سازی از اینترنت» (needs temporary internet) or add manually

---

## 7. Holoo integration points (current & future)

- **Buy invoice (today):** حسابداری و هلو → open a VERIFIED order → «خروجی اکسل برای هلو» gives you
  barcode / name / qty / unit price / discount / VAT / total exactly in the order Holoo's Buy tab expects →
  import/type once, no second calculation.
- **Receipt print (today):** فروش و مشتریان → صف صندوق → «ارسال به صندوق هلو و چاپ رسید» marks the
  pre-invoice READY and shows the print view. The cashier keys it into Holoo as today.
- **Direct API (future):** when/if your Holoo version exposes an API or watched import folder,
  implement it in `src/app/api/preorders/[id]/route.ts` (action `cashier_edit`) and
  `src/app/api/orders/[id]/route.ts` (action `account`) — those two functions are the only
  integration surface; everything else stays unchanged.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| Page loads but data empty | Check `.env` DATABASE_URL matches the real db path, run `bun run db:push` |
| Chat not live (messages need refresh) | Chat service not running: `systemctl status hz-chat`; check port 3003 |
| Internet image search fails | The z-ai CLI needs internet; offline you can still paste image URL or upload from device |
| Forgot admin PIN | `sqlite3 db/custom.db "UPDATE User SET pin='1234' WHERE name='کیانوش صفاپور';"` |
| Slow on old phones | Use Chrome/Firefox recent versions; the app is designed for 2019+ Android devices |
