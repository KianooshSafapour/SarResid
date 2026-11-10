/**
 * Agent C one-off repair script.
 * The live-capture seed (seed-live.ts) reads returns from bulk-details.json whose detail
 * shape has no cashierId (it embeds `cashier:{...}` instead) and no payment id — so
 * ReturnRequest.cashierId/approvedById and ReturnPayment rows were never populated.
 * This script repairs them from the LIST capture (returns.json) + payment captures,
 * idempotently. Run: bun prisma/repair-agent-c.ts
 */
import { db } from '../src/lib/db'
import { readFileSync, writeFileSync, existsSync } from 'fs'

type Row = Record<string, any>

function J(p: string): Row {
  return JSON.parse(readFileSync(`/tmp/live-api/${p}`, 'utf8'))
}

async function main() {
  // ---- 1. ReturnRequest.cashierId / approvedById (from returns.json LIST capture) ----
  const list = J('returns.json').data.items as Row[]
  for (const it of list) {
    const r = await db.returnRequest.findUnique({ where: { code: it.code } })
    if (!r) {
      console.log('missing return', it.code)
      continue
    }
    const patch: Row = {}
    if (!r.cashierId && it.cashierId) patch.cashierId = it.cashierId
    if (!r.approvedById && it.approvedById) patch.approvedById = it.approvedById
    if (!r.approvedAt && it.approvedAt) patch.approvedAt = new Date(it.approvedAt)
    if (r.submittedAt?.toISOString() !== it.submittedAt && it.submittedAt) {
      patch.submittedAt = new Date(it.submittedAt)
    }
    if (Object.keys(patch).length) {
      await db.returnRequest.update({ where: { id: r.id }, data: patch })
      console.log('repaired', it.code, Object.keys(patch).join(','))
    }
  }

  // ---- 2. ReturnPayment rows (stored per live contract: kind/amount + JSON blob in note) ----
  const details = J('bulk-details.json').returns as Row[]
  for (const dr of details) {
    const d = dr.data.return as Row
    const pay = d.payment as Row | null
    if (!pay) continue
    const existing = await db.returnPayment.findFirst({ where: { returnId: d.id } })
    if (existing) continue
    await db.returnPayment.create({
      data: {
        returnId: d.id,
        kind: 'TRANSFER',
        amount: Number(pay.amount) || 0,
        note: JSON.stringify({
          bankName: pay.bankName ?? null,
          accountNumber: pay.accountNumber ?? null,
          cardNumber: pay.cardNumber ?? null,
          referenceNumber: pay.referenceNumber ?? null,
          transferredAt: pay.transferredAt ?? null,
          recordedBy: pay.recordedBy ?? null,
        }),
        createdAt: pay.createdAt ? new Date(pay.createdAt) : new Date(),
      },
    })
    console.log('created ReturnPayment for', d.code)
  }

  // ---- 3. Campaign notes sidecar (schema has no note column; live API returned one) ----
  const NOTE_FILE = `${process.cwd()}/db/campaign-notes.json`
  const capCampaigns = J('campaigns.json').data.items as Row[]
  const notes: Record<string, string> = existsSync(NOTE_FILE)
    ? JSON.parse(readFileSync(NOTE_FILE, 'utf8'))
    : {}
  for (const c of capCampaigns) {
    if (c.note && !notes[c.id]) notes[c.id] = c.note
  }
  writeFileSync(NOTE_FILE, JSON.stringify(notes, null, 2))
  console.log('campaign notes:', Object.keys(notes).length)

  console.log('repair done')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
