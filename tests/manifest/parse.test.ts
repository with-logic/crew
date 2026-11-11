/**
 * Project manifest parser (§9.2): the `.crewrc` line format and the
 * references it accepts and rejects.
 */
import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { MANIFEST_FILENAME, parseManifest } from "../../src/manifest/parse.ts";

const FILE = `/work/app/${MANIFEST_FILENAME}`;

const parse = (text: string) => parseManifest({ text, file: FILE });

function rejection(text: string): CrewError {
  try {
    parse(text);
  } catch (err) {
    return err as CrewError;
  }
  throw new Error("expected parseManifest to reject");
}

describe("parseManifest: line format", () => {
  test("an empty manifest declares nothing", () => {
    expect(parse("")).toEqual([]);
    expect(parse("\n\n  \n")).toEqual([]);
  });

  test("blank lines and # comment lines are ignored", () => {
    const text = "# shared skills\n\n@acme/skills\n   # indented comment\n";
    expect(parse(text).map((e) => e.ref)).toEqual(["@acme/skills"]);
  });

  test("each entry keeps its 1-based line number and its reference as written", () => {
    const entries = parse("# one\n@acme/skills\n\ngh:acme/tools//pdf@v1\n");
    expect(entries.map((e) => [e.line, e.ref])).toEqual([
      [2, "@acme/skills"],
      [4, "gh:acme/tools//pdf@v1"],
    ]);
  });

  test("surrounding whitespace, CRLF line endings, and a leading BOM are not part of a reference", () => {
    const entries = parse("﻿  @acme/skills\t\r\n./skills/pdf\r\n");
    expect(entries.map((e) => e.ref)).toEqual(["@acme/skills", "./skills/pdf"]);
  });

  test("a # inside a line is part of the reference, not a comment", () => {
    const [entry] = parse("./skills/c#\n");
    expect(entry?.source).toEqual({ type: "path", path: "/work/app/skills/c#" });
  });

  test("a final line with no newline is still a reference", () => {
    expect(parse("@acme/skills").map((e) => [e.line, e.ref])).toEqual([[1, "@acme/skills"]]);
  });

  test("a line repeated after trimming is rejected, naming both lines", () => {
    const err = rejection("@acme/skills\n# again\n  @acme/skills\t\n");
    expect(err.code).toBe("manifest_invalid");
    expect(err.message).toContain("line 3");
    expect(err.message).toContain("repeats line 1");
  });
});

describe("parseManifest: accepted references", () => {
  test("git sources parse exactly as they do on the command line", () => {
    const entries = parse("@acme/skills\ngh:acme/tools@v1.4.0//skills/pdf\n");
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
    const [entry] = parse("./tools/skills/notes\n");
    expect(entry?.source).toEqual({ type: "path", path: "/work/app/tools/skills/notes" });
  });

  test("a path may use .. as long as it stays inside the project", () => {
    const entries = parse("./a/../skills/pdf\n./\n../app/skills/docx\n");
    expect(entries.map((e) => e.source)).toEqual([
      { type: "path", path: "/work/app/skills/pdf" },
      { type: "path", path: "/work/app" },
      { type: "path", path: "/work/app/skills/docx" },
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
    expect(() => parse("@acme/skills\npython-testing\n")).toThrow(CrewError);
  });

  for (const ref of [
    "https://ghp_secret123@github.com/acme/skills",
    "https://user:hunter2secret@host.example/acme/skills//pdf",
    "https://host.example/acme/skills?access_token=tok_secret9",
  ]) {
    test(`a URL carrying a credential is manifest_invalid, and the credential is not echoed: ${ref.slice(0, 22)}…`, () => {
      const err = rejection(`${ref}\n`);
      expect(err.code).toBe("manifest_invalid");
      expect(err.message).toContain("credential");
      expect(err.details).toMatchObject({ file: FILE, line: 1 });
      expect(String(err.details["ref"])).toContain("***");
      const shown = `${err.message} ${JSON.stringify(err.details)}`;
      for (const secret of ["ghp_secret123", "hunter2secret", "tok_secret9"]) {
        expect(shown).not.toContain(secret);
      }
    });
  }

  test("a URL with a harmless query, a default port, or an uppercase host is not a credential", () => {
    const accepted = [
      "https://host.example:443/acme/skills",
      "https://HOST.example/acme/skills",
      "https://github.com/acme/skills?tab=readme-ov-file",
      "https://github.com/acme/skills/tree/main/pdf?plain=1",
      "https://github.com/acme/skills#readme?token=note",
    ];
    expect(parse(`${accepted.join("\n")}\n`).map((e) => e.line)).toEqual([1, 2, 3, 4, 5]);
  });

  test("a password is a credential on any URL with a scheme, including ssh://", () => {
    const err = rejection("ssh://git:hunter2secret@host.example/acme/skills.git\n");
    expect(err.message).toContain("credential");
  });

  test.each(["token", "access_token", "private_token", "api_key", "apikey", "PASSWORD", "%74oken"])(
    "the sensitive query parameter %p is a credential, and its value is not echoed",
    (key) => {
      const err = rejection(`https://host.example/acme/skills?x=1&${key}=s3cretValue\n`);
      expect(err.message).toContain("credential");
      expect(`${err.message} ${JSON.stringify(err.details)}`).not.toContain("s3cretValue");
    },
  );

  test("an scp-style remote is judged as one even when its path contains ://", () => {
    expect(parse("git@host.example:acme/repo://path\n").map((e) => e.line)).toEqual([1]);
  });

  test("an SSH URL's username is not a credential", () => {
    const refs = "git@github.com:acme/skills.git\nssh://git@host.example/acme/skills.git\n";
    expect(parse(refs).map((e) => e.line)).toEqual([1, 2]);
  });
});
