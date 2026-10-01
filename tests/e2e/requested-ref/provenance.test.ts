/**
 * Requested-ref namespace fallback keeps repository and commit provenance
 * (§8.3, §9 step 3; C-INST-05c/05e).
 */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import type { Marker } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../helpers/fixtures.ts";

const originals = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let agentRoot: string;
beforeEach(() => {
  agentRoot = makeTempDir("crew-provenance-agent-");
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originals.userPath;
  claudeCodeAdapter.detect = originals.detect;
});

const cases = [
  {
    label: "unavailable fallback cannot borrow named export",
    named: true,
    tagA: true,
    tagB: false,
    deleted: false,
    ref: "team/foo@v1",
    code: 4,
  },
  {
    label: "selected fallback supplies its own bytes and SHA",
    named: true,
    tagA: true,
    tagB: true,
    deleted: false,
    ref: "team/foo@v1",
    code: 0,
  },
  {
    label: "fallback survives unavailable named ref and deleted HEAD",
    named: true,
    tagA: false,
    tagB: true,
    deleted: true,
    ref: "team/foo@v1",
    code: 0,
  },
  {
    label: "namespace resolves historically without a named tap",
    named: false,
    tagA: false,
    tagB: true,
    deleted: true,
    ref: "team/foo@v1",
    code: 0,
  },
  {
    label: "missing named ref retains ref_not_found",
    named: true,
    tagA: false,
    tagB: false,
    deleted: false,
    ref: "team/foo@v1",
    code: 5,
  },
  {
    label: "bare lookup excludes a tap without the requested ref",
    named: true,
    tagA: false,
    tagB: true,
    deleted: true,
    ref: "foo@v1",
    code: 0,
  },
  {
    label: "three-segment lookup keeps its explicit tap",
    named: true,
    tagA: false,
    tagB: true,
    deleted: true,
    ref: "other/team/foo@v1",
    code: 0,
  },
] as const;

for (const scenario of cases) {
  test(`C-INST-05c/05e ${scenario.label}`, () => {
    const home = makeCrewHome();
    writeConfig({ ...readConfig(home), taps: [] }, home);
    const repoA = makeTempDir("crew-provenance-A-");
    makeGitRepo(repoA);
    makeSkill(
      join(repoA, "skills", "team"),
      "foo",
      skillFrontmatter({ name: scenario.ref === "foo@v1" ? "foo" : "bar", description: "A bytes" }),
    );
    commitAll(repoA, "A skill");
    if (scenario.tagA) tagRepo(repoA, "v1");
    const repoB = makeTempDir("crew-provenance-B-");
    makeGitRepo(repoB);
    makeSkill(
      join(repoB, "skills", "team"),
      "foo",
      skillFrontmatter({ name: "foo", description: "B bytes" }),
    );
    const shaB = commitAll(repoB, "B skill");
    if (scenario.tagB) tagRepo(repoB, "v1");
    if (scenario.deleted) {
      rmSync(join(repoB, "skills", "team", "foo"), { recursive: true });
      commitAll(repoB, "delete B skill at HEAD");
    }
    const run = (args: string[]) => {
      const cap = captureStreams();
      return {
        code: runCli(args, { home, streams: cap.streams }),
        out: cap.stdout(),
        err: cap.stderr(),
      };
    };
    if (scenario.named) expect(run(["tap", "add", `file://${repoA}`, "team"]).code).toBe(0);
    expect(run(["tap", "add", `file://${repoB}`, "other"]).code).toBe(0);
    const ref = scenario.ref;
    const preview = run(["info", ref]);
    expect(preview.code).toBe(scenario.code);
    if (scenario.code === 0) expect(preview.out).toContain("B bytes");
    const result = run(["install", ref, "--agent", "claude-code"]);
    expect(result.code).toBe(scenario.code);
    if (scenario.code !== 0) {
      expect(readState(home).installations).toHaveLength(0);
      if (scenario.code === 5) expect(result.err).toContain("ref_not_found");
      return;
    }
    const state = readState(home).installations;
    expect(state).toHaveLength(1);
    expect(state[0]!.name).toBe("foo");
    expect(state[0]!.source.tap).toBe("other");
    expect(state[0]!.resolved_sha).toBe(shaB);
    const dest = join(agentRoot, "foo");
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("B bytes");
    const marker = JSON.parse(readFileSync(join(dest, ".crew.json"), "utf8")) as Marker;
    expect(marker.tap_url).toBe(`file://${repoB}`);
    expect(marker.resolved_sha).toBe(shaB);
  });
}
