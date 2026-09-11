/**
 * Unit coverage for `sourceLabel` (§5.1 "Source labels").
 *
 * C-LIST-07 covers which label shape each tap kind gets; C-LIST-08
 * covers the round-trip property (an auto git tap's label parses back to
 * the same URL and subpath) and the orphaned-tap fallback.
 */

import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { isAutoTapSource, repoRef, sourceLabel } from "../../src/commands/source-label.ts";
import type { Config, StateEntry, TapConfig } from "../../src/core/types.ts";
import { parseRef } from "../../src/refs/parse.ts";

function tap(over: Partial<TapConfig> & Pick<TapConfig, "name">): TapConfig {
  return {
    kind: "git",
    registered: false,
    url: "",
    subpath: "",
    path: "",
    ...over,
  };
}

function config(...taps: TapConfig[]): Config {
  return {
    taps,
    disabled_agents: [],
    forced_agents: [],
    autoupdate: { enabled: false, interval_seconds: 14400 },
  };
}

function entry(tapName: string, path: string): StateEntry {
  return {
    name: "demo",
    source: { tap: tapName, path },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:x",
    scope: "user",
    installed_at: "2026-01-01T00:00:00Z",
    agents: ["claude-code"],
    pinned: false,
    explicit: true,
    required_by: [],
  };
}

describe("sourceLabel", () => {
  test("C-LIST-07 a registered tap keeps its configured name", () => {
    const cfg = config(tap({ name: "core", registered: true, url: "https://x/y.git" }));
    expect(sourceLabel(entry("core", ""), cfg)).toBe("core");
    expect(sourceLabel(entry("core", "skills/demo"), cfg)).toBe("core/skills/demo");
  });

  test("C-LIST-07 an auto GitHub tap renders as @owner/repo", () => {
    const cfg = config(
      tap({ name: "skills-internal-comms", url: "https://github.com/anthropics/skills.git" }),
    );
    expect(sourceLabel(entry("skills-internal-comms", ""), cfg)).toBe("@anthropics/skills");
  });

  test("C-LIST-07 subpath and entry path join into one location", () => {
    const cfg = config(
      tap({
        name: "skills-internal-comms",
        url: "https://github.com/anthropics/skills.git",
        subpath: "skills/internal-comms",
      }),
    );
    expect(sourceLabel(entry("skills-internal-comms", ""), cfg)).toBe(
      "@anthropics/skills//skills/internal-comms",
    );

    const rootTap = config(
      tap({ name: "skills", url: "https://github.com/anthropics/skills.git" }),
    );
    expect(sourceLabel(entry("skills", "skills/docx"), rootTap)).toBe(
      "@anthropics/skills//skills/docx",
    );
  });

  test("C-LIST-07 other hosts use their shorthand or a bare host path", () => {
    const gl = config(tap({ name: "t", url: "https://gitlab.com/acme/skills.git" }));
    expect(sourceLabel(entry("t", ""), gl)).toBe("gl:acme/skills");

    const bb = config(tap({ name: "t", url: "https://bitbucket.org/acme/skills.git" }));
    expect(sourceLabel(entry("t", ""), bb)).toBe("bb:acme/skills");

    const self = config(tap({ name: "t", url: "https://git.example.com/acme/skills.git" }));
    expect(sourceLabel(entry("t", ""), self)).toBe("git.example.com/acme/skills");
  });

  test("C-LIST-07 an auto path tap shows the directory", () => {
    const dir = `${homedir()}/code/my-skills`;
    const cfg = config(tap({ name: "my-skills", kind: "path", path: dir }));
    expect(sourceLabel(entry("my-skills", ""), cfg)).toBe("~/code/my-skills");
    expect(sourceLabel(entry("my-skills", "demo"), cfg)).toBe("~/code/my-skills/demo");
  });

  test("C-LIST-08 an auto git label parses back to the same url and subpath", () => {
    const url = "https://github.com/anthropics/skills.git";
    const cfg = config(tap({ name: "skills", url, subpath: "skills" }));
    const label = sourceLabel(entry("skills", "internal-comms"), cfg);

    const parsed = parseRef(label);
    expect(parsed.type).toBe("git");
    if (parsed.type !== "git") throw new Error("expected a git source");
    expect(parsed.url).toBe(url);
    expect(parsed.subpath).toBe("skills/internal-comms");
  });

  test("C-LIST-08 an orphaned tap falls back to the raw tap and path", () => {
    const cfg = config(tap({ name: "other", registered: true }));
    expect(sourceLabel(entry("gone", ""), cfg)).toBe("gone");
    expect(sourceLabel(entry("gone", "skills/demo"), cfg)).toBe("gone/skills/demo");
  });

  test("a URL crew cannot decompose is shown unchanged", () => {
    const cfg = config(tap({ name: "t", url: "https://example.com" }));
    expect(sourceLabel(entry("t", ""), cfg)).toBe("https://example.com");
  });

  test("ssh-style urls drop the credential prefix", () => {
    expect(repoRef("git@github.com:acme/skills.git")).toBe("@acme/skills");
    expect(repoRef("ssh://git@git.example.com/acme/skills.git")).toBe(
      "git.example.com/acme/skills",
    );
  });

  test("a host:port survives the scp-separator rewrite", () => {
    expect(repoRef("https://git.example.com:8443/acme/skills.git")).toBe(
      "git.example.com:8443/acme/skills",
    );
  });

  test("a nested group path keeps every owner segment", () => {
    expect(repoRef("https://gitlab.com/acme/team/skills.git")).toBe("gl:acme/team/skills");
  });

  test("a file:// url is shown exactly as typed", () => {
    const cfg = config(tap({ name: "repo-demo", url: "file:///tmp/repo", subpath: "skills/demo" }));
    expect(sourceLabel(entry("repo-demo", ""), cfg)).toBe("file:///tmp/repo//skills/demo");
  });

  test("isAutoTapSource is true only for a configured unregistered tap", () => {
    const cfg = config(tap({ name: "auto" }), tap({ name: "core", registered: true }));
    expect(isAutoTapSource(entry("auto", ""), cfg)).toBe(true);
    expect(isAutoTapSource(entry("core", ""), cfg)).toBe(false);
    expect(isAutoTapSource(entry("gone", ""), cfg)).toBe(false);
  });
});
