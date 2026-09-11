/**
 * The attached-skill guard on `crew tap remove` (§16.3, C-TAP-16c..f)
 * and the soft `tap_missing` update outcome it makes possible
 * (§10.1, C-UPD-12b).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../src/config/load.ts";
import { tapPath } from "../../src/core/paths.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let ccRoot: string;
let restore: (() => void) | null = null;

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  const originals = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.d;
  };
});

afterEach(() => {
  if (restore) restore();
  restore = null;
});

function run(home: string, argv: string[]) {
  const c = captureStreams();
  const code = runCli(argv, { home, streams: c.streams });
  return { code, stdout: c.stdout(), stderr: c.stderr() };
}

/** A one-skill git repo usable as a tap. */
function buildTapRepo(name: string = "alpha"): string {
  const repo = makeTempDir("crew-guard-repo-");
  makeGitRepo(repo);
  makeSkill(repo, name, skillFrontmatter({ name, description: `The ${name} skill` }));
  commitAll(repo, "init");
  return repo;
}

/**
 * Add the repo as a tap and install everything in it. Returns both exit
 * codes so the caller owns the assertions (Biome forbids them here).
 */
function tapWithInstall(home: string, repo: string, tap: string = "mytap") {
  const added = run(home, ["tap", "add", `file://${repo}`, tap]).code;
  const installed = run(home, ["install", tap, "--agent", "claude-code"]).code;
  return added + installed;
}

describe("C-TAP-16c attached-skill guard", () => {
  test("refuses to remove a tap with installed skills and names them", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "mytap"]);

    expect(r.code).toBe(4);
    expect(r.stderr).toContain("alpha (user)");
    expect(r.stderr).toContain("--uninstall mytap");
    expect(r.stderr).toContain("--force mytap");
    // The tap and its clone survive the refusal.
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
    expect(existsSync(tapPath("mytap", home))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
  });

  test("a tap with nothing installed still removes without extra flags", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    expect(run(home, ["tap", "add", `file://${repo}`, "mytap"]).code).toBe(0);

    const r = run(home, ["tap", "remove", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Removed tap mytap");
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
  });

  test("the JSON error payload lists the attached skills", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "mytap", "--json"]);

    expect(r.code).toBe(4);
    const payload = JSON.parse(r.stdout) as {
      error: { name: string; details: { attached: string[] } };
    };
    expect(payload.error.name).toBe("usage_error");
    expect(payload.error.details.attached).toEqual(["alpha (user)"]);
  });
});

describe("C-TAP-16d tap remove --uninstall", () => {
  test("removes the skills and then the tap", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);

    const r = run(home, ["tap", "remove", "--uninstall", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Uninstalling alpha");
    expect(r.stdout).toContain("Removed tap mytap");
    expect(existsSync(join(ccRoot, "alpha"))).toBe(false);
    expect(readState(home).installations).toHaveLength(0);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
    expect(existsSync(tapPath("mytap", home))).toBe(false);
  });

  test("a safety abort keeps the tap so the user can retry", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    // Drop the marker so removal hits `untracked_directory` (§7.4 step 1).
    rmSync(join(ccRoot, "alpha", ".crew.json"));

    const r = run(home, ["tap", "remove", "--uninstall", "mytap"]);

    expect(r.code).toBe(1);
    expect(r.stdout).toContain("Kept tap mytap");
    expect(r.stdout).toContain("--force --uninstall");
    // The tap survives so the retry has something to act on.
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
  });

  test("--dry-run changes nothing", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "--uninstall", "--dry-run", "mytap", "--json"]);

    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout) as { dry_run: boolean; uninstalled: unknown[] };
    expect(payload.dry_run).toBe(true);
    expect(payload.uninstalled).toHaveLength(1);
    // Install, state, config, and clone all survive the preview.
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
    expect(existsSync(join(ccRoot, "alpha", ".crew.json"))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
    expect(existsSync(tapPath("mytap", home))).toBe(true);
  });
});

describe("C-TAP-16e tap remove --force keeps skills", () => {
  test("removes the tap, keeps the install, and warns", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "--force", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Removed tap mytap");
    expect(r.stdout).toContain("stayed installed: alpha (user)");
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
  });
});

describe("C-UPD-12b tap_missing", () => {
  test("update reports the orphaned skill softly and exits 0", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    expect(run(home, ["tap", "remove", "--force", "mytap"]).code).toBe(0);

    const r = run(home, ["update"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("tap removed");
    expect(r.stdout).toContain("1 with a removed tap");
    // The install and its state entry are left alone.
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
  });

  test("JSON reports the outcome and names the missing tap", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    expect(run(home, ["tap", "remove", "--force", "mytap"]).code).toBe(0);

    const r = run(home, ["update", "--json"]);

    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout) as {
      rows: { name: string; outcome: { kind: string; tap?: string } }[];
    };
    expect(payload.rows[0]!.outcome.kind).toBe("tap_missing");
    expect(payload.rows[0]!.outcome.tap).toBe("mytap");
  });

  test("other skills still update in the same run", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo("alpha"), "gonetap")).toBe(0);
    const liveRepo = buildTapRepo("beta");
    expect(tapWithInstall(home, liveRepo, "livetap")).toBe(0);
    expect(run(home, ["tap", "remove", "--force", "gonetap"]).code).toBe(0);

    // Move `beta` upstream so the live tap has something to pull.
    makeSkill(liveRepo, "beta", skillFrontmatter({ name: "beta", description: "Beta, revised" }));
    commitAll(liveRepo, "revise beta");

    const r = run(home, ["update", "--json"]);

    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout) as {
      rows: { name: string; outcome: { kind: string } }[];
    };
    const kinds = new Map(payload.rows.map((row) => [row.name, row.outcome.kind]));
    expect(kinds.get("alpha")).toBe("tap_missing");
    expect(kinds.get("beta")).toBe("updated");
  });
});

describe("C-TAP-16f default-tap guard composes", () => {
  test("core with attached skills is still refused without --force", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    // Point `core` at a local repo so installing from it needs no network.
    const config = readConfig(home);
    const taps = config.taps.map((t) => (t.name === "core" ? { ...t, url: `file://${repo}` } : t));
    writeConfig({ ...config, taps }, home);
    expect(run(home, ["install", "core", "--agent", "claude-code"]).code).toBe(0);

    const refused = run(home, ["tap", "remove", "core"]);
    expect(refused.code).toBe(4);
    expect(refused.stderr).toContain("default tap");

    const both = run(home, ["tap", "remove", "--uninstall", "--force", "core"]);
    expect(both.code).toBe(0);
    expect(readState(home).installations).toHaveLength(0);
    expect(readConfig(home).taps.some((t) => t.name === "core")).toBe(false);
  });
});

describe("tap --uninstall flag placement", () => {
  test("--uninstall on another tap subcommand is a usage error", () => {
    const home = makeCrewHome();
    const r = run(home, ["tap", "list", "--uninstall"]);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("`--uninstall` only applies to `crew tap remove`");
  });

  test("--recursive on tap remove is a usage error", () => {
    const home = makeCrewHome();
    const r = run(home, ["tap", "remove", "--recursive", "mytap"]);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("`--recursive` only applies to `crew tap add`");
  });

  test("tap remove needs exactly one name", () => {
    const home = makeCrewHome();
    const r = run(home, ["tap", "remove"]);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain("exactly one tap name");
  });
});
