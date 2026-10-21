"""Bound one owned Bun owner-read child; never read its metadata here (§14)."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

bun, module, target, kind = sys.argv[1:]
root = Path(target).parent
owner = Path(target + '.lock.owner')
ready = root / 'ready'
if kind in ['fifo', 'symlink-fifo']:
    fifo = root / 'fifo'
    os.mkfifo(fifo)
    if kind == 'fifo':
        fifo.rename(owner)
    else:
        owner.symlink_to(fifo)
elif kind == 'malformed':
    owner.write_text('invalid record')
script = f'''
import {{mkdirSync,statSync,utimesSync,writeFileSync}} from "node:fs";
import {{acquireLock}} from {json.dumps(module)};
const target={json.dumps(target)};
if({json.dumps(kind)}==="oversized"){{
 mkdirSync(target+".lock");utimesSync(target+".lock",new Date(0),new Date(0));
 const stat=statSync(target+".lock");
 writeFileSync(target+".lock.owner",process.pid+" "+stat.ino+" "+stat.birthtimeMs+" "+"x".repeat(1024*1024));
}}
writeFileSync({json.dumps(str(ready))},String(process.pid));
acquireLock(target,100).release();
'''
child = None
reason = 'startup'
started = time.monotonic()
ready_at = None
maximum_rss = 0
try:
    with (root / 'stdout').open('wb') as out, (root / 'stderr').open('wb') as err:
        child = subprocess.Popen([bun, '-e', script], stdout=out, stderr=err)
        while child.poll() is None:
            now = time.monotonic()
            if ready_at is None and ready.exists():
                ready_at = now
            rss = subprocess.run(['ps', '-o', 'rss=', '-p', str(child.pid)],
                                 capture_output=True, text=True, timeout=.5)
            value = int(rss.stdout.strip() or '0')
            maximum_rss = max(maximum_rss, value)
            if value > 256 * 1024:
                reason = 'rss-guard'
                break
            if now - started > 10:
                reason = 'outer-watchdog'
                break
            if ready_at is not None and now - ready_at > 1:
                reason = 'acquisition-wall'
                break
            if ready_at is None and now - started > 5:
                reason = 'startup-wall'
                break
            time.sleep(.05)
        else:
            reason = 'exited'
finally:
    if child is not None:
        if child.poll() is None:
            child.send_signal(signal.SIGTERM)
            try:
                child.wait(timeout=.2)
            except subprocess.TimeoutExpired:
                child.kill()
        child.wait(timeout=1)
result = dict(reason=reason, ready=ready.exists(), exit=child.returncode,
              pid=child.pid, max_rss_kib=maximum_rss, joined=True,
              stderr=(root / 'stderr').read_bytes()[:4096].decode(errors='replace'))
print(json.dumps(result))
