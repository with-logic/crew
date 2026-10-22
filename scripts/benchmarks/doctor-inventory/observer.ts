/** Diagnostic-copy observations for doctor inventories and §14 lock lifetimes; never production. */
export interface Observation {
  readonly kind: string;
  readonly ns: string;
  readonly build: number;
  readonly phase: string;
  readonly details: Readonly<Record<string, unknown>>;
}
let active = false;
let build = 0;
let held = false;
let stateTarget = "";
let events: Observation[] = [];
export function begin(target: string): void {
  stateTarget = target;
  events = [];
  build = 0;
  held = false;
  active = true;
}
export function observe(kind: string, details: Record<string, unknown> = {}): void {
  if (!active) return;
  if (kind === "lock.acquired" && details["target"] === stateTarget) held = true;
  if (kind === "inventory.begin") build += 1;
  events.push({
    kind,
    ns: process.hrtime.bigint().toString(),
    build,
    phase: held ? "locked" : "unlocked",
    details,
  });
  if (kind === "lock.release.end" && details["target"] === stateTarget) held = false;
}
export function end(): Observation[] {
  active = false;
  return events;
}
