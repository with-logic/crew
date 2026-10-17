/**
 * What dependency resolution learns about a parent's siblings (§9 step
 * 6), read once per resolution. Every bare-name dependency of every
 * parent in the same directory is looked up in the same tree — a live
 * clone held by its tap lock, or a commit's export kept for the whole
 * resolution — so each directory is indexed once: its entries, what each
 * of them is (a skill, a folder leading out of the repository, the name
 * it declares), and the entries each dependency name may be. Each sibling
 * a dependency finds is loaded, and staged, once too.
 *
 * Only answers are kept: a question that throws (a folder crew can't
 * list, a sibling crew can't load) is asked again, and fails again, the
 * next time. What each answer is read from on disk: `./disk.ts`.
 */

import type { LoadedSkill } from "../../core/types.ts";
import type { SourceBoundary } from "../../sources/source-boundary.ts";
import type { StoredSkill } from "../../sources/store.ts";

/** What one entry of a sibling directory is, read when the directory is indexed. */
export interface SiblingEntry {
  /** A skill folder — or, in a gist, a skill file (§9 step 5). */
  readonly skill: boolean;
  /** A skill folder that leads out of the repository through a link (C-SPEC-17). */
  readonly leadsOut: boolean;
  /** The name it declares: a skill inside the repository whose name crew can read; else null. */
  readonly declared: string | null;
}

/** How to read one sibling directory: the lookup supplies it, knowing the source. */
export interface SiblingReader {
  /** The directory's entry names, in walk order; throws when crew can't list it. */
  readonly list: () => readonly string[];
  /** The dependency name `entry` stands for: itself, or a gist file's name without `.md`. */
  readonly stem: (entry: string) => string;
  /** The repository the directory's folders must stay inside (C-SPEC-17). */
  readonly readBoundary: () => SourceBoundary;
  /** What `entry` is, judged against `boundary`. */
  readonly readEntry: (entry: string, boundary: SourceBoundary) => SiblingEntry;
}

/** One sibling directory, indexed once per resolution. */
export interface SiblingDir {
  /** The repository its folders must stay inside; null for a path source or a gist. */
  readonly boundary: SourceBoundary;
  /** The entries a dependency `name` may be — named for it, or declaring it — in walk order. */
  candidatesFor(name: string): readonly string[];
  /** What `entry`, one of the directory's entries, is. */
  entry(entry: string): SiblingEntry;
}

export interface SiblingScan {
  /** `path` indexed through `reader` the first time it's wanted this resolution; that index after. */
  indexDir(path: string, reader: SiblingReader): SiblingDir;
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
    indexDir: (path, reader) => remember(dirs, path, () => indexDir(reader)),
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
  const boundary = reader.readBoundary();
  const order = new Map<string, number>();
  const facts = new Map<string, SiblingEntry>();
  const byStem = new Map<string, string[]>();
  const byDeclared = new Map<string, string[]>();
  for (const [i, entry] of entries.entries()) {
    order.set(entry, i);
    add(byStem, reader.stem(entry), entry);
    const fact = reader.readEntry(entry, boundary);
    facts.set(entry, fact);
    if (fact.declared !== null) add(byDeclared, fact.declared, entry);
  }
  return {
    boundary,
    candidatesFor(name) {
      const found = new Set([...(byStem.get(name) ?? []), ...(byDeclared.get(name) ?? [])]);
      return [...found].sort((a, b) => order.get(a)! - order.get(b)!);
    },
    // Every candidate is one of the directory's entries.
    entry: (entry) => facts.get(entry)!,
  };
}

function add(groups: Map<string, string[]>, key: string, entry: string): void {
  const group = groups.get(key);
  if (group) group.push(entry);
  else groups.set(key, [entry]);
}
