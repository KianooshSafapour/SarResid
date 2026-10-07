'use client'

/**
 * فرمان‌یاب — quick command palette (Ctrl+K / ⌘K)
 * Persian-aware fuzzy navigation to every allowed view + quick actions.
 * Matching normalizes Arabic/Persian look-alikes (ي→ی، ك→ک), strips ZWNJ & spaces.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppCtx } from '@/components/app/ui-bits'
import { VIEW_ACCESS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ClipboardList, PackageCheck, Warehouse, Calculator, ShoppingBasket,
  Truck, LayoutGrid, Store, BadgePercent, Banknote, FileSpreadsheet, ListChecks, BookOpen,
  Newspaper, MessageCircle, NotebookPen, HeartHandshake, Trophy, BellRing, Sunrise,
  ShieldCheck, Info, Plus, LogOut, ScanBarcode, Printer, Search, CornerUpLeft,
  FlaskConical, GraduationCap, Presentation, Library, ClipboardCheck, CalendarRange,
} from 'lucide-react'

type Cmd = {
  key: string
  label: string
  hint?: string
  icon: React.ReactNode
  group: string
  run: (ctx: AppCtx) => void
}

/** normalize Persian text for forgiving search — \u escapes so no transform can mangle the literals */
export function normFa(s: string): string {
  return s
    .replace(/[\u064A\u0649]/g, '\u06CC') // ي ى → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/[\u200c\u200f\u200e]/g, '') // ZWNJ/RLM/LRM
    .replace(/\u0622/g, '\u0627') // آ → ا
    .replace(/\u0629/g, '\u0647') // ة → ه
    .replace(/\s+/g, '')
    .toLowerCase()
}

const RECENT_KEY = 'hz-recent-views'

export function pushRecentView(key: string) {
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const next = [key, ...prev.filter((k) => k !== key)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* private mode */ }
}

export function getRecentViews(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

export default function CommandPalette({ ctx, onClose, onLogout }: { ctx: AppCtx; onClose: () => void; onLogout: () => void }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Cmd[]>(() => {
    if (!ctx.user) return []
    const nav = (key: string) => (c: AppCtx) => {
      pushRecentView(key)
      c.navigate(key)
      onClose()
    }
    const items: Cmd[] = [
      { key: 'dashboard', label: 'داشبورد', hint: 'نمای کلی امروز', icon: <LayoutDashboard size={16} />, group: 'بخش‌ها', run: nav('dashboard') },
      { key: 'orders', label: 'سفارش‌ها', hint: 'چرخه تأمین', icon: <ClipboardList size={16} />, group: 'بخش‌ها', run: nav('orders') },
      { key: 'receiving', label: 'دریافت مرسوله', hint: 'اسکن و ثبت ورود', icon: <PackageCheck size={16} />, group: 'بخش‌ها', run: nav('receiving') },
      { key: 'verify', label: 'تأیید انبار', hint: 'برداشت موجودی', icon: <Warehouse size={16} />, group: 'بخش‌ها', run: nav('verify') },
      { key: 'accounting', label: 'حسابداری و هلو', hint: 'خروجی اکسل', icon: <Calculator size={16} />, group: 'بخش‌ها', run: nav('accounting') },
      { key: 'products', label: 'کالاها', hint: 'کارت کالا و پیش‌نویس سفارش', icon: <ShoppingBasket size={16} />, group: 'بخش‌ها', run: nav('products') },
      { key: 'zonecount', label: 'شمارش روزانهٔ زون', hint: 'شمارش کور مرچندایزر', icon: <ClipboardCheck size={16} />, group: 'بخش‌ها', run: nav('zonecount') },
      { key: 'providers', label: 'تأمین‌کنندگان', hint: 'نماینده‌ها و چرخه', icon: <Truck size={16} />, group: 'بخش‌ها', run: nav('providers') },
      { key: 'planogram', label: 'پلانوگرام قفسه‌ها', hint: 'نقشه قفسه', icon: <LayoutGrid size={16} />, group: 'بخش‌ها', run: nav('planogram') },
      { key: 'sales', label: 'فروش و مشتریان', hint: 'پیش‌فاکتور و مشتری', icon: <Store size={16} />, group: 'بخش‌ها', run: nav('sales') },
      { key: 'pricecheck', label: 'کنترل قیمت روزانه', hint: 'تابلوی حاشیه سود', icon: <BadgePercent size={16} />, group: 'بخش‌ها', run: nav('pricecheck') },
      { key: 'cheques', label: 'چک‌ها و پرداخت‌ها', hint: 'برنامه‌ریز سررسید و انعطاف', icon: <Banknote size={16} />, group: 'بخش‌ها', run: nav('cheques') },
      { key: 'archive', label: 'آرشیو اسناد', hint: 'بایگانی دیجیتال-فیزیکی زونکن‌ها', icon: <Library size={16} />, group: 'بخش‌ها', run: nav('archive') },
      { key: 'reports', label: 'گزارش‌ها و اکسل', hint: 'خروجی‌های مدیریتی', icon: <FileSpreadsheet size={16} />, group: 'بخش‌ها', run: nav('reports') },
      { key: 'tasks', label: 'وظایف من', hint: 'لیست امروز', icon: <ListChecks size={16} />, group: 'بخش‌ها', run: nav('tasks') },
      { key: 'sop', label: 'روال‌های استاندارد', hint: 'آموزش گام‌به‌گام', icon: <BookOpen size={16} />, group: 'بخش‌ها', run: nav('sop') },
      { key: 'wall', label: 'دیجیتال‌وال', hint: 'اطلاعیه‌ها', icon: <Newspaper size={16} />, group: 'بخش‌ها', run: nav('wall') },
      { key: 'messages', label: 'پیام‌ها', hint: 'پیام خصوصی امن', icon: <MessageCircle size={16} />, group: 'بخش‌ها', run: nav('messages') },
      { key: 'notes', label: 'یادداشت‌های من', hint: 'برگه‌های چسبان', icon: <NotebookPen size={16} />, group: 'بخش‌ها', run: nav('notes') },
      { key: 'feedback', label: 'بازخورد و ایده‌ها', hint: 'صدای تیم', icon: <HeartHandshake size={16} />, group: 'بخش‌ها', run: nav('feedback') },
      { key: 'leaves', label: 'مرخصی و برنامهٔ تیم', hint: 'تقویم مرخصی و رزرو روز', icon: <CalendarRange size={16} />, group: 'بخش‌ها', run: nav('leaves') },
      { key: 'perf', label: 'عملکرد و امتیازها', hint: 'جدول امتیاز و SPLH', icon: <Trophy size={16} />, group: 'بخش‌ها', run: nav('perf') },
      { key: 'notifs', label: 'مرکز اعلان‌ها', hint: 'کارهای در انتظار', icon: <BellRing size={16} />, group: 'بخش‌ها', run: nav('notifs') },
      { key: 'briefing', label: 'صبح‌نامه امروز', hint: 'گزارش چاپی جلسه صبح', icon: <Sunrise size={16} />, group: 'بخش‌ها', run: nav('briefing') },
      { key: 'admin', label: 'مدیریت سامانه', hint: 'کاربران و سلامت', icon: <ShieldCheck size={16} />, group: 'بخش‌ها', run: nav('admin') },
      { key: 'science', label: 'جعبه‌ابزار علمی', hint: 'ABC، نقطه سفارش، EOQ، ضایعات', icon: <FlaskConical size={16} />, group: 'بخش‌ها', run: nav('science') },
      { key: 'research', label: 'مرکز پژوهش', hint: 'مبنای آکادمیک سامانه', icon: <GraduationCap size={16} />, group: 'بخش‌ها', run: nav('research') },
      { key: 'demo', label: 'استودیوی دمو', hint: 'شرکت‌های نمایشی شبیه‌سازی‌شده', icon: <Presentation size={16} />, group: 'بخش‌ها', run: nav('demo') },
      { key: 'help', label: 'راهنما و آموزش', hint: 'سؤالات متداول', icon: <Info size={16} />, group: 'بخش‌ها', run: nav('help') },
    ]
    const allowed = items.filter(
      (i) => i.group !== 'بخش‌ها' || VIEW_ACCESS[i.key]?.roles.includes('*') || VIEW_ACCESS[i.key]?.roles.includes(ctx.user!.role) || (VIEW_ACCESS[i.key]?.secondary || []).some((s) => (ctx.user!.secondaryRoles || []).includes(s))
    )

    const actions: Cmd[] = []
    if (['GM', 'PM', 'OM'].includes(ctx.user.role)) {
      actions.push({
        key: 'act-new-order', label: 'ثبت سفارش جدید', hint: 'سفارش به تأمین‌کننده', icon: <Plus size={16} />, group: 'اقدامات سریع',
        run: (c) => { c.navigate('orders', 'new'); onClose() },
      })
    }
    actions.push({
      key: 'act-scan', label: 'اسکن بارکد با دوربین', hint: 'جست‌وجوی کالا', icon: <ScanBarcode size={16} />, group: 'اقدامات سریع',
      run: () => { window.dispatchEvent(new CustomEvent('hz-open-scanner')); onClose() },
    })
    if (['GM', 'OM', 'OWNER', 'ACC'].includes(ctx.user.role)) {
      actions.push({
        key: 'act-briefing-print', label: 'چاپ صبح‌نامه امروز', hint: 'گزارش جلسه صبح', icon: <Printer size={16} />, group: 'اقدامات سریع',
        run: (c) => { c.navigate('briefing'); onClose() },
      })
    }
    actions.push({
      key: 'act-logout', label: 'خروج از حساب', hint: ctx.user.name, icon: <LogOut size={16} />, group: 'اقدامات سریع',
      run: () => { onLogout(); onClose() },
    })
    return [...allowed, ...actions]
  }, [ctx.user, onClose, onLogout])

  const recents = useMemo(() => {
    if (q.trim()) return []
    const keys = getRecentViews()
    return commands.filter((c) => keys.includes(c.key)).sort((a, b) => keys.indexOf(b.key) - keys.indexOf(a.key)).slice(0, 4)
  }, [q, commands])

  const results = useMemo(() => {
    const nq = normFa(q)
    const pool = q.trim() ? commands : recents.length > 0 ? recents : commands.slice(0, 8)
    if (!nq) return pool
    return pool
      .map((c) => {
        const hay = normFa(c.label + ' ' + (c.hint || '') + ' ' + c.key)
        const pos = hay.indexOf(nq)
        return { c, score: pos === -1 ? -1 : pos }
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c)
  }, [q, commands, recents])

  /** نتایج با پرچم «سرفصل گروه جدید» — بدون تغییر متغیر حین رندر */
  const resultsWithGroups = useMemo(
    () => results.map((c, i) => ({ c, showGroup: i === 0 || results[i - 1].group !== c.group })),
    [results]
  )

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  /** ریست انتخاب با تغییر جست‌وجو — الگوی رسمی ریست حین رندر */
  const [prevQ, setPrevQ] = useState(q)
  if (prevQ !== q) {
    setPrevQ(q)
    setIdx(0)
  }

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIdx((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const c = results[idx]
        if (c) c.run(ctx)
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [results, idx, ctx, onClose]
  )

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="فرمان‌یاب">
      <div className="absolute inset-0 bg-[#0b2e20]/45 backdrop-blur-[2px] palette-backdrop" onClick={onClose} aria-hidden />
      <div className="palette-pop glow-card gold-glow-border relative w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-2xl">
        {/* search input */}
        <div className="flex items-center gap-2.5 border-b border-[#e4dcc4] px-4 py-3">
          <Search size={17} className="shrink-0 text-[#8a6d10]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="کجا برویم؟ (مثلاً «قیمت»، «چک»، «اسکن»…)"
            className="w-full bg-transparent text-sm font-bold text-foreground outline-none placeholder:text-muted-foreground/70"
            aria-label="جست‌وجوی بخش‌ها و اقدامات"
          />
          <kbd className="shrink-0 rounded-lg border border-border bg-muted px-1.5 py-0.5 text-[9px] font-black text-muted-foreground">Esc</kbd>
        </div>

        {/* results */}
        <div ref={listRef} className="scroll-gold max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-xs font-bold text-muted-foreground">
              چیزی پیدا نشد — کلمه دیگری امتحان کنید 🍃
            </p>
          )}
          {resultsWithGroups.map(({ c, showGroup }, i) => (
            <div key={c.key}>
              {showGroup && (
                <p className="px-2 pb-1 pt-2.5 text-[9px] font-black tracking-wide text-muted-foreground/80">{c.group}</p>
              )}
              <button
                data-idx={i}
                onMouseEnter={() => setIdx(i)}
                onClick={() => c.run(ctx)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right transition',
                  i === idx ? 'bg-gradient-to-l from-[#0e7a4a]/12 to-[#c9a227]/10 shadow-[inset_0_0_0_1px_rgba(201,162,39,0.35)]' : 'hover:bg-secondary/60'
                )}
              >
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', i === idx ? 'bg-[#0e7a4a] text-white' : 'bg-muted text-foreground/70')}>
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-extrabold">{c.label}</span>
                  {c.hint && <span className="block truncate text-[10px] text-muted-foreground">{c.hint}</span>}
                </span>
                {i === idx && <CornerUpLeft size={13} className="shrink-0 text-[#c9a227]" />}
              </button>
            </div>
          ))}
        </div>

        {/* footer hints */}
        <div className="flex items-center justify-between border-t border-[#e4dcc4] bg-[#f7f3e6]/60 px-4 py-2">
          <p className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground">
            <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5">↑</kbd>
            <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5">↓</kbd>
            حرکت • <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5">Enter</kbd> انتخاب
          </p>
          <p className="text-[9px] font-black text-[#8a6d10]">Ctrl + K فرمان‌یاب 🌿</p>
        </div>
      </div>
    </div>
  )
}
