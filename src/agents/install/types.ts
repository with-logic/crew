/** Inputs and outcomes for one physical target install (§7.3). */

import type { Scope, TapConfig } from "../../core/types.ts";
import type { AgentAdapter } from "../adapter.ts";

export interface InstallInput {
  readonly agents: readonly AgentAdapter[];
  readonly scope: Scope;
  readonly cwd: string;
  readonly storePath: string;
  readonly skillName: string;
  readonly tap: TapConfig;
  readonly tapRelativePath: string;
  readonly ref: string | null;
  readonly resolvedSha: string | null;
  readonly contentHash: string;
  readonly force: boolean;
}

export type InstallOutcome = { kind: "installed" } | { kind: "up_to_date" };
