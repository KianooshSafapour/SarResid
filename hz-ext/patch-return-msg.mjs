/**
 * hz-ext/patch-return-msg.mjs — R10-MSG
 * «پیام به مشتری» در مودال «ثبت پرداخت» (PaymentForm = تابع R) در صفحهٔ
 * «در انتظار تایید و پرداخت» (چانکِ منجمد 03279e393cf0183f.js).
 *
 * داخل تابع R سه وصلهٔ جراحیِ یکتا (هر کدام فقط ۱ بار در چانک):
 *  R1) ابتدای بدنهٔ R — استیت‌های پیام/موبایل/باز + useEffect که
 *      /api/returns/{id} و /api/return-templates را می‌گیرد، الگوی همان علت
 *      (با جایگزین «*») را با مقادیر مشتری/مبلغ/کد/تاریخ رندر می‌کند.
 *  R2) نخستین فرزندِ div فرم (پیش از گرید بانک/تاریخ) — بخشِ جمع‌شوندهٔ
 *      «پیام به مشتری»: textarea قابل ویرایش + شمارندهٔ ۷۰۰ نویسه +
 *      دکمهٔ «ارسال پیامک» (غیرفعال اگر موبایل مشتری نیست).
 *  R3) بدنهٔ POST /api/returns/{id}/payment — افزودن customerMsg (متن نهایی
 *      textarea) تا در note پرداخت بایگانی شود (سمت سرور ≤۷۰۰ نویسه).
 *
 * فقط چانک 03279e393cf0183f.js (صفحهٔ در انتظار تایید و پرداخت).
 * Idempotent: اگر نشانی /api/return-templates در چانک بود، رد می‌شود.
 * از کمک‌تابع‌های خودِ همان ماژول استفاده می‌کند (a.useState/useEffect،
 * s.api، v.toast، t.jsx/jsxs، n.faMoney، l.toFaDigits/todayJalali،
 * h.Button، w.Landmark) — بدون هیچ import جدید.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CHUNK = join(ROOT, 'public', '_next', 'static', 'chunks', '03279e393cf0183f.js')

const DONE_MARKER = '"/api/return-templates"'

/* R1 — استیت‌ها + افکت + hzSend (String.raw: بک‌اسلش‌ها literal می‌مانند) */
const INJ_HEAD = String.raw`
var hz1=(0,a.useState)(""),hzMsg=hz1[0],hzSetMsg=hz1[1],
hz2=(0,a.useState)(""),hzPh=hz2[0],hzSetPh=hz2[1],
hz3=(0,a.useState)(!0),hzOp=hz3[0],hzSetOp=hz3[1],
hz4=(0,a.useState)(!1),hzSnd=hz4[0],hzSetSnd=hz4[1];
(0,a.useEffect)(function(){(async function(){
var rd=null;
try{var q1=await(0,s.api)("/api/returns/"+e);q1.ok&&q1.data&&q1.data.return&&(rd=q1.data.return)}catch(e1){}
var rsn=rd&&rd.reason?String(rd.reason):"سایر",
    nm=rd&&rd.customerName?String(rd.customerName):"مشتری";
hzSetPh(rd&&rd.customerPhone?String(rd.customerPhone||""):"");
var list=[],tpl=null;
try{var q2=await(0,s.api)("/api/return-templates");q2.ok&&q2.data&&q2.data.items&&(list=q2.data.items)}catch(e2){}
tpl=list.find(function(it){return it.enabled&&it.reason===rsn})||null;
if(!tpl)tpl=list.find(function(it){return it.enabled&&it.reason==="*"})||null;
var bb=tpl?String(tpl.body||""):"",
    txt=bb.replace(/\{مشتری\}/g,nm).replace(/\{مبلغ\}/g,(0,n.faMoney)(r)).replace(/\{کد\}/g,rd&&rd.code?String(rd.code):"—").replace(/\{تاریخ\}/g,(0,l.toFaDigits)((0,l.todayJalali)())).replace(/\{علت\}/g,rsn).replace(/\{بانک\}/g,d||"—").replace(/\{شماره‌یگیری\}/g,N&&N.trim()?N.trim():"—").replace(/\{شماره‌پیگیری\}/g,N&&N.trim()?N.trim():"—");
hzSetMsg(txt.slice(0,700))
})();},[e]);
var hzSend=async function(){
if(!hzMsg||!hzMsg.trim())return void v.toast.error("متن پیام خالی است");
if(!hzPh)return void v.toast.error("شمارهٔ موبایل مشتری ثبت نشده است");
hzSetSnd(!0);
var q3=null;
try{q3=await(0,s.api)("/api/sms/send",{method:"POST",body:{text:hzMsg.trim().slice(0,700),to:Array.of(hzPh),reason:"RETURN_CUSTOMER"}})}catch(e3){}
hzSetSnd(!1);
q3&&q3.ok?v.toast.success("پیامک برای مشتری ارسال شد"):v.toast.error(q3&&q3.error?q3.error:"ارسال پیامک ناموفق بود")
};
`

/* R2 — بلوک JSX به‌عنوان نخستین فرزندِ div فرم */
const INJ_JSX = String.raw`
(0,t.jsxs)("div",{className:"rounded-lg border bg-muted p-3 space-y-2",children:[
(0,t.jsxs)("button",{type:"button",onClick:function(){hzSetOp(!hzOp)},className:"flex w-full items-center justify-between gap-2 text-xs font-bold text-stone-600",children:[
(0,t.jsxs)("span",{className:"flex items-center gap-1",children:[(0,t.jsx)(w.Landmark,{className:"w-4 h-4 text-teal-700"}),"پیام به مشتری"]}),
(0,t.jsx)("span",{className:"text-xs font-normal text-stone-400",children:hzOp?"بستن":"نمایش"})]}),
hzOp?(0,t.jsxs)("div",{className:"space-y-2",children:[
(0,t.jsx)("textarea",{className:"w-full rounded-md border border-input py-2 px-3 text-sm leading-6 resize",dir:"rtl",rows:4,maxLength:700,value:hzMsg,onChange:function(ev){hzSetMsg(String(ev.target.value||"").slice(0,700))},placeholder:"متن پیام به مشتری (قابل ویرایش)…"}),
(0,t.jsxs)("div",{className:"flex flex-wrap items-center justify-between gap-2",children:[
(0,t.jsx)("span",{className:"text-xs text-stone-500",children:(0,l.toFaDigits)(String(hzMsg.length))+" / ۷۰۰"}),
(0,t.jsxs)(h.Button,{type:"button",variant:"outline",size:"sm",disabled:hzSnd||!hzPh,onClick:hzSend,className:"gap-1",children:[hzSnd?"در حال ارسال…":hzPh?"ارسال پیامک به مشتری":"شمارهٔ موبایل ثبت نشده"]})
]})]}):null
]}),
`

const ANCHOR_HEAD = 'function R({returnId:e,amount:r,onDone:i}){let[d,c]'
const HEAD_NEW = 'function R({returnId:e,amount:r,onDone:i}){' + INJ_HEAD + 'let[d,c]'

const ANCHOR_CHILD =
  'return(0,t.jsxs)("div",{className:"space-y-3",children:[(0,t.jsxs)("div",{className:"grid gap-3 sm:grid-cols-2"'
const CHILD_NEW =
  'return(0,t.jsxs)("div",{className:"space-y-3",children:[' + INJ_JSX + ',(0,t.jsxs)("div",{className:"grid gap-3 sm:grid-cols-2"'

const ANCHOR_PAY = 'transferredAt:y}});D(!1)'
const PAY_NEW = 'transferredAt:y,customerMsg:hzMsg||void 0}});D(!1)'

function main() {
  let src
  try {
    src = readFileSync(CHUNK, 'utf8')
  } catch {
    console.error('✗ 03279e393cf0183f.js: not found')
    process.exit(1)
  }

  if (src.includes(DONE_MARKER)) {
    console.log('  = 03279e393cf0183f.js: return-msg preview already patched')
    return
  }

  const jobs = [
    [ANCHOR_HEAD, HEAD_NEW, 'state+effect+hzSend injected at top of PaymentForm R'],
    [ANCHOR_CHILD, CHILD_NEW, '«پیام به مشتری» block injected as first form child'],
    [ANCHOR_PAY, PAY_NEW, 'customerMsg appended to payment POST body'],
  ]
  for (const [anchor, replacement, label] of jobs) {
    const n = src.split(anchor).length - 1
    if (n !== 1) {
      console.error(`✗ 03279e393cf0183f.js: anchor for "${label}" found ${n}× (expected 1) — chunk format changed?`)
      process.exit(1)
    }
    src = src.replace(anchor, replacement)
    console.log(`  + 03279e393cf0183f.js: ${label}`)
  }

  writeFileSync(CHUNK, src)
  console.log('✓ return-msg patches applied (chunk 03279e393cf0183f.js)')
}

main()
