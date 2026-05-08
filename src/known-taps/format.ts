/**
 * Known-tap display formatting helpers (§16.2.1).
 */

export interface KnownTapSourceParts {
  readonly url: string;
  readonly subpath: string;
}

export function knownTapSource(tap: KnownTapSourceParts): string {
  if (tap.subpath === "") {
    return tap.url;
  }
  return `${tap.url}//${tap.subpath}`;
}
