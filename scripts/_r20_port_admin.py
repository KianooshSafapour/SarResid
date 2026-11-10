# -*- coding: utf-8 -*-
"""port v2 — ساده: تغییر نام کامپوننت اصلی + افزودن پوسته"""
import io, re

SRC = 'src/app/shop-ops'
DST = 'storefront/src/app/admin'

def port(name, src_file, inner):
    src = io.open(f'{SRC}/{src_file}', encoding='utf-8').read()
    src = src.replace("fetch('/api/shop-admin/", "fetch('/api/admin/shop-admin/")
    src = src.replace("fetch(`/api/shop-admin/", "fetch(`/api/admin/shop-admin/")
    src = src.replace("fetch('/api/sms/panels'", "fetch('/api/admin/sms/panels'")
    for a, b in [('ops-field', 'adm-field'), ('ops-btn', 'adm-btn'), ('ops-card', 'adm-card'),
                 ('ops-chip', 'adm-chip'), ('ops-chips', 'adm-chips'), ('ops-toggle', 'adm-toggle'),
                 ('ops-note', 'adm-note'), ('ops-toast', 'adm-toast'), ('ops-table', 'adm-table'),
                 ('ops-empty', 'adm-empty'), ('ops-skel', 'adm-skel'), ('ops-grid2', 'adm-grid')]:
        src = src.replace(a, b)
    src = re.sub(r"className=\"ops-btn (primary )?small\"", 'className="adm-btn sm"', src)
    src = re.sub(r"className=\"ops-btn small danger\"", 'className="adm-btn sm danger"', src)
    src = re.sub(r"className=\"ops-btn danger small\"", 'className="adm-btn sm danger"', src)
    src = re.sub(r"className=\"ops-btn small\"", 'className="adm-btn sm"', src)
    # تغییر نام export اصلی
    m = re.search(r'export default function (\w+)\(\)', src)
    orig = m.group(1)
    src = src.replace(f'export default function {orig}()', f'function {inner}()')
    src = src.replace("'use client'\n", "'use client'\n\nimport AdminShell from '@/components/admin/AdminShell'\n", 1)
    src += f"\nexport default function {name}() {{\n  return <AdminShell><{inner} /></AdminShell>\n}}\n"
    io.open(f'{DST}/{name}/page.tsx', 'w', encoding='utf-8', newline='').write(src)
    print('ported', name, '(', orig, '→', inner, ')')

port('settings', 'settings/settings-client.tsx', 'SettingsInner')
port('categories', 'categories/categories-client.tsx', 'CategoriesInner')
port('products', 'products/products-client.tsx', 'ProductsInner')
port('customers', 'customers/customers-client.tsx', 'CustomersInner')
