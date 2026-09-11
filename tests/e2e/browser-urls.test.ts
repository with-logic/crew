/**
 * Browser URLs through the real CLI (§8.2, §16.3; C-REF-24, C-REF-27).
 *
 * Nothing here touches the network: every case is decided by the
 * reference parser before a clone would happen.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { parseTapAddTarget } from "../../src/commands/tap/target.ts";
import { CrewError } from "../../src/core/errors.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

describe("crew install <browser-url>", () => {
  test("C-REF-24 a blob link to a non-SKILL.md file exits 4 with invalid_ref", () => {
    const home = makeCrewHome();
    const cap = captureStreams();
    const code = runCli(
      ["install", "https://github.com/acme/skills/blob/main/python/README.md", "--json"],
      { home, streams: cap.streams },
    );
    expect(code).toBe(4);
    const payload = JSON.parse(cap.stdout());
    expect(payload.error.name).toBe("invalid_ref");
    expect(payload.error.message).toContain("SKILL.md");
  });
});

describe("crew tap add <browser-url> (C-REF-27)", () => {
  test("a /tree/main/<path> link registers a subpath tap with no ref", () => {
    expect(parseTapAddTarget("https://github.com/acme/skills/tree/main/skills", "/tmp")).toEqual({
      kind: "git",
      url: "https://github.com/acme/skills.git",
      subpath: "skills",
      path: "",
    });
  });

  test("master is treated as the default branch too", () => {
    const t = parseTapAddTarget("https://github.com/acme/skills/tree/master", "/tmp");
    expect(t.url).toBe("https://github.com/acme/skills.git");
    expect(t.subpath).toBe("");
  });

  test("an explicit @main tail is dropped for the same reason", () => {
    expect(parseTapAddTarget("@acme/skills@main//skills", "/tmp").subpath).toBe("skills");
  });

  test("any other ref is still a usage_error", () => {
    let caught: unknown;
    try {
      parseTapAddTarget("https://github.com/acme/skills/tree/v1.0/skills", "/tmp");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CrewError);
    expect((caught as CrewError).code).toBe("usage_error");
    expect((caught as CrewError).message).toContain("@v1.0");
  });

  test("through the CLI: a pinned browser link is refused before any clone", () => {
    const home = makeCrewHome();
    const cap = captureStreams();
    const code = runCli(
      ["tap", "add", "https://github.com/acme/skills/tree/v1.0/skills", "acme", "--json"],
      { home, streams: cap.streams },
    );
    expect(code).toBe(4);
    expect(JSON.parse(cap.stdout()).error.name).toBe("usage_error");
  });
});
