import type { Metadata } from "next";
import { SkillCatalog } from "../../components/catalog/SkillCatalog";
import { Container } from "../../components/primitives/Container";
import { Section } from "../../components/primitives/Section";
import { Footer } from "../../components/sections/Footer";
import { Nav } from "../../components/sections/Nav";
import { SKILL_CATALOG_TAPS } from "../../lib/generated/skillCatalog";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "homecrew skill catalog",
  description: "Browse the default Homecrew tap and trusted taps you can add with crew tap add.",
};

export default function SkillsPage() {
  return (
    <>
      <Nav />
      <main>
        <Section className={styles.hero}>
          <Container>
            <div className={styles.kicker}>Skill catalog</div>
            <h1>Skill Catalog</h1>
            <p>
              Homecrew ships with a few default skills in <code>core</code> to get you bootstrapped.
              We also index trusted taps and make them easy to search from the <code>crew</code>{" "}
              CLI. The important part: Homecrew never installs a skill automatically. You explicitly
              choose every skill or tap before it lands on your system.
            </p>
          </Container>
        </Section>

        <Section className={styles.catalogSection}>
          <Container>
            <SkillCatalog taps={SKILL_CATALOG_TAPS} />
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
