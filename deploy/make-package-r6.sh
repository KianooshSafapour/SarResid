#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  SarResid — R6 package builder (LOCAL ONLY — never run on server)
#  Produces: deploy/sarresid-r6-<timestamp>.tar.gz — CODE ONLY.
#  NEVER includes: db/, .env, node_modules, .next, qa/, upload/,
#  research/, deploy/, agent-ctx/, tests/, local-only scripts.
#  Run AFTER `bun hz-ext/build.mjs` so public/ holds the fresh chunks.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TS=$(date +%Y%m%d-%H%M)
OUT="$ROOT/deploy/sarresid-r6-$TS.tar.gz"
STAGE=$(mktemp -d)

# freshness check: the content-hashed view chunk must exist
CHUNK=$(ls public/_next/static/chunks/ | grep -E '^hzext-[0-9a-f]+\.js$' | head -1)
[ -n "$CHUNK" ] || { echo "✗ no hzext chunk found — run: bun hz-ext/build.mjs"; exit 1; }

# stage the whitelist
mkdir -p "$STAGE"
for item in src prisma public hz-ext mini-services .f4h \
            package.json bun.lock next.config.ts tsconfig.json \
            components.json postcss.config.mjs eslint.config.mjs tailwind.config.ts; do
  cp -a "$item" "$STAGE/"
done
# scripts/: everything EXCEPT local-only tools (never ship sandbox SSH creds/tooling)
mkdir -p "$STAGE/scripts"
for f in scripts/*; do
  base=$(basename "$f")
  case "$base" in
    sshx.py|sync-down.py|apply-sync.sh) continue ;;
  esac
  [ -f "$f" ] && cp -a "$f" "$STAGE/scripts/"
done
for d in scripts/checks scripts/data scripts/dbq; do
  [ -d "$d" ] && cp -a "$d" "$STAGE/scripts/"
done

tar czf "$OUT" -C "$STAGE" .
rm -rf "$STAGE"
echo "✓ $OUT ($(du -h "$OUT" | cut -f1)) — view chunk: $CHUNK"
echo "  code-only: db/.env/qa/upload/research/deploy/agent-ctx excluded by design"
tar tzf "$OUT" | grep -c . | sed 's/^/  entries: /'
