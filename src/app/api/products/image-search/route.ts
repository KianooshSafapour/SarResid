import { fail, getSessionUser, json } from '@/lib/api-helpers'
import { spawn } from 'child_process'

/**
 * Search the internet for product photos via z-ai image-search CLI.
 * Returns OSS-hosted stable URLs the user can pick from.
 */
export async function POST(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return fail('ابتدا وارد شوید', 401)
  const { query } = await req.json()
  if (!query || !String(query).trim()) return fail('عبارت جستجو را وارد کنید')

  const q = `${String(query).trim()} محصول بسته‌بندی`
  const result = await new Promise<any>((resolve) => {
    const proc = spawn('z-ai', ['image-search', '-q', q, '--count', '6', '--no-rank'], {
      timeout: 150000,
    })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d.toString()))
    proc.stderr.on('data', (d) => (err += d.toString()))
    proc.on('close', () => {
      try {
        const start = out.indexOf('{')
        resolve(JSON.parse(start >= 0 ? out.slice(start) : out))
      } catch {
        resolve({ success: false, results: [], error: err || 'parse error' })
      }
    })
    proc.on('error', (e) => resolve({ success: false, results: [], error: e.message }))
  })

  if (!result.success) {
    return json({ images: [], error: result.error || 'جستجوی تصویر ناموفق بود' })
  }
  const images = (result.results || []).map((r: any) => ({
    url: r.original_url,
    source: r.source || '',
    width: r.original_width || '',
    height: r.original_height || '',
  }))
  return json({ images })
}
