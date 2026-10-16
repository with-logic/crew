/**
 * Live smoke check: install a real GitHub gist end to end (§8.2 "Gists").
 *
 * The test suite never touches the network, so it serves gists from local
 * repositories. This script is the other half: it runs crew from source
 * against `gist.github.com` itself, in a scratch HOME and CREW_HOME, and
 * checks what landed against an independent `git clone` of the gist.
 * It covers what only GitHub can answer — that the owner-less clone URL
 * crew records clones, that a revision page's SHA is fetchable, and that
 * the gist's files arrive byte for byte.
 *
 *   bun run smoke:gist [https://gist.github.com/<owner>/<id>]
 *
 * Needs network access; it is never part of `bun test`.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSkillFileName } from "../src/core/gist-url.ts";
import { opensFrontmatter } from "../src/skill/frontmatter.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_GIST = "https://gist.github.com/stevekrenzel/7489027d2d93c185f48a628547c043d8";

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface Scratch {
  readonly env: Record<string, string>;
  readonly skills: string;
  readonly state: () => { installations: { name: string; resolved_sha: string }[] };
}

function exec(cmd: string[], env: Record<string, string> = {}): Run {
  const proc = Bun.spawnSync({ cmd, cwd: ROOT, env: { ...process.env, ...env } });
  return {
    code: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

/** A scratch user, with claude-code detectable, so nothing touches the real home. */
function scratchHome(): Scratch {
  const home = mkdtempSync(join(tmpdir(), "crew-smoke-gist-"));
  mkdirSync(join(home, ".claude"));
  const crewHome = join(home, ".crew");
  return {
    env: { HOME: home, CREW_HOME: crewHome, CREW_NO_UPDATE_CHECK: "1" },
    skills: join(home, ".claude", "skills"),
    state: () => JSON.parse(readFileSync(join(crewHome, "state.json"), "utf8")),
  };
}

function crew(scratch: Scratch, args: string[]): Run {
  const r = exec(["bun", "run", "src/index.ts", ...args, "--agent", "claude-code"], scratch.env);
  if (r.code !== 0) fail(`crew ${args.join(" ")} exited ${r.code}\n${r.stdout}${r.stderr}`);
  return r;
}

function fail(message: string): never {
  process.stderr.write(`smoke:gist FAILED — ${message}\n`);
  process.exit(1);
}

/** Pass when `actual` equals `expected`; otherwise fail showing both. */
function check(what: string, actual: unknown, expected: unknown): void {
  const [a, e] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== e) fail(`${what}\n  expected ${e}\n  actual   ${a}`);
  process.stdout.write(`ok  ${what}\n`);
}

function git(dir: string, args: string[]): string {
  const r = exec(["git", "-C", dir, ...args]);
  if (r.code !== 0) fail(`git ${args.join(" ")} failed\n${r.stderr}`);
  return r.stdout;
}

/** The gist's skill files at `rev`, by crew's own candidate rule: file → bytes. */
function skillFilesAt(dir: string, rev: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of git(dir, ["ls-tree", "--name-only", rev]).split("\n")) {
    if (!isSkillFileName(name)) continue;
    const text = git(dir, ["show", `${rev}:${name}`]);
    if (opensFrontmatter(text)) files.set(name, text);
  }
  return files;
}

function declaredName(skillMd: string): string {
  return /^name:\s*["']?([a-z0-9-]+)/m.exec(skillMd)?.[1] ?? fail("a skill file has no name");
}

function namesOf(files: Map<string, string>): string[] {
  return [...files.values()].map(declaredName).sort();
}

const installedNames = (scratch: Scratch): string[] => readdirSync(scratch.skills).sort();

const page = (process.argv[2] ?? DEFAULT_GIST).replace(/\/+$/, "");
const id = page.split("/").pop() ?? fail(`can't read a gist ID from ${page}`);

// An independent clone: the gist as GitHub serves it, with no crew involved.
const direct = mkdtempSync(join(tmpdir(), "crew-smoke-gist-direct-"));
const clone = exec(["git", "clone", "--quiet", `https://gist.github.com/${id}.git`, direct]);
if (clone.code !== 0) fail(`git clone failed\n${clone.stderr}`);
const revisions = git(direct, ["rev-list", "HEAD"]).trim().split("\n");
const head = revisions[0]!;
if (git(direct, ["ls-tree", "--name-only", head]).split("\n").includes("SKILL.md")) {
  fail(
    `${page} has a root SKILL.md, so it is one skill — point this script at a gist of skill files`,
  );
}
const files = skillFilesAt(direct, head);
if (files.size === 0) fail(`${page} has no skill files to check against`);
process.stdout.write(`gist ${id} at ${head.slice(0, 8)}: ${namesOf(files).join(", ")}\n`);

// The page URL installs every skill, byte for byte, under the derived tap.
const whole = scratchHome();
crew(whole, ["install", page]);
check("the page URL installs every skill", installedNames(whole), namesOf(files));
const shas = whole.state().installations.map((e) => e.resolved_sha);
check(
  "every skill is recorded at the gist's HEAD (rerun if the gist moved)",
  [...new Set(shas)],
  [head],
);
for (const text of files.values()) {
  const name = declaredName(text);
  check(
    `${name}/SKILL.md matches the gist`,
    readFileSync(join(whole.skills, name, "SKILL.md"), "utf8"),
    text,
  );
}
const update = JSON.parse(crew(whole, ["update", "--json"]).stdout);
const outcomes = update.rows.map((r: { outcome: { kind: string } }) => r.outcome.kind);
check("crew update reports every skill up to date", [...new Set(outcomes)], ["up_to_date"]);

// `//<file>` installs just that file's skill.
const [file, text] = [...files.entries()][0]!;
const one = scratchHome();
crew(one, ["install", `${page}//${file}`]);
check(`${page}//${file} installs only that skill`, installedNames(one), [declaredName(text)]);

// A revision page installs that revision — an older one, when the gist has
// one; otherwise HEAD's page, which only shows the page URL resolves.
const oldest = revisions[revisions.length - 1]!;
const label = oldest === head ? "(the gist's only revision)" : "(an older revision)";
const pinned = scratchHome();
crew(pinned, ["install", `${page}/${oldest}`]);
const then = skillFilesAt(direct, oldest);
check(
  `a revision page installs that revision's skills ${label}`,
  installedNames(pinned),
  namesOf(then),
);
const pinnedShas = pinned.state().installations.map((e) => e.resolved_sha);
check("…recorded at that revision", [...new Set(pinnedShas)], [oldest]);
for (const bytes of then.values()) {
  const name = declaredName(bytes);
  check(
    `…with ${name} as it was`,
    readFileSync(join(pinned.skills, name, "SKILL.md"), "utf8"),
    bytes,
  );
}

process.stdout.write("smoke:gist passed\n");
