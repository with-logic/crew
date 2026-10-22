/** Read an inspected physical marker inventory before any adapter ownership filtering (§11.2). */
import { lstatSync } from "node:fs";
import { join } from "node:path";
import type { Marker } from "../../../core/types.ts";
import { readJson } from "../../../util/json.ts";
import { inspectInventoryDirectory, inventoryNames } from "./filesystem.ts";
import {
  type InventoryProblem,
  invalidMarkerProblem,
  linkedInventoryProblem,
  unreadableInventoryProblem,
} from "./findings.ts";
import { isDoctorMarker } from "./validate.ts";

export interface PhysicalMarkerInventory {
  readonly base: string;
  readonly markers: readonly { readonly name: string; readonly marker: Marker }[];
  readonly problems: readonly InventoryProblem[];
}

/** Missing markers are absent; invalid or unreadable entries remain facts for every observer. */
export function readPhysicalMarkerInventory(base: string): PhysicalMarkerInventory {
  const markers: { name: string; marker: Marker }[] = [];
  const problems: InventoryProblem[] = [];
  for (const name of inventoryNames(base, problems)) {
    const installDir = join(base, name);
    if (!inspectInventoryDirectory(installDir, problems, false)) continue;
    const path = join(installDir, ".crew.json");
    let marker: unknown = null;
    try {
      if (lstatSync(path).isSymbolicLink()) {
        problems.push(linkedInventoryProblem(path));
        continue;
      }
      marker = readJson<unknown>(path);
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        problems.push(unreadableInventoryProblem(path, err));
        continue;
      }
      // Malformed JSON leaves null so the existing field guard reports marker_invalid.
    }
    if (!isDoctorMarker(marker)) {
      problems.push(
        invalidMarkerProblem(
          path,
          "invalid marker; correct its JSON, field types, field values and tap metadata before repair",
        ),
      );
      continue;
    }
    markers.push({ name, marker });
  }
  return { base, markers, problems };
}
