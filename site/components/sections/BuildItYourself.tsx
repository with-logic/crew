"use client";

import { useState } from "react";
import styles from "./BuildItYourself.module.css";

interface Props {
  /** Full preamble + PRD text to copy when the user clicks the button. */
  readonly prompt: string;
}

/**
 * "Build it yourself" (Software-as-a-Prompt) callout.
 *
 * The thesis: the PRD is the source code. Hand the PRD (+ a short
 * preamble) to an agent coder and you get back a working `crew`.
 * Click-to-copy button inlines the whole payload; no fetches, no
 * external links required.
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
      <div className={styles.header}>
        <span className={styles.tag}>Software-as-a-Prompt</span>
        <h3 id="saap-heading" className={styles.heading}>
          Or build it yourself.
        </h3>
      </div>

      <p className={styles.copy}>
        The PRD is the source code. Paste it into any agent coder —{" "}
        <span className={styles.mono}>Claude Code</span>, <span className={styles.mono}>Codex</span>
        , <span className={styles.mono}>Cursor</span>, pick your agent, pick your stack — and you'll
        get a working <span className={styles.mono}>crew</span>-compliant binary out the other side.
        Ours is written in TypeScript. Yours could be in Go, Rust, Swift, or whatever you're in the
        mood for today.
      </p>

      <div className={styles.actionRow}>
        <button type="button" className={styles.button} onClick={onCopy}>
          <ClipboardGlyph />
          {copied ? "copied" : `Copy the whole PRD to your clipboard (${kb} KB)`}
        </button>
        <span className={styles.hint}>Then paste it into your agent and follow the preamble.</span>
      </div>

      <p className={styles.footnote}>
        Half joking, half serious. If you ship one, we'd love to see it.
      </p>
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
