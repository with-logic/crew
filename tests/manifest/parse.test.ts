/**
 * Project manifest parser (§9.2): the `.crewrc` line format and the
 * references it accepts and rejects.
 */
import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { MANIFEST_FILENAME, parseManifest } from "../../src/manifest/parse.ts";

const FILE = `/work/app/${MANIFEST_FILENAME}`;

function rejection(text: string): CrewError {
  try {
    parseManifest(text, FILE);
  } catch (err) {
    return err as CrewError;
  }
  throw new Error("expected parseManifest to reject");
}

describe("parseManifest: line format", () => {
  test("an empty manifest declares nothing", () => {
    expect(parseManifest("", FILE)).toEqual([]);
    expect(parseManifest("\n\n  \n", FILE)).toEqual([]);
  });

  test("blank lines and # comment lines are ignored", () => {
    const text = "# shared skills\n\n@acme/skills\n   # indented comment\n";
    expect(parseManifest(text, FILE).map((e) => e.ref)).toEqual(["@acme/skills"]);
  });

  test("each entry keeps its 1-based line number and its reference as written", () => {
    const entries = parseManifest("# one\n@acme/skills\n\ngh:acme/tools//pdf@v1\n", FILE);
    expect(entries.map((e) => [e.line, e.ref])).toEqual([
      [2, "@acme/skills"],
      [4, "gh:acme/tools//pdf@v1"],
    ]);
  });

  test("surrounding whitespace, CRLF line endings, and a leading BOM are not part of a reference", () => {
    const entries = parseManifest("﻿  @acme/skills\t\r\n./skills/pdf\r\n", FILE);
    expect(entries.map((e) => e.ref)).toEqual(["@acme/skills", "./skills/pdf"]);
  });

  test("a # inside a line is part of the reference, not a comment", () => {
    const [entry] = parseManifest("./skills/c#\n", FILE);
    expect(entry?.source).toEqual({ type: "path", path: "/work/app/skills/c#" });
  });

  test("a repeated line is rejected, naming both lines", () => {
    const err = rejection("@acme/skills\n# again\n@acme/skills\n");
    expect(err.code).toBe("manifest_invalid");
    expect(err.message).toContain("line 3");
    expect(err.message).toContain("repeats line 1");
  });
});

describe("parseManifest: accepted references", () => {
  test("git sources parse exactly as they do on the command line", () => {
    const entries = parseManifest("@acme/skills\ngh:acme/tools@v1.4.0//skills/pdf\n", FILE);
    expect(entries.map((e) => e.source)).toEqual([
      { type: "git", url: "https://github.com/acme/skills.git", ref: null, subpath: "" },
      {
        type: "git",
        url: "https://github.com/acme/tools.git",
        ref: "v1.4.0",
        subpath: "skills/pdf",
      },
    ]);
  });

  test("a relative path resolves against the manifest's directory, not the working directory", () => {
    const [entry] = parseManifest("./tools/skills/notes\n", FILE);
    expect(entry?.source).toEqual({ type: "path", path: "/work/app/tools/skills/notes" });
  });

  test("a path may use .. as long as it stays inside the project", () => {
    const entries = parseManifest("./a/../skills/pdf\n./\n", FILE);
    expect(entries.map((e) => e.source)).toEqual([
      { type: "path", path: "/work/app/skills/pdf" },
      { type: "path", path: "/work/app" },
    ]);
  });
});

describe("parseManifest: rejected references", () => {
  const cases: readonly (readonly [string, string, string])[] = [
    ["a bare skill name", "python-testing", "through a tap"],
    ["a tap-qualified name", "acme/python-testing@v1", "through a tap"],
    ["an absolute path", "/opt/skills/pdf", "relative to the project"],
    ["a home-relative path", "~/skills/pdf", "relative to the project"],
    ["a parent path", "../shared/pdf", "outside the project"],
    ["the parent directory itself", "../", "outside the project"],
    ["a path that climbs out through ..", "./a/../../pdf", "outside the project"],
    ["a malformed reference", "not a ref", "isn't a valid skill name"],
  ];
  for (const [what, ref, reason] of cases) {
    test(`${what} is manifest_invalid`, () => {
      const err = rejection(`# header\n${ref}\n`);
      expect(err.code).toBe("manifest_invalid");
      expect(err.exitCode).toBe(4);
      expect(err.message).toContain(`${FILE} line 2`);
      expect(err.message).toContain(reason);
      expect(err.details).toEqual({ file: FILE, line: 2, ref });
    });
  }

  test("nothing is returned when any line is invalid", () => {
    expect(() => parseManifest("@acme/skills\npython-testing\n", FILE)).toThrow(CrewError);
  });
});
