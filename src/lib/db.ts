import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function buildClient(): PrismaClient {
  return new PrismaClient({
    // query logging off,
  })
}

let client = globalForPrisma.prisma ?? buildClient()

/**
 * Dev-server prisma cache repair (Agent API-2):
 * The generated prisma client can be REGENERATED while the dev server keeps
 * running (new models added via `prisma db push` + generate — e.g. SmsOutbox,
 * DateCheck, UserPermOverride, HolooSyncLog, SmsPanel/SmsTemplate). Node's require cache then still holds the STALE PrismaClient
 * class, so `db.smsOutbox` etc. are undefined at runtime.
 * Detect a stale instance (missing the newest model) and rebuild it by
 * busting the prisma entries of the require cache and re-requiring fresh.
 * Production builds always ship a fresh client, so this branch never runs there.
 */
// R4-5: smsPanel/smsTemplate are the newest models — add future models here.
// R4-7: dataSnapshot added (snapshot/reset system).
const STALENESS_PROBES = ['zoneColumn', 'smsPanel', 'dataSnapshot']
const missingModel = (m: string) => !(client as unknown as Record<string, unknown>)[m]
// R4-coordinator: field-level staleness — adding FIELDS to existing models (not new models)
// doesn't trip the model probe above; probe a known new field via the internal DMMF.
const userFields: { name?: string }[] =
  ((client as unknown as { _dmmf?: { modelMap?: Record<string, { fields?: { name?: string }[] }> } })._dmmf?.modelMap?.User?.fields) || []
const missingUserField = !userFields.some((f) => f?.name === 'mobile')
if (STALENESS_PROBES.some(missingModel) || missingUserField) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = require('module') as typeof import('module')
    const req = createRequire(`${process.cwd()}/package.json`) as ReturnType<
      typeof createRequire
    > & { cache: Record<string, unknown> }
    for (const key of Object.keys(req.cache)) {
      if (key.includes('/node_modules/@prisma/client/') || key.includes('/node_modules/.prisma/client/')) {
        delete req.cache[key]
      }
    }
    const fresh = req('@prisma/client') as typeof import('@prisma/client')
    client = new fresh.PrismaClient({})
    globalForPrisma.prisma = client
  } catch {
    client = buildClient()
  }
}

export const db = client

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
