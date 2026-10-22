/** Timed doctor invocation and unchanged protected-byte controls for PRD §11.2/§14. */
import { lstatSync } from "node:fs";
import { join, relative } from "node:path";
import { inventory } from "./inventory.ts";
import { begin, end } from "./observer.ts";
import type { Fixture, Measurement } from "./types.ts";

export function measureFixture(fixture: Fixture): Measurement {
  const { input, env, invoke, stateTarget, home } = fixture;
  const before = inventory(fixture);
  env.schedulerCalls.length = 0;
  env.transportCalls.length = 0;
  const flags =
    input.mode === "plain"
      ? []
      : input.mode === "dry"
        ? ["--repair", "--dry-run"]
        : input.mode === "verify-repair"
          ? ["--verify", "--repair"]
          : ["--repair"];
  if (input.counters) begin(stateTarget);
  const start = process.hrtime.bigint();
  const out = invoke(["doctor", "--json", ...flags]);
  const commandNs = process.hrtime.bigint() - start;
  const events = input.counters ? end() : [];
  const after = inventory(fixture);
  const unchanged = JSON.stringify(before.protected) === JSON.stringify(after.protected);
  const coordinationUnchanged =
    JSON.stringify(before.coordination) === JSON.stringify(after.coordination);
  const stateExists = lstatSync(stateTarget, { throwIfNoEntry: false }) !== undefined;
  const lockExists =
    lstatSync(join(home, "state.json.lock"), { throwIfNoEntry: false }) !== undefined;
  if (env.transportViolations.length) throw new Error("doctor attempted forbidden git transport");
  if ((input.mode === "plain" || input.mode === "dry") && !unchanged)
    throw new Error("read-only/dry-run protected byte inventory changed outside CREW_HOME/locks");
  if (input.fresh && stateExists) throw new Error("fresh read-only/dry-run created state");
  if (lockExists) throw new Error("doctor left a state lock behind");
  return {
    ...out,
    mode: input.mode,
    roots: input.roots,
    command_ms: Number(commandNs) / 1e6,
    counters: input.counters,
    events,
    unchanged,
    stateExists,
    lockExists,
    before: before.protected,
    after: after.protected,
    bytePreservationExcludedPaths: [relative(fixture.path, fixture.coordinationRoot)],
    coordinationBefore: before.coordination,
    coordinationAfter: after.coordination,
    coordinationUnchanged,
    schedulerCalls: env.schedulerCalls,
    transportCalls: env.transportCalls,
  };
}
