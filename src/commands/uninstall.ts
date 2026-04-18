/**
 * `crew uninstall <name> [<name>...]` (§7.4).
 *
 * Removes each skill from every target listed in state, then updates
 * state.json. Fails with `not_installed_here` if no state entry exists,
 * unless `--force`.
 */

import { CrewError } from "../core/errors.ts";
import { readState, removeByName, writeState } from "../state/load.ts";
import { withStateLock } from "../state/lock.ts";
import { uninstallSkillFromTarget } from "../targets/install.ts";
import { adapterByName } from "../targets/registry.ts";
import type { CommandContext, CommandOutput } from "./types.ts";

export function uninstallCommand(ctx: CommandContext): CommandOutput {
  if (ctx.positional.length === 0) {
    throw new CrewError("usage_error", "usage: crew uninstall <name> [<name>...]");
  }

  interface Record {
    name: string;
    removedFrom: string[];
    absentFrom: string[];
    failures: { target: string; error: { code: string; message: string } }[];
  }
  const records: Record[] = [];
  let exitCode = 0;

  const newState = withStateLock(() => {
    let state = readState(ctx.home);
    for (const name of ctx.positional) {
      const entries = state.installations.filter((e) => e.name === name);
      const rec: Record = { name, removedFrom: [], absentFrom: [], failures: [] };
      if (entries.length === 0) {
        if (!ctx.flags.force) {
          throw new CrewError("not_installed_here", `\`${name}\` is not installed`);
        }
        records.push(rec);
        continue;
      }
      for (const entry of entries) {
        for (const targetName of entry.targets) {
          const adapter = adapterByName(targetName);
          if (!adapter) {
            continue;
          }
          try {
            const outcome = uninstallSkillFromTarget({
              adapter,
              scope: entry.scope,
              cwd: ctx.cwd,
              skillName: name,
              force: ctx.flags.force,
            });
            if (outcome === "removed") {
              rec.removedFrom.push(targetName);
            } else {
              rec.absentFrom.push(targetName);
            }
          } catch (err) {
            const ce = err as CrewError;
            rec.failures.push({
              target: targetName,
              error: { code: ce.code ?? "usage_error", message: ce.message },
            });
          }
        }
      }
      if (rec.failures.length > 0) {
        exitCode = 1;
      }
      state = removeByName(state, name);
      records.push(rec);
    }
    writeState(state, ctx.home);
    return state;
  }, ctx.home);

  void newState;

  const human: string[] = [];
  for (const r of records) {
    if (r.failures.length > 0) {
      human.push(
        `${r.name}: FAILED (${r.failures.map((f) => `${f.target}:${f.error.code}`).join(", ")})`,
      );
    } else {
      human.push(`${r.name}: removed from ${r.removedFrom.join(", ") || "(nothing)"}`);
    }
  }
  return { exitCode, human, json: { records } };
}
