/** Server-side RBAC engine — custom roles (multi-role users) + caps + exec bypass.
 *  نقش‌های اجرایی (OWNER/GM/OM/ADMIN) همیشه دسترسی کامل دارند و قابل محدودکردن نیستند.
 *  round-16: گیت لایسنس ماژولار — viewهای ماژولیِ بدون اشتراک فعال قفل‌اند (به‌جز سندباکس و founder). */
import { db } from '@/lib/db'
import { isSandboxActive } from '@/lib/db'
import { safeParse } from '@/lib/api-helpers'
import { BUILTIN_ROLES, VIEW_ACCESS, canAccess, isExecRole } from '@/lib/constants'
import type { SessionUser } from '@/lib/api-helpers'
import { viewLicensed, parseLicense, type LicenseState } from '@/lib/license'
import { todayIso } from '@/lib/jalali'

/* ── کش لایسنس (۳۰ ثانیه) ── */
let licCache: { at: number; lic: LicenseState } | null = null
export function invalidateLicenseCache() {
  licCache = null
}
export async function currentLicense(): Promise<LicenseState> {
  if (licCache && Date.now() - licCache.at < 30_000) return licCache.lic
  let lic = parseLicense(undefined)
  try {
    const row = await db.setting.findUnique({ where: { key: 'license.state' } })
    lic = parseLicense(row?.value)
  } catch {
    lic = parseLicense(undefined)
  }
  licCache = { at: Date.now(), lic }
  return lic
}

export type RolePerms = { views: string[]; caps: string[] }

type CacheEntry = { at: number; map: Map<string, RolePerms> }
let roleCache: CacheEntry | null = null
const CACHE_TTL = 30_000 // 30s — edits in Admin take effect within half a minute at worst

export function invalidateRoleCache() {
  roleCache = null
}

async function loadRoleMap(): Promise<Map<string, RolePerms>> {
  if (roleCache && Date.now() - roleCache.at < CACHE_TTL) return roleCache.map
  const rows = await db.role.findMany({ where: { active: true } })
  const map = new Map<string, RolePerms>()
  // builtin roles carry their constant caps; DB rows may refine them
  for (const b of BUILTIN_ROLES) {
    map.set(b.key, { views: b.views || [], caps: b.caps })
  }
  for (const r of rows) {
    const p = safeParse<RolePerms>(r.permissions, { views: [], caps: [] })
    const prev = map.get(r.key) || { views: [], caps: [] }
    map.set(r.key, {
      views: Array.from(new Set([...prev.views, ...p.views])),
      caps: Array.from(new Set([...prev.caps, ...p.caps])),
    })
  }
  roleCache = { at: Date.now(), map }
  return map
}

/** همهٔ نقش‌های مؤثر کاربر: نقش اصلی + secondaryRoles + roleIds */
export function userRoleKeys(user: Pick<SessionUser, 'role' | 'secondaryRoles' | 'roleIds'>): string[] {
  const ids = safeParse<string[]>(user.roleIds || '[]', [])
  return Array.from(new Set([user.role, ...user.secondaryRoles, ...ids]))
}

export async function getEffectivePerms(user: Pick<SessionUser, 'role' | 'secondaryRoles' | 'roleIds'>): Promise<{ views: Set<string>; caps: Set<string> }> {
  const map = await loadRoleMap()
  const views = new Set<string>()
  const caps = new Set<string>()
  for (const key of userRoleKeys(user)) {
    const p = map.get(key)
    if (!p) continue
    if (p.views.includes('*')) views.add('*')
    for (const v of p.views) views.add(v)
    if (p.caps.includes('*')) caps.add('*')
    for (const c of p.caps) caps.add(c)
  }
  return { views, caps }
}

/** آیا کاربر به view دسترسی دارد؟ (سندباکس ⇄ لایسنس ⇄ بای‌پس اجرایی ⇄ VIEW_ACCESS ⇄ نقش‌های سفارشی) */
export async function canViewApi(
  user: (Pick<SessionUser, 'role' | 'secondaryRoles' | 'roleIds'> & { id: string }) | null,
  view: string
): Promise<boolean> {
  if (!user) return false
  // سندباکس دمو — همهٔ ماژول‌ها آزادند تا خریدار بتواند همه‌چیز را امتحان کند
  if (isSandboxActive()) return true
  // گیت لایسنس ماژولار (founder/هسته همیشه باز)
  const lic = await currentLicense()
  const v = viewLicensed(lic, view, todayIso())
  if (!v.ok) return false
  if (isExecRole(user.role)) return true
  if (canAccess(view, user.role, user.secondaryRoles)) return true
  const { views } = await getEffectivePerms(user)
  return views.has('*') || views.has(view)
}

/** آیا کاربر cap مشخصی دارد؟ */
export async function hasCap(
  user: (Pick<SessionUser, 'role' | 'secondaryRoles' | 'roleIds'>) | null,
  cap: string
): Promise<boolean> {
  if (!user) return false
  if (isExecRole(user.role)) return true
  const { caps } = await getEffectivePerms(user)
  return caps.has('*') || caps.has(cap)
}

/** ترکیب سریع: گارد API با پیام فارسی */
export async function guardCap(
  user: Pick<SessionUser, 'role' | 'secondaryRoles' | 'roleIds'> | null,
  cap: string
): Promise<string | null> {
  if (!user) return 'ابتدا وارد شوید'
  if (await hasCap(user, cap)) return null
  return 'دسترسی لازم را ندارید'
}

/** بخش‌هایی که «فقط» از طریق نقش‌های سفارشی (roleIds) باز می‌شوند — برای فیلتر ناوبری سمت کلاینت */
export async function extraViewsFor(
  user: Pick<SessionUser, 'role' | 'secondaryRoles' | 'roleIds'> | null
): Promise<string[]> {
  if (!user) return []
  const { views } = await getEffectivePerms(user)
  const result: string[] = []
  for (const v of views) {
    if (v === '*') return ['*']
    if (!canAccess(v, user.role, user.secondaryRoles)) result.push(v)
  }
  return result
}
