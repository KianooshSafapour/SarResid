import { readFile } from 'fs/promises'
import path from 'path'
import { fail, getSessionUser, json } from '@/lib/api-helpers'

/** مرکز پژوهش — برگردان پژوهش‌نامه علمی (JSON ساختاریافته + متن فارسی) */
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  try {
    const dir = path.join(process.cwd(), 'src', 'lib', 'research')
    const [fa, en] = await Promise.all([
      readFile(path.join(dir, 'research-supermarket-fa.md'), 'utf-8'),
      readFile(path.join(dir, 'research-supermarket.json'), 'utf-8'),
    ])
    return json({ fa, en: JSON.parse(en) })
  } catch {
    return fail('پژوهش‌نامه یافت نشد', 404)
  }
}
