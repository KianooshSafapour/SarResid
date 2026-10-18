import { NextResponse } from 'next/server'
import { ok } from '@/lib/api'
import { SESSION_COOKIE } from '@/lib/auth'

export async function POST() {
  const res = ok({ done: true })
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
