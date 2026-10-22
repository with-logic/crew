/** Read only bounded regular advisory-owner metadata without following links (§14). */
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

// Three numeric fields (PID, inode, birthtime) fit well below this metadata bound.
const RECORD_BYTES = 256;

/**
 * Missing or linked records, non-file devices, and oversized records return undefined.
 * Directory reads and other I/O errors propagate.
 */
export function readOwnerRecord(path: string): string | undefined {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ELOOP") return undefined;
    throw err;
  }
  try {
    const stat = fstatSync(fd);
    // Directories retain the ordinary bounded-read EISDIR failure.
    if (!(stat.isFile() || stat.isDirectory())) return undefined;
    const bytes = Buffer.alloc(RECORD_BYTES + 1);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    return count > RECORD_BYTES ? undefined : bytes.toString("utf8", 0, count);
  } finally {
    closeSync(fd);
  }
}
