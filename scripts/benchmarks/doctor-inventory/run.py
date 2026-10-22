"""Caller-run, serial, owned-process measurement driver for PRD §11.2 and §14."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import platform
import signal
import statistics
import subprocess
import time
import uuid
ROOT = Path(__file__).resolve().parent

def stop(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    # Only our own still-live process handle and its newly created process group.
    if os.getpgid(proc.pid) != proc.pid:
        raise RuntimeError('owned process group changed; preserve and inspect')
    os.killpg(proc.pid, signal.SIGTERM)
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=2)

def child(bun: str, payload: dict, timeout: int) -> tuple[dict, float]:
    start = time.perf_counter_ns()
    proc = subprocess.Popen([bun, str(ROOT / 'command.ts'), json.dumps(payload)],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            start_new_session=True, cwd=ROOT)
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    finally:
        stop(proc)
    elapsed = (time.perf_counter_ns() - start) / 1e6
    if proc.returncode != 0:
        raise RuntimeError(f'owned child {proc.pid} exit {proc.returncode}: {stderr.decode()} {stdout.decode()}')
    if stderr:
        raise RuntimeError(f'unexpected child stderr: {stderr.decode()}')
    return json.loads(stdout), elapsed

def counters(events: list[dict], fixture: Path) -> dict:
    grouped = Counter((e['build'], e['phase'], e['kind']) for e in events)
    target = str(fixture / 'crew' / 'state.json')
    lock = [e for e in events if e['kind'].startswith('lock.') and e['details'].get('target') == target]
    def duration(a: str, b: str):
        first = next((e for e in lock if e['kind'] == a), None)
        last = next((e for e in lock if e['kind'] == b), None)
        return None if first is None or last is None else (int(last['ns']) - int(first['ns'])) / 1e6
    return {'observed_calls': [{'build': b, 'phase': p, 'kind': k, 'count': n}
                               for (b, p, k), n in sorted(grouped.items())],
            'state_lock_count': sum(e['kind'] == 'lock.acquired' for e in lock),
            'instrumented_acquire_ms': duration('lock.request', 'lock.acquired'),
            'instrumented_hold_body_ms': duration('lock.acquired', 'lock.release.begin'),
            'instrumented_hold_including_release_ms': duration('lock.acquired', 'lock.release.end')}

def state_lock_requested(events: list[dict], fixture: Path) -> bool:
    target = str(fixture / 'crew' / 'state.json')
    return any(e['kind'] == 'lock.request' and e['details'].get('target') == target for e in events)

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--bun', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--samples', type=int, default=5)
    args = parser.parse_args()
    bun = str(Path(args.bun).resolve())
    output = args.output.resolve()
    run = output / 'runs' / uuid.uuid4().hex
    run.mkdir(parents=True)
    (run / 'OWNED.json').write_text(json.dumps({'owner': str(output), 'pid': os.getpid(),
        'created_ns': time.time_ns(), 'platform': platform.platform(), 'bun': bun})+'\n')
    summary = []
    # Sequential only. Each setup is excluded from command and process latency.
    for count in [1, 10, 100]:
        for mode in ['plain', 'dry', 'repair']:
            samples = []
            walls = []
            for sample in range(-1, args.samples):
                fixture = run / f'plain-{count}-{mode}-{sample}'
                payload = {'fixture': str(fixture), 'runRoot': str(output / 'runs'), 'roots': count, 'source': str(output / 'copies' / 'plain'),
                           'counters': False, 'mode': mode, 'fresh': False}
                child(bun, {**payload, 'action': 'setup'}, 60)
                result, wall = child(bun, {**payload, 'action': 'measure'}, 30)
                (run / f'{fixture.name}.json').write_text(json.dumps({**result, 'process_ms': wall})+'\n')
                if sample >= 0:
                    samples.append(result['command_ms'])
                    walls.append(wall)
            fixture = run / f'counters-{count}-{mode}'
            payload = {'fixture': str(fixture), 'runRoot': str(output / 'runs'), 'roots': count, 'source': str(output / 'copies' / 'counters'),
                       'counters': True, 'mode': mode, 'fresh': False}
            child(bun, {**payload, 'action': 'setup'}, 60)
            result, wall = child(bun, {**payload, 'action': 'measure'}, 30)
            if mode != 'repair' and state_lock_requested(result['events'], fixture):
                raise RuntimeError('read-only/dry-run attempted the state lock')
            (run / f'{fixture.name}.json').write_text(json.dumps({**result, 'process_ms': wall})+'\n')
            summary.append({'roots': count, 'mode': mode, 'plain_command_ms': samples,
                'plain_command_median_ms': statistics.median(samples), 'plain_process_ms': walls,
                'plain_process_median_ms': statistics.median(walls),
                'counters_command_ms': result['command_ms'], **counters(result['events'], fixture)})
            (run / 'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    # Fresh controls require no state lock; maintenance lease artifacts are separately reported.
    for mode in ['plain', 'dry']:
        fixture = run / f'fresh-{mode}'
        payload = {'fixture': str(fixture), 'runRoot': str(output / 'runs'), 'roots': 1, 'source': str(output / 'copies' / 'counters'),
                   'counters': True, 'mode': mode, 'fresh': True}
        child(bun, {**payload, 'action': 'setup'}, 60)
        result, wall = child(bun, {**payload, 'action': 'measure'}, 30)
        if state_lock_requested(result['events'], fixture):
            raise RuntimeError('fresh read-only/dry-run attempted the state lock')
        (run / f'{fixture.name}.json').write_text(json.dumps({**result, 'process_ms': wall})+'\n')
    print(run)

if __name__ == '__main__':
    main()
