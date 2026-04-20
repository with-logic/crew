import { Button } from "../primitives/Button";
import { Container } from "../primitives/Container";
import { Eyebrow } from "../primitives/Eyebrow";
import { Section } from "../primitives/Section";
import styles from "./BottomCTA.module.css";

export function BottomCTA() {
  return (
    <Section tight ruleTop>
      <Container>
        <div className={styles.wrap}>
          <Eyebrow centered>Teach every agent on your machine</Eyebrow>
          <h2 className={styles.title}>$ crew install &lt;skill&gt;</h2>
          <div className={styles.ctaRow}>
            <Button href="#install">Install crew</Button>
            <Button href="#commands" variant="ghost">
              Command reference
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  );
}
