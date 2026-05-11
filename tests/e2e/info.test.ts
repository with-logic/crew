/**
 * End-to-end coverage for `crew info` (§8, §9).
 *
 * `info` is a read-only resolver over installed state and configured
 * taps. These tests cover tap lookup paths that do not install first.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

describe("crew info", () => {
  test("bare tap skill uses declared SKILL.md name, not source directory", () => {
    const home = makeCrewHome();
    const repo = makeDeclaredNameTap();
    runCli(["tap", "add", repo, "firebase"], { home, streams: captureStreams().streams });

    const capture = captureStreams();
    const code = runCli(["info", "firebase-data-connect"], { home, streams: capture.streams });

    expect(code).toBe(0);
    expect(capture.stdout()).toContain("firebase-data-connect");
    expect(capture.stdout()).toContain("Data Connect basics");
  });

  test("qualified tap skill uses declared SKILL.md name, not source directory", () => {
    const home = makeCrewHome();
    const repo = makeDeclaredNameTap();
    runCli(["tap", "add", repo, "firebase"], { home, streams: captureStreams().streams });

    const capture = captureStreams();
    const code = runCli(["info", "firebase/firebase-data-connect"], {
      home,
      streams: capture.streams,
    });

    expect(code).toBe(0);
    expect(capture.stdout()).toContain("firebase-data-connect");
    expect(capture.stdout()).toContain("Data Connect basics");
  });

  test("bare namespace lists its member skills", () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    const namespace = join(repo, "skills", "knowledge-work");
    mkdirSync(namespace, { recursive: true });
    makeSkill(
      namespace,
      "finance",
      skillFrontmatter({ name: "financial-analysis", description: "Finance workflows" }),
    );
    runCli(["tap", "add", repo, "anthropic"], { home, streams: captureStreams().streams });

    const capture = captureStreams();
    const code = runCli(["info", "knowledge-work"], { home, streams: capture.streams });

    expect(code).toBe(0);
    expect(capture.stdout()).toContain("financial-analysis");
    expect(capture.stdout()).toContain("Finance workflows");
  });

  test("bare missing skill reports no skill or namespace match", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    const code = runCli(["info", "missing-skill"], { home, streams: capture.streams });

    expect(code).toBe(4);
    expect(capture.stderr()).toContain("isn't a skill or namespace");
  });

  test("bare ambiguous skill reports candidates", () => {
    const home = makeCrewHome();
    const one = makeTempDir();
    const two = makeTempDir();
    makeSkill(one, "shared", skillFrontmatter({ name: "shared" }));
    makeSkill(two, "shared", skillFrontmatter({ name: "shared" }));
    runCli(["tap", "add", one, "one"], { home, streams: captureStreams().streams });
    runCli(["tap", "add", two, "two"], { home, streams: captureStreams().streams });

    const capture = captureStreams();
    const code = runCli(["info", "shared"], { home, streams: capture.streams });

    expect(code).toBe(4);
    expect(capture.stderr()).toContain("ambiguous");
    expect(capture.stderr()).toContain("crew install one/shared");
    expect(capture.stderr()).toContain("crew install two/shared");
  });
});

function makeDeclaredNameTap(): string {
  const repo = makeTempDir();
  const skills = join(repo, "skills");
  mkdirSync(skills);
  makeSkill(
    skills,
    "firebase-data-connect-basics",
    skillFrontmatter({
      name: "firebase-data-connect",
      description: "Data Connect basics",
    }),
  );
  return repo;
}
