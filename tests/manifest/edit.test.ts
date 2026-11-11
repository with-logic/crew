/**
 * Editing a manifest's text (§9.2): lines are added and removed, and
 * everything else in the file is left exactly as it was.
 */

import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { addManifestLines, removeManifestLines } from "../../src/manifest/index.ts";

describe("addManifestLines", () => {
  test("appends each reference as its own line, in the order given", () => {
    expect(addManifestLines("@acme/a\n", ["@acme/b", "./tools/c"])).toEqual({
      text: "@acme/a\n@acme/b\n./tools/c\n",
      changedRefs: ["@acme/b", "./tools/c"],
    });
  });

  test("starts an empty manifest", () => {
    expect(addManifestLines("", ["@acme/a"])).toEqual({
      text: "@acme/a\n",
      changedRefs: ["@acme/a"],
    });
  });

  test("gives a last line that lacks a newline one before appending", () => {
    expect(addManifestLines("@acme/a", ["@acme/b"]).text).toBe("@acme/a\n@acme/b\n");
  });

  test("skips a reference the manifest already lists, however that line is indented", () => {
    const text = "# shared skills\n  @acme/a  \n";

    expect(addManifestLines(text, ["@acme/a"])).toEqual({ text, changedRefs: [] });
  });

  test("adds a reference given twice only once", () => {
    expect(addManifestLines("", ["@acme/a", " @acme/a "])).toEqual({
      text: "@acme/a\n",
      changedRefs: ["@acme/a"],
    });
  });

  test("does not count a commented-out reference as present", () => {
    expect(addManifestLines("# @acme/a\n", ["@acme/a"]).text).toBe("# @acme/a\n@acme/a\n");
  });

  test("leaves comments, blank lines, and CRLF line endings as they were", () => {
    const text = "# shared\r\n\r\n@acme/a\r\n";

    expect(addManifestLines(text, ["@acme/b"]).text).toBe(`${text}@acme/b\n`);
  });
});

describe("removeManifestLines", () => {
  test("deletes the line of each reference it lists", () => {
    expect(removeManifestLines("@acme/a\n@acme/b\n./tools/c\n", ["@acme/b"])).toEqual({
      text: "@acme/a\n./tools/c\n",
      changedRefs: ["@acme/b"],
    });
  });

  test("deletes several, reporting them in the order asked for, not the file's", () => {
    expect(removeManifestLines("@acme/a\n@acme/b\n@acme/c\n", ["@acme/c", "@acme/a"])).toEqual({
      text: "@acme/b\n",
      changedRefs: ["@acme/c", "@acme/a"],
    });
  });

  test("a surviving last line that had no newline still has none", () => {
    expect(removeManifestLines("@acme/a\n@acme/b", ["@acme/a"]).text).toBe("@acme/b");
  });

  test("leaves a reference the manifest does not list out of what changed", () => {
    expect(removeManifestLines("@acme/a\n", ["@acme/a", "@acme/zzz"])).toEqual({
      text: "",
      changedRefs: ["@acme/a"],
    });
  });

  test("changes nothing when it lists none of them", () => {
    const text = "@acme/a\n";

    expect(removeManifestLines(text, ["@acme/b"])).toEqual({ text, changedRefs: [] });
  });

  test("matches a line whatever its indentation, and a reference given with spaces", () => {
    expect(removeManifestLines("  @acme/a  \n@acme/b\n", [" @acme/a"]).text).toBe("@acme/b\n");
  });

  test("leaves comments, blank lines, and a commented-out reference alone", () => {
    const text = "# shared\n\n# @acme/a\n@acme/a\n";

    expect(removeManifestLines(text, ["@acme/a"]).text).toBe("# shared\n\n# @acme/a\n");
  });

  test("keeps the line endings of the lines that stay", () => {
    expect(removeManifestLines("@acme/a\r\n@acme/b\r\n", ["@acme/a"]).text).toBe("@acme/b\r\n");
  });

  test("a last line with no newline is removed cleanly", () => {
    expect(removeManifestLines("@acme/a\n@acme/b", ["@acme/b"]).text).toBe("@acme/a\n");
  });

  test("adding a line back after removing it restores the manifest", () => {
    const text = "@acme/a\n@acme/b\n";
    const without = removeManifestLines(text, ["@acme/b"]).text;

    expect(addManifestLines(without, ["@acme/b"]).text).toBe(text);
  });
});

describe("a reference that is not one non-empty line", () => {
  test.each([
    ["an empty string", ""],
    ["only spaces", "   "],
    ["two lines", "@acme/a\n@acme/b"],
    ["a carriage return inside", "@acme/a\r@acme/b"],
  ])("%s is a usage_error for both edits", (_what, ref) => {
    for (const edit of [addManifestLines, removeManifestLines]) {
      let thrown: unknown;
      try {
        edit("@acme/a\n", [ref]);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(CrewError);
      expect((thrown as CrewError).code).toBe("usage_error");
    }
  });
});
