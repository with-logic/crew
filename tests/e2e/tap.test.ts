/**
 * Tap management tests (crew tap add/list/remove) via file:// URLs.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { tapPath } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

describe("crew tap", () => {
  function buildTapRepo(): string {
    const repo = makeTempDir("crew-tap-repo-");
    makeGitRepo(repo);
    makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "An alpha skill" }));
    makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "A beta skill" }));
    commitAll(repo, "init");
    return repo;
  }

  test("C-TAP-01 add clones the repo", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const url = `file://${repo}`;
    const code = runCli(["tap", "add", url, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(tapPath("mytap", home), ".git"))).toBe(true);
  });

  test("C-TAP-02 add with explicit name", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "custom-name"], {
      home,
      streams: captureStreams().streams,
    });
    expect(readConfig(home).taps.some((t) => t.name === "custom-name")).toBe(true);
  });

  test("C-TAP-03 remove deletes", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["tap", "remove", "mytap"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
    expect(existsSync(tapPath("mytap", home))).toBe(false);
  });

  test("C-TAP-04 list reports every tap", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    runCli(["tap", "list"], { home, streams: capture.streams });
    expect(capture.stdout()).toContain("core");
  });

  test("C-TAP-05 core tap present by default", () => {
    const home = makeCrewHome();
    expect(readConfig(home).taps[0]!.name).toBe("core");
  });

  test("C-TAP-06 remove core is refused without --force", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "remove", "core"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
    expect(readConfig(home).taps[0]!.name).toBe("core");
  });

  test("tap add no longer requires --yes — succeeds without confirmation", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const code = runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(true);
  });

  test("C-TAP-10 `crew tap <git-url>` is shorthand for `crew tap add`", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    // No `add` keyword — the URL is the first positional.
    const code = runCli(["tap", `file://${repo}`, "shortcut-tap"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readConfig(home).taps.some((t) => t.name === "shortcut-tap")).toBe(true);
  });

  test("C-TAP-11 `crew tap <unknown-word>` is a usage error", () => {
    // Not a subcommand and not a git source — must NOT be silently
    // treated as a tap.
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "listt"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("crew tap");
  });

  test("`crew tap <unparseable>` falls through to usage error", () => {
    // Input that makes `parseRef` throw — covers the catch branch of
    // the shorthand's `looksLikeGitSource` guard.
    const home = makeCrewHome();
    const c = captureStreams();
    // Uppercase fails the tap-name regex and isn't git-shaped.
    const code = runCli(["tap", "NotAValidName"], { home, streams: c.streams });
    expect(code).toBe(4);
  });

  test("tap add with invalid name fails", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "add", "file:///tmp/x", "Bad-Name"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
  });

  test("tap add is idempotent when name + URL already match", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("already configured");
    expect(c.stdout()).toContain("nothing to do");
    expect(readConfig(home).taps.filter((t) => t.name === "mytap")).toHaveLength(1);
  });

  test("tap add with same name but different URL fails with a useful remedy", () => {
    const home = makeCrewHome();
    const repoA = buildTapRepo();
    const repoB = buildTapRepo();
    runCli(["tap", "add", `file://${repoA}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    const code = runCli(["tap", "add", `file://${repoB}`, "mytap"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    // Tells the user where the existing tap points.
    expect(c.stderr()).toContain(`file://${repoA}`);
    // Tells the user exactly how to resolve it — including the URL
    // they just tried, so the suggested command is copy-pasteable.
    expect(c.stderr()).toContain(`crew tap add file://${repoB}`);
    expect(c.stderr()).toContain("<tap-name>");
  });

  test("tap remove nonexistent fails", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "remove", "ghost"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("C-TAP-07 search matches by description", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "alpha"], { home, streams: c.streams });
    expect(c.stdout()).toContain("alpha");
  });

  test("C-TAP-08 search --json", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });
    const c = captureStreams();
    runCli(["search", "--json", "alpha"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.hits.length).toBeGreaterThanOrEqual(1);
  });

  test("crew tap list --json", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    runCli(["tap", "list", "--json"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout());
    expect(parsed.taps[0].name).toBe("core");
  });

  test("unknown tap subcommand", () => {
    const home = makeCrewHome();
    const code = runCli(["tap", "frob"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  test("search without query fails", () => {
    const home = makeCrewHome();
    const code = runCli(["search"], { home, streams: captureStreams().streams });
    expect(code).toBe(4);
  });

  // C-TAP-12/13/14: subpath taps.
  //
  // A subpath tap points at a directory inside a repo (e.g. `skills/`) instead of
  // the repo root. Once configured, users reference its skills the same way they
  // would for a root tap — bare name, or `<tap>/<skill>` when disambiguating.
  function buildSubpathRepo(): string {
    const repo = makeTempDir("crew-monorepo-");
    makeGitRepo(repo);
    // Stuff at the root that is NOT a skill — would be wrongly indexed by a
    // root tap but must be ignored by a subpath tap.
    makeSkill(
      join(repo, "skills"),
      "gamma",
      skillFrontmatter({ name: "gamma", description: "A gamma skill under skills/" }),
    );
    makeSkill(
      join(repo, "skills"),
      "delta",
      skillFrontmatter({ name: "delta", description: "A delta skill under skills/" }),
    );
    // Noise outside the subpath — docs dir that happens to look skill-ish.
    makeSkill(
      repo,
      "decoy",
      skillFrontmatter({ name: "decoy", description: "Not reachable via subpath tap" }),
    );
    commitAll(repo, "init");
    return repo;
  }

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
    expect(tap.subpath).toBeUndefined();
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
    expect(c.stdout()).toContain("already configured");
    expect(c.stdout()).toContain("nothing to do");
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

  test("`crew tap add <local-path>` is a usage error (not a git source)", () => {
    // A relative/absolute local path parses as a `path` source, not a git
    // source — taps must be git-backed so `crew update` can refresh them.
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["tap", "add", "./not-a-git-thing"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("isn't a git URL");
  });

  test("a tap with a @ref tail is rejected (taps track default branch)", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo();
    const c = captureStreams();
    const code = runCli(["tap", "add", `file://${repo}@main`, "mytap"], {
      home,
      streams: c.streams,
    });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("taps track the default branch");
  });
});
