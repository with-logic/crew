/**
 * Previewing an explicit `@<ref>` with `crew info` (§9.1).
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { repoWithSkillDeletedAtHead, twoCommitRepo, useRedirectedAdapter } from "./helpers.ts";

useRedirectedAdapter();

describe("crew info at an explicit ref", () => {
  test("C-INST-05b info previews the ref's content", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    const cap = captureStreams();
    const code = runCli(["info", `file://${repo}@v1//demo`, "--json"], {
      home,
      streams: cap.streams,
    });

    expect(code).toBe(0);
    const payload = JSON.parse(cap.stdout()) as { skills: { description: string }[] };
    expect(payload.skills[0]!.description).toBe("VERSION ONE");
  });

  test("C-INST-05e info on a qualified ref previews a skill deleted at HEAD", () => {
    const home = makeCrewHome();
    const { repo } = repoWithSkillDeletedAtHead();
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams });

    const cap = captureStreams();
    const code = runCli(["info", "acme/gone@v2", "--json"], { home, streams: cap.streams });

    expect(code).toBe(0);
    const payload = JSON.parse(cap.stdout()) as { skills: { name: string }[] };
    expect(payload.skills.map((s) => s.name)).toEqual(["gone"]);
  });

  test("C-INST-05e a ref against a path tap previews the directory as-is", () => {
    // A path tap has no commits, so a ref cannot narrow it: it is skipped
    // when materializing candidate taps, and the bare name still resolves
    // against its directory.
    const home = makeCrewHome();
    const dir = makeTempDir("crew-pathtap-");
    makeSkill(
      dir,
      "ptskill",
      skillFrontmatter({ name: "ptskill", description: "PATH TAP" }),
      "p\n",
    );
    runCli(["tap", "add", dir, "ptap"], { home, streams: captureStreams().streams });

    const cap = captureStreams();
    const code = runCli(["info", "ptskill@v1", "--json"], { home, streams: cap.streams });

    expect(code).toBe(0);
    const payload = JSON.parse(cap.stdout()) as { skills: { description: string }[] };
    expect(payload.skills[0]!.description).toBe("PATH TAP");
  });

  test("C-INST-05e info on a BARE name previews a skill deleted at HEAD", () => {
    const home = makeCrewHome();
    const { repo } = repoWithSkillDeletedAtHead();
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams });

    const cap = captureStreams();
    const code = runCli(["info", "gone@v2", "--json"], { home, streams: cap.streams });

    expect(code).toBe(0);
    const payload = JSON.parse(cap.stdout()) as { skills: { name: string }[] };
    expect(payload.skills.map((s) => s.name)).toEqual(["gone"]);
  });
});
