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

import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_GIST = "https://gist.github.com/stevekrenzel/7489027d2d93c185f48a628547c043d8";

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function exec(cmd: string[], env: Record<string, string> = {}): Run {
  const proc = Bun.spawnSync({ cmd, cwd: ROOT, env: { ...process.env, ...env } });
  return {
    code: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

/** A scratch user: HOME and CREW_HOME, so nothing touches the real ones. */
function scratchHome(): { env: Record<string, string>; skills: string } {
  const home = mkdtempSync(join(tmpdir(), "crew-smoke-gist-"));
  return {
    env: { HOME: home, CREW_HOME: join(home, ".crew"), CREW_NO_UPDATE_CHECK: "1" },
    skills: join(home, ".claude", "skills"),
  };
}

function crew(env: Record<string, string>, args: string[]): Run {
  const r = exec(["bun", "run", "src/index.ts", ...args, "--agent", "claude-code"], env);
  if (r.code !== 0) fail(`crew ${args.join(" ")} exited ${r.code}\n${r.stdout}${r.stderr}`);
  return r;
}

function fail(message: string): never {
  process.stderr.write(`smoke:gist FAILED — ${message}\n`);
  process.exit(1);
}

function check(ok: boolean, message: string): void {
  if (!ok) fail(message);
  process.stdout.write(`ok  ${message}\n`);
}

/** The gist's skill files, from a clone crew had no part in: name → bytes. */
function expectedSkills(cloneUrl: string): { sha: string; files: Map<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), "crew-smoke-gist-direct-"));
  const clone = exec(["git", "clone", "--quiet", cloneUrl, dir]);
  if (clone.code !== 0) fail(`git clone ${cloneUrl} failed\n${clone.stderr}`);
  const sha = exec(["git", "-C", dir, "rev-parse", "HEAD"]).stdout.trim();
  const files = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    if (!/\.md$/i.test(name)) continue;
    const text = readFileSync(join(dir, name), "utf8");
    if (text.trimStart().startsWith("---")) files.set(name, text);
  }
  if (files.size === 0) fail(`${cloneUrl} has no skill files to check against`);
  return { sha, files };
}

function declaredName(skillMd: string): string {
  return /^name:\s*["']?([a-z0-9-]+)/m.exec(skillMd)?.[1] ?? fail("a skill file has no name");
}

function installedSkills(skills: string): string[] {
  return readdirSync(skills).sort();
}

const page = (process.argv[2] ?? DEFAULT_GIST).replace(/\/+$/, "");
const id = page.split("/").pop() ?? fail(`can't read a gist ID from ${page}`);
const { sha, files } = expectedSkills(`https://gist.github.com/${id}.git`);
const names = [...files.values()].map(declaredName).sort();
process.stdout.write(`gist ${id} at ${sha.slice(0, 8)}: ${names.join(", ")}\n`);

// The page URL installs every skill, byte for byte, under the derived tap.
const whole = scratchHome();
crew(whole.env, ["install", page]);
check(
  JSON.stringify(installedSkills(whole.skills)) === JSON.stringify(names),
  `${page} installs ${names.join(", ")}`,
);
for (const text of files.values()) {
  const installed = readFileSync(join(whole.skills, declaredName(text), "SKILL.md"), "utf8");
  check(installed === text, `${declaredName(text)}/SKILL.md matches the gist byte for byte`);
}
const state = JSON.parse(readFileSync(join(whole.env["CREW_HOME"]!, "state.json"), "utf8"));
const taps = new Set(state.installations.map((e: { source: { tap: string } }) => e.source.tap));
check(
  taps.size === 1 && taps.has(`gist-${id.slice(0, 8)}`),
  `recorded under tap gist-${id.slice(0, 8)}`,
);
crew(whole.env, ["update"]);
check(true, "crew update on the installed gist exits 0");

// A revision page pins that revision.
const pinned = scratchHome();
crew(pinned.env, ["install", `${page}/${sha}`]);
const pinnedState = JSON.parse(readFileSync(join(pinned.env["CREW_HOME"]!, "state.json"), "utf8"));
check(
  pinnedState.installations.every((e: { resolved_sha: string }) => e.resolved_sha === sha),
  `${page}/${sha.slice(0, 8)}… installs that revision`,
);

// `//<file>` installs just that file's skill.
const [file, text] = [...files.entries()][0]!;
const one = scratchHome();
crew(one.env, ["install", `${page}//${file}`]);
check(
  JSON.stringify(installedSkills(one.skills)) === JSON.stringify([declaredName(text)]),
  `${page}//${file} installs only ${declaredName(text)}`,
);

process.stdout.write("smoke:gist passed\n");
