/** Shared clone cleanup retains repositories still referenced by a tap (§6, §16.5). */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readConfig } from "../../../src/config/load.ts";
import { cloneDirForTap, makeTempDir } from "../../helpers/fixtures.ts";
import { bareHome, run, twoSubpathRepo } from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let agentDir: string;

beforeEach(() => {
  agentDir = makeTempDir("crew-shared-agent-");
  claudeCodeAdapter.userPath = () => agentDir;
  claudeCodeAdapter.detect = () => true;
});

afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});

describe("shared clone cleanup", () => {
  test("C-TAP-28b auto-tap GC keeps a clone a registered tap still uses", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    // An install creates an auto tap; a registered tap over the same
    // repository is added separately.
    expect(run(home, ["install", `file://${repo}//alpha`, "--yes"]).code).toBe(0);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);
    const shared = cloneDirForTap("beta-tap", home)!;
    const autoTap = readConfig(home).taps.find((t) => !t.registered)!;
    expect(cloneDirForTap(autoTap.name, home)).toBe(shared);

    // Uninstalling the only skill collects the auto tap, but its bytes
    // are the registered tap's bytes too.
    expect(run(home, ["uninstall", "alpha"]).code).toBe(0);

    expect(readConfig(home).taps.some((t) => t.name === autoTap.name)).toBe(false);
    expect(existsSync(shared)).toBe(true);
    const search = run(home, ["search", "--json", "beta"]);
    const parsed = JSON.parse(search.stdout) as { hits: { name: string }[] };
    expect(parsed.hits.some((h) => h.name === "beta")).toBe(true);
  });

  test("C-TAP-28b `tap remove --uninstall` keeps a clone another tap shares", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    run(home, ["tap", "add", `file://${repo}//alpha`, "alpha-tap"]);
    run(home, ["tap", "add", `file://${repo}//beta`, "beta-tap"]);
    const shared = cloneDirForTap("alpha-tap", home)!;
    expect(run(home, ["install", "alpha-tap", "--yes"]).code).toBe(0);

    // The guard path removes the attached skill and then the tap; the
    // bytes stay because `beta-tap` still points at this repository.
    expect(run(home, ["tap", "remove", "--uninstall", "alpha-tap"]).code).toBe(0);

    expect(readConfig(home).taps.some((t) => t.name === "alpha-tap")).toBe(false);
    expect(existsSync(shared)).toBe(true);
    const search = run(home, ["search", "--json", "beta"]);
    const parsed = JSON.parse(search.stdout) as { hits: { name: string }[] };
    expect(parsed.hits.some((h) => h.name === "beta")).toBe(true);
  });

  test("C-TAP-28b auto-tap GC deletes a clone nothing else references", () => {
    const home = bareHome();
    const repo = twoSubpathRepo();
    expect(run(home, ["install", `file://${repo}//alpha`, "--yes"]).code).toBe(0);
    const autoTap = readConfig(home).taps.find((t) => !t.registered)!;
    const clone = cloneDirForTap(autoTap.name, home)!;
    expect(existsSync(clone)).toBe(true);

    expect(run(home, ["uninstall", "alpha"]).code).toBe(0);

    // Nothing else points at the repository, so the bytes go too.
    expect(readConfig(home).taps.some((t) => t.name === autoTap.name)).toBe(false);
    expect(existsSync(clone)).toBe(false);
  });
});
