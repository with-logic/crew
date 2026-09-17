/**
 * Dependency resolution during install (§9 step 6; C-DEP-01/02/08).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

type Redirectable = {
  userPath: () => string;
  projectPath: (cwd: string) => string;
  detect: () => boolean;
};
/** Every target adapter with the `<cwd>/<dir>/skills` project layout it uses. */
const ADAPTERS: ReadonlyArray<readonly [name: string, adapter: Redirectable, dir: string]> = [
  ["claude-code", claudeCodeAdapter, ".claude"],
  ["codex", codexAdapter, ".codex"],
  ["gemini-cli", geminiCliAdapter, ".gemini"],
];

/**
 * Redirect every target adapter to a tmp directory so tests never touch
 * `~/.claude/skills` etc. Returns the tmp roots keyed by adapter name and
 * a restore function.
 */
function redirectAdapters(): { agents: Record<string, string>; restore: () => void } {
  const agents: Record<string, string> = {};
  const saved = ADAPTERS.map(
    ([, adapter]) =>
      [
        adapter,
        { userPath: adapter.userPath, projectPath: adapter.projectPath, detect: adapter.detect },
      ] as const,
  );
  for (const [name, adapter, dir] of ADAPTERS) {
    const root = makeTempDir(`crew-${name}-`);
    agents[name] = root;
    adapter.userPath = () => root;
    adapter.projectPath = (cwd) => join(cwd, dir, "skills");
    adapter.detect = () => true;
  }
  return {
    agents,
    restore() {
      for (const [adapter, original] of saved) Object.assign(adapter, original);
    },
  };
}

let redirect: ReturnType<typeof redirectAdapters>;

beforeEach(() => {
  redirect = redirectAdapters();
});
afterEach(() => {
  redirect.restore();
});

describe("install dependencies", () => {
  test("C-DEP-01 + C-DEP-02 sibling dependency resolves first", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    makeSkill(container, "dep", skillFrontmatter({ name: "dep" }));
    makeSkill(container, "root", skillFrontmatter({ name: "root", dependencies: ["dep"] }));
    const code = runCli(["install", join(container, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(redirect.agents["claude-code"]!, "dep", "SKILL.md"))).toBe(true);
    expect(existsSync(join(redirect.agents["claude-code"]!, "root", "SKILL.md"))).toBe(true);
  });

  test("C-DEP-01 digit-leading dependency installs before dependent", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    makeSkill(container, "numeric-source", skillFrontmatter({ name: "3-statement-model" }));
    makeSkill(
      container,
      "root",
      skillFrontmatter({ name: "root", dependencies: ["3-statement-model"] }),
    );
    const code = runCli(["install", join(container, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const depEntry = readState(home).installations.find(
      (entry) => entry.name === "3-statement-model",
    )!;
    expect(depEntry.source.path).toBe("");
    writeFileSync(join(container, "numeric-source", "README.md"), "updated");
    const capture = captureStreams();
    const updateCode = runCli(["update", "3-statement-model"], { home, streams: capture.streams });
    expect(updateCode).toBe(0);
    expect(capture.stdout()).toContain("updated");
  });

  test("duplicate declared sibling dependency names fail deterministically", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    makeSkill(container, "one", skillFrontmatter({ name: "dep" }));
    makeSkill(container, "two", skillFrontmatter({ name: "dep" }));
    makeSkill(container, "root", skillFrontmatter({ name: "root", dependencies: ["dep"] }));

    const capture = captureStreams();
    const code = runCli(["install", join(container, "root")], {
      home,
      streams: capture.streams,
    });

    expect(code).toBe(4);
    expect(capture.stderr()).toContain("appears multiple times");
  });

  test("C-DEP-08 dependency cycle terminates", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    makeSkill(container, "a", skillFrontmatter({ name: "a", dependencies: ["b"] }));
    makeSkill(container, "b", skillFrontmatter({ name: "b", dependencies: ["a"] }));
    const code = runCli(["install", join(container, "a")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(redirect.agents["claude-code"]!, "a", "SKILL.md"))).toBe(true);
    expect(existsSync(join(redirect.agents["claude-code"]!, "b", "SKILL.md"))).toBe(true);
  });

  test("failed dependency fails the root install", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    makeSkill(
      container,
      "root",
      skillFrontmatter({ name: "root", dependencies: ["nonexistent-xxx"] }),
    );
    const code = runCli(["install", join(container, "root")], {
      home,
      streams: captureStreams().streams,
    });
    // An unresolvable dependency bubbles up as invalid_ref/ambiguous from acquire; exit 4.
    expect([4, 5]).toContain(code);
  });

  test("--recursive does not propagate to path dependencies", () => {
    const home = makeCrewHome();
    const rootContainer = makeTempDir();
    const depContainer = makeTempDir();
    const nested = join(depContainer, "teams", "support");
    mkdirSync(nested, { recursive: true });
    makeSkill(nested, "deep-dep", skillFrontmatter({ name: "deep-dep" }));
    makeSkill(
      rootContainer,
      "root",
      skillFrontmatter({ name: "root", dependencies: [depContainer] }),
    );

    const code = runCli(["install", "--recursive", join(rootContainer, "root")], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(4);
    expect(existsSync(join(redirect.agents["claude-code"]!, "deep-dep"))).toBe(false);
    expect(existsSync(join(redirect.agents["claude-code"]!, "root"))).toBe(false);
  });
});
