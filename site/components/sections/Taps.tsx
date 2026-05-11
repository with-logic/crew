import { Acc, Cmt, CodeBlock, Key, Ok, Prompt } from "../primitives/CodeBlock";
import { Container } from "../primitives/Container";
import { Eyebrow } from "../primitives/Eyebrow";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./Taps.module.css";

export function Taps() {
  return (
    <Section id="taps" ruleTop>
      <Container>
        <SectionHead
          number="07"
          label="Taps"
          title="A tap is just a git repo full of skills."
          description={
            <>
              No hosted registry, no server, no account. Your personal skills repo, team repo, or
              public collection <em>is</em> the package index. Fork it, branch it, review it in pull
              requests, and <code>crew update</code> pulls it like any other.
            </>
          }
        />

        <div className={styles.grid}>
          <div>
            <Eyebrow>Repository shape</Eyebrow>
            <CodeBlock variant="light">
              {"acme-skills/\n├── README.md              "}
              <Cmt># optional, informational</Cmt>
              {"\n├── "}
              <Acc>founding-engineer/</Acc>
              {"\n│   └── SKILL.md\n├── "}
              <Acc>code-review/</Acc>
              {"\n│   └── SKILL.md\n├── "}
              <Acc>platform-engineer/</Acc>
              {"\n│   ├── SKILL.md\n│   └── playbook.md\n└── docs/\n    └── contributing.md    "}
              <Cmt># ignored by crew search</Cmt>
            </CodeBlock>
            <p className={styles.note}>
              Any top-level directory with a valid <code>SKILL.md</code> is a skill; the install
              name comes from the <code>name</code> field inside <code>SKILL.md</code>. Everything
              else is ignored. Prefer to keep skills under a <code>skills/</code> directory? That
              works too — if <code>skills/</code> exists, crew indexes its children instead of the
              root.
            </p>
            <p className={styles.note}>
              Group related skills into <strong>namespaces</strong>: <code>skills/marketing/*</code>
              , <code>skills/engineering/*</code>. Then <code>crew install marketing</code> installs
              the whole bundle, and <code>crew install acme/marketing/email-outreach</code> picks
              one.
            </p>
          </div>

          <div>
            <Eyebrow>Day one for a new teammate</Eyebrow>
            <CodeBlock>
              <Prompt /> crew tap add <Acc>@acme/skills</Acc>
              {"\n"}
              <Ok>✓</Ok> cloned <Key>acme</Key> → ~/.crew/taps/acme (42 skills)
              {"\n\n"}
              <Prompt /> crew install <Acc>acme/team-baseline</Acc>
              {"\n"}
              <Cmt># meta-skill pulling in everything the team considers standard</Cmt>
              {"\n"}
              <Cmt># (e.g. founding-engineer, code-review, pr-descriptions, on-call…)</Cmt>
              {"\n"}
              <Ok>✓</Ok> resolved 14 dependencies
              {"\n"}
              <Ok>✓</Ok> installed across every detected agent
              {"\n\n"}
              <Prompt /> crew autoupdate enable
              {"\n"}
              <Ok>✓</Ok> agent loaded · keeps skills current every 4h
            </CodeBlock>
            <p className={styles.note}>
              A meta-skill is an ordinary skill whose body describes the team's conventions and
              whose <code>dependencies</code> list pulls in the rest. The same pattern works for a
              solo baseline: one command to recreate your preferred agent setup on a new Mac.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
