import { Brand } from "../primitives/Brand";
import { Container } from "../primitives/Container";
import styles from "./Footer.module.css";

const COLUMNS: readonly {
  readonly title: string;
  readonly links: readonly { readonly href: string; readonly label: string }[];
}[] = [
  {
    title: "Product",
    links: [
      { href: "#how", label: "How it works" },
      { href: "#commands", label: "Commands" },
      { href: "#safety", label: "Safety" },
      { href: "#install", label: "Install" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "https://agentskills.io/specification", label: "Agent Skills spec" },
      { href: "#skill-md", label: "SKILL.md anatomy" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: "https://github.com/with-logic/crew", label: "GitHub" },
      { href: "https://github.com/with-logic/crew-skills", label: "Default tap (core)" },
      {
        href: "https://github.com/with-logic/crew/blob/main/CHANGELOG.md",
        label: "Changelog",
      },
      { href: "https://github.com/with-logic/crew/blob/main/LICENSE", label: "License · MIT" },
    ],
  },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.grid}>
          <div>
            <Brand />
            <p className={styles.lede}>
              A package manager for agent skills. Install once, everywhere. Ship skills like
              packages. macOS-first, open source.
            </p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <h5 className={styles.h5}>{c.title}</h5>
              <ul className={styles.list}>
                {c.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.bot}>
          <span>crew · v0.3.1 · macOS (arm64, x86_64)</span>
          <span>$ crew help</span>
        </div>
      </Container>
    </footer>
  );
}
