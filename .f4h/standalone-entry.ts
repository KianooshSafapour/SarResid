/* Standalone entry — exposes the fixed mountTour as window.__mountTour */
import { mountTour } from '../hz-ext/src/lib/ui.tsx'
;(window as any).__mountTour = mountTour
console.log('[mountTour] fixed engine injected')
