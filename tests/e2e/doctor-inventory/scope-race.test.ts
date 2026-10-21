/** Cross-scope shared-path inventory races must preserve the surviving install (§7.2, §11.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ampAdapter } from "../../../src/agents/amp.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
// Allow Bun startup and a real uninstall on CI while bounding a stuck child.
const UNINSTALL_CHILD_TIMEOUT_MS = 10_000;
let target: string;
let project: string;
let shared: string;
beforeEach(() => {
  target = makeTempDir();
  project = makeTempDir();
  shared = join(project, ".agents", "skills");
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = (root) => join(root, adapter.name);
    adapter.detect = () => false;
  }
  ampAdapter.projectPath = () => shared;
  ampAdapter.detect = () => true;
  codexAdapter.userPath = () => shared;
  codexAdapter.projectPath = () => shared;
  codexAdapter.detect = () => true;
  setAutoupdatePlatform("freebsd");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});

test("C-STATE-14 repair preserves a project owner when a user alias is uninstalled during initial inventory", () => {
  const home = makeCrewHome();
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  for (const [scope, agent] of [
    ["project", "amp"],
    ["user", "codex"],
  ] as const) {
    expect(
      runCli(["install", source, "--scope", scope, "--agent", agent, "--json"], {
        home,
        cwd: project,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
  }
  const marker = join(shared, "demo", ".crew.json");
  expect(JSON.parse(readFileSync(marker, "utf8"))).toMatchObject({
    scope: "user",
    agents: ["amp", "codex"],
  });
  const entry = readState(home).installations[0]!;
  const preservedPaths = [
    join(home, "state.json"),
    join(home, "config.yaml"),
    marker,
    join(shared, "demo", "SKILL.md"),
    join(home, "store", `demo@${entry.content_hash.slice(7, 15)}`, "SKILL.md"),
  ];
  const child = `
    import { join } from "node:path";
    import { ALL_AGENTS } from ${JSON.stringify(new URL("../../../src/agents/registry.ts", import.meta.url).href)};
    import { runCli } from ${JSON.stringify(new URL("../../../src/cli/main.ts", import.meta.url).href)};
    const { home, target, project, shared } = JSON.parse(process.argv[1]);
    for (const adapter of ALL_AGENTS) {
      adapter.userPath = () => adapter.name === "codex" ? shared : join(target, adapter.name);
      adapter.projectPath = (root) => ["amp", "codex"].includes(adapter.name) ? shared : join(root, adapter.name);
      adapter.detect = () => ["amp", "codex"].includes(adapter.name);
    }
    process.exitCode = runCli(["uninstall", "demo", "--scope", "user", "--agent", "codex", "--json"], {home, cwd: project});
  `;
  let uninstalled = false;
  let checkpoint: Buffer<ArrayBuffer>[] = [];
  // Amp has read the user-scoped marker from its project base; Codex has not scanned it yet.
  codexAdapter.userPath = () => {
    if (!uninstalled) {
      uninstalled = true;
      expect(existsSync(join(home, "state.json.lock"))).toBe(false);
      const result = Bun.spawnSync(
        [process.execPath, "--eval", child, JSON.stringify({ home, target, project, shared })],
        { stdout: "pipe", stderr: "pipe", timeout: UNINSTALL_CHILD_TIMEOUT_MS },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr.toString()).toBe("");
      expect(readState(home).installations).toEqual([
        expect.objectContaining({ scope: "project", agents: ["amp"], project_root: project }),
      ]);
      expect(JSON.parse(readFileSync(marker, "utf8"))).toMatchObject({
        scope: "user",
        agents: ["amp"],
      });
      checkpoint = preservedPaths.map((path) => readFileSync(path));
    }
    return shared;
  };
  const cap = captureStreams();
  const code = runCli(["doctor", "--repair", "--json"], {
    home,
    cwd: project,
    streams: cap.streams,
  });
  expect(uninstalled).toBe(true);
  expect(checkpoint).toHaveLength(5);
  expect(preservedPaths.map((path) => (existsSync(path) ? readFileSync(path) : null))).toEqual(
    checkpoint,
  );
  expect(code).toBe(1);
  expect(cap.stderr()).toBe("");
  const result = JSON.parse(cap.stdout());
  expect(result.repairs).toEqual([]);
  expect(result.findings).toContainEqual(
    expect.objectContaining({
      code: "marker_invalid",
      message: expect.stringContaining(marker),
    }),
  );
});
