#!/usr/bin/env python3
"""
Convert Holoo ERP exports (inventory.xls + stakeholders-new.xlsx) into normalized JSON
for the SarResid import script (scripts/import-holoo.ts).

Outputs:
  scripts/data/products-holoo.json
  scripts/data/suppliers-holoo.json
"""
import json
import os
import xlrd
import openpyxl

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD = os.path.join(BASE, 'upload')
OUTDIR = os.path.join(BASE, 'scripts', 'data')
os.makedirs(OUTDIR, exist_ok=True)


ARABIC_TO_PERSIAN = str.maketrans({
    '\u064a': '\u06cc',  # ي -> ی
    '\u0649': '\u06cc',  # ى -> ی
    '\u0643': '\u06a9',  # ك -> ک
    '\u0640': '',        # tatweel -> remove
})


def fa(s: str) -> str:
    """Normalize Arabic variants to Persian (matches live platform data)."""
    return s.translate(ARABIC_TO_PERSIAN)


def clean_str(v):
    """xlrd/openpyxl value -> trimmed, Persian-normalized string; whole floats lose their .0"""
    if v is None:
        return ''
    if isinstance(v, float):
        if v.is_integer():
            return fa(str(int(v)))
        return fa(str(v))
    if isinstance(v, int):
        return fa(str(v))
    s = fa(str(v).strip())
    return s


def to_num(v):
    """value -> float or 0"""
    if v is None or v == '':
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ================= PRODUCTS =================
def convert_products():
    wb = xlrd.open_workbook(os.path.join(UPLOAD, 'inventory.xls'))
    ws = wb.sheet_by_index(0)
    hdr = [str(ws.cell_value(0, c)).strip() for c in range(ws.ncols)]
    ix = {h: i for i, h in enumerate(hdr)}

    i_name = ix['نام كالا']
    i_code = ix['كد كالا']
    i_unit = ix['واحد كالا']
    i_main = ix['گروه اصلي']
    i_sub = ix['گروه فرعي']
    i_sell = ix['في فروش']
    i_sell2 = ix['قيمت فروش  2']
    i_buy = ix['آخرين في خريد']
    i_stock = ix['موجودي']
    i_min = ix['حداقل']
    i_status = ix['وضعيت کالا']
    # barcode columns كد2..كد52
    bc_cols = [ix[c] for c in ('كد2','كد3','كد4','كد5','كد6','كد7','كد8','كد9','كد10',
                                'كد11','كد12','كد13','كد14','كد15','كد16','كد17','كد18','كد19','كد20',
                                'كد21','كد22','كد23','كد24','كد25','كد26','كد27','كد28','كد29','كد30',
                                'كد31','كد32','كد33','كد34','كد35','كد36','كد37','كد38','كد39','كد40',
                                'كد41','كد42','كد43','كد44','كد45','كد46','كد47','كد48','كد49','كد50','كد51','كد52')
                if c in ix]

    products = []
    seen_codes = set()
    skipped_dupe = 0
    for r in range(1, ws.nrows):
        name = clean_str(ws.cell_value(r, i_name))
        code = clean_str(ws.cell_value(r, i_code))
        if not name or not code:
            continue
        if code in seen_codes:
            skipped_dupe += 1
            continue
        seen_codes.add(code)

        extras = []
        for c in bc_cols:
            b = clean_str(ws.cell_value(r, c))
            if b and b != code and b not in extras:
                extras.append(b)

        stock_f = to_num(ws.cell_value(r, i_stock))
        stock = int(round(stock_f))
        min_f = to_num(ws.cell_value(r, i_min))
        reorder = int(round(min_f)) if min_f > 0 else None

        unit = clean_str(ws.cell_value(r, i_unit)) or 'عدد'
        status = clean_str(ws.cell_value(r, i_status)) or 'فعال'

        products.append({
            'name': name,
            'code': code,
            'unit': unit,
            'mainGroup': clean_str(ws.cell_value(r, i_main)),
            'subGroup': clean_str(ws.cell_value(r, i_sub)),
            'sellPrice': to_num(ws.cell_value(r, i_sell)),
            'sellPrice2': to_num(ws.cell_value(r, i_sell2)),
            'lastBuyPrice': to_num(ws.cell_value(r, i_buy)),
            'stock': stock,
            'reorderLevel': reorder,
            'status': status,
            'active': status == 'فعال',
            'barcodes': [code] + extras,
        })

    out = os.path.join(OUTDIR, 'products-holoo.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False)
    print(f'products: {len(products)} written ({skipped_dupe} dupes skipped) -> {out}')


# ================= SUPPLIERS =================
def convert_suppliers():
    wb = openpyxl.load_workbook(os.path.join(UPLOAD, 'stakeholders-new.xlsx'), read_only=True)
    ws = wb['stakeholders-new']
    rows = ws.iter_rows(min_row=1, values_only=True)
    hdr = [str(h).strip() if h is not None else '' for h in next(rows)]
    ix = {h: i for i, h in enumerate(hdr)}

    suppliers = []
    seen = set()
    skipped_dupe = 0
    for row in rows:
        if row is None:
            continue
        name = clean_str(row[ix['نام طرف حساب']]).lstrip('|').strip()
        code = clean_str(row[ix['كد طرف حساب']])
        if not name or not code:
            continue
        if code in seen:
            skipped_dupe += 1
            continue
        seen.add(code)

        mobile = clean_str(row[ix['تلفن همراه']])
        phone = clean_str(row[ix['تلفن']])
        phone_out = mobile or phone or None

        suppliers.append({
            'name': name,
            'code': code,
            'phone': phone_out,
            'job': clean_str(row[ix['شغل']]) or None,
            'classification': clean_str(row[ix['طبقه بندي']]) or None,
            'intermediary': clean_str(row[ix['نام واسطه']]) or None,
            'balance': int(round(to_num(row[ix['مانده']]))),
            'creditLimit': to_num(row[ix['حد اعتبار']]),
            'status': clean_str(row[ix['وضعيت طرف حساب']]) or 'فعال',
            'note': clean_str(row[ix['توضيحات']]) or None,
            'economicCode': clean_str(row[ix['كد اقتصادي']]) or None,
            'nationalId': clean_str(row[ix['كد ملي']]) or None,
            'postalCode': clean_str(row[ix['كد پستي']]) or None,
        })

    out = os.path.join(OUTDIR, 'suppliers-holoo.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(suppliers, f, ensure_ascii=False)
    print(f'suppliers: {len(suppliers)} written ({skipped_dupe} dupes skipped) -> {out}')


if __name__ == '__main__':
    convert_products()
    convert_suppliers()
