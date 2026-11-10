# -*- coding: utf-8 -*-
"""دیسامبل encryptText — نسخهٔ مقاوم (رفع کرش goto/branch نهایی جدول)" + جدول آپکد کامل‌تر"""
import zipfile, struct

z = zipfile.ZipFile('upload/TncHolooWebServiceFull/JarFile/TNCHolooWebService-1.0.jar')
data = z.read('BOOT-INF/classes/com/utility/ConvertStr.class')

pos = 8
count = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
consts = [None] * count
i = 1
while i < count:
    tag = data[pos]; pos += 1
    if tag == 1:
        ln = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
        consts[i] = data[pos:pos+ln]; pos += ln
    elif tag in (7, 8, 16, 19, 20):
        consts[i] = ('ref', struct.unpack('>H', data[pos:pos+2])[0]); pos += 2
    elif tag == 15: pos += 3
    elif tag in (3, 4): consts[i] = ('num', struct.unpack('>i', data[pos:pos+4])[0]); pos += 4
    elif tag in (5, 6): consts[i] = ('num', struct.unpack('>q', data[pos:pos+8])[0]); pos += 8; i += 1
    elif tag in (9, 10, 11, 12, 17, 18): consts[i] = ('ref2', struct.unpack('>HH', data[pos:pos+4])); pos += 4
    i += 1

def resolve(idx, depth=0):
    c = consts[idx]
    if isinstance(c, tuple) and depth < 3:
        if c[0] == 'ref': return resolve(c[1], depth + 1)
        if c[0] == 'ref2': return f'{resolve(c[1][0], depth+1)}.{resolve(c[1][1], depth+1)}'
    return c.decode('utf-8', 'replace') if isinstance(c, bytes) else str(c)

pos += 2 + 2 + 2
ifc = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2 + ifc * 2
fcount = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
for _ in range(fcount):
    pos += 6
    ac = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
    for _ in range(ac):
        pos += 2; ln = struct.unpack('>I', data[pos:pos+4])[0]; pos += 4 + ln
mcount = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2

# طول آپکد بر اساس JVM spec (فشرده + گسترده)
OP1 = set(list(range(0x00, 0x10)) + [0x1a,0x1b,0x1c,0x1d,0x1e,0x1f,0x20,0x21,0x22,0x23,0x24,0x25,0x26,0x27,0x28,0x29,0x2a,0x2b,0x2c,0x2d,
    0x2e,0x2f,0x30,0x31,0x32,0x33,0x34,0x35,0x3e,0x3f,0x40,0x41,0x42,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x4b,0x4c,0x4d,0x4e,0x4f,
    0x50,0x51,0x52,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x5b,0x5c,0x5d,0x5e,0x5f,0x60,0x61,0x62,0x63,0x64,0x65,0x66,0x67,0x68,0x69,
    0x6a,0x6b,0x6c,0x6d,0x6e,0x6f,0x70,0x71,0x72,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x7b,0x7c,0x7d,0x7e,0x7f,0x80,0x81,0x82,0x83,
    0x85,0x86,0x87,0x88,0x89,0x8a,0x8b,0x8c,0x8d,0x8e,0x8f,0x91,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0xae,0xaf,0xb0,0xb1,0xbf,0xc2,0xc3,0xc5])
OP2 = {0x10,0x12,0x15,0x16,0x19,0x36,0x3a,0x3b,0x3c,0x3d,0xa9,0xbc}
OP3 = {0x11,0x13,0x14,0x17,0x18,0x99,0x9a,0x9b,0x9c,0x9d,0x9e,0x9f,0xa0,0xa1,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xbb,0xc0,0xc1,0xc6,0xc7,0x84}
BRANCH3 = {0x99,0x9a,0x9b,0x9c,0x9d,0x9e,0x9f,0xa0,0xa1,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xc6,0xc7}

for _ in range(mcount):
    acc, nameIdx, descIdx = struct.unpack('>HHH', data[pos:pos+6]); pos += 6
    ac = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
    code_off = None
    for _ in range(ac):
        anIdx = struct.unpack('>H', data[pos:pos+2])[0]; pos += 2
        ln = struct.unpack('>I', data[pos:pos+4])[0]
        if consts[anIdx] == b'Code': code_off = pos + 4
        pos += 4 + ln
    if resolve(nameIdx) != 'encryptText' or not code_off: continue
    cpos = code_off
    ms, ml, cl = struct.unpack('>HHI', data[cpos:cpos+8])
    bc = data[cpos+8:cpos+8+cl]
    j = 0
    out = []
    while j < len(bc):
        op = bc[j]
        s = j
        if op == 0xc4:  # wide
            wop = bc[j+1]
            j += 4 if wop == 0x84 else 4
            out.append((s, 'wide'))
            continue
        if op == 0xaa:  # tableswitch
            p = ((j + 1) + 3) & ~3
            df, lo, hi = struct.unpack('>iii', bc[p:p+12])
            j = p + 12 + (hi - lo + 1) * 4
            out.append((s, f'tableswitch default->{s+df}'))
            continue
        if op == 0xab:  # lookupswitch
            p = ((j + 1) + 3) & ~3
            df, n = struct.unpack('>ii', bc[p:p+8])
            j = p + 8 + n * 8
            out.append((s, f'lookupswitch default->{s+df}'))
            continue
        if op == 0xba:
            j += 5; out.append((s, 'invokedynamic')); continue
        if op in OP2: arg = bc[j+1:j+2]; j += 2
        elif op in OP3: arg = bc[j+1:j+3]; j += 3
        else: arg = b''; j += 1
        label = {
            0x12: lambda: f"ldc {resolve(arg[0])!r}",
            0x13: lambda: f"ldc_w {resolve(struct.unpack('>H', arg)[0])!r}",
            0x14: lambda: f"ldc2_w {resolve(struct.unpack('>H', arg)[0])!r}",
            0x10: lambda: f'bipush {struct.unpack(">b", arg)[0]}',
            0x11: lambda: f'sipush {struct.unpack(">h", arg)[0]}',
            0xb2: lambda: f'getstatic {resolve(struct.unpack(">H", arg)[0])}',
            0xb3: lambda: f'putstatic {resolve(struct.unpack(">H", arg)[0])}',
            0xb4: lambda: f'getfield {resolve(struct.unpack(">H", arg)[0])}',
            0xb5: lambda: f'putfield {resolve(struct.unpack(">H", arg)[0])}',
            0xb6: lambda: f'invokevirtual {resolve(struct.unpack(">H", arg)[0])}',
            0xb7: lambda: f'invokespecial {resolve(struct.unpack(">H", arg)[0])}',
            0xb8: lambda: f'invokestatic {resolve(struct.unpack(">H", arg)[0])}',
            0xbb: lambda: f'new {resolve(struct.unpack(">H", arg)[0])}',
            0xbd: lambda: f'anewarray {resolve(struct.unpack(">H", arg)[0])}',
            0xc0: lambda: f'newarray T={arg[0]}',
            0x15: lambda: f'iload {arg[0]}', 0x19: lambda: f'aload {arg[0]}',
            0x36: lambda: f'istore {arg[0]}', 0x3a: lambda: f'astore {arg[0]}',
            0xa9: lambda: f'return', 0xb1: lambda: f'return', 0xac: lambda: f'ireturn', 0xb0: lambda: f'areturn',
            0x57: lambda: 'pop', 0x58: lambda: 'pop2', 0x50: lambda: 'aaload', 0x53: lambda: 'aastore',
            0x4c: lambda: 'lstore', 0x51: lambda: 'laload', 0x61: lambda: 'ladd', 0x75: lambda: 'lneg',
            0x60: lambda: 'iadd', 0x64: lambda: 'isub', 0x68: lambda: 'imul', 0x70: lambda: 'irem',
            0x78: lambda: 'ishl', 0x7a: lambda: 'ishr', 0x80: lambda: 'iand', 0x82: lambda: 'ior',
            0x86: lambda: 'i2b', 0x91: lambda: 'l2i',
            0x59: lambda: 'dup', 0x5a: lambda: 'dup_x1',
        }
        if op in BRANCH3:
            off = struct.unpack('>h', arg)[0]
            out.append((s, {0x99:'ifeq',0x9a:'ifne',0x9b:'iflt',0x9c:'ifge',0x9d:'ifgt',0x9e:'ifle',0x9f:'if_icmpeq',
                0xa0:'if_icmpne',0xa1:'if_icmplt',0xa2:'if_icmpge',0xa3:'if_icmpgt',0xa4:'if_icmple',0xa5:'if_acmpeq',
                0xa6:'if_acmpne',0xa7:'goto',0xc6:'ifnull',0xc7:'ifnonnull'}[op] + f' -> {s+off}'))
        else:
            def safe_label(op_, arg_):
                try:
                    return label[op_]()
                except Exception:
                    return f'op_{op_:02x}(arg={arg_.hex()})'
            name = safe_label(op, arg)
            out.append((s, name))
    for s, t in out:
        print(f'{s:4d}: {t}')
    break
