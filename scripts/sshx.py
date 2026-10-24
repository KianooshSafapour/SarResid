#!/usr/bin/env python3
"""SarResid SSH helper (local-only tooling, never deployed).

Modes:
  recon                 read-only server overview
  run 'cmd1' 'cmd2'...  run arbitrary commands, print output
  sftp-get remote local download one file
  sftp-put local remote upload one file (NEVER use without explicit user approval)
"""
import sys
import paramiko

HOST = '195.248.241.14'
USER = 'root'
PASSWORD = '@@ZAI6677'


def client():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=25,
              look_for_keys=False, allow_agent=False)
    return c


def run(c, cmd, timeout=180):
    stdin, stdout, stderr = c.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    return rc, out, err


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'recon'
    c = client()
    try:
        if mode == 'run':
            for cmd in sys.argv[2:]:
                rc, out, err = run(c, cmd)
                print(f'=== RC={rc} | {cmd}')
                print(out, end='')
                if err.strip():
                    print('  [stderr]', err.strip()[:1500])
        elif mode == 'recon':
            cmds = [
                'date; hostname; uptime | cut -d, -f1',
                'ls -la /opt/sarresid',
                'grep -E "\\"(name|version)\\"" /opt/sarresid/package.json | head -4',
                'ls /opt/sarresid/hz-ext/src/views/ 2>/dev/null',
                'ls -lat /root/backups/ 2>/dev/null | head -30',
                'systemctl is-active sarresid-web sarresid-realtime holoo-sim 2>&1',
                'du -sh /opt/sarresid/* 2>/dev/null | sort -h | tail -22',
                'ls -la /opt/sarresid/db/ 2>/dev/null; [ -f /opt/sarresid/.env ] && echo HAS_ENV',
                'cd /opt/sarresid && git log --oneline -8 2>/dev/null || echo NO_GIT',
            ]
            for cmd in cmds:
                rc, out, err = run(c, cmd)
                print(f'\n───── {cmd}')
                print(out.rstrip() if out.strip() else '(empty)')
                if err.strip():
                    print('  [stderr]', err.strip()[:400])
        elif mode == 'sftp-get':
            remote, local = sys.argv[2], sys.argv[3]
            s = c.open_sftp()
            s.get(remote, local)
            print(f'GET {remote} -> {local} done')
            s.close()
        elif mode == 'sftp-put':
            local, remote = sys.argv[2], sys.argv[3]
            s = c.open_sftp()
            s.put(local, remote)
            print(f'PUT {local} -> {remote} done')
            s.close()
        else:
            print('unknown mode:', mode)
            sys.exit(2)
    finally:
        c.close()


if __name__ == '__main__':
    main()
