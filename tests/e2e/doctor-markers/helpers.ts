/**
 * Shared steps for the doctor marker suites (§11.2 checks 9 and 10): point
 * claude-code and codex at fresh skills folders, install a skill into
 * both, and read doctor's findings.
 */

import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

type Redirect = Pick<typeof codexAdapter, "userPath" | "detect">;

/** Point claude-code and codex at fresh skills folders, both detected; returns an undo. */
export function redirectAgents(): { restore: () => void } {
  const originals: (readonly [Redirect, Redirect])[] = [];
  for (const adapter of [claudeCodeAdapter, codexAdapter]) {
    originals.push([adapter, { userPath: adapter.userPath, detect: adapter.detect }]);
    const root = makeTempDir("crew-agent-");
    adapter.userPath = () => root;
    adapter.detect = () => true;
  }
  return {
    restore: () => {
      for (const [adapter, original] of originals) Object.assign(adapter, original);
    },
  };
}

export const BOTH = ["--agent", "claude-code", "--agent", "codex"];

/** A repo whose skills, `names`, live under `skills/`. */
export function buildRepo(names: readonly string[]): string {
  const repo = makeTempDir("crew-doctor-");
  makeGitRepo(repo);
  for (const n of names) makeSkill(join(repo, "skills"), n, skillFrontmatter({ name: n }));
  commitAll(repo, "initial");
  return repo;
}

/** Run the CLI against `home`; throws when it fails. */
export function must(home: string, args: readonly string[]): void {
  const code = runCli([...args], { home, streams: captureStreams().streams });
  if (code !== 0) throw new Error(`crew ${args.join(" ")} failed`);
}

export interface Finding {
  readonly level: string;
  readonly code: string;
  readonly message: string;
}

/** `crew doctor` with `flags`, as JSON: its exit code and findings. */
export function doctor(
  home: string,
  flags: readonly string[] = [],
): { code: number; findings: Finding[] } {
  const cap = captureStreams();
  const code = runCli(["doctor", ...flags, "--json"], { home, streams: cap.streams });
  return { code, findings: (JSON.parse(cap.stdout()) as { findings: Finding[] }).findings };
}

/** Each finding as `code:level`, sorted. */
export function codes(findings: readonly Finding[]): string[] {
  return findings.map((f) => `${f.code}:${f.level}`).sort();
}
