/** Caller-owned aggregate evidence for excluded Git discovery symlinks (§9 step 5). */

const WARNING =
  "warning: Git skill discovery skipped symlink entries; link targets were not followed.";

/** One command shares this boolean across its actual discovery scans. */
export class GitDiscoveryWarnings {
  private skippedSymlink: boolean;

  constructor() {
    this.skippedSymlink = false;
  }

  recordSkippedSymlink(): void {
    this.skippedSymlink = true;
  }

  warnings(): string[] {
    return this.skippedSymlink ? [WARNING] : [];
  }
}
