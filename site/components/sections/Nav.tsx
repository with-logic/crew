import { CREW_VERSION_TAG } from "../../lib/version";
import { Brand } from "../primitives/Brand";
import styles from "./Nav.module.css";

const LINKS: readonly { readonly href: string; readonly label: string }[] = [
  { href: "#how", label: "How it works" },
  { href: "#refs", label: "Skill refs" },
  { href: "#commands", label: "Commands" },
  { href: "#taps", label: "Taps" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        <Brand href="/" />
        <span className={styles.version}>{CREW_VERSION_TAG}</span>
        <div className={styles.links}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
        <div className={styles.spacer} />
        <a
          className={styles.osPill}
          href="https://github.com/with-logic/crew"
          aria-label="GitHub repository"
        >
          <GitHubMark />
          github.com/with-logic/crew
        </a>
        <a className={styles.cta} href="#install">
          $ crew install <span className={styles.ctaArrow}>↗</span>
        </a>
      </div>
    </nav>
  );
}

function GitHubMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={styles.gh}
    >
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8a8 8 0 0 0-8-8z" />
    </svg>
  );
}
