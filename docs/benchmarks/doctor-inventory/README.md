<!-- Baseline observations for PRD §11.2/§14 and issue 250; no product behavior change. -->
# Doctor inventory measurements

Baseline source: `319cabc3f5f4bf630ae8163fed4f483ff3feed50`.
Issue: [#250](https://github.com/with-logic/crew/issues/250).
Measurements came from the original local recovery harness, run
`7f0b9e941b0945dbbffa42b80b1eae7b`. The portable harness accompanying this report
was reproduced against the same pin in nine checks covering installed plain/dry/repair,
fresh plain/dry, and 100-root repair. These checks validate reproduction; they are
not an optimized result or a replacement for the recorded 65-result matrix.

Healthy repair's median command time was 12.781 / 46.728 / 186.562 ms at
1 / 10 / 100 project roots. Its initial inventory ran before the state lock.
Repair then took that lock, built a fresh inventory, and reconciled against it. These results
establish the cost of the current behavior. They provide no measured optimized
result or speedup and do not establish equivalence for moving initial checks
under the lock. Keep the initial checks and authoritative fresh inventory.

Resolve #250 with these measurements and retain the existing check order and
fresh inventory under the state lock. The proposed optimization was conditional
on measurements supporting a change; these results do not justify that change.
This report changes no CLI command, PRD contract or product source.

## Latency

`plain` is `doctor --json`, `dry` is `doctor --repair --dry-run --json`, and
`repair` is `doctor --repair --json`. The recorded mode names remain the original
measurement keys.

Each cell has one excluded warmup and five independent fixture samples, followed
by one separate diagnostic pass. All 65 result records, including warmups and
fresh controls, are in [measurements.json](./measurements.json). Its summary keeps
the exact five latency values and original medians; each raw result keeps its
command/process values. The 10-root repair values span 21.300–91.919 ms, so the
median should not be read as a precise invariant or extrapolated into a budget.

| Project roots | Mode | Command median ms | Process median ms |
| --- | --- | ---: | ---: |
| 1 | plain | 9.287 | 68.142 |
| 1 | dry | 8.910 | 64.720 |
| 1 | repair | 12.781 | 69.272 |
| 10 | plain | 13.744 | 89.702 |
| 10 | dry | 14.659 | 94.287 |
| 10 | repair | 46.728 | 130.156 |
| 100 | plain | 103.070 | 474.496 |
| 100 | dry | 97.215 | 450.551 |
| 100 | repair | 186.562 | 565.986 |

`command_ms` brackets only `runCli(["doctor", "--json", ...])`. It includes the
maintenance lease and real CLI parsing, dispatch, checks, repair and formatting.
Fixture setup, module imports, adapter redirection, the before/after filesystem
hash inventories and final JSON serialization are outside that timer.
`process_ms` includes those imports, redirection, inventories and serialization,
from spawn through child exit. It is **not raw CLI startup latency**. The separate
public-install setup child is excluded from both timings.

## Diagnostic observations

The separate counters copy reports actual attempted calls, not kernel syscalls.
The table shows each inventory build in healthy repair; both builds had the same
counts. Plain and dry run build one inventory. A build-local cache already avoids
repeating physical marker reads for aliases sharing `(scope, device, inode)`.
Physical reads here correspond to real marker-bearing directories in this fixture,
not a theoretical adapter × root multiplication.

| Roots | Logical scans | Root gates | Directory probes | Physical reads | Marker file read attempts | Cache hits |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 38 | 1 | 57 | 19 | 19 | 18 |
| 10 | 209 | 10 | 300 | 91 | 91 | 108 |
| 100 | 1919 | 100 | 2730 | 811 | 811 | 1008 |

Every directory probe in these healthy fixtures reached the search-access check;
each physical read reached one listing and one successful marker file read.
These equalities describe this fixture, not guarantees for errors or empty roots.
The JSON preserves every event-kind count by build and state-lock phase, actual
cache hit/miss counts, check order and lock timestamps. Counts and lock timing
from uninstrumented latency runs are `null`: they were not measured.

| Roots | State locks | Instrumented acquire ms | Held body ms | Held including release ms |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 0.161 | 3.406 | 3.495 |
| 10 | 1 | 0.165 | 7.879 | 7.978 |
| 100 | 1 | 0.211 | 98.214 | 98.315 |

Acquisition brackets advisory-lock entry through the successful real lock return.
Held body ends immediately before release; including-release ends after release.
These diagnostic userspace brackets include instrumentation overhead. Allocation,
timestamps and the release wrapper add work. Diagnostic command timings are
retained separately and must not be compared with latency samples as an optimization
win or used to subtract an exact overhead estimate.

## Fixtures and controls

Public `install` generated the state and markers for one local skill at user scope
and every one of N project roots, with all 19 real adapters targeted. Cwd is one
of those roots. Actual project path methods execute; actual user paths are mapped
into owned fixture directories while preserving their shared-path topology.
Unsupported empty paths stay empty. Detection is controlled true. A disabled,
unloaded launchd scheduler is supplied through the existing scheduler seam; only
`list` is accepted. No live scheduler or real host detector latency is measured.

The configured core tap is an unreachable local `file://` path. The Git seam
permits only cloning that exact local fixture path and rejects unexpected
transport, including violations swallowed by Crew. The measurement commands had
zero transport calls. No dependency install or network access is part of reproduction.

Every installed plain/dry result preserved the complete protected byte/mode/link
inventory and left no state-lock directory. The diagnostic plain/dry passes never
requested the state lock.
Both fresh controls preserved protected bytes, created no `state.json`, and made
no state-lock request. Every mode legitimately acquired its maintenance lease.
Only `crew/locks`, including its root and descendants, is excluded from protected
equality; that subtree's before/after inventories are reported separately in JSON.
It changed in every result. Healthy repair's only protected change was the
persistent `crew/state.json.lock.owner` sidecar; state/config/store/source/installed
skill bytes were unchanged. The JSON records those exact changed-path hashes.

These healthy cases do not prove concurrent uninstall, orphan reconstruction,
invalid-marker refusal, drift multiplicity, `--verify` ordering or scheduler repair
semantics. Existing correctness tests remain authoritative. No such tests were
replaced or added for this report.

## Reproduce

Prerequisites: an existing local checkout containing the pinned object, its existing
`node_modules`, Python 3, Git and Bun. The scripts do not fetch or install anything.
From the repository root, use a fresh output directory selected by preparation:

```sh
output="$(python3 scripts/benchmarks/doctor-inventory/prepare.py --materialize)"
python3 scripts/benchmarks/doctor-inventory/run.py --output "$output" --bun "$(command -v bun)" --samples 5
```

Preparation extracts the immutable pin into unchanged `plain` and separately
instrumented `counters` copies, reusing existing dependencies via a symlink. It
writes complete forward/inverse instrumentation patches and before/after hashes
inside that output directory. Exact instrumentation anchors refuse source drift.
The observer import is derived from the script location so both copies use the
same observer singleton. Product source remains unchanged.

The driver runs serially in owned process groups with 60-second setup and
30-second measurement timeouts. It retains direct child handles and signals only
its own still-live group on timeout/interruption, then reaps the child. No global
process-name cleanup is used. Output is preserved on failure. Remove only the
explicit owned output directory after saving evidence and checking children exited.
Do not run alongside tests, builds or another benchmark. Record Bun version,
hardware and dependency identity when repeating. The preceding pilot recorded Bun
1.3.13; the same executable was used immediately afterward for the matrix. CPU/RAM
and a dependency digest were not captured and remain `null` in the JSON.

## Limits and interpretation

The recorded environment was macOS 26.5.1 on arm64, running Bun 1.3.13 source
modules. Bun version comes from the preceding pilot receipt, with the same
explicit executable used for the matrix and no dependency install between them.
CPU model, RAM and a contemporaneous dependency digest were not recorded. This is a warm-filesystem development-runtime sample, with one skill
per root, controlled detection and scheduler behavior. It does not measure the
compiled Crew binary, cold disk caches, contention or real user inventories.
The five-sample cells and single diagnostic pass do not establish statistical
confidence. There is no after measurement, implemented optimization or speedup
claim. Portable reproduction checked successful commands, protected-byte controls,
fresh-state controls, state-lock counts and both repair inventory builds, including
1,622 physical reads across the two 100-root repair builds. Those checks validate
the harness without extending the baseline timing claims.
