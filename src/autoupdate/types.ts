/**
 * Shared autoupdate scheduler types (§10.2).
 *
 * Both platform backends consume the same enable input so the dispatcher
 * and concrete schedulers cannot drift independently.
 */

export interface EnableInput {
  readonly crewBinaryPath: string;
  readonly intervalSeconds: number;
  readonly home?: string;
}
