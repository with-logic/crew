/** Contain recorded git skill locations before source reads (§7.5, §9). */
import { CrewError } from "../../core/errors.ts";
import { sourceReadFailure } from "../../util/source-read.ts";
import { assertNoSymlinkEscape } from "../../util/symlink-containment.ts";

/** Invalid selected locations are hard skill failures; filesystem errors remain operational. */
export function assertRecordedGitLocation(root: string, selected: string): void {
  try {
    assertNoSymlinkEscape(root, selected, "recorded skill path");
  } catch (err) {
    if (err instanceof CrewError) throw new CrewError("invalid_skill", err.message, err.details);
    throw sourceReadFailure(selected, err);
  }
}
