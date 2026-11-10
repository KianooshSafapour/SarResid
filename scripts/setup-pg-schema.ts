/* راه‌اندازی دیتابیس PostgreSQL برای صف تراکنش‌های هلو */
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()

async function main() {
  // ۱) ساخت جداول PostgreSQL برای صف تراکنش و کش کاتالوگ
  // (با SQL خام چون Prisma هنوز به SQLite وصل است)
  const queries = [
    // ── صف تراکنش‌های هلو (Outbox Pattern) ──
    `CREATE TABLE IF NOT EXISTS holoo_txn_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kind TEXT NOT NULL,              -- INVOICE | CUSTOMER | PRODUCT_PRICE | PAYMENT
      payload JSONB NOT NULL,          -- دادهٔ ارسالی به هلو
      status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | SENT | CONFIRMED | FAILED | CANCELLED
      idempotency_key TEXT UNIQUE,     -- جلوگیری از ارسال تکراری
      holoo_response JSONB,            -- پاسخ هلو (در صورت موفقیت)
      error TEXT,                      -- خطا (در صورت شکست)
      retry_count INT DEFAULT 0,
      max_retries INT DEFAULT 5,
      created_at TIMESTAMPTZ DEFAULT now(),
      sent_at TIMESTAMPTZ,
      confirmed_at TIMESTAMPTZ,
      -- فراداده
      entity_type TEXT,               -- order | return | customer | product
      entity_id TEXT,                 -- شناسهٔ موجودیت محلی
      created_by TEXT                -- کاربر ایجادکننده
    )`,
    `CREATE INDEX IF NOT EXISTS idx_holoo_txn_status ON holoo_txn_queue(status) WHERE status = 'PENDING'`,
    `CREATE INDEX IF NOT EXISTS idx_holoo_txn_entity ON holoo_txn_queue(entity_type, entity_id)`,

    // ── جدول کش کاتالوگ (source of truth = هلو) ──
    `CREATE TABLE IF NOT EXISTS holoo_catalog_cache (
      product_id TEXT PRIMARY KEY,     -- ErpCode هلو
      data JSONB NOT NULL,            -- کل دادهٔ کالا از هلو
      synced_at TIMESTAMPTZ DEFAULT now(),
      version BIGINT DEFAULT 0        -- نسخهٔ sync برای optimistic concurrency
    )`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_synced ON holoo_catalog_cache(synced_at)`,

    // ── لاگ تضادها (وقتی هلو و محلی اختلاف دارند) ──
    `CREATE TABLE IF NOT EXISTS holoo_conflicts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      local_data JSONB NOT NULL,
      remote_data JSONB,
      resolution TEXT DEFAULT 'PENDING',  -- PENDING | LOCAL_WINS | REMOTE_WINS | MANUAL_MERGE
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )`,
  ]

  // اجرا با اتصال مستقیم PostgreSQL
  const { Client } = await import('pg')
  const client = new Client({
    host: '127.0.0.1',
    port: 5432,
    database: 'sarresid',
    user: 'sarresid',
    password: 'hz-pg-2026',
  })

  try {
    await client.connect()
    for (const q of queries) {
      await client.query(q)
      console.log('✓', q.split('\n')[0].slice(0, 60).trim())
    }
  } finally {
    await client.close()
  }

  console.log('\n✅ PostgreSQL schema ready for Holoo sync architecture')
  await p.$disconnect()
}

main().catch(console.error)
