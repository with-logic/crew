"use client";

import { useState } from "react";
import styles from "./CopyButton.module.css";

interface CopyButtonProps {
  readonly text: string;
  readonly label?: string;
}

export function CopyButton({ text, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API blocked or unavailable — silently no-op. The
      // command text is still visible, so users can select+copy manually.
    }
  }

  return (
    <button
      type="button"
      className={styles.btn}
      onClick={onClick}
      aria-label={label}
      title={copied ? "Copied" : label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="9" height="10" rx="1.5" />
      <path d="M10 4V3a1.5 1.5 0 0 0-1.5-1.5h-4A1.5 1.5 0 0 0 3 3v8a1.5 1.5 0 0 0 1.5 1.5H5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5L6.5 12L13 4.5" />
    </svg>
  );
}
