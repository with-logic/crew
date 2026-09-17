/**
 * C-TAP-12/13/14 subpath taps (§16.3): a tap that points at a directory
 * inside a repo, its name derivation, and idempotence rules.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildSubpathRepo, buildTapRepo } from "./helpers.ts";

describe("crew tap", () => {
  test("C-TAP-12 subpath tap installs skills by bare name", () => {
    const home = makeCrewHome();
    // Ditch the default `core` tap (whose URL is github.com) so bare-name
    // install doesn't try to clone it in the sandboxed test env.
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildSubpathRepo();
    const code = runCli(["tap", "add", `file://${repo}//skills`, "backend-skills"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    // Config records both url and subpath, separately.
    const cfg = readConfig(home);
    const tap = cfg.taps.find((t) => t.name === "backend-skills")!;
    expect(tap.url).toBe(`file://${repo}`);
    expect(tap.subpath).toBe("skills");
    // Bare-name install resolves through the subpath tap.
    const c = captureStreams();
    const installCode = runCli(["install", "gamma"], { home, streams: c.streams });
    expect(installCode).toBe(0);
    // And `decoy` at the repo root is NOT reachable — subpath tap must not
    // leak siblings of its own tap dir.
    const c2 = captureStreams();
    const decoyCode = runCli(["install", "decoy"], { home, streams: c2.streams });
    expect(decoyCode).not.toBe(0);
  });

  test("C-TAP-12 search finds skills under the tap subpath only", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildSubpathRepo();
    runCli(["tap", "add", `file://${repo}//skills`, "backend-skills"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "--json", ""], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as { hits: { name: string }[] };
    const names = parsed.hits.map((h) => h.name).sort();
    expect(names).toContain("gamma");
    expect(names).toContain("delta");
    expect(names).not.toContain("decoy");
  });

  test("root tap search indexes skills directory before root children", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildSubpathRepo();
    runCli(["tap", "add", `file://${repo}`, "root-skills"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "--json", ""], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as { hits: { name: string }[] };
    const names = parsed.hits.map((h) => h.name).sort();
    expect(names).toContain("gamma");
    expect(names).toContain("delta");
    expect(names).not.toContain("decoy");
  });

  test("C-TAP-13 default name derivation uses <repo>-<subpath> for subpath taps", () => {
    const home = makeCrewHome();
    const repo = buildSubpathRepo();
    // Rename the repo dir so the derivation has something meaningful to pick up.
    // (The test temp repo name isn't predictable; instead, inspect deriveTapName
    // via a URL whose last segment is stable.)
    const code = runCli(["tap", "add", `file://${repo}//skills`], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.subpath === "skills")!;
    // Name is `<repo-last-segment>-skills`. The temp-dir prefix is
    // `crew-monorepo-`, so the tail contains that prefix plus a random id;
    // we just check the `-skills` suffix to confirm subpath-aware derivation.
    expect(tap.name.endsWith("-skills")).toBe(true);
  });

  test("C-TAP-13 default name derivation for a root tap stays as last segment", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const code = runCli(["tap", "add", `file://${repo}`], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const tap = readConfig(home).taps.find((t) => t.name !== "core")!;
    // No `-skills` suffix because no subpath was present.
    expect(tap.subpath).toBe("");
    expect(tap.name.endsWith("-skills")).toBe(false);
  });

  test("C-TAP-14 re-adding same (name, url, subpath) is idempotent", () => {
    const home = makeCrewHome();
    const repo = buildSubpathRepo();
    runCli(["tap", "add", `file://${repo}//skills`, "backend-skills"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["tap", "add", `file://${repo}//skills`, "backend-skills"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("already set up");
  });

  test("C-TAP-14 same name, different subpath is a usage error", () => {
    const home = makeCrewHome();
    const repo = buildSubpathRepo();
    // Add a skill at a different subpath so the second add points somewhere real.
    makeSkill(
      join(repo, "other"),
      "omega",
      skillFrontmatter({ name: "omega", description: "elsewhere" }),
    );
    commitAll(repo, "add other/");
    runCli(["tap", "add", `file://${repo}//skills`, "backend-skills"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["tap", "add", `file://${repo}//other`, "backend-skills"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    // Error shows the existing target and the copy-pasteable remedy.
    expect(c.stderr()).toContain(`${repo}//skills`);
    expect(c.stderr()).toContain(`crew tap add file://${repo}//other <tap-name>`);
  });
});
