# -*- coding: utf-8 -*-
"""جست‌وجوی تابع تبدیل رمز هلو در JAR"""
import zipfile, re

z = zipfile.ZipFile('upload/TncHolooWebServiceFull/JarFile/TNCHolooWebService-1.0.jar')
for n in z.namelist():
    if not n.endswith('.class') or '$' in n:
        continue
    data = z.read(n)
    up = data.upper()
    if b'PASWORD' not in up:
        continue
    strs = re.findall(rb'[\x20-\x7e]{4,}', data)
    hits = []
    for s in strs:
        t = s.decode('ascii', 'ignore')
        tu = t.upper()
        if any(k in tu for k in ('XOR', 'ENCRYPT', 'DECODE', 'BASE64', 'CHARAT', 'SUBSTRING', 'REPLACE')):
            hits.append(t)
    # الگوهای جایگزینی کاراکتری (مثل تبدهای رمز)
    pat = [s.decode('ascii', 'ignore') for s in strs if re.fullmatch(r'[<>=;@?A-Za-z]{4,12}', s.decode('ascii', 'ignore')) and s.count(b'>') >= 2]
    if hits or pat:
        print('##', n.split('/')[-1])
        for h in sorted(set(hits))[:6]:
            print('   hit:', h[:80])
        for p in sorted(set(pat))[:6]:
            print('   pat:', p[:40])
