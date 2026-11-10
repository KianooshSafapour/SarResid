'use client'

import { useEffect, useState } from 'react'

export default function SwRegister() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => null)
    }
    const h = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      setTimeout(() => setMsg(''), 3500)
    }
    window.addEventListener('hz-toast', h)
    return () => window.removeEventListener('hz-toast', h)
  }, [])
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null
}
