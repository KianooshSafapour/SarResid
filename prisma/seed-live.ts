/* Seed SarResid DB from live data dumps captured from nootyezrepyh.space-z.ai */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const L = (p: string) => require('fs').readFileSync(`/tmp/live-api/${p}`, 'utf-8')
const J = (p: string) => JSON.parse(L(p))

async function main() {
  console.log('seeding users...')
  const roster = J('admin-users.json').data.items as any[]
  for (const u of roster) {
    await db.user.upsert({
      where: { username: u.username },
      create: {
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        honorific: u.honorific || '',
        role: u.role,
        title: u.title || '',
        phone: u.phone,
        avatarJson: u.avatarJson,
        pin: u.username === 'kianoosh' ? null : '1234',
        password: u.username === 'kianoosh' ? '@@HZ6677' : null,
        points: u.points || 0,
        active: u.active,
        lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt) : null,
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding products (14,766)...')
  const products = Object.values(Object.fromEntries((J('bulk-products.json').products as any[]).map((p: any) => [p.id, p]))) as any[]
  const batch = 500
  for (let i = 0; i < products.length; i += batch) {
    const slice = products.slice(i, i + batch)
    await db.product.createMany({
      data: slice.map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        unit: p.unit || 'عدد',
        category: p.category,
        mainGroup: p.mainGroup,
        subGroup: p.subGroup,
        sellPrice: p.sellPrice || 0,
        sellPrice2: p.sellPrice2 || 0,
        lastBuyPrice: p.lastBuyPrice || 0,
        stock: p.stock || 0,
        reorderLevel: p.reorderLevel,
        shelfLifeDays: p.shelfLifeDays,
        status: p.status || 'فعال',
        active: p.active !== false,
      })),
      
    })
    if ((i / batch) % 5 === 0) console.log(`  products ${i + slice.length}/${products.length}`)
  }

  console.log('seeding suppliers (1,171)...')
  const suppliers = Object.values(Object.fromEntries((J('bulk-suppliers.json').suppliers as any[]).map((s: any) => [s.id, s]))) as any[]
  for (let i = 0; i < suppliers.length; i += 500) {
    await db.supplier.createMany({
      data: suppliers.slice(i, i + 500).map((s: any) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        phone: s.phone,
        job: s.job,
        classification: s.classification,
        balance: s.balance,
        creditLimit: s.creditLimit || 0,
        status: s.status || 'فعال',
      })),
      
    })
  }

  console.log('seeding orders + items...')
  const orders = J('bulk-details.json').orders as any[]
  for (const o of orders) {
    const d = o.data
    await db.order.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        code: d.code,
        status: d.status,
        supplierId: d.supplierId,
        supplierName: d.supplierName,
        deliveryDate: d.deliveryDate,
        payMethod: d.payMethod || 'CASH',
        notes: d.notes ?? null,
        totalAmount: d.totalAmount || 0,
        createdById: d.createdById ?? null,
        createdByName: d.createdByName ?? null,
        receivedAt: d.receivedAt ? new Date(d.receivedAt) : null,
        createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
      },
      update: {},
    })
    for (const it of d.items || []) {
      await db.orderItem.upsert({
        where: { id: it.id },
        create: {
          id: it.id,
          orderId: d.id,
          productId: it.productId,
          name: it.name,
          barcode: it.barcode,
          qty: it.qty || 1,
          unitBuyPrice: it.unitBuyPrice || 0,
          printedPrice: it.printedPrice || 0,
          receivedQty: it.receivedQty,
          status: it.status || 'PENDING',
          expiryDate: it.expiryDate,
          note: it.note,
        },
        update: {},
      })
    }
  }

  console.log('seeding returns + items...')
  const returns = J('bulk-details.json').returns as any[]
  for (const r of returns) {
    const d = r.data.return
    await db.returnRequest.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        code: d.code,
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        customerCardNumber: d.customerCardNumber,
        purchaseAt: d.purchaseAt,
        reason: d.reason,
        note: d.note,
        totalAmount: d.totalAmount || 0,
        exchangeValue: d.exchangeValue || 0,
        transferAmount: d.transferAmount || 0,
        transferNote: d.transferNote,
        settlementType: d.settlementType || 'exchange',
        status: d.status,
        cashierId: d.cashierId,
        approvedById: d.approvedById,
        approvedAt: d.approvedAt ? new Date(d.approvedAt) : null,
        submittedAt: d.submittedAt ? new Date(d.submittedAt) : null,
        createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
      },
      update: {},
    })
    for (const it of d.items || []) {
      await db.returnItem.upsert({
        where: { id: it.id },
        create: {
          id: it.id,
          returnId: d.id,
          name: it.name,
          barcode: it.barcode,
          qty: it.qty || 1,
          unit: it.unit || 'عدد',
          unitPrice: it.unitPrice || 0,
          lineTotal: it.lineTotal || 0,
        },
        update: {},
      })
    }
    if (d.payment?.id) {
      await db.returnPayment.upsert({
        where: { id: d.payment.id },
        create: {
          id: d.payment.id,
          returnId: d.id,
          kind: d.payment.kind || 'TRANSFER',
          amount: d.payment.amount || 0,
          note: d.payment.note,
          createdAt: d.payment.createdAt ? new Date(d.payment.createdAt) : new Date(),
        },
        update: {},
      })
    }
  }

  console.log('seeding margin invoices + items...')
  const margins = J('bulk-details.json').margins as any[]
  for (const m of margins) {
    const d = m.data.invoice
    await db.marginInvoice.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        number: d.number,
        supplierId: d.supplierId,
        supplierName: d.supplierName,
        note: d.note,
        status: d.status || 'draft',
        archived: !!d.archived,
        archivedAt: d.archivedAt ? new Date(d.archivedAt) : null,
        dateJalali: d.dateJalali,
        createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
      },
      update: {},
    })
    for (const it of d.items || []) {
      await db.marginItem.upsert({
        where: { id: it.id },
        create: {
          id: it.id,
          invoiceId: d.id,
          productId: it.productId,
          barcode: it.barcode,
          productName: it.productName,
          unit: it.unit || 'عدد',
          quantity: it.quantity || 1,
          totalCost: it.totalCost || 0,
          unitCost: it.unitCost || 0,
          printedPrice: it.printedPrice || 0,
          margin: it.margin || 0,
          profitPerUnit: it.profitPerUnit || 0,
          note: it.note,
          level: it.level || 'OK',
          alertsJson: JSON.stringify(it.alerts || []),
        },
        update: {},
      })
    }
  }

  console.log('seeding cheques...')
  const cheques = (J('cheques.json').data.items || []) as any[]
  for (const c of cheques) {
    if (!c.id) continue
    await db.cheque.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        number: c.number,
        amount: c.amount || 0,
        status: c.status,
        recipient: c.recipient,
        sayadSerial: c.sayadSerial,
        selfIssued: !!c.selfIssued,
        writtenAt: c.writtenAt,
        dueDate: c.dueDate,
        note: c.note,
        orderCode: c.orderCode,
        historyJson: JSON.stringify(c.history || []),
        createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
        updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding payments...')
  const payments = (J('payments.json').data.items || []) as any[]
  for (const p of payments) {
    if (!p.id) continue
    await db.payment.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        kind: p.kind,
        amount: p.amount || 0,
        supplierName: p.supplierName,
        orderCode: p.orderCode,
        note: p.note,
        holooReceiptNo: p.holooReceiptNo,
        createdBy: p.createdBy,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding customers...')
  const customers = (J('customers.json').data.items || []) as any[]
  for (const c of customers) {
    if (!c.id) continue
    await db.customer.upsert({
      where: { phone: c.phone },
      create: {
        id: c.id,
        phone: c.phone,
        name: c.name,
        returnsCount: c.returnsCount || 0,
        totalAmount: c.totalAmount || 0,
        firstAt: c.firstAt ? new Date(c.firstAt) : new Date(),
        lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt) : new Date(),
        smsEnabled: c.smsEnabled !== false,
        birthday: c.birthday,
        note: c.note,
        manualTier: c.manualTier,
      },
      update: {},
    })
  }

  console.log('seeding campaigns...')
  const campaigns = (J('campaigns.json').data.items || []) as any[]
  for (const c of campaigns) {
    if (!c.id) continue
    await db.campaign.upsert({
      where: { id: c.id },
      create: { id: c.id, title: c.title, kind: c.kind, targetTier: c.targetTier, date: c.date, status: c.status, createdAt: c.createdAt ? new Date(c.createdAt) : new Date() },
      update: {},
    })
  }

  console.log('seeding personnel + salary profiles...')
  const personnel = (J('personnel.json').data.items || []) as any[]
  for (const p of personnel) {
    if (!p.userId) continue
    await db.personnel.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        userId: p.userId,
        fullName: p.fullName,
        nationalId: p.nationalId,
        phone: p.phone,
        jobTitle: p.jobTitle,
        department: p.department,
        hireDate: p.hireDate,
        birthday: p.birthday,
        bankCard: p.bankCard,
        shaba: p.shaba,
        emergencyName: p.emergencyName,
        emergencyPhone: p.emergencyPhone,
        note: p.note,
        active: p.active !== false,
      },
      update: {},
    })
    if (p.salaryProfile) {
      const s = p.salaryProfile
      await db.salaryProfile.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          userId: s.userId,
          baseSalary: s.baseSalary || 0,
          housingAllowance: s.housingAllowance || 0,
          foodAllowance: s.foodAllowance || 0,
          childAllowance: s.childAllowance || 0,
          children: s.children || 0,
          seniorityDaily: s.seniorityDaily || 0,
          active: s.active !== false,
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
        },
        update: {},
      })
    }
  }

  console.log('seeding leaves...')
  const leaves = (J('leaves.json').data.items || []) as any[]
  for (const l of leaves) {
    if (!l.id || !l.userId) continue
    await db.leaveRequest.upsert({
      where: { id: l.id },
      create: {
        id: l.id,
        userId: l.userId,
        type: l.type,
        fromDate: l.fromDate,
        toDate: l.toDate,
        days: l.days || 1,
        hours: l.hours || 0,
        reason: l.reason,
        status: l.status,
        responseNote: l.responseNote,
        approverName: l.approverName,
        createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding floorplans + blocks...')
  const floorplans = (J('floorplans.json').data.plans || []) as any[]
  for (const f of floorplans) {
    await db.floorplan.upsert({
      where: { id: f.id },
      create: { id: f.id, name: f.name, width: f.width || 2560, height: f.height || 1200 },
      update: {},
    })
    for (const b of f.blocks || []) {
      await db.floorBlock.upsert({
        where: { id: b.id },
        create: {
          id: b.id,
          planId: f.id,
          kind: b.kind,
          x: b.x, y: b.y, w: b.w, h: b.h,
          rotation: b.rotation || 0,
          label: b.label,
          zoneName: b.zoneName,
          metaJson: b.meta ? JSON.stringify(b.meta) : null,
        },
        update: {},
      })
    }
  }

  console.log('seeding planograms...')
  const planograms = (J('planograms.json').data.planograms || []) as any[]
  for (const p of planograms) {
    if (!p.id) continue
    await db.planogram.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        blockLabel: p.blockLabel,
        rows: p.rows || 4,
        cols: p.cols || 6,
        cellsJson: JSON.stringify(p.cellsJson || p.cells || []),
        status: p.status,
        note: p.note,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding zones...')
  const zones = (J('zones.json').data.zones || []) as any[]
  for (const z of zones) {
    if (!z.id) continue
    await db.zone.upsert({
      where: { id: z.id },
      create: {
        id: z.id,
        name: z.name,
        type: z.type,
        criticality: z.criticality || 'C',
        countFrequency: z.countFrequency || 'MONTHLY',
        ownerName: z.ownerName,
        minStaff: z.minStaff,
      },
      update: {},
    })
  }

  console.log('seeding price-checks...')
  const priceChecks = (J('price-checks.json').data.checks || []) as any[]
  for (const p of priceChecks) {
    if (!p.id || !p.productId) continue
    await db.priceCheck.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        date: p.date,
        productId: p.productId,
        lastCost: p.lastCost || 0,
        sellPrice: p.sellPrice || 0,
        margin: p.margin || 0,
        ok: !!p.ok,
        note: p.note,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding waste records...')
  const waste = (J('waste.json').data.items || []) as any[]
  for (const w of waste) {
    if (!w.id) continue
    await db.wasteRecord.upsert({
      where: { id: w.id },
      create: {
        id: w.id,
        date: w.date,
        name: w.name,
        qty: w.qty || 1,
        unit: w.unit || 'عدد',
        reason: w.reason,
        estValue: w.estValue || 0,
        userName: w.userName,
        note: w.note,
        createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding wall posts...')
  const wall = (J('wall.json').data.posts || []) as any[]
  for (const w of wall) {
    if (!w.id || !w.authorId) continue
    await db.wallPost.upsert({
      where: { id: w.id },
      create: {
        id: w.id,
        content: w.content,
        pinned: !!w.pinned,
        authorId: w.authorId,
        likesJson: w.likesJson || null,
        createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding feedback...')
  const feedback = (J('feedback.json').data.items || []) as any[]
  for (const f of feedback) {
    if (!f.id) continue
    await db.feedback.upsert({
      where: { id: f.id },
      create: {
        id: f.id,
        kind: f.kind,
        authorId: f.authorId ?? null,
        content: f.content,
        status: f.status,
        response: f.response,
        points: f.points || 0,
        createdAt: f.createdAt ? new Date(f.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding problems...')
  const problems = (J('problems.json').data.problems || []) as any[]
  for (const p of problems) {
    if (!p.id) continue
    await db.problem.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        date: p.date,
        problem: p.problem,
        action: p.action,
        responsible: p.responsible,
        status: p.status,
        reporterId: p.reporterId,
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding shift reports...')
  const shiftReports = (J('shift-reports.json').data.reports || []) as any[]
  for (const s of shiftReports) {
    if (!s.id || !s.userId) continue
    await db.shiftReport.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        userId: s.userId,
        date: s.date,
        type: s.type,
        dataJson: s.dataJson || '{}',
        note: s.note,
        createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding KB articles...')
  const kb = (J('kb.json').data.articles || []) as any[]
  for (const a of kb) {
    if (!a.id || !a.slug) continue
    await db.kbArticle.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        slug: a.slug,
        title: a.title,
        category: a.category,
        summary: a.summary || '',
        body: a.body || '',
        imageUrl: a.imageUrl,
        pinned: !!a.pinned,
        views: a.views || 0,
      },
      update: {},
    })
  }

  console.log('seeding awards...')
  const awards = (J('awards.json').data.awards || []) as any[]
  for (const a of awards) {
    if (!a.id || !a.userId) continue
    await db.award.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        userId: a.userId,
        points: a.points || 0,
        reason: a.reason,
        awardedByName: a.awardedByName,
        createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding notifications...')
  const notifs = (J('notifications.json').data.items || []) as any[]
  for (const n of notifs) {
    if (!n.id) continue
    await db.notification.upsert({
      where: { id: n.id },
      create: {
        id: n.id,
        userId: n.userId,
        role: n.role,
        kind: n.kind,
        severity: n.severity || 'info',
        title: n.title,
        body: n.body,
        go: n.go,
        readAt: n.readAt ? new Date(n.readAt) : null,
        createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding activity log (last 100)...')
  const activity = (J('activity.json').data.items || []) as any[]
  for (const a of activity) {
    if (!a.id) continue
    await db.activityLog.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        userId: a.userId,
        userName: a.userName,
        action: a.action,
        actionLabel: a.actionLabel,
        category: a.category,
        detail: a.detail,
        entityId: a.entityId,
        createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
      },
      update: {},
    })
  }

  console.log('seeding checklist templates + today states...')
  const checklists = J('checklists.json').data as any
  for (const c of checklists.checklists || []) {
    const tplId = c.id
    await db.checklistTemplate.upsert({
      where: { id: tplId },
      create: {
        id: tplId,
        title: c.title,
        description: c.description || '',
        phase: c.phase || 'start',
        frequency: c.frequency || 'DAILY',
        points: c.points || 1,
        roleKey: c.roleKey ?? null,
        itemsJson: JSON.stringify((c.items || []).map((i: any) => ({ text: i.text, hint: i.hint }))),
      },
      update: {},
    })
    if ((c.state || []).some((s: any) => s.done)) {
      await db.checklistState.upsert({
        where: { day_templateId: { day: checklists.day, templateId: tplId } },
        create: {
          day: checklists.day,
          templateId: tplId,
          itemsJson: JSON.stringify(c.state || []),
          completedAt: c.completedAt ? new Date(c.completedAt) : null,
        },
        update: {},
      })
    }
  }

  console.log('seeding SOPs...')
  const sops = (J('sops.json').data.sops || []) as any[]
  for (const s of sops) {
    if (!s.id) continue
    await db.sop.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        title: s.title,
        description: s.description || '',
        stepsJson: JSON.stringify(s.steps || []),
        views: s.views || 0,
        version: s.version || 1,
      },
      update: {},
    })
  }

  console.log('seeding settings (payroll statutory)...')
  const payroll = J('payroll.json').data as any
  await db.setting.upsert({
    where: { key: 'payroll_statutory' },
    create: {
      key: 'payroll_statutory',
      value: JSON.stringify(payroll.statutory || {}),
    },
    update: { value: JSON.stringify(payroll.statutory || {}) },
  })

  console.log('✅ SEED COMPLETE')
  console.log('users:', await db.user.count())
  console.log('products:', await db.product.count())
  console.log('suppliers:', await db.supplier.count())
  console.log('orders:', await db.order.count())
  console.log('returns:', await db.returnRequest.count())
  console.log('cheques:', await db.cheque.count())
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
