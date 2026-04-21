import { Container } from "../primitives/Container";
import { Pill } from "../primitives/Pill";
import styles from "./ValueProp.module.css";

export function ValueProp() {
  return (
    <section className={styles.section}>
      <Container>
        <p className={styles.label}>What is Crew?</p>
        <h2 className={styles.title}>
          Crew turns <span className={styles.mark}>any&nbsp;git&nbsp;repo</span> into a registry of
          agent skills.
        </h2>
        <p className={styles.sub}>
          <span>
            Push a <code className={styles.codePaper}>SKILL.md</code>. Share a link. That's the
            package index. No servers, no accounts, no hosted registry.
          </span>
        </p>
        <div className={styles.chips}>
          <Pill>
            <strong>no hosted registry</strong> · git is the backend
          </Pill>
          <Pill>
            <strong>no telemetry</strong> · crew never phones home
          </Pill>
          <Pill>
            <strong>open source</strong> · MIT
          </Pill>
        </div>
      </Container>
    </section>
  );
}
