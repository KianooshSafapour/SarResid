#!/usr/bin/env python3
"""sync-down.py — pull latest code + DB snapshot from the demo server (READ-ONLY on server).

Server side: VACUUM INTO snapshot of live SQLite (consistent even while app writes),
gzip it, tar the project (excluding node_modules/.next/db/custom.db), md5 both.
Then SFTP download to /tmp/dl/ and verify checksums.
The /tmp scratch files on the server are removed afterwards. Nothing else is touched.
"""
import hashlib
import os
import shlex
import sys

import paramiko

HOST, USER, PW = '195.248.241.14', 'root', '@@ZAI6677'
OUT = '/tmp/dl'


def md5_of(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(OUT, exist_ok=True)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PW, timeout=30,
              look_for_keys=False, allow_agent=False)

    def run(cmd, timeout=900):
        _, o, e = c.exec_command(cmd, timeout=timeout)
        out = o.read().decode('utf-8', 'replace')
        err = e.read().decode('utf-8', 'replace')
        return o.channel.recv_exit_status(), out, err

    # 1) consistent DB snapshot via VACUUM INTO (works on live db, read-only conn)
    vac = ("const {Database}=require('bun:sqlite');"
           "const db=new Database('/opt/sarresid/db/custom.db',{readonly:true});"
           "db.exec(\"VACUUM INTO '/tmp/custom-snapshot.db'\");"
           "db.close();console.log('VACUUM OK')")
    rc, out, err = run('/root/.bun/bin/bun -e ' + shlex.quote(vac), 300)
    print('[vacuum] rc=%s out=%s err=%s' % (rc, out.strip(), err.strip()[:300]))
    if rc:
        sys.exit('VACUUM failed')

    # 2) gzip + code tarball
    steps = [
        'gzip -f /tmp/custom-snapshot.db',
        ('cd /opt/sarresid && tar czf /tmp/sarresid-code.tar.gz '
         '--exclude=node_modules --exclude=.next --exclude=db/custom.db .'),
        'md5sum /tmp/custom-snapshot.db.gz /tmp/sarresid-code.tar.gz',
        'ls -la /tmp/custom-snapshot.db.gz /tmp/sarresid-code.tar.gz',
    ]
    for cmd in steps:
        rc, out, err = run(cmd)
        print('$ %s\n%s' % (cmd, out.strip()))
        if err.strip():
            print('  [stderr]', err.strip()[:300])
        if rc:
            sys.exit('step failed: ' + cmd)
    remote_md5 = {}
    for line in out.splitlines() + []:
        pass
    # recompute md5 line parsing from the dedicated md5sum output above
    rc2, out2, _ = run('md5sum /tmp/custom-snapshot.db.gz /tmp/sarresid-code.tar.gz')
    for line in out2.splitlines():
        parts = line.split()
        if len(parts) == 2:
            remote_md5[parts[1]] = parts[0]

    # 3) download
    s = c.open_sftp()
    for remote, local in [('/tmp/custom-snapshot.db.gz', OUT + '/custom-snapshot.db.gz'),
                           ('/tmp/sarresid-code.tar.gz', OUT + '/sarresid-code.tar.gz')]:
        print('GET %s -> %s' % (remote, local))
        s.get(remote, local)
    s.close()

    # 4) verify
    ok = True
    for local, remote_name in [(OUT + '/custom-snapshot.db.gz', '/tmp/custom-snapshot.db.gz'),
                               (OUT + '/sarresid-code.tar.gz', '/tmp/sarresid-code.tar.gz')]:
        lm = md5_of(local)
        rm = remote_md5.get(remote_name, '?')
        status = 'OK' if lm == rm else 'MISMATCH'
        ok = ok and (lm == rm)
        print('%-28s local=%s remote=%s size=%d %s' % (remote_name, lm, rm, os.path.getsize(local), status))

    # 5) tidy /tmp scratch on server (safe; app untouched)
    rc, out, err = run('rm -f /tmp/custom-snapshot.db /tmp/custom-snapshot.db.gz /tmp/sarresid-code.tar.gz')
    c.close()
    print('DONE ok=%s' % ok)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
