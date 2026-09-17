/**
 * Coverage close-out for refs/parse edge forms, SKILL.md frontmatter and validation, and the YAML wrapper.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { parseRef } from "../../../src/refs/parse.ts";
import { parseYaml, stringifyYaml } from "../../../src/yaml/parse.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

// Adapter redirection: any test in this file that runs `crew install`
// would otherwise write into the real `~/.claude/skills/` etc. Point
// each adapter's userPath at a per-test tmp root, and force `detect()`
// so we don't depend on the machine actually having Claude Code / Codex
// / Gemini installed. The CLAUDE.md testing philosophy requires this.
let ccRoot: string;
let restore: (() => void) | null = null;

function setupTargets() {
  ccRoot = makeTempDir("crew-cc-");
  const co = makeTempDir("crew-co-");
  const ge = makeTempDir("crew-ge-");
  const originals = {
    cc: { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect },
    co: { u: codexAdapter.userPath, d: codexAdapter.detect },
    ge: { u: geminiCliAdapter.userPath, d: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => co;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => ge;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
}

beforeEach(() => setupTargets());
afterEach(() => {
  resetGitRunner();
  if (restore) {
    restore();
  }
  restore = null;
});

describe("refs/parse — URL canonicalization edge cases", () => {
  test("malformed http URL fails (refs/parse.ts:154-155)", () => {
    // An http URL whose `pathname` is just `/` or empty: our validator
    // rejects it.
    expect(() => parseRef("https://example.com/")).toThrow(CrewError);
  });

  test("ssh url with whitespace rejected", () => {
    // Whitespace in an ssh URL makes `new URL()` throw a TypeError, which
    // the CLI layer translates to `usage_error` with exit 4.
    expect(() => parseRef("ssh://bad url/repo")).toThrow();
  });

  test("unrecognized scheme not valid", () => {
    // Unknown schemes (neither `file://`/`ssh://` nor http(s)) hit the
    // final `return null` and surface as invalid_ref.
    expect(() => parseRef("weird://anything/repo")).toThrow(CrewError);
  });
});

describe("parseRef unusual but legal forms", () => {
  test("file:// url parses", () => {
    const { parseRef } =
      require("../../../src/refs/parse.ts") as typeof import("../../../src/refs/parse.ts");
    const r = parseRef("file:///tmp/my-repo");
    expect(r.type).toBe("git");
  });
  test("ssh:// url parses", () => {
    const { parseRef } =
      require("../../../src/refs/parse.ts") as typeof import("../../../src/refs/parse.ts");
    const r = parseRef("ssh://git@example.com/owner/repo.git");
    expect(r.type).toBe("git");
  });
});

describe("skill/frontmatter — unterminated frontmatter", () => {
  test("missing end `---` raises invalid_skill (frontmatter.ts ~38)", () => {
    const { extractFrontmatter } =
      require("../../../src/skill/frontmatter.ts") as typeof import("../../../src/skill/frontmatter.ts");
    expect(() => extractFrontmatter("---\nname: foo\n")).toThrow(CrewError);
  });
});

describe("skill/validate — compatibility non-string", () => {
  test("compatibility as a number fails (validate.ts)", () => {
    const { validateFrontmatter } =
      require("../../../src/skill/validate.ts") as typeof import("../../../src/skill/validate.ts");
    expect(() => validateFrontmatter({ name: "foo", description: "x", compatibility: 42 })).toThrow(
      CrewError,
    );
  });
});

describe("skill/frontmatter — invalid yaml raises invalid_skill (frontmatter.ts:44-45)", () => {
  test("bad YAML inside frontmatter becomes invalid_skill", () => {
    const { extractFrontmatter } =
      require("../../../src/skill/frontmatter.ts") as typeof import("../../../src/skill/frontmatter.ts");
    // Tab characters are illegal for indentation in YAML.
    expect(() => extractFrontmatter("---\nname: foo\n\tbad: tab\n---\nbody")).toThrow(CrewError);
  });
});

describe("yaml edge cases", () => {
  test("parseYaml list items: nested list under `-`", () => {
    const y = "items:\n  - a\n  - b";
    expect(parseYaml(y)).toEqual({ items: ["a", "b"] });
  });
  test("parseYaml treats whitespace-only input as an empty document", () => {
    // A file of only blank lines is empty, not malformed — `load` would
    // return undefined for it, so the trim guard normalizes to null.
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("   ")).toBeNull();
    expect(parseYaml("\n\n  \t\n")).toBeNull();
  });
  test("parseYaml reserved scalars", () => {
    expect(parseYaml("x: ~")).toEqual({ x: null });
    expect(parseYaml("x: Null")).toEqual({ x: null });
    expect(parseYaml("x: False")).toEqual({ x: false });
  });
  test("stringify nested list-of-map", () => {
    const v: import("../../../src/yaml/parse.ts").YamlValue = {
      items: [
        { a: 1 } as import("../../../src/yaml/parse.ts").YamlValue,
        { b: 2 } as import("../../../src/yaml/parse.ts").YamlValue,
      ],
    };
    const s = stringifyYaml(v);
    const back = parseYaml(s);
    expect(back).toEqual(v);
  });
  test("stringify empty nested map", () => {
    expect(stringifyYaml({ a: {} })).toBe("a: {}\n");
  });
  test("parse tolerates unparseable trailing comment-only content", () => {
    expect(parseYaml("a: 1\n# trailing")).toEqual({ a: 1 });
  });
});
