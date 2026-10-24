#!/usr/bin/env bash
# apply-sync.sh — local only. Replace rolled-back local project with the R5 version
# pulled from the demo server (/tmp/dl/*), preserving sandbox-specific bits.
set -euo pipefail
SRC=/tmp/sarresid-latest
DST=/home/z/my-project
TS=$(date +%Y%m%d-%H%M)

echo "== 1/8 backup current (rolled-back) state =="
mkdir -p /home/z/backups
tar --exclude=node_modules --exclude=.next -czf "/home/z/backups/myproject.pre-sync.$TS.tar.gz" -C /home/z my-project
cp "$DST/db/custom.db" "/home/z/backups/custom.db.pre-sync.$TS" 2>/dev/null || true
echo "   backup: /home/z/backups/myproject.pre-sync.$TS.tar.gz"

echo "== 2/8 stop main dev server =="
ps aux | grep -E 'next dev|next-server' | grep -v grep | awk '{print $2}' | xargs -r kill || true
sleep 1.5
ps aux | grep -E 'next dev|next-server' | grep -v grep | awk '{print $2}' | xargs -r kill -9 || true
# bun run dev wrapper of the main app (cwd = my-project)
for p in $(ps aux | awk '/bun run dev/ && !/awk/ {print $2}'); do
  [ "$(readlink /proc/$p/cwd 2>/dev/null || true)" = "$DST" ] && kill "$p" 2>/dev/null || true
done
sleep 1
if ss -tlnp | grep -q ':3000 '; then echo "PORT 3000 STILL BUSY:"; ss -tlnp | grep ':3000 '; exit 1; fi
echo "   port 3000 free"

echo "== 3/8 extract server bundle =="
rm -rf "$SRC" && mkdir -p "$SRC"
tar xzf /tmp/dl/sarresid-code.tar.gz -C "$SRC"
echo "   top-level:"; ls -a "$SRC" | sed 's/^/     /'
tar tzf /tmp/dl/sarresid-code.tar.gz | grep -c node_modules || true

echo "== 4/8 rsync code (exact server match) =="
rsync -a --delete "$SRC/src/"                 "$DST/src/"
rsync -a --delete "$SRC/prisma/"              "$DST/prisma/"
rsync -a --delete "$SRC/public/"              "$DST/public/"
rsync -a --delete "$SRC/hz-ext/"              "$DST/hz-ext/"
rsync -a --delete "$SRC/mini-services/"       "$DST/mini-services/"
rsync -a --delete "$SRC/.f4h/"                "$DST/.f4h/"
rsync -a --delete --exclude='sshx.py' --exclude='sync-down.py' --exclude='apply-sync.sh' "$SRC/scripts/" "$DST/scripts/"
rsync -a "$SRC/research/" "$DST/research/"
rsync -a --delete --exclude='custom.db' "$SRC/db/" "$DST/db/"
for f in package.json bun.lock next.config.ts tsconfig.json tailwind.config.ts \
         components.json postcss.config.mjs eslint.config.mjs worklog.md \
         SPEC-AGENT.md SPEC-R3.md Caddyfile .gitignore next-env.d.ts \
         tsconfig.tsbuildinfo qa-cheque.png qa-handover.png qa-performance.png qa-thermal.png; do
  if [ -e "$SRC/$f" ]; then cp -a "$SRC/$f" "$DST/$f"; fi
done
echo "   .env kept local (sandbox path); NOT overwritten from server"

echo "== 5/8 swap in fresh DB snapshot =="
gunzip -c /tmp/dl/custom-snapshot.db.gz > "$DST/db/custom.db"
ls -la "$DST/db/"

echo "== 6/8 install deps + prisma client =="
cd "$DST"
bun install 2>&1 | tail -3
bun run db:generate 2>&1 | tail -3 || true

echo "== 7/8 bounce mini-services =="
for svc in realtime holoo-sim chat-service; do
  (cd "$DST/mini-services/$svc" && bun install 2>&1 | tail -1) || true
done
for port in 3003 3030 3031 3040; do
  pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
done
sleep 2
(cd "$DST/mini-services/realtime"     && nohup bun run dev >/dev/null 2>&1 &)
(cd "$DST/mini-services/holoo-sim"     && nohup bun run dev >/dev/null 2>&1 &)
(cd "$DST/mini-services/chat-service"  && nohup bun run dev >/dev/null 2>&1 &)
sleep 5
ss -tlnp | grep -E ':(3000|3003|3030|3031|3040) ' || true

echo "== 8/8 restart main dev server =="
cd "$DST"
[ -f dev.log ] && mv dev.log "dev.log.pre-sync.$TS"
rm -rf .next
nohup bun run dev >/dev/null 2>&1 &
code=""
for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/auth/roster || true)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "   /api/auth/roster -> $code"
curl -s -o /dev/null -w '   GET / -> %{http_code}\n' http://127.0.0.1:3000/ || true

echo "== version markers =="
echo "   views: $(ls "$DST/hz-ext/src/views/" | wc -l)"
echo "   COORD-R5 in worklog: $(grep -c 'COORD-R5' "$DST/worklog.md")"
echo "   hzext chunks: $(ls "$DST/public/_next/static/chunks/" | grep -c hzext)"
ls "$DST/public/_next/static/chunks/" | grep hzext || true
echo "APPLY DONE"
