declare module 'hz:react' {
  const React: any
  export default React
}
declare module 'hz:jsx' {
  export const jsx: any
  export const jsxs: any
  export const Fragment: any
}
declare module 'hz:api' {
  export function api(url: string, opts?: any): Promise<any>
  export function qs(params: Record<string, any>): string
}
declare module 'hz:shell' {
  export function useShell(): { user: any, go: (route: string) => void, refreshBadges: () => void }
}
declare module 'hz:cn' {
  export function cn(...parts: any[]): string
}
declare module 'hz:button' {
  export const Button: any
  export const buttonVariants: any
}
declare module 'hz:input' {
  export const Input: any
}
declare module 'hz:toast' {
  export const toast: { success: (m: string, o?: any) => void, error: (m: string, o?: any) => void, info: (m: string, o?: any) => void, warning: (m: string, o?: any) => void }
  export const Toaster: any
}
declare module 'hz:jalali' {
  export const JALALI_MONTHS: string[]
  export const WEEKDAY_FA: string[]
  export function addJalaliDays(dash: string, days: number): string
  /** takes a JS Date (runtime module 956657 — verified) */
  export function formatJalali(d: Date): string
  /** takes a JS Date; returns "27 مهر 1405" (LATIN digits — wrap with toFaDigits) */
  export function formatJalaliLong(d: Date): string
  export function jalaliMonthLength(y: number, m: number): number
  /** (jy, jm, jd) → JS Date — 3 NUMBERS, not a dash string */
  export function jalaliToDate(jy: number, jm: number, jd: number): Date
  export function jalaliWeekStart(dash: string): string
  /** dash string → 0..6 (شنبه=0 … جمعه=6) */
  export function jalaliWeekday(dash: string): number
  /** dash string → JS Date (gregorian) — verified live; has getDay/getFullYear */
  export function parseJalali(s: string): Date | null
  export function toEnDigits(s: string): string
  export function toFaDigits(s: string): string
  export function toJalali(d: Date): string
  export function todayJalali(): string
}
declare module 'hz:dialog' {
  export const Dialog: any, DialogContent: any, DialogHeader: any, DialogTitle: any, DialogDescription: any, DialogFooter: any
}
declare module 'hz:card' {
  export const Card: any, CardHeader: any, CardTitle: any, CardContent: any
}
declare module 'hz:select' {
  export const Select: any, SelectTrigger: any, SelectValue: any, SelectContent: any, SelectItem: any
}
declare module 'hz:badge' {
  export const Badge: any
}
declare module 'hz:table' {
  export const Table: any, TableHeader: any, TableBody: any, TableHead: any, TableRow: any, TableCell: any
}
declare module 'hz:tabs' {
  export const Tabs: any, TabsList: any, TabsTrigger: any, TabsContent: any
}
declare module 'hz:progress' {
  export const Progress: any
}
declare module 'hz:checkbox' {
  export const Checkbox: any
}
declare module 'hz:textarea' {
  export const Textarea: any
}
declare module 'hz:popover' {
  export const Popover: any
}
