"use client";

import { useState } from "react";
import styles from "./BuildItYourself.module.css";

interface Props {
  /** Full preamble + PRD text to copy when the user clicks the button. */
  readonly prompt: string;
}

const PRD_URL = "https://github.com/with-logic/crew/blob/main/PRD.md";

/**
 * "From Scratch" (Software-as-a-Prompt) callout.
 *
 * The thesis: the PRD is the source code. Hand the PRD (+ a short
 * preamble) to an agent coder and you get back a working `crew`.
 * The copy button inlines the whole payload — no fetches, no external
 * links required.
 */
export function BuildItYourself({ prompt }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Most likely a secure-context failure (http rather than https)
      // or a permissions policy. Leave the button un-ticked so the
      // user notices nothing happened.
    }
  };

  const kb = Math.round(prompt.length / 1024);

  return (
    <aside className={styles.saap} aria-labelledby="saap-heading">
      <div className={styles.tagRow}>
        <span className={styles.tag}>Software-as-a-Prompt</span>
      </div>

      <h3 id="saap-heading" className={styles.heading}>
        Create Your Own From Scratch
      </h3>

      <p className={styles.copy}>
        Crew was built by agents from this{" "}
        <a href={PRD_URL} target="_blank" rel="noreferrer">
          PRD
        </a>
        . Build your own from the same spec — in Go, Rust, Swift, or whatever else. The button below
        copies a ready-to-paste prompt with the full PRD.
      </p>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.button} onClick={onCopy}>
          <ClipboardGlyph />
          {copied ? "Copied" : `Copy the whole PRD to your clipboard (${kb} KB)`}
        </button>
      </div>
    </aside>
  );
}

function ClipboardGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
