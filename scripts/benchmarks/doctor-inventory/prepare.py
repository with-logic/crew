"""Prepare exact source-copy diagnostic patches for PRD §11.2/§14; never execute Crew."""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
sys.dont_write_bytecode = True
from patches import CHANGES, instrument
REPO = Path(__file__).resolve().parents[3]
PIN = '319cabc3f5f4bf630ae8163fed4f483ff3feed50'

def git(*args: str) -> bytes:
    return subprocess.check_output(['git', '-C', str(REPO), *args])

def source(path: str) -> str:
    return git('show', f'{PIN}:{path}').decode()

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--materialize', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    output = args.output.resolve() if args.output else Path(tempfile.mkdtemp(prefix='crew-doctor-inventory-'))
    output.mkdir(parents=True, exist_ok=True)
    forward, inverse, manifest = [], [], {}
    modified = {}
    for path in CHANGES:
        before = source(path)
        after = instrument(path, before)
        modified[path] = after
        manifest[path] = {'before_sha256': hashlib.sha256(before.encode()).hexdigest(),
                          'after_sha256': hashlib.sha256(after.encode()).hexdigest()}
        forward.extend(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                           fromfile=f'a/{path}', tofile=f'b/{path}'))
        inverse.extend(difflib.unified_diff(after.splitlines(True), before.splitlines(True),
                                           fromfile=f'a/{path}', tofile=f'b/{path}'))
    (output / 'instrumentation.patch').write_text(''.join(forward))
    (output / 'instrumentation.inverse.patch').write_text(''.join(inverse))
    (output / 'instrumentation.manifest.json').write_text(json.dumps({'pin': PIN, 'files': manifest}, indent=2)+'\n')
    if not args.materialize:
        print(output)
        return
    files = git('ls-tree', '-r', '--name-only', PIN, 'src/', 'package.json', 'release/signing-public-key.pem').decode().splitlines()
    for name in ['plain', 'counters']:
        dest = output / 'copies' / name
        if dest.exists():
            raise SystemExit(f'preserve existing copy: {dest}')
        for path in files:
            target = dest / path
            target.parent.mkdir(parents=True, exist_ok=True)
            content = source(path)
            target.write_text(modified[path] if name == 'counters' and path in modified else content)
        # Reuse the caller's existing dependencies read-only; no install or lockfile change.
        (dest / 'node_modules').symlink_to(REPO / 'node_modules', target_is_directory=True)
        (dest / 'SOURCE.json').write_text(json.dumps({'pin': PIN, 'instrumented': name == 'counters'})+'\n')
    print(output)

if __name__ == '__main__':
    main()
