/**
 * `crew info <ref-or-name>` — show details for a skill (or every skill
 * in a tap, when the ref names a tap).
 *
 * Resolves the reference through the same tap-attribution pipeline as
 * `crew install`, just doesn't run the install — uses `acquireTap`
 * (read-only, no fetch) to walk the tap and load its skills.
 */

import { join } from "node:path";
import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { findTapForBareName } from "../install/attribute-bare-name.ts";
import { attributeRef } from "../install/tap-attribution.ts";
import { NAME_PATTERN, parseRef } from "../refs/parse.ts";
import { acquireTap } from "../sources/acquire/index.ts";
import { expandSkills } from "../sources/expand.ts";
import { readState } from "../state/load.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function infoCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length !== 1) {
    throw new CrewError(
      "usage_error",
      "`crew info` needs exactly one skill name or reference — e.g. `crew info python-testing` or `crew info gh:acme/skills//python/testing`",
    );
  }
  const arg = ctx.positional[0]!;

  // Bare names try state first.
  const state = readState(ctx.home);
  const isBareName = NAME_PATTERN.test(arg);
  const entry = isBareName ? state.installations.find((e) => e.name === arg) : undefined;
  if (entry) {
    const human = [
      `name: ${entry.name}`,
      `scope: ${entry.scope}`,
      `tap: ${entry.source.tap}/${entry.source.path}`,
      `ref: ${entry.ref ?? "(default)"}`,
      `resolved_sha: ${entry.resolved_sha ?? "(path)"}`,
      `content_hash: ${entry.content_hash}`,
      `targets: ${entry.targets.join(", ")}`,
      `pinned: ${entry.pinned}`,
      `installed_at: ${entry.installed_at}`,
    ];
    return { exitCode: 0, human, json: { installed: entry } };
  }

  // Fall back to treating as a ref. We don't create auto-taps here
  // (that's an install-time side effect). Instead, find the matching
  // tap or fall back to bare-name search across configured taps.
  const config = readConfig(ctx.home);
  const source = parseRef(arg, ctx.cwd);
  const { tap, dir } = (() => {
    if (source.type === "tap" && source.tap === null) {
      // Bare name: matches a tap or a skill.
      const namedTap = config.taps.find((t) => t.name === source.name);
      if (namedTap) {
        const acq = acquireTap(namedTap, ctx.home);
        return { tap: namedTap, dir: acq.rootDir };
      }
      const owning = findTapForBareName(source.name, config, ctx.home);
      const acq = acquireTap(owning, ctx.home);
      return { tap: owning, dir: join(acq.rootDir, source.name) };
    }
    if (source.type === "tap") {
      const t = config.taps.find((c) => c.name === source.tap);
      if (!t)
        throw new CrewError("invalid_ref", `no tap named \`${source.tap}\` is configured`, {
          tap: source.tap,
        });
      const acq = acquireTap(t, ctx.home);
      return { tap: t, dir: join(acq.rootDir, source.name) };
    }
    // Git or path source — find or skip auto-create (we don't write config from `info`).
    const matched = config.taps.find((t) => {
      if (source.type === "git")
        return t.kind === "git" && t.url === source.url && t.subpath === source.subpath;
      return t.kind === "path" && t.path === source.path;
    });
    if (matched) {
      const acq = acquireTap(matched, ctx.home);
      return { tap: matched, dir: acq.rootDir };
    }
    // Not in config: do an ephemeral attribution (we'll throw away the new tap row).
    const attrib = attributeRef(source, config);
    const acq = acquireTap(attrib.tap, ctx.home);
    return { tap: attrib.tap, dir: acq.rootDir };
  })();
  void tap;

  const skills = expandSkills(dir);
  const info = skills.map((s) => ({
    name: s.frontmatter.name,
    description: s.frontmatter.description,
    license: s.frontmatter.license ?? null,
    compatibility: s.frontmatter.compatibility ?? null,
    homepage: s.frontmatter.metadata?.crew?.homepage ?? null,
    dependencies: s.frontmatter.metadata?.crew?.dependencies ?? [],
  }));
  const human = info.flatMap((i) => [
    `name: ${i.name}`,
    `description: ${i.description}`,
    `license: ${i.license ?? "-"}`,
    `compatibility: ${i.compatibility ?? "-"}`,
    `homepage: ${i.homepage ?? "-"}`,
    `dependencies: ${i.dependencies.join(", ") || "-"}`,
    "",
  ]);
  return { exitCode: 0, human, json: { skills: info } };
}
