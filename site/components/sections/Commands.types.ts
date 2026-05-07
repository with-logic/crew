/**
 * Types for homepage command reference data (§16.6).
 */

import type { ReactNode } from "react";

export interface CommandReference {
  readonly name: string;
  readonly signature: ReactNode;
  readonly description: ReactNode;
}

export interface CommandGroup {
  readonly id: string;
  readonly label: string;
  readonly commands: readonly CommandReference[];
}
