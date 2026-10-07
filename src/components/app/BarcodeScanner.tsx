'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Keyboard, Loader2, X } from 'lucide-react'

/**
 * دوربین اسکن بارکد — با دوربین موبایل بارکد بخوانید.
 * Fallback همیشه فعال است: اگر دوربین نبود/اجازه داده نشد، تایپ دستی کار می‌کند.
 * html5-qrcode به‌صورت داینامیک import می‌شود (سازگار با SSR).
 */

type ScanCb = (code: string) => void

export function openBarcodeScanner(onScan: ScanCb) {
  // سبک‌ترین API: رویداد سراسری — هر جایی که لازم است شنونده ثبت می‌کند
  window.dispatchEvent(new CustomEvent('hz-open-scanner'))
  const handler = (e: Event) => onScan((e as CustomEvent).detail)
  window.addEventListener('hz-scanner-result', handler, { once: true })
  return () => window.removeEventListener('hz-scanner-result', handler)
}

export default function BarcodeScannerHost() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'starting' | 'running' | 'error'>('starting')
  const [errMsg, setErrMsg] = useState('')
  const [manual, setManual] = useState('')
  const regionRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<any>(null)
  const cbRef = useRef<ScanCb | null>(null)

  useEffect(() => {
    const onOpen = () => {
      cbRef.current = (code: string) => {
        window.dispatchEvent(new CustomEvent('hz-scanner-result', { detail: code }))
      }
      setOpen(true)
    }
    window.addEventListener('hz-open-scanner', onOpen)
    return () => window.removeEventListener('hz-open-scanner', onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setState('starting')
    setErrMsg('')
    ;(async () => {
      try {
        const mod = await import('html5-qrcode')
        if (cancelled || !regionRef.current) return
        const scanner = new mod.Html5Qrcode('hz-scan-region', {
          verbose: false,
          formatsToSupport: [
            mod.Html5QrcodeSupportedFormats.EAN_13,
            mod.Html5QrcodeSupportedFormats.EAN_8,
            mod.Html5QrcodeSupportedFormats.UPC_A,
            mod.Html5QrcodeSupportedFormats.UPC_E,
            mod.Html5QrcodeSupportedFormats.CODE_128,
            mod.Html5QrcodeSupportedFormats.CODE_39,
            mod.Html5QrcodeSupportedFormats.ITF,
            mod.Html5QrcodeSupportedFormats.QR_CODE,
          ],
        })
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.4 },
          (decoded: string) => {
            cbRef.current?.(decoded)
            setOpen(false)
          },
          () => {
            /* per-frame decode miss — طبیعی است */
          }
        )
        if (!cancelled) setState('running')
      } catch (e: unknown) {
        if (cancelled) return
        setState('error')
        const msg = e instanceof Error ? e.message : String(e)
        if (/permission|NotAllowed/i.test(msg)) setErrMsg('دسترسی به دوربین داده نشد — از تنظیمات مرورگر اجازه دهید یا دستی وارد کنید')
        else if (/NotFound|no camera/i.test(msg)) setErrMsg('دوربینی پیدا نشد — با تایپ دستی ادامه دهید')
        else setErrMsg('دوربین در این محیط در دسترس نیست — بارکد را دستی وارد کنید')
      }
    })()
    return () => {
      cancelled = true
      const s = scannerRef.current
      if (s) {
        // stop() به‌صورت همگام throw می‌کند اگر دوربین هرگز استارت نخورده باشد
        try {
          s.stop().then(() => s.clear()).catch(() => {})
        } catch {
          /* never started — nothing to stop */
        }
        scannerRef.current = null
      }
    }
  }, [open])

  const submitManual = () => {
    const v = manual.trim()
    if (!v) return
    cbRef.current?.(v)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-label="اسکن بارکد با دوربین">
      <div className="fade-in-up w-full max-w-md rounded-3xl border-2 border-[#c9a227]/60 bg-[#faf7ee] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#0b2e20]">
            <Camera size={18} className="text-[#0e7a4a]" /> اسکن بارکد با دوربین
          </h3>
          <button onClick={() => setOpen(false)} className="rounded-full p-2 transition hover:bg-black/5" aria-label="بستن">
            <X size={18} />
          </button>
        </div>

        <div className="relative overflow-hidden rounded-2xl border-2 border-[#0e7a4a]/30 bg-black/90">
          <div id="hz-scan-region" ref={regionRef} className="mx-auto min-h-[220px] w-full [&_video]:rounded-2xl" />
          {state === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-cream">
              <Loader2 size={28} className="animate-spin text-[#c9a227]" />
              <p className="text-xs font-bold">در حال روشن‌کردن دوربین…</p>
            </div>
          )}
          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b2e20]/95 p-5 text-center">
              <CameraOff size={26} className="text-[#c9a227]" />
              <p className="text-xs font-bold leading-5 text-cream">{errMsg}</p>
            </div>
          )}
          {state === 'running' && (
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-40 -translate-y-1/2 rounded-xl border-2 border-[#c9a227] shadow-[0_0_24px_rgba(201,162,39,0.55)]" />
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-white p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Keyboard size={14} /> یا بارکد را دستی وارد کنید:
          </p>
          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
              placeholder="مثلاً ۶۲۶۰۱۲۳۴۵۶۷۸۹"
              dir="ltr"
              className="flex-1 rounded-xl border-2 border-[#c9a227]/40 px-3 py-2.5 text-sm font-bold outline-none focus:border-[#c9a227]"
              autoFocus
            />
            <button onClick={submitManual} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground transition active:scale-95">
              تأیید
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">
          بارکد روی بسته را داخل کادر نگه دارید — پس از تشخیص، خودکار ثبت می‌شود
        </p>
      </div>
    </div>
  )
}
