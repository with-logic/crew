/**
 * Path validation helpers for known-tap registry builds (§16.2.1).
 */

export function assertRelativePosixPath(value: string, field: string, allowEmpty: boolean): void {
  if (value === "" && allowEmpty) return;
  if (value === "") throw new Error(`${field} must not be empty`);
  if (value.startsWith("/") || value.includes("\\")) {
    throw new Error(`${field} must be a relative POSIX path`);
  }
  const parts = value.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") {
      throw new Error(`${field} contains invalid path segment \`${part}\``);
    }
  }
}
