/** Local skill metadata is escaped only at human output boundaries (§5.1, §9). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import {
  escapedMetadata as escaped,
  rawMetadata as raw,
  yamlMetadata as yamlValue,
} from "../../helpers/metadata.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let destination: string;

beforeEach(() => {
  destination = makeTempDir("crew-metadata-agent-");
  claudeCodeAdapter.userPath = () => destination;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

test("local info escapes metadata while JSON retains original field values", () => {
  const home = makeCrewHome();
  const skill = makeSkill(
    makeTempDir(),
    "demo",
    skillFrontmatter({
      name: "demo",
      description: yamlValue,
      license: yamlValue,
      compatibility: yamlValue,
      homepage: yamlValue,
      dependencies: [yamlValue],
    }),
  );
  const json = captureStreams();
  expect(runCli(["info", skill, "--json"], { home, streams: json.streams })).toBe(0);
  const payload: unknown = JSON.parse(json.stdout());
  expect(payload).toMatchObject({
    skills: [
      {
        description: raw,
        license: raw,
        compatibility: raw,
        homepage: raw,
        dependencies: [raw],
      },
    ],
  });
  const human = captureStreams();
  expect(runCli(["info", skill], { home, streams: human.streams })).toBe(0);
  expect(human.stdout().split(escaped)).toHaveLength(6);
});

test("local install, reinstall, and installed info escape descriptions without changing bytes", () => {
  const home = makeCrewHome();
  const skill = makeSkill(
    makeTempDir(),
    "demo",
    skillFrontmatter({ name: "demo", description: yamlValue }),
  );
  for (const args of [
    ["install", skill],
    ["install", skill],
    ["info", "demo"],
  ]) {
    const human = captureStreams();
    expect(runCli([...args, "--agent", "claude-code"], { home, streams: human.streams })).toBe(0);
    expect(human.stdout()).toContain(escaped);
  }
  expect(readFileSync(join(destination, "demo", "SKILL.md"))).toEqual(
    readFileSync(join(skill, "SKILL.md")),
  );
  const json = captureStreams();
  expect(runCli(["info", "demo", "--json"], { home, streams: json.streams })).toBe(0);
  const payload: unknown = JSON.parse(json.stdout());
  expect(payload).toMatchObject({ description: raw });
});

test("local invalid skill diagnostics escape metadata before wrapping", () => {
  const home = makeCrewHome();
  const source = makeTempDir();
  makeSkill(source, "demo", skillFrontmatter({ name: "demo" }));
  makeSkill(source, "invalid", skillFrontmatter({ name: yamlValue }));
  const human = captureStreams();
  expect(runCli(["install", source], { home, streams: human.streams })).toBe(1);
  expect(human.stdout()).toContain(escaped);
});
