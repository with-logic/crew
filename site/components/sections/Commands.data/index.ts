/**
 * Static homepage command reference data (§16.6), one file per group.
 */
import type { CommandGroup } from "../Commands.types";
import { AGENTS } from "./agents";
import { DISCOVERY } from "./discovery";
import { HOUSEKEEPING } from "./housekeeping";
import { MANAGING } from "./managing";
import { META } from "./meta";

export const GROUPS: readonly CommandGroup[] = [MANAGING, DISCOVERY, AGENTS, HOUSEKEEPING, META];
