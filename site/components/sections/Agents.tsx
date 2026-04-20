import { AGENTS } from "../../lib/agents";
import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import styles from "./Agents.module.css";

export function Agents() {
  return (
    <Section id="agents" ruleTop>
      <Container>
        <SectionHead
          number="12"
          label="Agents"
          title="Works with every Mac agent that speaks the spec."
          description={
            <>
              Any agent coder that reads the{" "}
              <a href="https://agentskills.io/specification">Agent Skills spec</a> is a valid
              target. Crew auto-detects the ones you already have and quietly skips the rest.
            </>
          }
        />

        <div className={styles.grid}>
          {AGENTS.map((a) => (
            <div key={a.name} className={styles.cell}>
              <span className={styles.name}>{a.name}</span>
              <span className={styles.display}>{a.display}</span>
            </div>
          ))}
        </div>

        <p className={styles.footnote}>
          Don't see yours? Its adapter probably takes an afternoon to write —{" "}
          <a href="https://github.com/with-logic/crew/blob/main/PRD.md#71-adapter-operations">
            §7.1
          </a>{" "}
          in the PRD walks you through it.
        </p>
      </Container>
    </Section>
  );
}
