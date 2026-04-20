/**
 * Global test preload.
 *
 * 1. Neutralize every agent adapter: point `userPath` / `projectPath`
 *    at an inert tmp dir and force `detect()` to return false. This
 *    keeps tests from writing to real skill dirs (`~/.claude/skills/`,
 *    `~/.agents/skills/`, etc.) on a dev machine that happens to have
 *    those agents installed. Without this, any `crew install` path
 *    from a test whose adapter mocks are incomplete pollutes the
 *    developer's real setup.
 *
 * 2. Force `claude-code` to `detect() === true` and restore its real
 *    `projectPath` function (which returns `<cwd>/.claude/skills`).
 *    Lots of tests hand-craft fixtures at `<projCwd>/.claude/skills/`
 *    then run uninstall/doctor flows against them; they rely on that
 *    mapping. Project scope is safe because `cwd` is always a tmp dir
 *    in tests. The `userPath` stays pointed at the inert dir so
 *    user-scope installs don't hit the real `~/.claude/skills/`.
 *
 * Tests that need other adapters active override specific ones in
 * their own `beforeEach` — e.g. `redirectAdapters()` in
 * `tests/e2e/install.test.ts` swaps real `userPath` / `projectPath` /
 * `detect` in for the duration of the test and restores on
 * `afterEach`.
 */

import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { neutralizeAdaptersExcept } from "./env.ts";

neutralizeAdaptersExcept([]);

type Mut = { detect: () => boolean; projectPath: (cwd: string) => string };
(claudeCodeAdapter as Mut).detect = () => true;
// Restore the real project-scope mapping so tests that hand-craft
// fixtures at `<cwd>/.claude/skills/` keep working.
(claudeCodeAdapter as Mut).projectPath = (cwd: string) => join(cwd, ".claude", "skills");
