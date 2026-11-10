# R13 — run deploy-r13.sh on the server
import importlib.util, os, sys, time

spec = importlib.util.spec_from_file_location('dh', os.path.join('scripts', 'deploy-helper.py'))
dh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dh)

t0 = time.time()
code, out, err = dh.run('cd /root && bash deploy-r13.sh /root/sarresid-r13-20261027-1154.tar.gz 2>&1', timeout=1500)
print('exit', code, f'({time.time()-t0:.0f}s)')
print(out[-6000:])
if err.strip():
    print('STDERR:', err[-1500:])
