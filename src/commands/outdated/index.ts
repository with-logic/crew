/**
 * `crew outdated [<selector>...]` (§10.1.1).
 *
 * The discoverable name for "what would `crew update` change" — the
 * same idea as `brew outdated`. It IS `crew update --dry-run`: same
 * selectors, same flags (`--force` previews pinned skills), same exit
 * code, same `--json` payload. Only the human rendering differs: it
 * shows just the rows that answer the question (pending updates,
 * pending additions, upstream removals, failures) and says "up to
 * date" when nothing would change.
 *
 * Being a preview, it calls `planUpdate` directly and never takes the
 * STATE lock — acquiring it would create `state.json` on a fresh home,
 * and §14 reserves that lock for commands that write. It does hold the
 * per-tap CLONE locks, because `planUpdate` takes them for every run:
 * a preview still fetches, so it still mutates the shared clone and
 * must not race a real update between SHA resolution and byte read.
 */

import { readConfig } from "../../config/load.ts";
import { crewHome } from "../../core/paths.ts";
import type { CommandContext, CommandOutput } from "../types.ts";
import { planUpdate } from "../update/plan.ts";
import { renderOutdated } from "./render.ts";

export function outdatedCommand(ctx: CommandContext): CommandOutput {
  const config = readConfig(ctx.home);
  const home = ctx.home ?? crewHome();
  const plan = planUpdate(ctx, config, home, true);

  const { rows, tapReexpandRows, tapRows } = plan;
  return {
    exitCode: plan.hardFailure ? 1 : 0,
    human: renderOutdated({ rows, tapReexpandRows, tapRows }, ctx.style),
    json: { rows, tap_reexpand_rows: tapReexpandRows, tap_rows: tapRows, dry_run: true },
  };
}
