/**
 * What dependency resolution learns about a parent's siblings (§9 step
 * 6), read once per resolution. Every bare-name dependency of every
 * parent in the same directory asks of the same tree — a live clone held
 * by its tap lock, or a commit's export kept for the whole resolution —
 * so each directory is indexed once: its entries, the entry each name
 * stands for, and the name each skill among them declares. Each sibling
 * a dependency finds is loaded, and staged, once too.
 *
 * Only answers are kept: a question that throws (a folder crew can't
 * list, a sibling crew can't load) is asked again, and fails again, the
 * next time. What each answer is read from on disk: `./disk.ts`.
 */

import type { LoadedSkill } from "../../core/types.ts";
import type { SourceBoundary } from "../../sources/source-boundary.ts";
import type { StoredSkill } from "../../sources/store.ts";

/** How to read one sibling directory: the lookup supplies it, knowing the source. */
export interface SiblingReader {
  /** The directory's entry names, in walk order; throws when crew can't list it. */
  readonly list: () => readonly string[];
  /** The name a dependency would be called to be found by `entry`'s own name. */
  readonly stem: (entry: string) => string;
  /** The repository the directory's folders must stay inside (C-SPEC-17). */
  readonly boundary: () => SourceBoundary;
  /** The name `entry` declares when it is a skill inside `boundary`; null otherwise. */
  readonly declares: (entry: string, boundary: SourceBoundary) => string | null;
}

/** One sibling directory, indexed once per resolution. */
export interface SiblingDir {
  readonly boundary: SourceBoundary;
  /** The entries a dependency `name` may be — named for it, or declaring it — in walk order. */
  candidatesFor(name: string): readonly string[];
}

export interface SiblingScan {
  /** `dir` indexed through `reader` the first time it's wanted this resolution; that index after. */
  dir(dir: string, reader: SiblingReader): SiblingDir;
  /** The skill `load()` gives the first time `path` loads this resolution; that skill after. */
  loaded(path: string, load: () => LoadedSkill): LoadedSkill;
  /** The store entry `stage()` gives the first time `key` stages this resolution; that entry after. */
  staged(key: string, stage: () => StoredSkill): StoredSkill;
}

export function makeSiblingScan(): SiblingScan {
  const dirs = new Map<string, SiblingDir>();
  const loaded = new Map<string, LoadedSkill>();
  const staged = new Map<string, StoredSkill>();
  return {
    dir: (dir, reader) => remember(dirs, dir, () => indexDir(reader)),
    loaded: (path, load) => remember(loaded, path, load),
    staged: (key, stage) => remember(staged, key, stage),
  };
}

/** `answers[key]`, asking `ask()` for it the first time; a throw is not kept. */
function remember<T>(answers: Map<string, T>, key: string, ask: () => T): T {
  const known = answers.get(key);
  if (known !== undefined) return known;
  const answer = ask();
  answers.set(key, answer);
  return answer;
}

function indexDir(reader: SiblingReader): SiblingDir {
  const entries = reader.list();
  const boundary = reader.boundary();
  const order = new Map<string, number>();
  const byStem = new Map<string, string[]>();
  for (const [i, entry] of entries.entries()) {
    order.set(entry, i);
    add(byStem, reader.stem(entry), entry);
  }
  const byDeclared = declaredNames(entries, reader, boundary);
  return {
    boundary,
    candidatesFor(name) {
      const found = new Set([...(byStem.get(name) ?? []), ...(byDeclared.get(name) ?? [])]);
      return [...found].sort((a, b) => order.get(a)! - order.get(b)!);
    },
  };
}

/** Each skill entry's declared name → the entries declaring it. */
function declaredNames(
  entries: readonly string[],
  reader: SiblingReader,
  boundary: SourceBoundary,
): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const entry of entries) {
    const declared = reader.declares(entry, boundary);
    if (declared !== null) add(byName, declared, entry);
  }
  return byName;
}

function add(groups: Map<string, string[]>, key: string, entry: string): void {
  const group = groups.get(key);
  if (group) group.push(entry);
  else groups.set(key, [entry]);
}
