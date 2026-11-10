# DATA-ARCHITECTURE — SarResid × Holoo Distributed Sync Design

> **Status: DESIGN + INITIAL IMPLEMENTATION (R22, 2026-11-04)**
> PostgreSQL 18.6 + Redis installed on server; PG schema (txn_queue, catalog_cache, conflicts) created.
> Based on: Transactional Outbox pattern (Helland 2007), Saga with compensation,
> CQRS-lite, CRDT PN-Counter for stock deltas, Stripe idempotency model.

## Architecture Overview

```
┌─────────────────────┐     REST/HTTPS      ┌──────────────────┐
│  Holoo Apex (MSSQL) │ ←──────────────────→ │ SarResid Server   │
│  5.202.62.192:5000  │   (write: outbox)    │ 195.248.241.14    │
│  = SOURCE OF TRUTH  │   (read: watermark)  │                   │
└─────────────────────┘                      │  ┌─────────────┐  │
                                             │  │ PostgreSQL  │  │
                                             │  │ (mirror +   │  │
                                             │  │  outbox)    │  │
                                             │  └──────┬──────┘  │
                                             │         │         │
                                             │  ┌──────┴──────┐  │
                                             │  │ Redis Cache │  │
                                             │  │ (cache-aside)│ │
                                             │  └──────┬──────┘  │
                                             └─────────┼─────────┘
                                                       │
                                              ┌────────┴────────┐
                                              │  Storefront PWA  │
                                              │  hyperzeytoon.com│
                                              └─────────────────┘
```

## Core Principles (from research)

1. **Holoo = source of truth** for: products, prices, official stock, customers, invoices
2. **PostgreSQL = durable write-behind buffer + read mirror** (survives Holoo outages)
3. **Redis = pure cache-aside** (never authoritative, never write-behind)
4. **SQLite = platform-internal data** (users, settings, orders, HR, etc.) — stays as-is

## Write Path (Outbox Pattern)

```
1. Business action (e.g., order delivered → invoice needed)
   ↓
2. PG transaction: INSERT into local mirror + INSERT into sync_outbox (idempotency_key = UUID)
   ↓ (both commit atomically — no lost writes)
3. Relay worker: SELECT ... FOR UPDATE SKIP LOCKED (multiple workers safe)
   ↓
4. POST to Holoo REST API (with idempotency key as external ref)
   ↓
5. Outcome:
   ├── 2xx → mark confirmed, store remote_ref (invoice number)
   ├── timeout (ambiguous) → reconciliation first: query Holoo for key, only re-post if absent
   ├── 4xx → mark failed (non-retryable), alert ops
   └── 5xx/network → exponential backoff + jitter, retry up to max_attempts
```

## Read Path (Watermark-based Pull)

```
1. Scheduled job per entity type (products, customers, stock)
   ↓
2. Fetch from Holoo: GET /Product/{page}/{size}?date.from={watermark}
   ↓ (all pages, no limit)
3. Upsert into PG mirror (holoo_catalog_cache)
   ↓
4. Invalidate affected Redis keys
   ↓
5. Advance watermark in same PG transaction
```

## Conflict Resolution (3-tier, domain-aware)

| Tier | Strategy | Fields |
|------|----------|--------|
| 1 | **Field ownership** — each field has one master | Holoo: prices, cost, official stock. SarResid: images, slugs, display stock |
| 2 | **Delta-based (PN-Counter)** for quantities | Stock: sync +n/-n operations, not absolute values |
| 3 | **LWW + manual queue** for contested fields | Product name: Holoo wins (it's the books). Manual merge for true same-field conflicts |

## Anti-Overselling (critical)

- **Never authorize a sale from the cache/mirror alone**
- Reserve stock locally at checkout: `UPDATE stock SET qty = qty - x WHERE qty >= x`
- Commit on payment + Holoo confirmation
- Release (compensate) on failure/timeout
- Current implementation already does this via `reservedMap()` in shop.ts

## Redis Caching Strategy

| Key | TTL | Invalidation |
|-----|-----|-------------|
| `product:{id}` | 30-60 min | On sync upsert |
| `catalog:cat:{id}:page:{n}` | 15-30 min | On sync upsert |
| `stock:{sku}` | 1-5 min | On sync upsert + local reservation |
| Order state | NEVER | N/A (read-modify-write) |

## PG Schema (created on server)

```sql
-- Transaction queue (Outbox)
holoo_txn_queue (id UUID PK, kind TEXT, payload JSONB, status TEXT, idempotency_key UNIQUE,
                 holoo_response JSONB, error TEXT, retry_count INT, max_retries INT,
                 entity_type TEXT, entity_id TEXT, created_by TEXT,
                 created_at, sent_at, confirmed_at)

-- Catalog cache (mirror of Holoo products)
holoo_catalog_cache (product_id TEXT PK, data JSONB, synced_at TIMESTAMPTZ, version BIGINT)

-- Conflict queue (for manual merge)
holoo_conflicts (id UUID PK, entity_type TEXT, entity_id TEXT,
                 local_data JSONB, remote_data JSONB, resolution TEXT,
                 resolved_by TEXT, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
```

## Next Steps

1. ✅ PG + Redis installed and schema created
2. ⬜ Implement relay worker (bun script, cron-driven)
3. ⬜ Wire shop invoice push through outbox (instead of direct API call)
4. ⬜ Wire product catalog reads through PG mirror + Redis cache
5. ⬜ Implement watermark-based pull job
6. ⬜ GUI: conflict resolution dashboard for managers
7. ⬜ Full E2E test on Holoo4

## References

- Helland (2007) *Life Beyond Distributed Transactions* — CIDR
- Vogels (2009) *Eventually Consistent* — CACM
- Kleppmann et al. (2019) *Local-First Software* — ACM Onward!
- microservices.io — Transactional Outbox, Saga patterns
- Stripe — Idempotency keys, backoff with jitter
