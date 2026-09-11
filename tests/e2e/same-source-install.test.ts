/**
 * Conformance tests for canonical source identity on install (§5.4, §16.5).
 *
 * One repository can back several taps: installing `<url>//skills/docx`
 * records a tap with that subpath, while installing `<url>` records a
 * tap with none. Both reach the same directory, so the second install is
 * a duplicate rather than a name conflict.
 *
 * Covers:
 *   - C-INST-13a: same canonical location → already installed, not a conflict.
 *   - C-INST-13b: the entry is re-attributed and the emptied auto tap is GC'd.
 *   - C-INST-13c: a registered tap is never re-attributed.
 *   - C-INST-13d: `.git` / trailing-slash / host-case spellings compare equal.
 *   - C-INST-13e: re-expansion skips a child already installed from the same source.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig } from "../../src/config/load.ts";
import { tapPath } from "../../src/core/paths.ts";
import type { Marker } from "../../src/core/types.ts";
import {
  canonicalRepoUrl,
  sameSourceIdentity,
  sourceIdentityOf,
} from "../../src/install/source-identity.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let ccRoot = "";
let original: { user: () => string; detect: () => boolean };

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  original = { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = original.user;
  (claudeCodeAdapter as { detect: () => boolean }).detect = original.detect;
});

/** A repo whose skills live under `skills/`. */
function buildRepo(names: readonly string[]): string {
  const repo = makeTempDir("crew-samesrc-");
  makeGitRepo(repo);
  for (const n of names) {
    makeSkill(join(repo, "skills"), n, skillFrontmatter({ name: n, description: `${n} skill` }));
  }
  commitAll(repo, "initial");
  return repo;
}

/** Install with a fresh capture, returning the exit code and stdout. */
function install(home: string, ref: string): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli(["install", ref, "--agent", "claude-code"], { home, streams: cap.streams });
  return { code, out: cap.stdout() };
}

describe("C-INST-13a same repo at the same path is not a name conflict", () => {
  test("C-INST-13a subpath install then whole-repo install reports already installed", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);

    expect(install(home, `file://${repo}//skills/docx`).code).toBe(0);
    const second = install(home, `file://${repo}`);

    expect(second.code).toBe(0);
    expect(second.out).toContain("already installed");
    expect(second.out).not.toContain("name_conflict");
    // The sibling that really was new still installs.
    const names = readState(home)
      .installations.map((e) => e.name)
      .sort();
    expect(names).toEqual(["docx", "pdf"]);
  });

  test("C-INST-13a a different repo with the same skill name still conflicts", () => {
    const home = makeCrewHome();
    const repoA = buildRepo(["docx"]);
    const repoB = buildRepo(["docx"]);

    expect(install(home, `file://${repoA}//skills/docx`).code).toBe(0);
    const cap = captureStreams();
    const code = runCli(["install", `file://${repoB}//skills/docx`, "--agent", "claude-code"], {
      home,
      streams: cap.streams,
    });

    expect(code).toBe(4);
    expect(cap.stderr()).toContain("name_conflict");
  });
});

describe("C-INST-13b re-attribution to the broader tap", () => {
  test("C-INST-13b moves state and markers, then GCs the emptied auto tap", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);

    install(home, `file://${repo}//skills/docx`);
    const narrowTap = readState(home).installations.find((e) => e.name === "docx")!.source.tap;
    expect(existsSync(tapPath(narrowTap, home))).toBe(true);

    const second = install(home, `file://${repo}`);
    expect(second.out).toContain("now tracked via");

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    const broadTap = entry.source.tap;
    expect(broadTap).not.toBe(narrowTap);
    expect(entry.source.path).toBe("skills/docx");

    // Marker follows state, since markers are authoritative (§11.1).
    const marker = JSON.parse(readFileSync(join(ccRoot, "docx", ".crew.json"), "utf8")) as Marker;
    expect(marker.tap_name).toBe(broadTap);
    expect(marker.path).toBe("skills/docx");
    expect(marker.tap_subpath).toBe("");

    // The emptied auto tap and its clone are gone (§16.5).
    expect(readConfig(home).taps.some((t) => t.name === narrowTap)).toBe(false);
    expect(existsSync(tapPath(narrowTap, home))).toBe(false);
  });

  test("C-INST-13b re-attributes a project-scope install and its marker", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const repo = buildRepo(["docx"]);

    const first = captureStreams();
    expect(
      runCli(
        ["install", "--scope", "project", `file://${repo}//skills/docx`, "--agent", "claude-code"],
        { home, cwd: project, streams: first.streams },
      ),
    ).toBe(0);
    const narrowTap = readState(home).installations[0]!.source.tap;

    const second = captureStreams();
    expect(
      runCli(["install", "--scope", "project", `file://${repo}`, "--agent", "claude-code"], {
        home,
        cwd: project,
        streams: second.streams,
      }),
    ).toBe(0);
    expect(second.stdout()).toContain("now tracked via");

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.scope).toBe("project");
    expect(entry.source.tap).not.toBe(narrowTap);
    expect(entry.source.path).toBe("skills/docx");

    // The project-scope marker follows too (§11.1).
    const marker = JSON.parse(
      readFileSync(join(project, ".claude", "skills", "docx", ".crew.json"), "utf8"),
    ) as Marker;
    expect(marker.tap_name).toBe(entry.source.tap);
    expect(marker.path).toBe("skills/docx");
  });

  test("C-INST-13b reports the previous tap in --json", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx"]);
    install(home, `file://${repo}//skills/docx`);
    const narrowTap = readState(home).installations[0]!.source.tap;

    const cap = captureStreams();
    runCli(["install", `file://${repo}`, "--agent", "claude-code", "--json"], {
      home,
      streams: cap.streams,
    });
    const payload = JSON.parse(cap.stdout()) as {
      already_installed: { name: string; reattributedFrom?: string }[];
    };
    const docx = payload.already_installed.find((a) => a.name === "docx")!;
    expect(docx.reattributedFrom).toBe(narrowTap);
  });
});

describe("C-INST-13c registered taps keep their attribution", () => {
  test("C-INST-13c a registered narrow tap is not re-attributed", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);
    runCli(["tap", "add", `file://${repo}//skills/docx`, "mine"], {
      home,
      streams: captureStreams().streams,
    });
    expect(install(home, "mine/docx").code).toBe(0);
    expect(readState(home).installations.find((e) => e.name === "docx")!.source.tap).toBe("mine");

    const second = install(home, `file://${repo}`);
    expect(second.code).toBe(0);
    expect(second.out).not.toContain("now tracked via");

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.source.tap).toBe("mine");
    expect(readConfig(home).taps.some((t) => t.name === "mine")).toBe(true);
  });
});

describe("C-INST-13d canonical URL comparison", () => {
  test("C-INST-13d ignores trailing .git, trailing slash, and host case", () => {
    expect(canonicalRepoUrl("https://github.com/acme/skills.git")).toBe(
      canonicalRepoUrl("https://github.com/acme/skills"),
    );
    expect(canonicalRepoUrl("https://github.com/acme/skills/")).toBe(
      canonicalRepoUrl("https://github.com/acme/skills"),
    );
    expect(canonicalRepoUrl("https://GitHub.com/acme/skills")).toBe(
      canonicalRepoUrl("https://github.com/acme/skills"),
    );
    // Case in the path is meaningful; only the host folds.
    expect(canonicalRepoUrl("https://github.com/Acme/skills")).not.toBe(
      canonicalRepoUrl("https://github.com/acme/skills"),
    );
    // Scp-style URLs have no scheme to split; they still lose `.git`.
    expect(canonicalRepoUrl("git@github.com:acme/skills.git")).toBe("git@github.com:acme/skills");
  });

  test("C-INST-13d subpath tap and whole-repo tap resolve to one location", () => {
    const narrow = sourceIdentityOf(
      {
        name: "skills-docx",
        kind: "git",
        registered: false,
        url: "https://github.com/acme/skills.git",
        subpath: "skills/docx",
        path: "",
      },
      "",
    );
    const broad = sourceIdentityOf(
      {
        name: "skills",
        kind: "git",
        registered: false,
        url: "https://github.com/acme/skills",
        subpath: "",
        path: "",
      },
      "skills/docx",
    );
    expect(sameSourceIdentity(narrow, broad)).toBe(true);

    const other = sourceIdentityOf(
      {
        name: "skills",
        kind: "git",
        registered: false,
        url: "https://github.com/acme/skills",
        subpath: "",
        path: "",
      },
      "skills/pdf",
    );
    expect(sameSourceIdentity(narrow, other)).toBe(false);
  });

  test("C-INST-13d path taps compare by directory and location", () => {
    const dir = makeTempDir("crew-pathtap-");
    const a = sourceIdentityOf(
      { name: "local", kind: "path", registered: false, url: "", subpath: "", path: `${dir}/` },
      "docx",
    );
    const b = sourceIdentityOf(
      { name: "local2", kind: "path", registered: false, url: "", subpath: "", path: dir },
      "docx",
    );
    expect(sameSourceIdentity(a, b)).toBe(true);
  });
});

describe("C-INST-13e re-expansion respects existing installs", () => {
  test("C-INST-13e does not re-add a child installed from the same source", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx"]);

    // Whole-repo install subscribes the group to re-expansion.
    expect(install(home, `file://${repo}`).code).toBe(0);
    const broadTap = readState(home).installations[0]!.source.tap;

    // A sibling appears upstream AND is installed directly by subpath
    // first, so re-expansion meets a child that already exists from the
    // same canonical location under a *different* tap row.
    makeSkill(join(repo, "skills"), "pdf", skillFrontmatter({ name: "pdf", description: "pdf" }));
    commitAll(repo, "add pdf");
    expect(install(home, `file://${repo}//skills/pdf`).code).toBe(0);
    const pdfTap = readState(home).installations.find((e) => e.name === "pdf")!.source.tap;
    expect(pdfTap).not.toBe(broadTap);

    const cap = captureStreams();
    const code = runCli(["update"], { home, streams: cap.streams });
    expect(code).toBe(0);
    // Exactly one pdf entry: no duplicate add from re-expansion.
    expect(readState(home).installations.filter((e) => e.name === "pdf")).toHaveLength(1);
  });
});
