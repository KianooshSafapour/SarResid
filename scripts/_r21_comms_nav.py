# -*- coding: utf-8 -*-
"""R21 — پچ منوی «ارتباطات» و «فروشگاه آنلاین» در شل سر رسید (بدون دست‌زدن به چانک‌های منجمد)"""
import io

p = 'src/app/shell.html'
s = io.open(p, encoding='utf-8').read()

anchor = '<script data-hz-ux="nav-system">'
assert anchor in s, 'nav-system anchor not found'

patch = r'''<script data-hz-ux="comms-nav">
/* ── R21: بخش «ارتباطات» (گفت‌وگوها + پیامک + ایمیل) و «فروشگاه آنلاین» در نوار بخش‌ها ──
   گفت‌وگوها/پیامک با مسیریابی هش خود SPA می‌روند؛ ایمیل و پنل فروشگاه صفحات کامل سر رسیداند. */
(function(){
  'use strict';
  var SVG_COMMS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path></svg>';
  var SVG_SHOP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';
  var SVG_MAIL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path></svg>';
  var SVG_CHAT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"></path></svg>';
  var panel=null;
  function closePanel(){ if(panel){ panel.remove(); panel=null; } }
  function openPanel(anchorBtn){
    closePanel();
    panel=document.createElement('div');
    panel.setAttribute('data-hz-comms-panel','1');
    panel.dir='rtl';
    panel.style.cssText='position:fixed;z-index:60;background:var(--sidebar,#fafaf9);border:1px solid var(--border,#e7e5e4);border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.14);padding:8px;min-width:230px';
    var r=anchorBtn.getBoundingClientRect();
    if(window.innerWidth>767){ panel.style.top=Math.min(r.bottom+8, window.innerHeight-260)+'px'; panel.style.right=Math.max(8, window.innerWidth-r.right)+'px'; }
    else { panel.style.bottom=(r.height+12)+'px'; panel.style.right='10px'; }
    panel.innerHTML=
      '<div style="font-size:13px;font-weight:800;padding:6px 10px 4px;color:var(--foreground,#292524)">ارتباطات</div>';
    function item(svg,label,fn){
      var b=document.createElement('button');
      b.type='button';
      b.style.cssText='display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;font:inherit;font-size:14px;color:var(--foreground,#292524);padding:10px 10px;border-radius:10px;cursor:pointer;text-align:right';
      b.onmouseenter=function(){ b.style.background='var(--accent,#f5f5f4)'; };
      b.onmouseleave=function(){ b.style.background='none'; };
      b.innerHTML='<span style="width:22px;height:22px;display:inline-flex;color:var(--muted-foreground,#78716c)">'+svg+'</span>'+label;
      b.onclick=function(ev){ ev.preventDefault(); ev.stopPropagation(); closePanel(); fn(); };
      panel.appendChild(b);
    }
    item(SVG_CHAT,'گفت‌وگوها (چت داخلی)',function(){ location.hash='#/messages'; });
    item('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z"></path><path d="M8 9h8"></path><path d="M8 12h5"></path></svg>','مرکز پیامک و اطلاع‌رسانی',function(){ location.hash='#/system/smscenter'; });
    item(SVG_MAIL,'ایمیل (صندوق هایپر زیتون)',function(){ window.location.href='/email'; });
    var sep=document.createElement('div');
    sep.style.cssText='height:1px;background:var(--border,#e7e5e4);margin:6px 6px';
    panel.appendChild(sep);
    var shop=document.createElement('button');
    shop.type='button';
    shop.style.cssText='display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;font:inherit;font-size:14px;font-weight:700;color:#0e7a4a;padding:10px;border-radius:10px;cursor:pointer;text-align:right';
    shop.onmouseenter=function(){ shop.style.background='#eef3ee'; };
    shop.onmouseleave=function(){ shop.style.background='none'; };
    shop.innerHTML='<span style="width:22px;height:22px;display:inline-flex;color:#0e7a4a">'+SVG_SHOP+'</span>فروشگاه آنلاین (سفارش‌ها)';
    shop.onclick=function(ev){ ev.preventDefault(); ev.stopPropagation(); closePanel(); window.location.href='/shop-ops'; };
    panel.appendChild(shop);
    document.body.appendChild(panel);
    setTimeout(function(){
      document.addEventListener('click',function h(e){ if(panel && !panel.contains(e.target)) closePanel(); document.removeEventListener('click',h); });
    },0);
  }
  function injectRail(rail){
    try{
      if(!rail || rail.getAttribute('data-hz-comms')!=null) return;
      rail.setAttribute('data-hz-comms','1');
      function railBtn(svg,label,fn){
        var b=document.createElement('button');
        b.type='button';
        b.title=label; b.setAttribute('aria-label',label);
        b.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;flex-shrink:0;cursor:pointer';
        b.innerHTML='<span style="width:30px;height:30px;display:inline-flex">'+svg+'</span><span style="font-size:12px;line-height:1.3;font-weight:600">'+label+'</span>';
        b.onclick=function(ev){ ev.preventDefault(); ev.stopPropagation(); fn(b); };
        rail.appendChild(b);
      }
      railBtn(SVG_COMMS,'ارتباطات',function(btn){ if(panel) closePanel(); else openPanel(btn); });
      railBtn(SVG_SHOP,'فروشگاه',function(){ window.location.href='/shop-ops'; });
    }catch(e){}
  }
  function scan(root){
    try{
      var rails=document.querySelectorAll('.workspace-rail');
      for(var i=0;i<rails.length;i++) injectRail(rails[i]);
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded',function(){ scan(document); });
  var mo=new MutationObserver(function(){ scan(document); });
  mo.observe(document.documentElement,{childList:true,subtree:true});
})();
</script>'''

s = s.replace(anchor, patch + anchor)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('comms-nav patch injected into shell.html')
