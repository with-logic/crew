/** Reversible replacements for one newly discovered tap child (§10.1.1). */

import { cpSync, lstatSync, mkdtempSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { rmrf } from "../../util/fs.ts";

/** A receipt for one physical target; shared adapters have one receipt. */
export class ChildReplacement {
  installed = false;
  private temporary: string | null = null;
  private backup: string | null = null;
  private retainBackup = false;

  private readonly dest: string;

  constructor(dest: string) {
    this.dest = dest;
  }

  /** Runs only after installer safety/no-op checks, immediately before replacement. */
  snapshot(): void {
    try {
      lstatSync(this.dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    this.temporary = mkdtempSync(join(dirname(this.dest), ".crew-rollback-"));
    const backup = join(this.temporary, "prior");
    cpSync(this.dest, backup, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
      preserveTimestamps: true,
    });
    this.backup = backup;
  }

  /** Restore a prior copy, or remove a new copy only after a proven installation. */
  rollback(): string | null {
    if (this.backup === null && !this.installed) return null;
    try {
      rmrf(this.dest);
      if (this.backup !== null) renameSync(this.backup, this.dest);
      return null;
    } catch (err) {
      this.retainBackup = true;
      const recovery = this.backup === null ? "" : `; prior copy retained at \`${this.backup}\``;
      return `rollback \`${this.dest}\`: ${(err as Error).message}${recovery}`;
    }
  }

  /** Backup housekeeping must not mask a failure or invalidate a successful install. */
  cleanup(): void {
    if (this.temporary === null || this.retainBackup) return;
    try {
      rmrf(this.temporary);
    } catch {
      // The install/state outcome is already settled; leave only this owned backup.
    }
  }
}
