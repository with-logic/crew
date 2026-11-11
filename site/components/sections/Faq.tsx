import { Container } from "../primitives/Container";
import { Section } from "../primitives/Section";
import { SectionHead } from "../primitives/SectionHead";
import { QAS } from "./Faq.data/index";
import styles from "./Faq.module.css";

export function Faq() {
  return (
    <Section id="faq" ruleTop>
      <Container>
        <SectionHead
          number="11"
          label="FAQ"
          title={<>Things people ask about Homecrew.</>}
          description=""
        />
        <div className={styles.list}>
          {QAS.map((qa) => (
            <details key={qa.id} open={qa.defaultOpen}>
              <summary>
                <span>{qa.q}</span>
              </summary>
              <div className={styles.ans}>{typeof qa.a === "string" ? <p>{qa.a}</p> : qa.a}</div>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}
