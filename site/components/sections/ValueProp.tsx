import { Container } from "../primitives/Container";
import { Pill } from "../primitives/Pill";
import styles from "./ValueProp.module.css";

export function ValueProp() {
  return (
    <section className={styles.section}>
      <Container>
        <p className={styles.label}>What is Crew?</p>
        <h2 className={styles.title}>
          Crew treats <span className={styles.mark}>agent&nbsp;skills</span> like packages.
        </h2>
        <p className={styles.sub}>
          <span>
            Install one skill for yourself, publish a repo for your team, or tap into a shared
            collection. Git is the package index; <code className={styles.codePaper}>SKILL.md</code>{" "}
            is the manifest.
          </span>
        </p>
        <div className={styles.chips}>
          <Pill>
            <strong>multi-agent</strong> · one install, every detected agent
          </Pill>
          <Pill>
            <strong>team taps</strong> · private git repos become registries
          </Pill>
          <Pill>
            <strong>no telemetry</strong> · crew never phones home
          </Pill>
        </div>
      </Container>
    </section>
  );
}
