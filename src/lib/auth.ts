import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

const SECRET = process.env.SESSION_SECRET || 'hz-sarresid-secret-6677-local'
export const SESSION_COOKIE = 'hz_session'
const SESSION_DAYS = 30

export interface SessionUser {
  id: string
  username: string
  fullName: string
  honorific: string
  role: string
  title: string
  phone: string | null
  mobile: string | null
  address: string | null
  postalCode: string | null
  avatarJson: string | null
  points: number
  active: boolean
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

/** Create signed session token: {random}.{userId}.{sig} */
export function createSessionToken(userId: string): string {
  const rnd = randomBytes(16).toString('base64url')
  const payload = `${rnd}.${userId}`
  return `${payload}.${sign(payload)}`
}

/** Verify + parse session token → userId | null */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [rnd, userId, sig] = parts
  const expected = sign(`${rnd}.${userId}`)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  return userId
}

/** Get current session user from request cookies (route handlers). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  const userId = verifySessionToken(token)
  if (!userId) return null
  const u = await db.user.findUnique({ where: { id: userId } })
  if (!u || !u.active) return null
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    honorific: u.honorific,
    role: u.role,
    title: u.title,
    phone: u.phone,
    mobile: u.mobile,
    address: u.address,
    postalCode: u.postalCode,
    avatarJson: u.avatarJson,
    points: u.points,
    active: u.active,
  }
}

export const sessionCookieOptions = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 3600,
}

/** Role hierarchy helpers */
export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'مدیر عامل',
  GM: 'مدیر کل',
  ADMIN: 'مدیر عملیات و IT',
  EXEC: 'مدیر اجرایی',
  ACC: 'حسابدار',
  PM: 'مدیر محصولات',
  HC: 'صندوقدار ارشد',
  SK: 'انباردار',
  SALES: 'فروشنده',
  CASHIER: 'صندوقدار',
  MERCH: 'نیروی چیدمان',
}

export const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC']
export function isManager(u: SessionUser | null): boolean {
  return !!u && MANAGER_ROLES.includes(u.role)
}
export function isExecRole(u: SessionUser | null): boolean {
  return !!u && (MANAGER_ROLES.includes(u.role) || u.role === 'ACC')
}
