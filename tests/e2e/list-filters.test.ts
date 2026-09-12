/**
 * `crew list --agent` / `--tap` filters (§5.1 "`crew list` agent and tap
 * filters"). Covers C-LIST-04..06: each filter narrows rows, unknown
 * names are usage errors, filters compose with `--scope`, and the JSON
 * payload reports the active filters.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

/**
 * The three adapter members a test may point at a temp root: where the
 * user- and project-scope installs land, and whether crew considers the
 * adapter present at all. Named for what it permits rather than for the
 * mutation itself.
 */
type RedirectableAdapter = {
  userPath: AgentAdapter["userPath"];
  projectPath: AgentAdapter["projectPath"];
  detect: AgentAdapter["detect"];
};
// Direct assignment (no double cast) so a change to the adapter contract
// is a type error here rather than being erased by `as unknown as`.
const adapters: RedirectableAdapter[] = [claudeCodeAdapter, codexAdapter];
let originals: RedirectableAdapter[];

beforeEach(() => {
  originals = adapters.map((a) => ({
    userPath: a.userPath,
    projectPath: a.projectPath,
    detect: a.detect,
  }));
  for (const a of adapters) {
    const dir = makeTempDir("crew-agent-");
    a.userPath = () => dir;
    a.projectPath = (c) => join(c, ".agents", dir.split("/").pop()!);
    a.detect = () => true;
  }
});
afterEach(() => {
  adapters.forEach((a, i) => {
    a.userPath = originals[i]!.userPath;
    a.projectPath = originals[i]!.projectPath;
    a.detect = originals[i]!.detect;
  });
});

const quiet = () => captureStreams().streams;

/**
 * `alpha` from its own path tap into both agents; `beta` from another tap
 * into codex only.
 *
 * Both installs name their agents explicitly. An unrestricted `crew
 * install` targets every *detected* adapter, and this file only redirects
 * `claude-code` and `codex` — so on a host where a third adapter is
 * detected it would join the install, making the expected agent lists
 * below environment-dependent.
 */
function seed(home: string): void {
  const a = makeTempDir("crew-alpha-src-");
  const b = makeTempDir("crew-beta-src-");
  const alpha = makeSkill(a, "alpha", skillFrontmatter({ name: "alpha" }));
  const beta = makeSkill(b, "beta", skillFrontmatter({ name: "beta" }));
  const alphaArgs = ["install", "--agent", "claude-code", "--agent", "codex", alpha];
  if (runCli(alphaArgs, { home, streams: quiet() }) !== 0) throw new Error("alpha");
  if (runCli(["install", "--agent", "codex", beta], { home, streams: quiet() }) !== 0)
    throw new Error("beta");
}

interface ListJson {
  scope: string | null;
  agent: string[];
  tap: string | null;
  installations: { name: string; agents: string[]; source: { tap: string } }[];
}

function run(home: string, ...args: string[]) {
  const cap = captureStreams();
  const code = runCli(["list", ...args], { home, streams: cap.streams });
  return { code, out: cap.stdout(), err: cap.stderr() };
}

function json(home: string, ...args: string[]): ListJson {
  const r = run(home, "--json", ...args);
  if (r.code !== 0) throw new Error(`list exited ${r.code}: ${r.err}`);
  return JSON.parse(r.out) as ListJson;
}

describe("crew list --agent / --tap", () => {
  test("C-LIST-04 --agent keeps rows installed into that agent and reports the filter", () => {
    const home = makeCrewHome();
    seed(home);
    const codex = json(home, "--agent", "codex");
    expect(codex.installations.map((e) => e.name).sort()).toEqual(["alpha", "beta"]);
    expect(codex.agent).toEqual(["codex"]);
    const cc = json(home, "--agent", "claude-code");
    expect(cc.installations.map((e) => e.name)).toEqual(["alpha"]);
    // Filter selects rows; it doesn't hide the row's full agent list.
    expect([...cc.installations[0]!.agents].sort()).toEqual(["claude-code", "codex"]);
    const human = run(home, "--agent", "claude-code");
    expect(human.out).toContain("alpha");
    expect(human.out).not.toContain("beta");
    expect(human.out).toContain("claude-code, codex");
    expect(json(home).agent).toEqual([]);
  });

  test("C-LIST-04 --agent is repeatable (any-of)", () => {
    const home = makeCrewHome();
    seed(home);
    const both = json(home, "--agent", "claude-code", "--agent", "codex");
    expect(both.installations.map((e) => e.name).sort()).toEqual(["alpha", "beta"]);
    expect(both.agent).toEqual(["claude-code", "codex"]);
  });

  test("C-LIST-04 an unknown agent is a usage_error naming the known agents", () => {
    const home = makeCrewHome();
    seed(home);
    const r = run(home, "--agent", "nope");
    expect(r.code).toBe(4);
    expect(r.err).toContain("unknown agent: nope");
    expect(r.err).toContain("claude-code");
  });

  test("C-LIST-05 --tap keeps rows attributed to that tap and reports the filter", () => {
    const home = makeCrewHome();
    seed(home);
    const all = json(home);
    const betaTap = all.installations.find((e) => e.name === "beta")!.source.tap;
    const filtered = json(home, "--tap", betaTap);
    expect(filtered.installations.map((e) => e.name)).toEqual(["beta"]);
    expect(filtered.tap).toBe(betaTap);
    expect(all.tap).toBeNull();
    const human = run(home, "--tap", betaTap);
    expect(human.out).toContain("beta");
    expect(human.out).not.toContain("alpha");
  });

  test("C-LIST-05 an unknown tap is a usage_error pointing at crew tap list", () => {
    const home = makeCrewHome();
    seed(home);
    const r = run(home, "--tap", "nope");
    expect(r.code).toBe(4);
    expect(r.err).toContain("`nope` was not found in your list of taps");
    expect(r.err).toContain("crew tap list");
  });

  test("C-LIST-05 a repeated --tap is a usage_error, not a silent unfiltered list", () => {
    const home = makeCrewHome();
    seed(home);
    const tap = json(home).installations[0]!.source.tap;
    // Repeating a single-value flag used to yield an array, which
    // `extras` dropped — so the filter silently vanished and neither
    // value was validated. Failing loudly is the only safe behaviour.
    const r = run(home, "--tap", tap, "--tap", "typo");
    expect(r.code).toBe(4);
    expect(r.err).toContain("`--tap` was given more than once");
  });

  test("C-LIST-05 the skills alias accepts list's own flags", () => {
    const home = makeCrewHome();
    seed(home);
    const tap = json(home).installations[0]!.source.tap;
    const aliased = run(home, "--json", "--tap", tap);
    const cap = captureStreams();
    const code = runCli(["skills", "--json", "--tap", tap], { home, streams: cap.streams });
    expect(code).toBe(0);
    expect(cap.stdout()).toBe(aliased.out);
  });

  test("C-LIST-07 prefixed aliases keep rejecting flags their subcommand ignores", () => {
    // `taps`/`untap` resolve to `tap list` / `tap remove`, neither of
    // which honours `--recursive`. Bare aliases like `skills` inherit
    // their canonical command's flag table; prefixed ones must not.
    const home = makeCrewHome();
    for (const cmd of ["taps", "untap"]) {
      const c = captureStreams();
      expect(runCli([cmd, "--recursive"], { home, streams: c.streams })).toBe(4);
      expect(c.stderr()).toContain("Unknown argument: recursive");
    }
  });

  test("C-LIST-06 filters compose with each other and with --scope", () => {
    const home = makeCrewHome();
    seed(home);
    const alphaTap = json(home).installations.find((e) => e.name === "alpha")!.source.tap;
    const hit = json(home, "--agent", "codex", "--tap", alphaTap, "--scope", "user");
    expect(hit.installations.map((e) => e.name)).toEqual(["alpha"]);
    expect(hit.scope).toBe("user");
    const miss = json(home, "--agent", "claude-code", "--tap", alphaTap, "--scope", "project");
    expect(miss.installations).toEqual([]);
  });

  test("C-LIST-06 an empty row-filtered view says no skills match those filters", () => {
    const home = makeCrewHome();
    seed(home);
    const r = run(home, "--agent", "claude-code", "--scope", "project");
    expect(r.code).toBe(0);
    expect(r.out).toContain("No skills match those filters.");
    expect(r.out).not.toContain("get started");
    // Scope alone keeps its own message.
    const scopeOnly = run(home, "--scope", "project");
    expect(scopeOnly.out).toContain("No skills installed at project scope.");
  });
});
