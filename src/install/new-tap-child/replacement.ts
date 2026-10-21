/** Reversible replacements for one newly discovered tap child (§10.1.1). */

import { lstatSync, mkdtempSync, readFileSync, renameSync, type Stats } from "node:fs";
import { dirname, join } from "node:path";
import { atomicReplace, rmrf } from "../../util/fs.ts";
import { redactText, sanitizeLine } from "../../util/redact.ts";

/** A receipt for one physical target; shared adapters have one receipt. */
export class ChildReplacement {
  installed = false;
  private temporary: string | null = null;
  private backup: string | null = null;
  private retainBackup = false;
  private published: {
    readonly dev: number;
    readonly ino: number;
    readonly marker: Buffer;
  } | null = null;

  private readonly dest: string;

  constructor(dest: string) {
    this.dest = dest;
  }

  /** Move the live destination aside after safety/no-op checks, immediately before replacement. */
  moveAsideForReplacement(staging: string): void {
    const identity = lstatSync(staging);
    this.published = {
      dev: identity.dev,
      ino: identity.ino,
      marker: readFileSync(join(staging, ".crew.json")),
    };
    try {
      lstatSync(this.dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    this.temporary = mkdtempSync(join(dirname(this.dest), ".crew-rollback-"));
    const backup = join(this.temporary, "prior");
    renameSync(this.dest, backup);
    this.backup = backup;
  }

  /** Restore a prior copy, or remove a new copy only after a proven installation. */
  rollback(): string | null {
    if (this.backup === null && !this.installed) return null;
    try {
      // §10.1.1: a completed publication later removed must stay absent.
      if (!this.ownsCurrentTarget())
        return this.failure("current target changed or is unavailable; left untouched");
      if (this.backup === null) rmrf(this.dest);
      else atomicReplace(this.backup, this.dest);
      return null;
    } catch (err) {
      return this.failure((err as Error).message);
    }
  }

  private ownsCurrentTarget(): boolean {
    let current: Stats;
    try {
      current = lstatSync(this.dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return !this.installed;
    }
    const marker = join(this.dest, ".crew.json");
    return (
      this.published !== null &&
      current.dev === this.published.dev &&
      current.ino === this.published.ino &&
      lstatSync(marker).isFile() &&
      readFileSync(marker).equals(this.published.marker)
    );
  }

  private failure(reason: string): string {
    this.retainBackup = true;
    const recovery = this.backup === null ? "" : `; prior copy retained at \`${this.backup}\``;
    return sanitizeLine(redactText(`rollback \`${this.dest}\`: ${reason}${recovery}`));
  }

  /** Backup housekeeping must not mask a failure or invalidate a successful install. */
  cleanup(): string | null {
    if (this.temporary === null || this.retainBackup) return null;
    try {
      rmrf(this.temporary);
      return null;
    } catch {
      return sanitizeLine(redactText(`could not remove rollback directory \`${this.temporary}\``));
    }
  }
}
