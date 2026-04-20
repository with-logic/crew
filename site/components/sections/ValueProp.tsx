import { Container } from "../primitives/Container";
import { Pill } from "../primitives/Pill";
import styles from "./ValueProp.module.css";

export function ValueProp() {
  return (
    <section className={styles.section}>
      <Container>
        <p className={styles.label}>What is Crew?</p>
        <h2 className={styles.title}>
          Share skills across your team in a <span className={styles.mark}>standard&nbsp;way</span>{" "}
          that keeps them up to date with zero effort.
        </h2>
        <p className={styles.sub}>
          <span>
            One command to install. The same skills on every laptop, in every coding agent. Updates
            arrive in the background. Changes ship through pull requests. Nothing leaves your
            network — crew, the CLI, and every skill you install are all open source under MIT.
          </span>
        </p>
        <div className={styles.chips}>
          <Pill>
            <strong>private by default</strong> · your git credentials, your repo
          </Pill>
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
