/**
 * Platform scheduler selector for autoupdate (§10.2).
 *
 * Commands use this module instead of depending directly on launchd or
 * systemd. Tests can override the platform without mutating `process`.
 */

import { CrewError } from "../core/errors.ts";
import { crewHome } from "../core/paths.ts";
import * as launchd from "./launchd.ts";
import { readAutoupdateLogTail } from "./log.ts";
import * as systemd from "./systemd.ts";
import type { EnableInput } from "./types.ts";

type Scheduler = {
  readonly enableAutoupdate: (input: EnableInput) => void;
  readonly disableAutoupdate: (home?: string) => void;
  readonly isAutoupdateLoaded: () => boolean;
};

let platformOverride: NodeJS.Platform | null = null;

export function setAutoupdatePlatform(next: NodeJS.Platform): NodeJS.Platform | null {
  const prev = platformOverride;
  platformOverride = next;
  return prev;
}

export function resetAutoupdatePlatform(): void {
  platformOverride = null;
}

export function enableAutoupdate(input: EnableInput): void {
  scheduler().enableAutoupdate(input);
}

export function disableAutoupdate(home: string = crewHome()): void {
  scheduler().disableAutoupdate(home);
}

export function isAutoupdateLoaded(): boolean {
  const selected = schedulerOrNull();
  return selected ? selected.isAutoupdateLoaded() : false;
}

export { readAutoupdateLogTail };

function scheduler(): Scheduler {
  const selected = schedulerOrNull();
  if (selected) return selected;
  const platform = platformOverride ?? process.platform;
  throw new CrewError(
    "autoupdate_failure",
    `autoupdate is not supported on ${platform}; Homecrew supports autoupdate on macOS and Linux`,
    { platform },
  );
}

function schedulerOrNull(): Scheduler | null {
  const platform = platformOverride ?? process.platform;
  if (platform === "darwin") return launchd;
  if (platform === "linux") return systemd;
  return null;
}
