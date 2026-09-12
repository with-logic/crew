/**
 * C-INST-13d/13e: canonical URL comparison and re-expansion.
 *
 * Two spellings of one repository must compare equal (§5.4), and
 * re-expansion must not "add" a child that is already installed from the
 * same canonical location through another tap row (§10.1.1).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import {
  canonicalRepoUrl,
  sameSourceIdentity,
  sourceIdentityOf,
} from "../../../src/install/source-identity.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { type AdapterRedirect, buildRepo, install, redirectClaudeCode } from "./helpers.ts";

let cc: AdapterRedirect;

beforeEach(() => {
  cc = redirectClaudeCode();
});
afterEach(() => {
  cc.restore();
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

  test("C-INST-13i scp-style URLs fold host case but keep path case", () => {
    // The host is a DNS name and case-insensitive; everything after the
    // `:` is a path on the server and is not.
    expect(canonicalRepoUrl("git@GitHub.com:acme/skills.git")).toBe(
      canonicalRepoUrl("git@github.com:acme/skills"),
    );
    expect(canonicalRepoUrl("ssh://git@GitLab.com/acme/skills")).toBe(
      canonicalRepoUrl("ssh://git@gitlab.com/acme/skills"),
    );
    expect(canonicalRepoUrl("git@github.com:Acme/Skills")).not.toBe(
      canonicalRepoUrl("git@github.com:acme/skills"),
    );
    // A host with no user part still folds.
    expect(canonicalRepoUrl("MyHost.com:acme/repo")).toBe("myhost.com:acme/repo");
  });

  test("C-INST-13i userinfo case is preserved in scheme'd URLs", () => {
    // `Alice` and `alice` can be different accounts, so folding them
    // would make two genuinely different sources compare equal — and
    // §5.4 reads "same source" as permission to overwrite without
    // `--force`. The host beside them still folds.
    expect(canonicalRepoUrl("ssh://Alice@github.com/acme/skills")).not.toBe(
      canonicalRepoUrl("ssh://alice@github.com/acme/skills"),
    );
    expect(canonicalRepoUrl("https://Token@github.com/acme/skills.git")).not.toBe(
      canonicalRepoUrl("https://token@github.com/acme/skills.git"),
    );
    expect(canonicalRepoUrl("ssh://Alice@GitHub.com/acme/skills")).toBe(
      canonicalRepoUrl("ssh://Alice@github.com/acme/skills"),
    );
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
