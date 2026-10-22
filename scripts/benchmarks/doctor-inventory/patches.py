"""Exact diagnostic-copy replacements for PRD §11.2 and §14; no production edit."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent
IMPORT = f'import {{ observe }} from "{ROOT / "observer.ts"}";\n'
CHANGES = {
    "src/commands/doctor/markers/index.ts": [
        ('  const markers: MarkerEntry[] = [];',
         '  observe("inventory.begin", { cwd, additionalProjectRoots, stateEntries: stateEntries.length });\n  const markers: MarkerEntry[] = [];'),
        ('  const roots = [...projectRoots];',
         '  const roots = [...projectRoots];\n  observe("inventory.roots", { roots });'),
        ('  return { markers, findings: [...inventoryFindings.values()], projectRoots: roots };',
         '  observe("inventory.end", { markers: markers.length, findings: inventoryFindings.size });\n  return { markers, findings: [...inventoryFindings.values()], projectRoots: roots };'),
    ],
    "src/commands/doctor/markers/scan.ts": [
        ('    const base = baseFor(adapter, scope, cwd);',
         '    const base = baseFor(adapter, scope, cwd);\n    observe("logical.scan", { adapter: adapter.name, scope, cwd, base });'),
        ('    let inventory = inventories.get(key);',
         '    let inventory = inventories.get(key);\n    observe("physical.cache_lookup", { key, base, hit: inventory !== undefined });'),
    ],
    "src/commands/doctor/markers/filesystem.ts": [
        ('): BigIntStats | undefined {\n  try {',
         '): BigIntStats | undefined {\n  observe("directory.probe", { path, followLinks });\n  try {'),
        ('    accessSync(path, constants.X_OK);',
         '    observe("directory.search", { path });\n    accessSync(path, constants.X_OK);'),
        ('export function inventoryDirectory(path: string, findings: Map<string, Finding>): boolean {',
         'export function inventoryDirectory(path: string, findings: Map<string, Finding>): boolean {\n  observe("project_root.gate", { path });'),
        ('    return readdirSync(path);',
         '    observe("inventory.readdir", { path });\n    return readdirSync(path);'),
    ],
    "src/commands/doctor/markers/physical.ts": [
        ('  const markers: { name: string; marker: Marker }[] = [];',
         '  observe("physical.read", { base });\n  const markers: { name: string; marker: Marker }[] = [];'),
        ('      if (lstatSync(path).isSymbolicLink()) {',
         '      observe("marker.lstat", { path });\n      if (lstatSync(path).isSymbolicLink()) {'),
        ('      marker = readJson<unknown>(path);',
         '      observe("marker.read_json", { path });\n      marker = readJson<unknown>(path);'),
    ],
    "src/util/fs.ts": [
        ('  return readFileSync(path, "utf8");',
         '  if (path.endsWith("/.crew.json")) observe("marker.read_file.attempt", { path });\n  const result = readFileSync(path, "utf8");\n  if (path.endsWith("/.crew.json")) observe("marker.read_file.success", { path });\n  return result;'),
        ('export function isDirectory(path: string, followSymlinks: boolean = true): boolean {',
         'export function isDirectory(path: string, followSymlinks: boolean = true): boolean {\n  observe("util.is_directory", { path, followSymlinks });'),
    ],
    "src/util/advisory-lock.ts": [
        ('  ensureDir(dirname(target));',
         '  observe("lock.request", { target });\n  ensureDir(dirname(target));'),
        ('      const release = lockfile.lockSync(target, {',
         '      const releaseActual = lockfile.lockSync(target, {'),
        ('      });\n      try {\n        owner.record();',
         '      });\n      observe("lock.acquired", { target });\n      const release = () => {\n        observe("lock.release.begin", { target });\n        try { releaseActual(); } finally { observe("lock.release.end", { target }); }\n      };\n      try {\n        owner.record();'),
    ],
    "src/commands/doctor/checks.ts": [
        ('  markers: readonly MarkerEntry[],\n): Finding[] {',
         '  markers: readonly MarkerEntry[],\n): Finding[] {\n  observe("check.state_marker");'),
        ('export function checkContentHashDrift(markers: MarkerEntry[]): Finding[] {',
         'export function checkContentHashDrift(markers: MarkerEntry[]): Finding[] {\n  observe("check.verify");'),
        ('): Finding[] {\n  const findings: Finding[] = [];\n  for (const adapter of ALL_AGENTS) {',
         '): Finding[] {\n  observe("check.agent_detection");\n  const findings: Finding[] = [];\n  for (const adapter of ALL_AGENTS) {'),
        ('export function checkOrphanStoreEntries(state: StateFile, home: string): Finding[] {',
         'export function checkOrphanStoreEntries(state: StateFile, home: string): Finding[] {\n  observe("check.store");'),
        ('export function checkProjectRoots(stateEntries: readonly StateEntry[]): Finding[] {',
         'export function checkProjectRoots(stateEntries: readonly StateEntry[]): Finding[] {\n  observe("check.project_roots");'),
        ('export function checkAutoupdateDrift(config: Config): Finding[] {',
         'export function checkAutoupdateDrift(config: Config): Finding[] {\n  observe("check.scheduler");'),
    ],
}

def instrument(path: str, original: str) -> str:
    result = original
    for old, new in CHANGES[path]:
        if result.count(old) != 1:
            raise ValueError(f"expected one exact anchor in {path}: {old!r}")
        result = result.replace(old, new, 1)
    # All targeted files have a leading docstring; retain it as the opening text.
    end = result.index("*/") + 2
    return result[:end] + "\n" + IMPORT + result[end:]
