/**
 * Shared fixtures for the `crew update <collection>` e2e suites
 * (PRD §10.1, C-UPD-26..32).
 *
 * Every tap is a real local `file://` git repo; nothing here touches the
 * network. Each calling suite redirects its own Claude Code adapter.
 */

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import type { TapRefreshRow } from "../../../src/commands/tap/refresh.ts";
import type { UpdateSelector } from "../../../src/commands/update/plan.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/index.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

/**
 * The `crew update --json` payload, derived from the production types
 * so a schema change breaks these suites at compile time rather than
 * silently passing against `any`. `error` is present only on failure
 * runs, which is why the two halves are optional.
 */
export interface UpdateJson {
  readonly rows: UpdateRow[];
  readonly tap_reexpand_rows: TapReexpandRow[];
  readonly tap_rows: TapRefreshRow[];
  readonly selectors: UpdateSelector[];
  readonly dry_run?: boolean;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly details: Record<string, unknown> & { readonly candidates?: string[] };
  };
}

export interface RunResult {
  readonly code: number;
  readonly out: string;
  json(): UpdateJson;
}

export function run(home: string, args: string[], cwd?: string): RunResult {
  const cap = captureStreams();
  const code = runCli(args, {
    home,
    streams: cap.streams,
    ...(cwd === undefined ? {} : { cwd }),
  });
  return { code, out: cap.stdout(), json: () => JSON.parse(cap.stdout()) };
}

/** Flat tap: `<repo>/<skill>/SKILL.md` per name. */
export function buildFlatTap(prefix: string, names: readonly string[]): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  for (const name of names) makeSkill(repo, name, skillFrontmatter({ name }));
  commitAll(repo, "init");
  return repo;
}

/** Namespaced tap: `<repo>/skills/<ns>/<skill>/SKILL.md`. */
export function buildNamespacedTap(
  prefix: string,
  layout: Record<string, readonly string[]>,
): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  mkdirSync(join(repo, "skills"));
  for (const [ns, names] of Object.entries(layout)) {
    mkdirSync(join(repo, "skills", ns));
    for (const name of names) makeSkill(join(repo, "skills", ns), name, skillFrontmatter({ name }));
  }
  commitAll(repo, "init");
  return repo;
}

/** Rewrite one skill's body in `repo` and commit. */
export function bump(repo: string, relSkillDir: string, name: string, body: string): void {
  makeSkill(join(repo, relSkillDir), name, skillFrontmatter({ name }), body);
  commitAll(repo, `bump ${name}`);
}

export function installedBody(root: string, name: string): string {
  return readFileSync(join(root, name, "SKILL.md"), "utf8");
}

/** A crew home with the default `core` tap removed, so taps are explicit. */
export function freshHome(): string {
  const home = makeCrewHome();
  run(home, ["tap", "remove", "core", "--force"]);
  return home;
}

/**
 * Register a tap whose `file://` URL points at a deleted path, so
 * refreshing it fails. Injected straight into config because
 * `crew tap add` validates by cloning and would reject it.
 */
export function addBrokenTap(home: string, name: string): void {
  const gone = makeTempDir(`upd-coll-broken-${name}-`);
  rmSync(gone, { recursive: true, force: true });
  const cfg = readConfig(home);
  writeConfig(
    {
      ...cfg,
      taps: [
        ...cfg.taps,
        { name, kind: "git", registered: true, url: `file://${gone}`, subpath: "", path: "" },
      ],
    },
    home,
  );
}
