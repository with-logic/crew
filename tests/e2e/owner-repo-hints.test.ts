/**
 * `owner/repo` typed where a tap reference was expected (§8.5
 * "Two-segment misses", §16.3). The error must point at the `@` form,
 * and `crew install` must surface a known tap that lives at that
 * GitHub repo.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../src/known-taps/registry.ts";
import type { KnownTap } from "../../src/known-taps/types.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

/** The registry entry, parameterized over the `.git` suffix (C-TAP-24b). */
function knownTaps(url: string): readonly KnownTap[] {
  return [
    {
      name: "anthropic",
      url,
      subpath: "skills",
      description: "Anthropic's skills.",
      trust: "official",
      skills: [{ name: "pdf", namespace: null, description: "PDF work.", path: "pdf" }],
    },
  ];
}

const KNOWN_TAPS = knownTaps("https://github.com/anthropics/skills.git");

afterEach(() => {
  resetKnownTapsForTest();
});

/** Fresh home with no taps (so nothing is cloned) and the fixture registry. */
function bareHome(taps: readonly KnownTap[] = KNOWN_TAPS): string {
  const home = makeCrewHome();
  setKnownTapsForTest(taps);
  const setup = captureStreams();
  runCli(["tap", "remove", "core", "--force"], { home, streams: setup.streams });
  return home;
}

describe("owner/repo hints", () => {
  test("C-TAP-24b install owner/repo suggests @owner/repo and the known tap at that repo", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["install", "anthropics/skills"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("use `@anthropics/skills` instead");
    expect(c.stderr()).toContain("This is the tap for the GitHub repo anthropics/skills.");
    expect(c.stderr()).toContain("crew tap add https://github.com/anthropics/skills anthropic");
    expect(c.stderr()).toContain("crew install anthropic");
  });

  test("C-TAP-24b JSON install miss lists the repo-matched tap", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["install", "--json", "anthropics/skills"], { home, streams: c.streams });
    expect(code).toBe(4);
    const parsed = JSON.parse(c.stdout()) as {
      error: { name: string; details: { known_tap_suggestions: { install: string }[] } };
    };
    expect(parsed.error.name).toBe("invalid_ref");
    expect(parsed.error.details.known_tap_suggestions.map((s) => s.install)).toEqual([
      "crew install anthropic",
    ]);
  });

  test("C-TAP-24b owner/repo with no known tap still gets the @ hint", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["install", "someone/else"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("use `@someone/else` instead");
    expect(c.stderr()).not.toContain("Homecrew found possible matches in known taps");
  });

  test("C-TAP-24b info owner/repo suggests @owner/repo", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["info", "anthropics/skills"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("use `@anthropics/skills` instead");
  });

  test("C-TAP-24c tap add owner/repo suggests crew tap add @owner/repo", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["tap", "add", "anthropics/skills"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("looks like a tap reference");
    expect(c.stderr()).toContain("run `crew tap add @anthropics/skills`");
  });

  test("tap add with a bare word keeps the default remedy", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["tap", "add", "skills"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).not.toContain("crew tap add @");
  });

  test("C-TAP-24b a registry URL without the .git suffix matches identically", () => {
    const home = bareHome(knownTaps("https://github.com/anthropics/skills"));
    const c = captureStreams();
    const code = runCli(["install", "anthropics/skills"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("This is the tap for the GitHub repo anthropics/skills.");
    expect(c.stderr()).toContain("crew install anthropic");

    const j = captureStreams();
    runCli(["install", "--json", "anthropics/skills"], { home, streams: j.streams });
    const parsed = JSON.parse(j.stdout()) as {
      error: { details: { known_tap_suggestions: { install: string; url: string }[] } };
    };
    expect(parsed.error.details.known_tap_suggestions.map((s) => s.install)).toEqual([
      "crew install anthropic",
    ]);
  });

  test("C-TAP-24d install owner/repo@ref keeps the ref in every suggestion", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["install", "anthropics/skills@v1"], { home, streams: c.streams });
    expect(code).toBe(4);
    // The echoed reference shows what was typed...
    expect(c.stderr()).toContain("`anthropics/skills@v1`");
    // ...and every suggested command installs the revision requested.
    expect(c.stderr()).toContain("use `@anthropics/skills@v1` instead");
    expect(c.stderr()).toContain("crew install anthropic@v1");
  });

  test("C-TAP-24d info owner/repo@ref keeps the ref in the remedy", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["info", "anthropics/skills@v1"], { home, streams: c.streams });
    expect(code).toBe(4);
    expect(c.stderr()).toContain("use `@anthropics/skills@v1` instead");
  });

  test("C-TAP-24d the JSON suggestion carries the ref too", () => {
    const home = bareHome();
    const c = captureStreams();
    runCli(["install", "--json", "anthropics/skills@v1"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      error: { details: { ref: string; known_tap_suggestions: { install: string }[] } };
    };
    expect(parsed.error.details.ref).toBe("v1");
    expect(parsed.error.details.known_tap_suggestions.map((s) => s.install)).toEqual([
      "crew install anthropic@v1",
    ]);
  });

  test("C-TAP-24f tap add owner/repo@ref keeps the ref in the correction", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["tap", "add", "anthropics/skills@v1"], { home, streams: c.streams });

    expect(code).toBe(4);
    // The ref does not change what the user meant, so the suggested
    // command keeps the revision they asked for.
    expect(c.stderr()).toContain("crew tap add @anthropics/skills@v1");
  });

  test("C-TAP-24g a repo match is offered alongside a same-named skill", () => {
    // `anthropic/pdf` names a skill in the tap; the tap also lives at
    // the GitHub repo `anthropic/pdf` in this fixture. Both readings
    // are plausible, so both must be offered.
    const home = makeCrewHome();
    setKnownTapsForTest([
      {
        name: "anthropic",
        url: "https://github.com/anthropic/pdf.git",
        subpath: "skills",
        description: "Anthropic's skills.",
        trust: "official",
        skills: [{ name: "pdf", namespace: null, description: "PDF work.", path: "pdf" }],
      },
    ]);
    const setup = captureStreams();
    runCli(["tap", "remove", "core", "--force"], { home, streams: setup.streams });

    const c = captureStreams();
    runCli(["install", "--json", "anthropic/pdf"], { home, streams: c.streams });
    const parsed = JSON.parse(c.stdout()) as {
      error: { details: { known_tap_suggestions: { install: string }[] } };
    };
    const commands = parsed.error.details.known_tap_suggestions.map((s) => s.install);
    expect(commands).toContain("crew install anthropic/pdf");
    expect(commands).toContain("crew install anthropic");
  });
});
