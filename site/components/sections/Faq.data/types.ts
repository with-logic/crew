/**
 * Types for the homepage FAQ data.
 */

import type { ReactNode } from "react";

export interface QA {
  readonly id: string;
  readonly q: ReactNode;
  readonly a: ReactNode;
  readonly defaultOpen?: boolean;
}
