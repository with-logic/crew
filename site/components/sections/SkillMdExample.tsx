import { Cmt, CodeBlock, Key } from "../primitives/CodeBlock";
import { Container } from "../primitives/Container";
import { Eyebrow } from "../primitives/Eyebrow";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./SkillMdExample.module.css";

export function SkillMdExample() {
  return (
    <Section id="skill-md" ruleTop>
      <Container>
        <SectionHead
          number="10"
          label="Anatomy of a skill"
          title={
            <>
              No proprietary manifest. Just <code>SKILL.md</code>.
            </>
          }
          description={
            <>
              Crew reads the{" "}
              <a href="https://agentskills.io/specification">Agent Skills specification</a>{" "}
              directly. Crew-specific metadata lives under <code>metadata.crew</code> so the skill
              stays fully spec-compliant — readable by any agent, not just the ones crew installs
              into.
            </>
          }
        />

        <CodeBlock variant="light">
          {"---\n"}
          <Key>name</Key>: founding-engineer
          {"\n"}
          <Key>description</Key>: Ship like a founding engineer. Use when scoping, writing, or
          reviewing code at an early-stage company.
          {"\n"}
          <Key>license</Key>: MIT
          {"\n"}
          <Key>metadata</Key>:{"\n  "}
          <Key>crew</Key>:{"\n    "}
          <Key>homepage</Key>: https://github.com/jane/founding-engineer
          {"\n    "}
          <Key>dependencies</Key>:{"\n      - code-review\n      - @acme/skills//code-review@v1.0"}
          {"\n---\n\n"}
          <Cmt># Founding engineer mode</Cmt>
          {"\n\nBias to action. The second-best solution shipped this week beats the"}
          {"\nperfect one shipped next month. Prefer small, obvious PRs over clever"}
          {"\nones. Delete code aggressively. Write the boring version first.\n\n"}
          <Cmt># ...the rest of the skill body is whatever the agent needs to read.</Cmt>
        </CodeBlock>

        <div className={styles.callouts}>
          <div>
            <Eyebrow>homepage</Eyebrow>
            <p className={styles.cText}>
              Shown by <code>crew info</code> so people can find your docs.
            </p>
          </div>
          <div>
            <Eyebrow>dependencies</Eyebrow>
            <p className={styles.cText}>
              Other skills to pull in — by name, git URL, or path. Walked transitively.
            </p>
          </div>
          <div>
            <Eyebrow>versions</Eyebrow>
            <p className={styles.cText}>
              Every install pins to a git commit SHA. Pin to a tag with <code>@v1.0</code>.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
