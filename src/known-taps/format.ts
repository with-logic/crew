/**
 * Known-tap display formatting helpers (§16.2.1).
 */

export interface KnownTapSourceParts {
  readonly url: string;
  readonly subpath: string;
}

export function knownTapSource(tap: KnownTapSourceParts): string {
  const url = displayUrl(tap.url);
  // `crew tap add <repo>` discovers a top-level `skills/` directory, so
  // known-tap prompts can use the shorter command for that common layout.
  if (tap.subpath === "" || tap.subpath === "skills") {
    return url;
  }
  return `${url}//${tap.subpath}`;
}

function displayUrl(url: string): string {
  if (!url.startsWith("https://github.com/")) {
    return url;
  }
  return url.endsWith(".git") ? url.slice(0, -4) : url;
}
