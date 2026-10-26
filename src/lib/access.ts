/**
 * Section/page role gates mirrored from the live AppShell permission map
 * (chunk f58febe0f4682bee.js — WORKSPACES + per-page map + caps, module 200150).
 * Managers (OWNER/GM/ADMIN) can always access everything.
 *
 * v0.3 (B1 — SPEC-R3 2.1): per-user permission overrides (UserPermOverride) +
 * capability gates. Overrides win over role defaults:
 *   pageKey forms — "finance/cheques" (page) | "section:hr" (whole section) | "cap:approveReturns" (capability)
 * OWNER/ADMIN (super roles) cannot be denied pages (caps can still be granted extra);
 * super roles always keep every capability unless… they always keep them (deny is a no-op for supers).
 */
import { db } from '@/lib/db'

export const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC'] // isManager()

/** super roles — can never be denied a page and always pass every capability */
export const SUPER_ROLES = ['OWNER', 'GM', 'ADMIN']

export interface AccessUser {
  id: string
  role: string
}

function allowed(role: string | undefined | null, roles: string[]): boolean {
  if (!role) return false
  if (roles.includes('*')) return true
  return SUPER_ROLES.includes(role) || roles.includes(role)
}

export const STORE_ROLES = {
  floorplan: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
  planograms: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'MERCH', 'SK'],
  zones: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'MERCH', 'SK'],
  pricecheck: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  waste: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
}

export const canFloorplan = (role?: string | null) => allowed(role, STORE_ROLES.floorplan)
export const canPlanogram = (role?: string | null) => allowed(role, STORE_ROLES.planograms)
export const canZones = (role?: string | null) => allowed(role, STORE_ROLES.zones)
export const canPriceCheck = (role?: string | null) => allowed(role, STORE_ROLES.pricecheck)
export const canWaste = (role?: string | null) => allowed(role, STORE_ROLES.waste)

/** hr/personnel page: OWNER/GM/ADMIN only */
export const canPersonnel = (role?: string | null) => !!role && ['OWNER', 'GM', 'ADMIN'].includes(role)
/** hr/shifts page: OWNER/GM/ADMIN/EXEC */
export const canShifts = (role?: string | null) => !!role && ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(role)
/** hr/leaves page: everyone (self-service + manager approvals) */
export const canLeaves = (role?: string | null) => !!role
/** hr/payroll page: OWNER/GM/ADMIN (managePayroll capability) */
export const canPayroll = (role?: string | null) => !!role && ['OWNER', 'GM', 'ADMIN'].includes(role)

/** reports section: OWNER/GM/ADMIN/EXEC/ACC/PM */
export const canReports = (role?: string | null) => allowed(role, ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'])

/** system section: OWNER/GM/ADMIN */
export const canSystem = (role?: string | null) => !!role && ['OWNER', 'GM', 'ADMIN'].includes(role)
/** admin/settings PUT: OWNER/ADMIN (live client gate) */
export const canSettingsWrite = (role?: string | null) => !!role && ['OWNER', 'ADMIN'].includes(role)

// ====================================================================
// v0.3 (B1) — RBAC registry mirror (chunk module 200150 + new R3 pages)
// ====================================================================

/** section → default roles ('*' = everyone) — mirrors canAccessWorkspace */
export const SECTION_DEFAULTS: Record<string, string[]> = {
  home: ['*'],
  tasks: ['*'],
  store: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH', 'SALES'],
  supply: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM', 'SK', 'HC'],
  returns: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'CASHIER'],
  profit: ['OWNER', 'GM', 'ADMIN', 'ACC'],
  finance: ['OWNER', 'GM', 'ADMIN', 'ACC'],
  hr: ['*'],
  crm: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'SALES', 'HC'],
  reports: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
  system: ['OWNER', 'GM', 'ADMIN'],
}

/** page → default roles — mirrors canAccessPage; pages absent here fall back to SECTION_DEFAULTS */
export const PAGE_DEFAULTS: Record<string, string[]> = {
  // ---- live chunk page map (verbatim) ----
  'supply/orders': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'ACC'],
  'supply/receiving': ['*'], // R11: دریافت کالا برای همهٔ کارکنان (مالک: «همه باید بتوانند دریافت و تأیید کنند» — با اصل دو‌نفره سمت سرور)
  'supply/products': ['*'],
  'supply/suppliers': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM', 'SK', 'HC'],
  'returns/approvals': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'returns/payments': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'returns/customers': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'HC'],
  'profit/stats': ['OWNER', 'GM', 'ADMIN', 'ACC'],
  'finance/cheques': ['OWNER', 'GM', 'ADMIN', 'ACC'],
  'finance/payments': ['OWNER', 'GM', 'ADMIN', 'ACC'],
  'hr/payroll': ['OWNER', 'GM', 'ADMIN'],
  'hr/personnel': ['OWNER', 'GM', 'ADMIN'],
  'hr/shifts': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'hr/leaves': ['*'],
  'store/floorplan': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
  'store/planograms': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'MERCH', 'SK'],
  'store/zones': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'MERCH', 'SK'],
  'store/pricecheck': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  'store/waste': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
  'crm/campaigns': ['OWNER', 'GM', 'ADMIN'],
  'system/users': ['OWNER', 'GM', 'ADMIN'],
  'system/settings': ['OWNER', 'GM', 'ADMIN'],
  'tasks/attendance': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  'store/reviews': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  'store/stockcount': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK'],
  'hr/performance': ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  // R5-E: MERCH (نیروی چیدمان) — تابلوی «ردیف‌های نیازمند شارژ» در نقشهٔ زنده
  'store/liveboard': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
  'system/activity': ['OWNER', 'GM', 'ADMIN'],
  // ---- R3 hz-ext views (same defaults as the sections they live in) ----
  'home/home': ['*'],
  'home/guide': ['*'],
  'home/account': ['*'],
  'system/holoo': ['OWNER', 'GM', 'ADMIN'],
  'tasks/reports': ['*'],
  'tasks/problems': ['*'],
  'tasks/tasks': ['*'],
  'tasks/checklists': ['*'],
  'tasks/sops': ['*'],
  'tasks/messages': ['*'],
  'tasks/feedback': ['*'],
  'tasks/wall': ['*'],
  'returns/new': ['*'],
  'returns/history': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'CASHIER'],
  'profit/builder': ['OWNER', 'GM', 'ADMIN', 'ACC', 'EXEC', 'PM'],
  'profit/history': ['OWNER', 'GM', 'ADMIN', 'ACC'],
  'reports/briefing': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
  'reports/overview': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
  'reports/exports': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'],
  'crm/customers': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'SALES', 'HC'],
  // ---- R4 hz-ext views (R4-6: staff legal documents + compact leaves) ----
  'hr/hrdocs': ['OWNER', 'GM', 'ADMIN'],
  // ---- R4-5: unified SMS/messaging center ----
  'system/smscenter': ['OWNER', 'GM', 'ADMIN'],
  // ---- R4-7: snapshot & reset (پشتیبان و بازنشانی داده) ----
  'system/data': ['OWNER', 'GM', 'ADMIN'],
}

/** capability → default roles — mirrors hasCap (module 200150) */
export const CAP_DEFAULTS: Record<string, string[]> = {
  approveReturns: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  recordReturnPayment: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  approveOrders: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC'],
  verifyReceiving: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'SK'],
  managePayroll: ['OWNER', 'GM', 'ADMIN'],
  manageUsers: ['OWNER', 'GM', 'ADMIN'],
  signCheques: ['OWNER', 'GM'],
  managePlanograms: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  confirmZoneCounts: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  answerUrgent: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
  manageChecklists: ['OWNER', 'GM', 'ADMIN', 'EXEC'],
}

export interface PermOverrideLike {
  userId: string
  pageKey: string
  allow: boolean
}

export interface EffectiveAccess {
  pageDeny: string[]
  pageAllow: string[]
  caps: Record<string, boolean>
}

interface ResolvedSets {
  specificDeny: Set<string>
  specificAllow: Set<string>
  sectionDeny: Set<string>
  sectionAllow: Set<string>
}

function resolveSets(role: string, overrides: PermOverrideLike[]): ResolvedSets {
  const isSuper = SUPER_ROLES.includes(role)
  const sets: ResolvedSets = {
    specificDeny: new Set(),
    specificAllow: new Set(),
    sectionDeny: new Set(),
    sectionAllow: new Set(),
  }
  for (const o of overrides) {
    if (o.pageKey.startsWith('cap:')) continue // handled by computeCaps
    if (o.pageKey.startsWith('section:')) {
      const sec = o.pageKey.slice('section:'.length)
      if (!(sec in SECTION_DEFAULTS)) continue
      if (o.allow) sets.sectionAllow.add(sec)
      else if (!isSuper) sets.sectionDeny.add(sec) // supers cannot be denied
    } else {
      if (o.allow) sets.specificAllow.add(o.pageKey)
      else if (!isSuper) sets.specificDeny.add(o.pageKey)
    }
  }
  return sets
}

function sectionPages(section: string): string[] {
  return Object.keys(PAGE_DEFAULTS).filter((k) => k.split('/')[0] === section)
}

/** pages denied/allowed for a role + its overrides (concrete page keys, sections expanded) */
export function computeAccess(role: string, overrides: PermOverrideLike[]): EffectiveAccess {
  const sets = resolveSets(role, overrides)
  const pageDeny = new Set<string>(sets.specificDeny)
  const pageAllow = new Set<string>(sets.specificAllow)
  for (const sec of sets.sectionDeny) for (const p of sectionPages(sec)) pageDeny.add(p)
  for (const sec of sets.sectionAllow) {
    for (const p of sectionPages(sec)) {
      if (!pageDeny.has(p)) pageAllow.add(p) // specific deny beats section allow
    }
  }
  // drop allowed keys that are explicitly denied (specific wins)
  for (const p of sets.specificDeny) pageAllow.delete(p)
  return {
    pageDeny: [...pageDeny],
    pageAllow: [...pageAllow],
    caps: computeCaps(role, overrides),
  }
}

/** effective capabilities: role defaults + cap: overrides (allow grants, deny blocks non-supers) */
export function computeCaps(role: string, overrides: PermOverrideLike[]): Record<string, boolean> {
  const isSuper = SUPER_ROLES.includes(role)
  const caps: Record<string, boolean> = {}
  const capOverrides = new Map<string, boolean>()
  for (const o of overrides) {
    if (!o.pageKey.startsWith('cap:')) continue
    capOverrides.set(o.pageKey.slice('cap:'.length), o.allow)
  }
  for (const [cap, roles] of Object.entries(CAP_DEFAULTS)) {
    if (isSuper) {
      caps[cap] = true // super-roles keep all caps
      continue
    }
    const ov = capOverrides.get(cap)
    caps[cap] = ov !== undefined ? ov : roles.includes(role)
  }
  return caps
}

/** Load a user's overrides + effective access (db-backed). */
export async function effectiveAccess(user: AccessUser): Promise<EffectiveAccess> {
  const overrides = await db.userPermOverride.findMany({ where: { userId: user.id } })
  return computeAccess(user.role, overrides)
}

/**
 * Page gate used by page-data routes (SPEC-R3 2.1):
 * super → pass; specific deny → block; specific allow → pass; section deny → block;
 * section allow → pass; otherwise role defaults (page map, else section map).
 */
export async function assertPageAccess(
  user: AccessUser,
  pageKey: string,
): Promise<{ ok: boolean; deny: string }> {
  const role = user?.role ?? ''
  const isSuper = SUPER_ROLES.includes(role)
  if (isSuper) return { ok: true, deny: '' }
  const overrides = await db.userPermOverride.findMany({ where: { userId: user.id } })
  const sets = resolveSets(role, overrides)
  const section = pageKey.includes('/') ? pageKey.split('/')[0] : ''
  if (sets.specificDeny.has(pageKey)) return { ok: false, deny: 'دسترسی به این بخش برای شما فعال نیست' }
  if (sets.specificAllow.has(pageKey)) return { ok: true, deny: '' }
  if (section && sets.sectionDeny.has(section)) return { ok: false, deny: 'دسترسی به این بخش برای شما فعال نیست' }
  if (section && sets.sectionAllow.has(section)) return { ok: true, deny: '' }
  const pageRoles = PAGE_DEFAULTS[pageKey]
  if (pageRoles) {
    const pass = pageRoles.includes('*') || pageRoles.includes(role)
    return { ok: pass, deny: pass ? '' : 'دسترسی به این بخش برای شما فعال نیست' }
  }
  const sectionRoles = section ? SECTION_DEFAULTS[section] : undefined
  if (sectionRoles) {
    const pass = sectionRoles.includes('*') || sectionRoles.includes(role)
    return { ok: pass, deny: pass ? '' : 'دسترسی به این بخش برای شما فعال نیست' }
  }
  return { ok: false, deny: 'دسترسی به این بخش برای شما فعال نیست' }
}

/** Capability gate: role default OR cap:allow override; cap:deny blocks non-super roles. */
export async function userCan(user: AccessUser, cap: string): Promise<boolean> {
  const role = user?.role ?? ''
  if (SUPER_ROLES.includes(role)) return true
  const defaults = CAP_DEFAULTS[cap]
  if (!defaults) return false
  const ov = await db.userPermOverride.findUnique({
    where: { userId_pageKey: { userId: user.id, pageKey: `cap:${cap}` } },
  })
  if (ov) return ov.allow
  return defaults.includes(role)
}

// ---- user-object capability helpers (SPEC-R3 2.1 — old role-string helpers stay above) ----

export async function canApproveReturnsUser(user: AccessUser): Promise<boolean> {
  return userCan(user, 'approveReturns')
}
export async function canRecordReturnPaymentUser(user: AccessUser): Promise<boolean> {
  return userCan(user, 'recordReturnPayment')
}
export async function canApproveOrdersUser(user: AccessUser): Promise<boolean> {
  return userCan(user, 'approveOrders')
}
export async function canSignChequesUser(user: AccessUser): Promise<boolean> {
  return userCan(user, 'signCheques')
}

/** validate an override pageKey: known page | section:<known> | cap:<known> */
export function isValidPermKey(pageKey: string): boolean {
  if (pageKey.startsWith('section:')) return pageKey.slice('section:'.length) in SECTION_DEFAULTS
  if (pageKey.startsWith('cap:')) return pageKey.slice('cap:'.length) in CAP_DEFAULTS
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pageKey)) return false
  return pageKey in PAGE_DEFAULTS
}
