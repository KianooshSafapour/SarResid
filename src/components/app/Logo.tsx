/** لوگوی سررسید (SarResid) — سررسید یعنی دفتر حساب شخصی؛ نشان: دفترچه + برگ زیتون */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#c9a227] to-[#14532d] shadow-lg"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#fffdf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* دفترچهٔ سررسید */}
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M9 3.5v17" />
        <path d="M12.5 9h4M12.5 12.5h4M12.5 16h2.5" />
      </svg>
    </div>
  )
}
