/**
 * `crew info <ref-or-name>` — show details for a skill.
 *
 * Accepts either a plain installed name (looked up in state) or a full
 * ref which is parsed, acquired, and loaded fresh.
 */

import { readConfig } from "../config/load.ts";
import { CrewError } from "../core/errors.ts";
import { NAME_PATTERN, parseRef } from "../refs/parse.ts";
import { acquireSource } from "../sources/acquire.ts";
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
      `ref: ${entry.ref ?? "(default)"}`,
      `resolved_sha: ${entry.resolved_sha ?? "(path)"}`,
      `content_hash: ${entry.content_hash}`,
      `targets: ${entry.targets.join(", ")}`,
      `pinned: ${entry.pinned}`,
      `installed_at: ${entry.installed_at}`,
    ];
    return { exitCode: 0, human, json: { installed: entry } };
  }

  // Fall back to treating as a ref.
  const config = readConfig(ctx.home);
  const source = parseRef(arg, ctx.cwd);
  const acquired = acquireSource(source, config, ctx.home);
  const skills = expandSkills(acquired.rootDir);
  const info = skills.map((s) => ({
    name: s.frontmatter.name,
    description: s.frontmatter.description,
    license: s.frontmatter.license ?? null,
    compatibility: s.frontmatter.compatibility ?? null,
    homepage: s.frontmatter.metadata?.crew?.homepage ?? null,
    dependencies: s.frontmatter.metadata?.crew?.dependencies ?? [],
    resolved_sha: acquired.resolvedSha,
    pinned: acquired.pinned,
  }));
  const human = info.flatMap((i) => [
    `name: ${i.name}`,
    `description: ${i.description}`,
    `license: ${i.license ?? "-"}`,
    `compatibility: ${i.compatibility ?? "-"}`,
    `homepage: ${i.homepage ?? "-"}`,
    `dependencies: ${i.dependencies.join(", ") || "-"}`,
    `resolved_sha: ${i.resolved_sha ?? "(path)"}`,
    `pinned: ${i.pinned}`,
    "",
  ]);
  return { exitCode: 0, human, json: { skills: info } };
}
