import { Button } from "../primitives/Button";
import { Container } from "../primitives/Container";
import { Terminal } from "../primitives/Terminal";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero}>
      <Container>
        <div className={styles.grid}>
          <div>
            <h1 className={styles.title}>
              <code className={styles.brandCode}>crew</code> lets your team{" "}
              <span className={styles.accent}>share</span> agent skills.
            </h1>
            <p className={styles.lede}>
              Easily discover and share skills across your team. One command to install. The same
              skills on every laptop, in every coding agent. Updated automatically.
            </p>
            <div className={styles.ctaRow}>
              <Button href="#how" variant="ghost">
                How it works
              </Button>
            </div>
          </div>
          <HeroTerminal />
        </div>
      </Container>
    </section>
  );
}

function HeroTerminal() {
  return (
    <Terminal title="~/work · zsh">
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.cmd}>crew tap add @acme/skills</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>
          cloned <span className={styles.acc}>acme</span> → 42 skills available
        </span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.cmd}>crew install acme/team-baseline</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>
          resolved <span className={styles.acc}>14 dependencies</span> from tap{" "}
          <span className={styles.acc}>acme</span>
        </span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>installed across every detected agent</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.cmd}>crew autoupdate enable</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>&nbsp;</span>
        <span className={styles.ok}>✓</span>
        <span className={styles.out}>checking every 4 hours</span>
      </div>
      <div className={styles.line}>
        <span className={styles.prompt}>$</span>
        <span className={styles.caret} />
      </div>
    </Terminal>
  );
}
