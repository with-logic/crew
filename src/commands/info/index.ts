/**
 * `crew info <ref-or-name>` — show details for a skill (or every skill
 * in a collection, when the ref names a tap).
 *
 * Two paths:
 *   - Installed bare name → gather from state + local install site.
 *   - Anything else → resolve through tap-attribution (no auto-tap
 *     side effects), walk the source, and render.
 */

import { join } from "node:path";
import { baseFor, cwdForEntry } from "../../agents/adapter.ts";
import { agentByName } from "../../agents/registry.ts";
import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import type { StateEntry } from "../../core/types.ts";
import type { NameCandidate } from "../../install/attribute-bare-name.ts";
import { type NonTapNameCandidate, resolveTapRef } from "../../install/resolve-ref/index.ts";
import { attributeRef } from "../../install/tap-attribution.ts";
import { NAME_PATTERN, parseRef } from "../../refs/parse.ts";
import { hasSkillMd, loadSkill } from "../../skill/load.ts";
import { acquireTap } from "../../sources/acquire/index.ts";
import { expandSkills } from "../../sources/expand.ts";
import { readState } from "../../state/load.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import type { InstalledInfo, SkillInfo } from "./render.ts";
import { renderInstalled, renderSkills } from "./render.ts";

export function infoCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length !== 1) {
    throw new CrewError(
      "usage_error",
      "`crew info` needs exactly one skill name or reference — e.g. `crew info python-testing` or `crew info gh:acme/skills//python/testing`",
    );
  }
  const arg = ctx.positional[0]!;

  // Bare names try state first — show the user what they have, with
  // a real description pulled from the installed SKILL.md. A skill
  // can be installed in multiple places (user + several projects);
  // gather them all so info reflects the full picture.
  const state = readState(ctx.home);
  const isBareName = NAME_PATTERN.test(arg);
  const matches = isBareName ? state.installations.filter((e) => e.name === arg) : [];
  if (matches.length > 0) {
    const installed = buildInstalledInfo(matches, ctx.cwd);
    return {
      exitCode: 0,
      human: renderInstalled(installed, ctx.style, ctx.width),
      json: {
        installed: installed.primary,
        entries: matches,
        description: installed.description,
      },
    };
  }

  // Fall through to resolving the ref and walking its source.
  const config = readConfig(ctx.home);
  const source = parseRef(arg, ctx.cwd);
  const { tap, dirs } = (() => {
    if (source.type === "tap" && source.tap === null) {
      const namedTap = config.taps.find((t) => t.name === source.name);
      if (namedTap) {
        const acq = acquireTap(namedTap, ctx.home);
        return { tap: namedTap, dirs: [acq.rootDir] };
      }
      // The tap-name case returned above; remaining bare refs resolve
      // to a skill or namespace candidate.
      return candidateDirs(resolveTapRef(source, config, ctx.home, "non-tap"));
    }
    if (source.type === "tap") {
      return candidateDirs(resolveTapRef(source, config, ctx.home, "non-tap"));
    }
    const matched = config.taps.find((t) => {
      if (source.type === "git")
        return t.kind === "git" && t.url === source.url && t.subpath === source.subpath;
      return t.kind === "path" && t.path === source.path;
    });
    if (matched) {
      const acq = acquireTap(matched, ctx.home);
      return { tap: matched, dirs: [acq.rootDir] };
    }
    const attrib = attributeRef(source, config);
    const acq = acquireTap(attrib.tap, ctx.home);
    return { tap: attrib.tap, dirs: [acq.rootDir] };
  })();

  const skillInfos = buildSkillInfos(dirs);
  return {
    exitCode: 0,
    human: renderSkills(skillInfos, tap, ctx.style, ctx.width),
    json: { skills: skillInfos },
  };
}

function candidateDirs(candidate: NonTapNameCandidate): {
  tap: NameCandidate["tap"];
  dirs: string[];
} {
  if (candidate.kind === "skill") return { tap: candidate.tap, dirs: [candidate.location.path] };
  return { tap: candidate.tap, dirs: candidate.members.map((m) => m.path) };
}

/**
 * Gather all state entries that match a skill name and enrich with a
 * description pulled from any installed SKILL.md. The "primary" entry
 * is the user-scope install when present, otherwise the first project
 * install; it drives the top-level metadata block.
 */
function buildInstalledInfo(entries: readonly StateEntry[], fallbackCwd: string): InstalledInfo {
  const primary = entries.find((e) => e.scope === "user") ?? entries[0]!;
  const description = loadDescriptionFromAny(entries, fallbackCwd);
  return { primary, entries, description };
}

function loadDescriptionFromAny(
  entries: readonly StateEntry[],
  fallbackCwd: string,
): string | null {
  for (const entry of entries) {
    for (const target of entry.agents) {
      const adapter = agentByName(target);
      if (!adapter) continue;
      const cwd = cwdForEntry(entry, fallbackCwd);
      const installDir = join(baseFor(adapter, entry.scope, cwd), entry.name);
      if (hasSkillMd(installDir)) {
        try {
          const loaded = loadSkill(installDir);
          return loaded.frontmatter.description ?? null;
        } catch {
          // Skip silently; try the next target/entry.
        }
      }
    }
  }
  return null;
}

/**
 * Walk a source directory and gather SkillInfo per skill we find.
 * `expandSkills` returns `{ valid, skipped }`; `info` is a
 * read-only "show me what's valid here" command, so skipped skills
 * are deliberately dropped. `crew install` surfaces those (§9 step 9).
 */
function buildSkillInfos(dirs: readonly string[]): SkillInfo[] {
  const valid = dirs.flatMap((d) => expandSkills(d).valid);
  return valid.map((s) => ({
    name: s.frontmatter.name,
    description: s.frontmatter.description,
    license: s.frontmatter.license ?? null,
    compatibility: s.frontmatter.compatibility ?? null,
    homepage: s.frontmatter.metadata?.crew?.homepage ?? null,
    dependencies: s.frontmatter.metadata?.crew?.dependencies ?? [],
  }));
}
