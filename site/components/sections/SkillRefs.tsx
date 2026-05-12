import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./SkillRefs.module.css";

const CARDS: readonly {
  readonly kind: string;
  readonly title: string;
  readonly desc: React.ReactNode;
  readonly examples: readonly string[];
}[] = [
  {
    kind: "Local path",
    title: "./my-skill",
    desc: (
      <>
        A directory on your machine. Detected by leading <code>./</code>, <code>../</code>,{" "}
        <code>/</code>, or <code>~</code>. Tilde expands, relatives resolve against <code>cwd</code>
        .
      </>
    ),
    examples: ["crew install ./founding-engineer", "crew install ~/code/team-skills/code-review"],
  },
  {
    kind: "Git source",
    title: "@owner/repo",
    desc: (
      <>
        Any reachable git URL. No tap setup required. <code>@owner/repo</code> is GitHub shorthand;
        full <code>https://</code> and <code>git@</code> URLs work for anywhere else. Append{" "}
        <code>@ref</code> to pin, <code>{"//subpath"}</code> to scope.
      </>
    ),
    examples: [
      "crew install @acme/skills",
      "crew install @acme/skills@v1.2.0",
      "crew install @acme/skills//engineers/founding",
    ],
  },
  {
    kind: "Tap source",
    title: "founding-engineer",
    desc: (
      <>
        A skill inside a configured tap. Bare names search every tap — including the default{" "}
        <code>core</code> tap, which ships with a curated set of battle-tested skills. Qualify with{" "}
        <code>tap/name</code> to be explicit. If a name is only in a trusted tap you haven't added,
        Homecrew shows the tap to add first.
      </>
    ),
    examples: [
      "crew install founding-engineer",
      "crew install core/founding-engineer",
      "crew install acme/code-review@v1.0",
    ],
  },
];

export function SkillRefs() {
  return (
    <Section id="refs" ruleTop>
      <Container>
        <SectionHead
          number="04"
          label="Skill references"
          title="Three ways to point at a skill."
          description={
            <>
              A reference is anything you can hand to <code>crew install</code> — and anything
              another skill can list as a dependency. The grammar is small on purpose.
            </>
          }
        />
        <div className={styles.grid}>
          {CARDS.map((c) => (
            <div key={c.kind} className={styles.card}>
              <h4 className={styles.kind}>{c.kind}</h4>
              <p className={styles.title}>{c.title}</p>
              <p className={styles.desc}>{c.desc}</p>
              <ul className={styles.examples}>
                {c.examples.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
