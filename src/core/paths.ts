/**
 * Crew's canonical filesystem layout.
 *
 * §6 lays out the directory tree crew owns under `~/.crew/`. Every path in
 * that tree is produced here so we never hardcode a layout decision in two
 * places. The paths are computed relative to a configurable `home` so tests
 * can redirect crew's state dir via the `CREW_HOME` environment variable.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the effective crew home directory (`~/.crew` by default). */
export function crewHome(): string {
  const override = process.env["CREW_HOME"];
  if (override && override.length > 0) {
    return override;
  }
  return join(homedir(), ".crew");
}

/**
 * Resolve the user's LaunchAgents directory. Normally
 * `~/Library/LaunchAgents`, but tests and sandboxed environments can
 * redirect via `CREW_LAUNCH_AGENTS_DIR`.
 */
export function launchAgentsDir(): string {
  const override = process.env["CREW_LAUNCH_AGENTS_DIR"];
  if (override && override.length > 0) {
    return override;
  }
  return join(homedir(), "Library", "LaunchAgents");
}

/** Every well-known path crew produces. */
export interface CrewPaths {
  readonly home: string;
  readonly configFile: string;
  readonly stateFile: string;
  readonly stateLock: string;
  readonly tapsDir: string;
  readonly cacheDir: string;
  readonly gitCacheDir: string;
  readonly storeDir: string;
  readonly logsDir: string;
  readonly autoupdateLog: string;
  readonly launchAgentsDir: string;
  readonly autoupdatePlist: string;
}

/** Compute every well-known path from the crew home. */
export function paths(home: string = crewHome()): CrewPaths {
  return {
    home,
    configFile: join(home, "config.yaml"),
    stateFile: join(home, "state.json"),
    stateLock: join(home, "state.json.lock"),
    tapsDir: join(home, "taps"),
    cacheDir: join(home, "cache"),
    gitCacheDir: join(home, "cache", "git"),
    storeDir: join(home, "store"),
    logsDir: join(home, "logs"),
    autoupdateLog: join(home, "logs", "autoupdate.log"),
    launchAgentsDir: launchAgentsDir(),
    autoupdatePlist: join(launchAgentsDir(), "sh.crew.autoupdate.plist"),
  };
}

/** Path to a tap's local clone. */
export function tapPath(name: string, home: string = crewHome()): string {
  return join(paths(home).tapsDir, name);
}

/** Path to a store entry for a (name, short-sha) pair. */
export function storeEntryPath(name: string, shortSha: string, home: string = crewHome()): string {
  return join(paths(home).storeDir, `${name}@${shortSha}`);
}
