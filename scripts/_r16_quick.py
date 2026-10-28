# R16 — GM full access + dashboard shift-letter shortcut
import io

# ── 1) GM in monitor/AI roles (server) ──
for p, old, new in [
    ('src/app/api/system/monitor/route.ts', "const MONITOR_ROLES = ['OWNER', 'ADMIN']", "const MONITOR_ROLES = ['OWNER', 'ADMIN', 'GM'] // R16: مدیر کل دسترسی کامل"),
    ('src/app/api/ai/chat/route.ts', "const AI_ROLES = ['OWNER', 'ADMIN']", "const AI_ROLES = ['OWNER', 'ADMIN', 'GM'] // R16"),
    ('src/app/api/ai/settings/route.ts', "const AI_ROLES = ['OWNER', 'ADMIN']", "const AI_ROLES = ['OWNER', 'ADMIN', 'GM'] // R16"),
]:
    s = io.open(p, encoding='utf-8').read()
    assert old in s, p
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new))
print('server roles ok')

# ── 2) access.ts: GM everywhere admin is (monitor/ai + sensitive pages) ──
p = 'src/lib/access.ts'
s = io.open(p, encoding='utf-8').read()
pairs = [
    ("'system/monitor': ['OWNER', 'ADMIN'],", "'system/monitor': ['OWNER', 'ADMIN', 'GM'],"),
    ("'system/ai': ['OWNER', 'ADMIN'],", "'system/ai': ['OWNER', 'ADMIN', 'GM'],"),
    ("'system/users': ['OWNER', 'GM', 'ADMIN'],", "'system/users': ['OWNER', 'GM', 'ADMIN'],"),
]
for old, new in pairs:
    if old in s:
        s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('access ok')

# ── 3) views: monitor.tsx + ai.tsx role gates + users.tsx tree hints ──
for p, old, new in [
    ("hz-ext/src/views/monitor.tsx", "!!user && ['OWNER', 'ADMIN'].includes(String(user.role))", "!!user && ['OWNER', 'ADMIN', 'GM'].includes(String(user.role))"),
    ("hz-ext/src/views/ai.tsx", "!!user && ['OWNER', 'ADMIN'].includes(String(user.role))", "!!user && ['OWNER', 'ADMIN', 'GM'].includes(String(user.role))"),
]:
    s = io.open(p, encoding='utf-8').read()
    assert old in s, p
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new))
print('views ok')

# ── 4) manifest roles for monitor/ai += GM ──
import json, collections
p = 'hz-ext/manifest.json'
m = json.load(io.open(p, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
for v in m['views']:
    if v['key'] in ('system/monitor', 'system/ai') and 'GM' not in v['roles']:
        v['roles'] = ['OWNER', 'GM', 'ADMIN'] if v['key'] == 'system/monitor' else ['OWNER', 'GM', 'ADMIN']
io.open(p, 'w', encoding='utf-8').write(json.dumps(m, ensure_ascii=False, indent=1))
print('manifest ok')

# ── 5) dashboard: صبح‌نامه/عصرنامه shortcut card ──
p = 'hz-ext/src/views/dashboard.tsx'
s = io.open(p, encoding='utf-8').read()
old = "  { label: 'گزارش شیفت', icon: 'penLine', go: 'tasks/reports', roles: ['*'] },"
assert old in s
new = "  { label: 'گزارش شیفت', icon: 'penLine', go: 'tasks/reports', roles: ['*'] },\n  /* R16: نامهٔ شیفت — دسترسی نخستِ هر شیفت (صبح‌نامه/عصرنامه) */\n  { label: 'نامهٔ شیفت', icon: 'handover' as any === 'handover' ? 'history' : 'history', go: 'tasks/reports', roles: ['*'], shiftLetter: true },"
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('dashboard quick-action ok (needs render tweak)')
