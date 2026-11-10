# -*- coding: utf-8 -*-
"""پارس کامل استخر ثابت جاوا + دیسمبل سبک متد encryptText در LoginDao"""
import zipfile, re, struct

z = zipfile.ZipFile('upload/TncHolooWebServiceFull/JarFile/TNCHolooWebService-1.0.jar')
data = z.read('BOOT-INF/classes/com/dao/LoginDao.class')

# ── پارس استخر ثابت (فرمت class جاوا) ──
assert data[:4] == b'\xca\xfe\xba\xbe'
pos = 8
count = struct.unpack('>H', data[pos:pos+2])[0]
pos += 2
consts = [None] * count  # 1-based

i = 1
while i < count:
    tag = data[pos]; pos += 1
    if tag == 1:  # Utf8
        ln = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
        consts[i] = data[pos:pos+ln].decode('utf-8', 'replace'); pos += ln
    elif tag in (7, 8, 16, 19, 20):
        consts[i] = ('ref', struct.unpack('>H', data[pos:pos+2])[0]); pos += 2
    elif tag == 15:
        pos += 3
    elif tag in (3, 4):  # Int/Float
        consts[i] = struct.unpack('>i', data[pos:pos+4])[0]; pos += 4
    elif tag in (5, 6):  # Long/Double
        consts[i] = struct.unpack('>q', data[pos:pos+8])[0]; pos += 8; i += 1
    elif tag in (9, 10, 11, 12, 17, 18):
        consts[i] = ('ref2', struct.unpack('>HH', data[pos:pos+4])); pos += 4
    else:
        raise Exception(f'tag {tag} at {i}')
    i += 1

# رشته‌های UTF8 اطراف encrypt
for idx, c in enumerate(consts):
    if isinstance(c, str) and ('encrypt' in c.lower() or 'pasword' in c.lower() or 'password' in c.lower()):
        print(idx, repr(c[:100]))

# ── دیسمبل خام: یافتن متد encryptText در بایت‌کد و چاپ ثابت‌های مرجع‌شده ──
# متن کامل رشته‌های UTF8 که فقط از حروف < > = ; @ ? تشکیل شده‌اند (جدول رمز)
print('--- cipher-ish strings ---')
for idx, c in enumerate(consts):
    if isinstance(c, str) and 8 <= len(c) <= 120:
        if re.fullmatch(r'[<>=;@?A-Za-z]+', c) and c.count('>') >= 3:
            print(idx, repr(c))
