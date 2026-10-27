# R13 — upload package + deploy script + آبان xls files to server
import importlib.util, os, glob, sys

spec = importlib.util.spec_from_file_location('dh', os.path.join('scripts', 'deploy-helper.py'))
dh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dh)

# 1) package + deploy script → /root/
pkg = sorted(glob.glob('deploy/sarresid-r13-*.tar.gz'))[-1]
print('package:', pkg, os.path.getsize(pkg) // 1024, 'KB')
dh.put(pkg, '/root/' + os.path.basename(pkg))
dh.put('deploy/deploy-r13.sh', '/root/deploy-r13.sh')
print('✓ package + deploy script uploaded')

# 2) آبان xls files → /opt/sarresid/upload/
files = [
    'upload/خريد آبان‌ماه 1405.xls',
    'upload/فروش آبان‌ماه 1405.xls',
    'upload/موجودي کل انبار منتهي به 1405.08.05_0835.xls',
    'upload/مشخصات کالاهاي انبار 1405.08.05_1033.xls',
]
for f in files:
    if not os.path.exists(f):
        print('✗ MISSING locally:', f)
        sys.exit(1)
    dh.put(f, '/opt/sarresid/upload/' + os.path.basename(f))
    print('✓ uploaded', os.path.basename(f))

code, out, err = dh.run('ls -la /root/sarresid-r13-*.tar.gz /root/deploy-r13.sh && ls /opt/sarresid/upload/ | grep -c xls')
print(out, err[:200])
