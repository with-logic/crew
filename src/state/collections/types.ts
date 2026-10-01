/** Collection selector types for update and uninstall (§7.4, §10.1). */
import type { StateSubject } from "../subjects.ts";

export type CollectionKind = "tap" | "namespace";
export type SubjectKind = "skill" | CollectionKind;

export interface CollectionSubject extends StateSubject {
  readonly kind: SubjectKind;
}
