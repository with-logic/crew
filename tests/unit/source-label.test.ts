/**
 * Unit coverage for `sourceLabel` (§5.1 "Source labels").
 *
 * C-LIST-08 covers which label shape each tap kind gets; C-LIST-09 covers
 * the round-trip property (an auto git tap's label parses back to the same
 * URL and subpath) and the orphaned-tap fallback; C-LIST-10 covers the
 * display-safety rules — no credentials, no control characters.
 */

import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import {
  isAutoTapSource,
  repoLabel,
  sourceLabel,
  tapIndex,
} from "../../src/commands/source-label/index.ts";
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

function taps(...rows: TapConfig[]) {
  const cfg: Config = {
    taps: rows,
    disabled_agents: [],
    forced_agents: [],
    autoupdate: { enabled: false, interval_seconds: 14400 },
  };
  return tapIndex(cfg);
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
  test("C-LIST-08 a registered tap keeps its configured name", () => {
    const t = taps(tap({ name: "core", registered: true, url: "https://x/y.git" }));
    expect(sourceLabel(entry("core", ""), t)).toBe("core");
    expect(sourceLabel(entry("core", "skills/demo"), t)).toBe("core/skills/demo");
  });

  test("C-LIST-08 an auto GitHub tap renders as @owner/repo", () => {
    const t = taps(
      tap({ name: "skills-internal-comms", url: "https://github.com/anthropics/skills.git" }),
    );
    expect(sourceLabel(entry("skills-internal-comms", ""), t)).toBe("@anthropics/skills");
  });

  test("C-LIST-08 subpath and entry path join into one location", () => {
    const t = taps(
      tap({
        name: "skills-internal-comms",
        url: "https://github.com/anthropics/skills.git",
        subpath: "skills/internal-comms",
      }),
    );
    expect(sourceLabel(entry("skills-internal-comms", ""), t)).toBe(
      "@anthropics/skills//skills/internal-comms",
    );

    const rootTap = taps(tap({ name: "skills", url: "https://github.com/anthropics/skills.git" }));
    expect(sourceLabel(entry("skills", "skills/docx"), rootTap)).toBe(
      "@anthropics/skills//skills/docx",
    );
  });

  test("C-LIST-08 shorthand hosts use their prefix", () => {
    const gl = taps(tap({ name: "t", url: "https://gitlab.com/acme/skills.git" }));
    expect(sourceLabel(entry("t", ""), gl)).toBe("gl:acme/skills");

    const bb = taps(tap({ name: "t", url: "https://bitbucket.org/acme/skills.git" }));
    expect(sourceLabel(entry("t", ""), bb)).toBe("bb:acme/skills");
  });

  test("C-LIST-08 an auto path tap shows the directory", () => {
    const dir = `${homedir()}/code/my-skills`;
    const t = taps(tap({ name: "my-skills", kind: "path", path: dir }));
    expect(sourceLabel(entry("my-skills", ""), t)).toBe("~/code/my-skills");
    expect(sourceLabel(entry("my-skills", "demo"), t)).toBe("~/code/my-skills/demo");
  });

  test("C-LIST-09 an auto git label parses back to the same url and subpath", () => {
    const url = "https://github.com/anthropics/skills.git";
    const t = taps(tap({ name: "skills", url, subpath: "skills" }));
    const label = sourceLabel(entry("skills", "internal-comms"), t);

    const parsed = parseRef(label);
    expect(parsed.type).toBe("git");
    if (parsed.type !== "git") throw new Error("expected a git source");
    expect(parsed.url).toBe(url);
    expect(parsed.subpath).toBe("skills/internal-comms");
  });

  test("C-LIST-09 an orphaned tap falls back to the raw tap and path", () => {
    const t = taps(tap({ name: "other", registered: true }));
    expect(sourceLabel(entry("gone", ""), t)).toBe("gone");
    expect(sourceLabel(entry("gone", "skills/demo"), t)).toBe("gone/skills/demo");
  });

  test("a URL crew cannot decompose is shown unchanged", () => {
    const t = taps(tap({ name: "t", url: "https://example.com" }));
    expect(sourceLabel(entry("t", ""), t)).toBe("https://example.com");
  });

  test("C-LIST-10 a password in a clone URL is masked", () => {
    const t = taps(tap({ name: "t", url: "https://user:tok3n@github.com/acme/skills.git" }));
    const label = sourceLabel(entry("t", ""), t);
    expect(label).not.toContain("tok3n");
    expect(label).not.toContain("user");
    expect(label).toBe("https://***@github.com/acme/skills.git");
  });

  test("C-LIST-10 a username-only token is masked", () => {
    // A personal access token is normally the username half with no
    // password at all, so masking only passwords would publish it.
    const t = taps(tap({ name: "t", url: "https://ghp_sEcReT@github.com/acme/skills.git" }));
    const label = sourceLabel(entry("t", ""), t);
    expect(label).not.toContain("ghp_sEcReT");
    expect(label).toBe("https://***@github.com/acme/skills.git");
  });

  test("C-LIST-10 an ssh:// userinfo is masked too", () => {
    const t = taps(tap({ name: "t", url: "ssh://tok3n@git.example.com/acme/skills.git" }));
    const label = sourceLabel(entry("t", ""), t);
    expect(label).not.toContain("tok3n");
    expect(label).toBe("ssh://***@git.example.com/acme/skills.git");
  });

  test("C-LIST-10 a query string or fragment is dropped", () => {
    const t = taps(
      tap({ name: "t", url: "https://github.com/acme/skills.git?access_token=sEcReT#frag" }),
    );
    const label = sourceLabel(entry("t", ""), t);
    expect(label).not.toContain("sEcReT");
    expect(label).toBe("@acme/skills");
  });

  test("C-LIST-10 an ssh username is kept — it addresses the remote", () => {
    // `git@` is the protocol's fixed account, not a secret, and dropping
    // it would leave a label that does not clone.
    expect(repoLabel("git@github.com:acme/skills.git")).toBe("git@github.com:acme/skills.git");
  });

  test("C-LIST-10 control characters in a subpath are escaped", () => {
    const t = taps(tap({ name: "t", url: "https://github.com/acme/skills.git" }));
    const label = sourceLabel(entry("t", "skills/[2K\rforged"), t);
    expect(label).not.toContain("");
    expect(label).not.toContain("\r");
    expect(label).toBe("@acme/skills//skills/\\x1b[2K\\x0dforged");
  });

  test("C-LIST-10 C1 control characters are escaped", () => {
    // U+009B is the 8-bit control sequence introducer: a terminal in
    // 8-bit mode reads it exactly as `ESC [`, so escaping C0 alone
    // still leaves a way to move the cursor.
    const csi = String.fromCodePoint(0x9b);
    const t = taps(tap({ name: "t", url: "https://github.com/acme/skills.git" }));
    const label = sourceLabel(entry("t", `skills/${csi}31mforged`), t);
    expect(label).not.toContain(csi);
    expect(label).toBe("@acme/skills//skills/\\x9b31mforged");
  });

  test("isAutoTapSource is true only for a configured unregistered tap", () => {
    const t = taps(tap({ name: "auto" }), tap({ name: "core", registered: true }));
    expect(isAutoTapSource(entry("auto", ""), t)).toBe(true);
    expect(isAutoTapSource(entry("core", ""), t)).toBe(false);
    expect(isAutoTapSource(entry("gone", ""), t)).toBe(false);
  });
});
