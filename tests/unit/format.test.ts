/**
 * Unit tests for the shared human-output formatting helpers.
 */

import { describe, expect, test } from "bun:test";
import {
  columns,
  firstSentences,
  plural,
  shortenHome,
  timeAgo,
  truncate,
  twoColumnTable,
  visualWidth,
  wrap,
} from "../../src/util/format.ts";

describe("plural", () => {
  test("uses the singular noun for 1, adds `s` otherwise", () => {
    expect(plural(1, "skill")).toBe("1 skill");
    expect(plural(0, "skill")).toBe("0 skills");
    expect(plural(3, "skill")).toBe("3 skills");
  });

  test("honors an explicit plural for irregular nouns", () => {
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(4, "entry", "entries")).toBe("4 entries");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-04-20T12:00:00Z");

  test("under a minute → `just now`", () => {
    expect(timeAgo("2026-04-20T11:59:30Z", now)).toBe("just now");
  });

  test("minute and hour ranges format compactly", () => {
    expect(timeAgo("2026-04-20T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-04-20T09:00:00Z", now)).toBe("3h ago");
  });

  test("under a week rolls up to days", () => {
    expect(timeAgo("2026-04-18T12:00:00Z", now)).toBe("2d ago");
  });

  test("over a week falls back to an ISO date", () => {
    expect(timeAgo("2026-04-01T12:00:00Z", now)).toBe("2026-04-01");
  });

  test("unparseable input is returned verbatim", () => {
    expect(timeAgo("not a date", now)).toBe("not a date");
  });
});

describe("shortenHome", () => {
  test("replaces exact $HOME with `~`", () => {
    expect(shortenHome("/Users/me", "/Users/me")).toBe("~");
  });

  test("collapses a child path to `~/<rest>`", () => {
    expect(shortenHome("/Users/me/projects/x", "/Users/me")).toBe("~/projects/x");
  });

  test("leaves paths outside home alone", () => {
    expect(shortenHome("/var/tmp/x", "/Users/me")).toBe("/var/tmp/x");
  });
});

describe("twoColumnTable", () => {
  test("pads the left cell to the widest row, with a gap", () => {
    expect(
      twoColumnTable([
        ["foo", "bar"],
        ["longer", "baz"],
      ]),
    ).toEqual(["foo     bar", "longer  baz"]);
  });

  test("honors an explicit gap", () => {
    expect(twoColumnTable([["a", "b"]], 4)).toEqual(["a    b"]);
  });

  test("empty input → empty output", () => {
    expect(twoColumnTable([])).toEqual([]);
  });
});

describe("columns", () => {
  test("renders an N-column aligned table", () => {
    const rendered = columns([
      ["a", "bb", "ccc"],
      ["aaa", "b", "cc"],
    ]);
    expect(rendered).toEqual(["a    bb  ccc", "aaa  b   cc"]);
  });

  test("handles rows with fewer cells than the widest", () => {
    expect(columns([["a", "b", "c"], ["d"]])).toEqual(["a  b  c", "d"]);
  });

  test("ignores ANSI width when aligning", () => {
    const ansi = "\x1b[1mbold\x1b[0m";
    const [row] = columns([[ansi, "tail"]]);
    // left cell padded to its visible width (4) + 2-char gap before tail.
    expect(row).toBe(`${ansi}  tail`);
  });

  test("empty input → empty output", () => {
    expect(columns([])).toEqual([]);
  });
});

describe("visualWidth", () => {
  test("strips ANSI when counting width", () => {
    expect(visualWidth("\x1b[31mhello\x1b[0m")).toBe(5);
    expect(visualWidth("hi")).toBe(2);
  });
});

describe("truncate", () => {
  test("leaves short strings alone", () => {
    expect(truncate("hi", 10)).toBe("hi");
  });

  test("chops to width-1 and appends ellipsis", () => {
    expect(truncate("hello world", 7)).toBe("hello …");
  });

  test("width <= 0 collapses to empty", () => {
    expect(truncate("anything", 0)).toBe("");
  });

  test("width of 1 collapses to the ellipsis itself", () => {
    expect(truncate("anything", 1)).toBe("…");
  });
});

describe("wrap", () => {
  test("wraps on word boundaries", () => {
    expect(wrap("one two three four", 10)).toEqual(["one two", "three four"]);
  });

  test("empty input yields a single empty line", () => {
    expect(wrap("", 10)).toEqual([""]);
  });

  test("never splits a long word", () => {
    expect(wrap("short verylongsinglewordhere", 6)).toEqual(["short", "verylongsinglewordhere"]);
  });
});

describe("firstSentences", () => {
  test("returns full text when it fits", () => {
    expect(firstSentences("Short description.", 240)).toBe("Short description.");
  });

  test("prefers a sentence boundary when over budget", () => {
    const text = "First sentence here. Second one follows. Third.";
    expect(firstSentences(text, 30)).toBe("First sentence here.");
  });

  test("recognizes `!` and `?` as boundaries", () => {
    expect(firstSentences("Wow! Another line here. Third.", 10)).toBe("Wow!");
    expect(firstSentences("Ready? Go! Done.", 7)).toBe("Ready?");
  });

  test("falls back to truncation when no boundary fits", () => {
    const text = "a".repeat(500);
    expect(firstSentences(text, 20)).toBe(`${"a".repeat(19)}…`);
  });
});
