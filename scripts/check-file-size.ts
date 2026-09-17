/**
 * Enforce the hard file-size cap from CLAUDE.md: every source, site, test,
 * and script file must be under 200 lines, counted the way `wc -l` counts
 * (newline characters). Runs as part of `bun run lint`, so it gates
 * `bun run check` and CI; a breach lists every offending file and exits 1.
 *
 * Why not Biome's `noExcessiveLinesPerFile`: it counts the span from the
 * first to the last code token, so a file's header docstring is free and
 * a 260-line file reports as 216. The cap is defined by `wc -l`; this
 * script measures exactly that.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CAP = 200;
const ROOTS = ["src", "tests", "scripts", "site/app", "site/components", "site/lib"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "coverage"]);

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // a root that doesn't exist in this checkout is simply empty
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if ([...EXTENSIONS].some((ext) => name.endsWith(ext))) yield path;
  }
}

function lineCount(path: string): number {
  const text = readFileSync(path, "utf8");
  let count = 0;
  for (const ch of text) if (ch === "\n") count += 1;
  return count;
}

const offenders: { path: string; lines: number }[] = [];
for (const root of ROOTS) {
  for (const path of walk(root)) {
    const lines = lineCount(path);
    if (lines >= CAP) offenders.push({ path, lines });
  }
}

if (offenders.length > 0) {
  offenders.sort((a, b) => b.lines - a.lines);
  const rows = offenders.map(({ path, lines }) => `  ${String(lines).padStart(5)}  ${path}`);
  process.stderr.write(
    `${offenders.length} file(s) at or over the ${CAP}-line cap (counted like \`wc -l\`):\n${rows.join("\n")}\nSplit them — see CLAUDE.md, "Organization conventions".\n`,
  );
  process.exit(1);
}
process.stdout.write(`file-size cap: every file under ${ROOTS.join(", ")} is under ${CAP} lines\n`);
