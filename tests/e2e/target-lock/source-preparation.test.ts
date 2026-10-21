/** Every fallback source acquisition finishes before shared target admission (§10.1, §14). */
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { tapClonePath } from "../../../src/core/repo-path.ts";
import { type GitRunner, resetGitRunner, runGit, setGitRunner } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../helpers/fixtures.ts";

const root = resolve(import.meta.dir, "../../..");
const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetGitRunner();
});

for (const kind of ["entry", "group", "missing-mirror"] as const) {
  test(`C-CONC-07 update prepares ${kind} source fallback outside every target lock`, () => {
    const home = makeCrewHome();
    const cwd = makeTempDir();
    const target = makeTempDir();
    for (const adapter of ALL_AGENTS) {
      adapter.userPath = () => target;
      adapter.projectPath = () => join(cwd, "unused", adapter.name);
      adapter.detect = () => adapter.name === "claude-code";
    }
    const invoke = (args: readonly string[]) => {
      const c = captureStreams();
      const code = runCli([...args, "--json"], { home, cwd, streams: c.streams });
      return { code, output: JSON.parse(c.stdout()), stderr: c.stderr() };
    };
    expect(invoke(["tap", "remove", "core", "--force"]).code).toBe(0);
    const repo = makeTempDir();
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    makeGitRepo(repo);
    tagRepo(repo, "v1");
    expect(invoke(["tap", "add", `file://${repo}`, "fixture"]).code).toBe(0);
    const tracked = kind !== "entry";
    expect(
      invoke([
        "install",
        tracked ? `file://${repo}@v1` : "fixture/demo@v1",
        ...(tracked ? ["--tap"] : []),
        "--agent",
        "claude-code",
      ]).code,
    ).toBe(0);
    expect(readState(home).installations[0]!.tracks_tap === true).toBe(tracked);
    const before = readFileSync(join(target, "demo", ".crew.json"));
    const healthyRoot = makeTempDir();
    const healthy = makeSkill(healthyRoot, "healthy", skillFrontmatter({ name: "healthy" }), "old");
    expect(invoke(["install", healthy, "--agent", "claude-code"]).code).toBe(0);
    writeFileSync(join(healthy, "new.txt"), "healthy revision");
    const observer = makeSkill(makeTempDir(), "observer", skillFrontmatter({ name: "observer" }));
    if (kind === "missing-mirror") {
      const tap = readConfig(home).taps.find((tap) => tap.kind === "git")!;
      rmSync(tapClonePath(tap, home), { recursive: true });
      rmSync(repo, { recursive: true });
    } else runGit(["tag", "--delete", "v1"], { cwd: repo });
    const operations: { op: string; held: boolean; contender: number }[] = [];
    let real: GitRunner;
    real = setGitRunner((args, options) => {
      const op = args.find((arg) => arg === "clone" || arg === "fetch");
      if (op) {
        const observerHome = makeCrewHome();
        const held = existsSync(join(target, ".crew-target.lock"));
        const script = `import {runCli} from ${JSON.stringify(join(root, "src/cli/main.ts"))};
import {ALL_AGENTS} from ${JSON.stringify(join(root, "src/agents/registry.ts"))};
import {installNetworkTripwire,takeRemoteGitFailure} from ${JSON.stringify(join(root, "tests/helpers/no-network.ts"))};
installNetworkTripwire();for(const a of ALL_AGENTS){a.userPath=()=>${JSON.stringify(target)};a.projectPath=a.userPath;a.detect=()=>true;}
process.exitCode=runCli(["install",${JSON.stringify(observer)},"--agent","codex","--json"],{home:${JSON.stringify(observerHome)},cwd:${JSON.stringify(cwd)}});
const violation=takeRemoteGitFailure();if(violation)throw new Error(violation);`;
        const child = Bun.spawnSync([process.execPath, "-e", script], {
          env: { ...process.env, CREW_LOCK_TIMEOUT_MS: "100" },
          timeout: 5000,
        });
        operations.push({ op, held, contender: child.exitCode });
      }
      return real(args, options);
    });
    const result = invoke(["update"]);
    expect(result.code, result.stderr).toBe(1);
    expect(operations.length, JSON.stringify(operations)).toBe(2);
    expect(operations.filter((op) => op.held)).toEqual([]);
    expect(operations.every((op) => op.contender === 0)).toBe(true);
    expect(readFileSync(join(target, "demo", ".crew.json"))).toEqual(before);
    expect(readFileSync(join(target, "healthy", "new.txt"), "utf8")).toBe("healthy revision");
    expect(
      result.output.rows.find((row: { name: string }) => row.name === "demo").outcome.error.code,
    ).toBe(kind === "missing-mirror" ? "source_unreachable" : "ref_not_found");
    if (tracked) expect(result.output.tap_reexpand_rows[0].kind).toBe("tap_error");
  }, 25_000);
}
