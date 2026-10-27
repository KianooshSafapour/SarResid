# R15 — returns→crm reorg: manifest, access.ts, shell shim, view links, users tree
import io, json, collections, re

# ── 1) build.mjs: register patch ──
p = 'hz-ext/build.mjs'
s = io.open(p, encoding='utf-8').read()
if "patch-returns-to-crm" not in s:
    s = s.replace("  await import('./patch-access-all.mjs')", "  await import('./patch-access-all.mjs')\n  await import('./patch-returns-to-crm.mjs')")
    io.open(p, 'w', encoding='utf-8').write(s)
print('build.mjs ok')

# ── 2) manifest: returns/new → crm/new ──
p = 'hz-ext/manifest.json'
m = json.load(io.open(p, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
for v in m['views']:
    if v['key'] == 'returns/new':
        v['key'] = 'crm/new'
        v['section'] = 'crm'
io.open(p, 'w', encoding='utf-8').write(json.dumps(m, ensure_ascii=False, indent=1))
print('manifest ok')

# ── 3) access.ts ──
p = 'src/lib/access.ts'
s = io.open(p, encoding='utf-8').read()
old_sec = """  returns: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'CASHIER'],"""
new_sec = """  // R15: بخش «مرجوعی» حذف شد — صفحاتش زیر «فروش و مشتریان» (crm) رفتند"""
assert old_sec in s
s = s.replace(old_sec, new_sec)
s = s.replace("""  crm: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'SALES', 'HC'],""",
"""  crm: ['*'], // R15: فروش و مشتریان — مرجوعی + CRM؛ گیت واقعی صفحه‌به‌صفحه سمت سرور""")
for old, new in [
    ("'returns/approvals': ['OWNER', 'GM', 'ADMIN', 'EXEC']", "'crm/approvals': ['OWNER', 'GM', 'ADMIN', 'EXEC']"),
    ("'returns/payments': ['OWNER', 'GM', 'ADMIN', 'EXEC']", "'crm/payments': ['OWNER', 'GM', 'ADMIN', 'EXEC']"),
    ("'returns/customers': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'HC']", "'crm/notebook': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'SALES', 'CASHIER']"),
    ("'returns/new': ['*']", "'crm/new': ['*']"),
    ("'returns/history': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'CASHIER']", "'crm/history': ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'HC', 'CASHIER']"),
]:
    assert old in s, old
    s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('access.ts ok')

# ── 4) API gates ──
for p, pairs in [
    ('src/app/api/returns/route.ts', [("'returns/approvals'", "'crm/approvals'"), ("'returns/history'", "'crm/history'")]),
    ('src/app/api/return-customers/route.ts', [("'returns/customers'", "'crm/notebook'")]),
]:
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        if old in s:
            s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8').write(s)
print('api gates ok')

# ── 5) shell.html redirect shim ──
p = 'src/app/shell.html'
s = io.open(p, encoding='utf-8').read()
if 'returns2crm' not in s:
    shim = """
<!-- R15: بازهدایش بخش قدیمی «مرجوعی» → «فروش و مشتریان» (crm) — لینک‌های فروزن را هم می‌گیرد
     returns/new|history|approvals|payments → crm/… · returns/customers → crm/notebook -->
<script id="returns2crm">
(function () {
  var MAP = { new: 'crm/new', history: 'crm/history', approvals: 'crm/approvals', payments: 'crm/payments', customers: 'crm/notebook' };
  function fix() {
    var m = (location.hash || '').match(/^#\/returns\/([a-z]+)(\?.*)?$/);
    if (!m) return;
    var to = MAP[m[1]];
    if (!to) return;
    var next = '#/' + to + (m[2] || '');
    try { location.replace(next); } catch (e) { location.hash = next; }
  }
  window.addEventListener('hashchange', fix);
  fix();
})();
</script>
"""
    # درج پیش از </head>
    s = s.replace('</head>', shim + '</head>')
    io.open(p, 'w', encoding='utf-8').write(s)
print('shim ok')

# ── 6) view links ──
for p in ['hz-ext/src/views/dashboard.tsx', 'hz-ext/src/views/handover.tsx', 'hz-ext/src/views/returns.tsx', 'hz-ext/src/views/users.tsx']:
    s = io.open(p, encoding='utf-8').read()
    o = s
    s = s.replace("'returns/new'", "'crm/new'").replace("'returns/history'", "'crm/history'").replace("'returns/approvals'", "'crm/approvals'").replace("'returns/payments'", "'crm/payments'").replace("'returns/customers'", "'crm/notebook'")
    s = s.replace('go(\'returns/', 'go(\'crm/')
    if s != o:
        io.open(p, 'w', encoding='utf-8').write(s)
        print('links updated:', p)
