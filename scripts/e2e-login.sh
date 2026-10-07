#!/bin/bash
# ابزار تست مرورگر — ورود خودکار + ناوبری (برای E2E خودکار)
# usage: ./scripts/e2e-login.sh "<view-hash>" [userName]
set -e
VIEW="${1:-}"
USER="${2:-کیانوش صفاپور}"
UID_JSON=$(curl -s "http://localhost:3000/api/users" -H "Authorization: Bearer dummy" 2>/dev/null || true)
# get user id via direct DB query (no auth needed server-side for id lookup)
USER_ID=$(cd /home/z/my-project && node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.user.findFirst({ where: { name: ${USER_JSON:-null} || process.env.E2E_USER_NAME } }).then(u => { console.log(u ? u.id : ''); return db.\$disconnect(); });
" 2>/dev/null)
export E2E_USER_NAME="$USER"
USER_ID=$(cd /home/z/my-project && E2E_USER_NAME="$USER" node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.user.findFirst({ where: { name: process.env.E2E_USER_NAME } }).then(u => { console.log(u ? u.id : ''); return db.\$disconnect(); });
" 2>/dev/null)
TOKEN=$(curl -s -X POST "http://localhost:3000/api/auth/login" -H "Content-Type: application/json" -d "{\"pin\":\"1234\",\"userId\":\"$USER_ID\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
if [ -z "$TOKEN" ]; then echo "LOGIN FAILED for $USER"; exit 1; fi
URL="http://localhost:3000/${VIEW:+#$VIEW}"
agent-browser open "http://localhost:3000/" >/dev/null 2>&1
agent-browser eval "localStorage.setItem('hz_token', '$TOKEN'); 'token-set'" >/dev/null 2>&1
agent-browser open "about:blank" >/dev/null 2>&1
agent-browser open "$URL" >/dev/null 2>&1
sleep 7
echo "logged in as $USER → $URL"
