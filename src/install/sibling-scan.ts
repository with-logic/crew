/**
 * What dependency resolution learns about a parent's siblings (§9 step
 * 6), read once per resolution: a directory's entries, which of them are
 * skills, which lead out of the repository, and each one's declared name.
 * Every bare-name dependency of
 * every parent in the same directory asks the same questions of the same
 * tree — a live clone held by its tap lock, or a commit's export kept for
 * the whole resolution — so each is answered from disk once.
 *
 * Only answers are kept: a question that throws (a folder crew can't
 * list, say) is asked again, and fails again, the next time.
 */

/** The questions a sibling walk asks, and the type of each answer. */
interface SiblingFacts {
  /** A directory's entry names. */
  readonly entries: readonly string[];
  /** Whether an entry is a skill: a folder with a `SKILL.md`, or a gist skill file. */
  readonly skill: boolean;
  /** Whether an entry's folder leads out of its repository (C-SPEC-17). */
  readonly leadsOut: boolean;
  /** An entry's declared name; null when it can't be read. */
  readonly name: string | null;
}

export interface SiblingScan {
  /** `ask()` the first time `fact` is wanted of `path` this resolution; that answer after. */
  once<F extends keyof SiblingFacts>(
    fact: F,
    path: string,
    ask: () => SiblingFacts[F],
  ): SiblingFacts[F];
}

export function makeSiblingScan(): SiblingScan {
  const answers = new Map<string, SiblingFacts[keyof SiblingFacts]>();
  return {
    once(fact, path, ask) {
      const key = `${fact}\0${path}`;
      if (answers.has(key)) return answers.get(key) as SiblingFacts[typeof fact];
      const answer = ask();
      answers.set(key, answer);
      return answer;
    },
  };
}
