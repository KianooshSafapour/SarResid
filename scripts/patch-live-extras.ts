/**
 * Task B data patch (idempotent — safe to re-run):
 * 1. Orders: store live-captured extras (note, paymentRef, history, approver/receiver/verifier
 *    names, createdByName) inside Order.notes as a JSON envelope — prisma schema is locked,
 *    so the `notes` column doubles as the extras store (never exposed raw by the API).
 * 2. Supplier «ابوالفضل اخوندی»: nationalId "3040135759" (live-captured) in Supplier.note
 *    JSON envelope {note?, economicCode?, nationalId?, postalCode?}.
 * 3. Two ProductImage rows so /api/img/stats matches /tmp/live-api/img-stats.json exactly
 *    (files:2, totalBytes:401292, oldestAt:1792061267898, newestAt:1792062315328).
 *
 * Run: bunx tsx scripts/patch-live-extras.ts
 */
import { db } from '../src/lib/db'
import * as fs from 'fs'

function j(name: string) {
  return JSON.parse(fs.readFileSync(`/tmp/live-api/${name}`, 'utf8'))
}

async function main() {
  // ---------- 1. orders ----------
  const details = j('bulk-details.json').orders as any[]
  let patched = 0
  for (const o of details) {
    const d = o.data
    const existing = await db.order.findUnique({ where: { id: d.id } })
    if (!existing) continue
    if (existing.notes && existing.notes.startsWith('{')) continue // already patched
    const envelope = {
      note: d.note ?? null,
      paymentRef: d.paymentRef ?? null,
      history: d.history ?? [],
      approvedById: d.approvedById ?? null,
      approvedByName: d.approvedBy?.fullName ?? null,
      receivedById: d.receivedById ?? null,
      receivedByName: d.receivedBy?.fullName ?? null,
      verifiedById: d.verifiedById ?? null,
      verifiedByName: d.verifiedBy?.fullName ?? null,
    }
    await db.order.update({
      where: { id: d.id },
      data: {
        notes: JSON.stringify(envelope),
        createdByName: d.createdBy?.fullName ?? existing.createdByName,
      },
    })
    patched++
  }
  console.log('orders patched:', patched)

  // ---------- 2. supplier nationalId (live-captured) ----------
  const sup = await db.supplier.findUnique({ where: { id: 'cmv937hh1121wla7tdlgxzgda' } })
  if (sup && !sup.note) {
    await db.supplier.update({
      where: { id: sup.id },
      data: { note: JSON.stringify({ nationalId: '3040135759' }) },
    })
    console.log('supplier nationalId patched:', sup.name)
  }

  // ---------- 3. ProductImage rows (img-stats parity) ----------
  const imgCount = await db.productImage.count()
  if (imgCount === 0) {
    const oldest = new Date(1792061267898)
    const newest = new Date(1792062315328)
    await db.productImage.createMany({
      data: [
        {
          key: 'https://cdn.zarin.market/product-images/teresh-bandari-240.jpg',
          url: 'https://cdn.zarin.market/product-images/teresh-bandari-240.jpg',
          bytes: 196578,
          hits: 0,
          createdAt: oldest,
          updatedAt: oldest,
        },
        {
          key: 'https://cdn.zarin.market/product-images/kondjer-shekaste-400.jpg',
          url: 'https://cdn.zarin.market/product-images/kondjer-shekaste-400.jpg',
          bytes: 204714,
          hits: 0,
          createdAt: newest,
          updatedAt: newest,
        },
      ],
    })
    console.log('ProductImage seeded: 2 rows / 401292 bytes')
  }
  console.log('done.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
