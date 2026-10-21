/** Unreadable and malformed marker inventory must not authorize repair (§11.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { ALL_AGENTS } from "../../src/agents/registry.ts";
import { resetAutoupdatePlatform, setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let target: string;
let cwd: string;
beforeEach(() => {
  target = makeTempDir();
  cwd = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = (root) => join(root, adapter.name);
    adapter.detect = () => false;
  }
  claudeCodeAdapter.detect = () => true;
  setAutoupdatePlatform("freebsd");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});
function invoke(home: string, args: string[]) {
  const cap = captureStreams();
  const code = runCli(args, { home, cwd, streams: cap.streams });
  return { code, text: cap.stdout(), stderr: cap.stderr(), json: () => JSON.parse(cap.stdout()) };
}
function installed() {
  const home = makeCrewHome();
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const installation = invoke(home, ["install", source, "--agent", "claude-code"]);
  const marker = join(target, "claude-code", "demo", ".crew.json");
  return { home, marker, installation, original: JSON.parse(readFileSync(marker, "utf8")) };
}
for (const scenario of [
  "unreadable",
  "malformed",
  "missing-agents",
  "invalid-scope",
  "bad-tap",
  "bad-discovery",
] as const) {
  test(`C-STATE-14 ${scenario} marker reports findings and preserves repair inputs`, () => {
    const { home, marker, original, installation } = installed();
    expect(installation.code).toBe(0);
    const orphan = join(home, "store", "orphan@12345678");
    mkdirSync(orphan);
    if (scenario === "unreadable") chmodSync(marker, 0);
    else if (scenario === "malformed") writeFileSync(marker, "{broken");
    else {
      const fields = {
        "missing-agents": { agents: null },
        "invalid-scope": { scope: "bogus" },
        "bad-tap": { tap_name: "invalid/name", tap_kind: "bogus" },
        "bad-discovery": { tap_discovery: "bogus" },
      };
      writeFileSync(marker, JSON.stringify({ ...original, ...fields[scenario] }));
    }
    const state = readFileSync(join(home, "state.json"), "utf8");
    const config = readFileSync(join(home, "config.yaml"), "utf8");
    try {
      for (const flags of [[], ["--repair"], ["--repair", "--dry-run"]]) {
        const result = invoke(home, ["doctor", ...flags, "--json"]);
        expect(result.code).toBe(1);
        const data = result.json();
        expect(data.findings).toContainEqual(
          expect.objectContaining({
            level: "error",
            code: scenario === "unreadable" ? "marker_unreadable" : "marker_invalid",
          }),
        );
        expect(
          data.findings.some((finding: { message: string }) => finding.message.includes(marker)),
        ).toBe(true);
        if (flags.length === 1) expect(data.repairs).toEqual([]);
      }
      const quiet = invoke(home, ["doctor", "--repair", "--quiet"]);
      expect(quiet.code).toBe(1);
      expect(quiet.text).toBe("");
      expect(quiet.stderr).toContain(marker);
      const human = invoke(home, ["doctor", "--repair", "--dry-run"]);
      expect(human.text).toContain("would address 0 findings");
      expect(human.text).not.toContain("would be repaired");
      expect(readFileSync(join(home, "state.json"), "utf8")).toBe(state);
      expect(readFileSync(join(home, "config.yaml"), "utf8")).toBe(config);
      expect(readConfig(home).taps.length).toBeGreaterThan(0);
      expect(existsSync(orphan)).toBe(true);
    } finally {
      if (scenario === "unreadable") chmodSync(marker, 0o600);
    }
  });
}
test("C-STATE-14 genuinely absent marker can still be reconciled", () => {
  const { home, marker, installation } = installed();
  expect(installation.code).toBe(0);
  rmSync(marker);
  const result = invoke(home, ["doctor", "--repair", "--json"]);
  expect(result.code).toBe(0);
  expect(readState(home).installations).toEqual([]);
});

test("C-STATE-14 invalid required marker fields cannot reconstruct state", () => {
  const { home, marker, original, installation } = installed();
  expect(installation.code).toBe(0);
  const statePath = join(home, "state.json");
  rmSync(statePath);
  const corrupt = [
    null,
    [],
    "text",
    { ...original, schema_version: 2 },
    { ...original, agents: [] },
    { ...original, agents: [42] },
    { ...original, name: 42 },
    { ...original, name: "" },
    { ...original, ref: 42 },
  ];
  for (const value of corrupt) {
    writeFileSync(marker, JSON.stringify(value));
    const result = invoke(home, ["doctor", "--repair", "--json"]);
    expect(result.code).toBe(1);
    expect(result.json().findings).toContainEqual(
      expect.objectContaining({ code: "marker_invalid" }),
    );
    expect(existsSync(statePath)).toBe(false);
  }
});

for (const scenario of ["malformed", "unreadable"] as const) {
  test(`C-STATE-14 shared paths report each ${scenario} marker once`, () => {
    const { home, marker, original, installation } = installed();
    expect(installation.code).toBe(0);
    codexAdapter.userPath = claudeCodeAdapter.userPath;
    const sibling = join(target, "claude-code", "other", ".crew.json");
    mkdirSync(join(target, "claude-code", "other"));
    writeFileSync(sibling, JSON.stringify(original));
    for (const path of [marker, sibling]) {
      if (scenario === "malformed") writeFileSync(path, "{broken");
      else chmodSync(path, 0);
    }
    try {
      const result = invoke(home, ["doctor", "--json"]);
      expect(result.code).toBe(1);
      const code = scenario === "malformed" ? "marker_invalid" : "marker_unreadable";
      const findings = result
        .json()
        .findings.filter((finding: { code: string }) => finding.code === code);
      expect(findings).toHaveLength(2);
      expect(
        findings.filter((finding: { message: string }) => finding.message.includes(marker)),
      ).toHaveLength(1);
      expect(
        findings.filter((finding: { message: string }) => finding.message.includes(sibling)),
      ).toHaveLength(1);
      expect(invoke(home, ["doctor"]).text).toContain("Found 3 problems.");
    } finally {
      if (scenario === "unreadable") {
        chmodSync(marker, 0o600);
        chmodSync(sibling, 0o600);
      }
    }
  });
}
