/** Search references escape terminal controls before column layout (§5.1, §16.6). */

import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../../src/known-taps/registry.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const namespace = "ns\x1b[2Jforged\x07\x7f\x85\nend";
const escapedNamespace = "ns\\x1b[2Jforged\\x07\\x7f\\x85\\x0aend";
const terminalWidth = 100;
const rowPrefixWidth = 4 + 2;
const ellipsisWidth = 1;
const description = "d".repeat(terminalWidth);
const reference = `${escapedNamespace}/demo`;
const summary = `${"d".repeat(terminalWidth - rowPrefixWidth - reference.length - ellipsisWidth)}…`;

afterEach(resetKnownTapsForTest);

test("configured namespace controls are escaped before columns; JSON and source stay raw", () => {
  const home = makeCrewHome();
  const root = makeTempDir("crew-search-controls-");
  const skill = makeSkill(
    join(root, "skills", namespace),
    "demo",
    skillFrontmatter({ name: "demo", description }),
  );
  makeSkill(join(root, "skills"), "healthy", skillFrontmatter({ name: "healthy", description }));
  const sourcePath = join(skill, "SKILL.md");
  const original = readFileSync(sourcePath, "utf8");
  expect(runCli(["tap", "add", root, "local"], { home, streams: captureStreams().streams })).toBe(
    0,
  );
  const human = captureStreams();
  expect(
    runCli(["search", "--tap", "local"], { home, streams: human.streams, width: terminalWidth }),
  ).toBe(0);
  const lines = human.stdout().split("\n");
  expect(lines).toContain(`    ${reference}  ${summary}`);
  expect(lines).toContain(`    ${"healthy".padEnd(reference.length)}  ${summary}`);
  expect(human.stdout()).not.toContain(namespace);
  for (const control of ["\x1b", "\x07", "\x7f", "\x85"]) {
    expect(human.stdout()).not.toContain(control);
  }
  expect(lines.filter((line) => line.includes("demo"))).toHaveLength(1);

  const json = captureStreams();
  expect(runCli(["search", "--tap", "local", "--json"], { home, streams: json.streams })).toBe(0);
  expect(JSON.parse(json.stdout()).hits).toEqual([
    {
      tap: "local",
      name: "demo",
      namespace,
      description,
      installed: false,
      same_name_installed: false,
    },
    {
      tap: "local",
      name: "healthy",
      namespace: null,
      description,
      installed: false,
      same_name_installed: false,
    },
  ]);
  expect(readFileSync(sourcePath, "utf8")).toBe(original);
});

test("known-tap namespace and install references are escaped before columns; JSON stays raw", () => {
  const home = makeCrewHome();
  expect(
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams }),
  ).toBe(0);
  const skills = [
    { name: "demo", namespace, description, path: `${namespace}/demo` },
    { name: "healthy", namespace: null, description, path: "healthy" },
  ];
  setKnownTapsForTest([
    {
      name: "trusted",
      url: "https://example.com/skills.git",
      subpath: "",
      trust: "curated",
      description: "catalog",
      skills,
    },
  ]);
  const human = captureStreams();
  expect(
    runCli(["search", "catalog"], { home, streams: human.streams, width: terminalWidth }),
  ).toBe(0);
  const lines = human.stdout().split("\n");
  expect(lines).toContain(`    ${reference}  ${summary} (crew install trusted/${reference})`);
  expect(lines).toContain(
    `    ${"healthy".padEnd(reference.length)}  ${summary} (crew install trusted/healthy)`,
  );
  expect(human.stdout()).not.toContain(namespace);
  for (const control of ["\x1b", "\x07", "\x7f", "\x85"]) {
    expect(human.stdout()).not.toContain(control);
  }
  expect(lines.filter((line) => line.includes("demo"))).toHaveLength(1);

  const json = captureStreams();
  expect(runCli(["search", "catalog", "--json"], { home, streams: json.streams })).toBe(0);
  expect(JSON.parse(json.stdout()).known_hits).toContainEqual({
    tap: "trusted",
    url: "https://example.com/skills.git",
    subpath: "",
    trust: "curated",
    name: "demo",
    namespace,
    description,
  });
});
