/** Typed developer fixture inputs and public CLI results for PRD §11.2/§14 measurements. */
import type { runCli } from "../../../src/cli/main.ts";
import type { fixtureEnvironment } from "./environment.ts";
import type { Observation } from "./observer.ts";

export interface Input {
  readonly fixture: string;
  readonly runRoot: string;
  readonly source: string;
  readonly roots: number;
  readonly counters: boolean;
  readonly mode: "plain" | "dry" | "repair" | "verify-repair";
  readonly fresh: boolean;
  readonly action: "setup" | "measure";
}

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type Invoke = (args: string[], working?: string) => CliResult;
export type PublicCli = typeof runCli;
export type Environment = Awaited<ReturnType<typeof fixtureEnvironment>>;
export type ByteInventory = Record<string, string>;

export interface Fixture {
  readonly input: Input;
  readonly path: string;
  readonly home: string;
  readonly stateTarget: string;
  readonly coordinationRoot: string;
  readonly projectRoots: string[];
  readonly cwd: string;
  readonly env: Environment;
  readonly invoke: Invoke;
}

export interface Measurement extends CliResult {
  readonly mode: Input["mode"];
  readonly roots: number;
  readonly command_ms: number;
  readonly counters: boolean;
  readonly events: Observation[];
  readonly unchanged: boolean;
  readonly stateExists: boolean;
  readonly lockExists: boolean;
  readonly before: ByteInventory;
  readonly after: ByteInventory;
  readonly bytePreservationExcludedPaths: string[];
  readonly coordinationBefore: ByteInventory;
  readonly coordinationAfter: ByteInventory;
  readonly coordinationUnchanged: boolean;
  readonly schedulerCalls: string[][];
  readonly transportCalls: string[][];
}
