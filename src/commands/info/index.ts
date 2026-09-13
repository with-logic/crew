/**
 * `crew info <ref-or-name>` — show details for a skill (or every skill
 * in a collection, when the ref names a tap).
 *
 * Two paths:
 *   - Installed bare name → gather from state + local install site.
 *   - Anything else → resolve through tap-attribution (no auto-tap
 *     side effects), walk the source, and render.
 *
 * This file owns the command shape and the installed-entry path; source
 * preview (including `@<ref>` handling) lives in `./preview.ts`.
 */

import { join } from "node:path";
import { baseFor, cwdForEntry } from "../../agents/adapter.ts";
import { agentByName } from "../../agents/registry.ts";
import { readConfig } from "../../config/load.ts";
import { CrewError } from "../../core/errors.ts";
import type { StateEntry } from "../../core/types.ts";
import { attributeRef } from "../../install/tap-attribution.ts";
import { parseRef } from "../../refs/parse.ts";
import { hasSkillMd, loadSkill } from "../../skill/load.ts";
import { readState } from "../../state/load.ts";
import { resolveStateSubject } from "../../state/subjects.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { skillsAtRef, tapCandidate } from "./preview.ts";
import type { InstalledInfo } from "./render.ts";
import { renderInstalled, renderSkills } from "./render.ts";

export function infoCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length !== 1) {
    throw new CrewError(
      "usage_error",
      "`crew info` needs exactly one skill name or reference — e.g. `crew info python-testing` or `crew info gh:acme/skills//python/testing`",
    );
  }
  const arg = ctx.positional[0]!;

  const state = readState(ctx.home);
  const subject = resolveStateSubject(state, arg);
  if (subject.entries.length > 0) {
    const installed = buildInstalledInfo(subject.entries, ctx.cwd);
    return {
      exitCode: 0,
      human: renderInstalled(installed, ctx.style, ctx.width),
      json: {
        installed: installed.primary,
        entries: subject.entries,
        description: installed.description,
      },
    };
  }

  const config = readConfig(ctx.home);
  const source = parseRef(arg, ctx.cwd);
  // An `@ref` tail previews that commit's content, not the clone's HEAD (§9.1).
  const ref = source.type === "path" ? null : source.ref;
  const { tap, skills } = (() => {
    if (source.type === "tap" && source.tap === null) {
      const namedTap = config.taps.find((t) => t.name === source.name);
      if (namedTap) {
        return { tap: namedTap, skills: skillsAtRef(namedTap, ref, ctx.home) };
      }
      return tapCandidate(source, config, ref, ctx.home);
    }
    if (source.type === "tap") {
      return tapCandidate(source, config, ref, ctx.home);
    }
    const matched = config.taps.find((t) => {
      if (source.type === "git")
        return t.kind === "git" && t.url === source.url && t.subpath === source.subpath;
      return t.kind === "path" && t.path === source.path;
    });
    if (matched) {
      return { tap: matched, skills: skillsAtRef(matched, ref, ctx.home) };
    }
    const attrib = attributeRef(source, config);
    return { tap: attrib.tap, skills: skillsAtRef(attrib.tap, ref, ctx.home) };
  })();

  return {
    exitCode: 0,
    human: renderSkills(skills, tap, ctx.style, ctx.width),
    json: { skills },
  };
}

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
