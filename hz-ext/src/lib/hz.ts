/**
 * HZ-EXT — shared modules bridge.
 * Imports resolve at build time to `globalThis.__HZ__.*`, populated by the
 * turbopack chunk wrapper via e.i(moduleId) from the live app.
 * ALL module IDs verified against the live chunks (see scripts/checks/module-catalog.json):
 *   react 271645 · jsx 843476 · api 29481 · shell 573254 · cn 975157 · button 519455
 *   input 793479 · jalali 956657 · toast 846696 · dialog 776639 · card 515288
 *   select 967489 · badge 487486 · table 784774 · tabs 677572 · progress 168148
 *   checkbox 257428 · textarea 624687 · popover 337822
 */
import React from 'hz:react'
export { React }
export const { useState, useEffect, useMemo, useRef, useCallback, useReducer, useContext, memo, Fragment } = React as any

export { jsx, jsxs } from 'hz:jsx'
export { api, qs } from 'hz:api'
export { useShell } from 'hz:shell'
export { cn } from 'hz:cn'
export { Button, buttonVariants } from 'hz:button'
export { Input } from 'hz:input'
export { toast } from 'hz:toast'
export {
  JALALI_MONTHS, WEEKDAY_FA, addJalaliDays, formatJalali, formatJalaliLong,
  jalaliMonthLength, jalaliToDate, jalaliWeekStart, jalaliWeekday,
  parseJalali, toEnDigits, toFaDigits, toJalali, todayJalali,
} from 'hz:jalali'
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from 'hz:dialog'
export { Card, CardContent, CardHeader, CardTitle } from 'hz:card'
export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from 'hz:select'
export { Badge } from 'hz:badge'
export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from 'hz:table'
export { Tabs, TabsList, TabsTrigger, TabsContent } from 'hz:tabs'
export { Progress } from 'hz:progress'
export { Checkbox } from 'hz:checkbox'
export { Textarea } from 'hz:textarea'
export { Popover } from 'hz:popover'

export { Icon, I } from './icons'
export {
  JalaliDate, Stepper, TourEngine, mountTour, printHTML, barcode128,
  amountWords, numberToPersianWords, minutesToHM, jsDateToJalali,
  TimeInput, MoneyInput, NumInput, faSlash,
  type TourStep, type TourHandle,
} from './ui'
export { docHTML, printDoc, DocPreview, ensureBrand, brandNow } from './docs'

/** فارسی‌سازی اعداد + جداکننده هزارگان فارسی (٬ U+066C) — مطابق نمونهٔ مالک: ۲۰۵٬۰۰۰
 *  فقط ورودی «عددی» گروه‌بندی می‌شود؛ رشته‌ها (بارکد، شماره چک، تلفن، کد، تاریخ…) فقط فارسی‌سازی می‌شوند.
 *  برای سال (۱۴۰۵) و شناسه‌ها از toFaDigits استفاده کنید. */
export function fa(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return ''
  if (typeof n === 'number') return n.toLocaleString('en-US').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/,/g, '٬')
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
}
/** پول به ریال با جداکنندهٔ فارسی */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '۰'
  return fa(Math.round(n).toLocaleString('en-US'))
}
/** پول به تومان */
export function toman(n: number | null | undefined): string {
  return money((n || 0) / 10)
}
