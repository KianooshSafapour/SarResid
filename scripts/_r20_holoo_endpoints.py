# -*- coding: utf-8 -*-
"""استخراج مسیرهای API از JAR هلو (رفع باگ نام‌گذاری قبلی — نام واقعی از خود آرشیو)"""
import zipfile, re

z = zipfile.ZipFile('upload/TncHolooWebServiceFull/JarFile/TNCHolooWebService-1.0.jar')
names = [n for n in z.namelist() if n.endswith('.class') and '$' not in n]

KEY = ('CompanyController', 'InvoiceController', 'ProductController', 'ProductPriceController',
       'ProductCustomCodeController', 'ProductPictureController', 'CustomerController',
       'BankController', 'SettlementController', 'SettingsController', 'CategoryAPI',
       'CouponController', 'ProductPriceAPI', 'WebSocketController', 'LoginController',
       'WebhookController', 'PreInvoiceController', 'OrderController', 'CustomerCheckController',
       'HeadingController', 'MidManController', 'DeliveryTimeController', 'DescriptionController')

for n in names:
    short = n.split('/')[-1].replace('.class', '')
    if short not in KEY:
        continue
    data = z.read(n)
    strs = re.findall(rb'[\x20-\x7e]{3,}', data)
    paths = sorted({s.decode() for s in strs if re.fullmatch(r'(/[A-Za-z0-9_{}.\-/]{2,})', s.decode())})
    methods = sorted({s.decode() for s in strs if s.decode() in ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')})
    print(f'## {n.replace("BOOT-INF/classes/", "")}')
    if paths:
        print('   paths:', ' | '.join(paths[:16]))
    if methods:
        print('   methods:', ','.join(methods))
