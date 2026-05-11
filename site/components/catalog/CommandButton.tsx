import { useId, useState } from "react";
import styles from "./CommandButton.module.css";

export interface CommandStatus {
  readonly command: string;
  readonly state: "copied" | "failed";
}

interface CommandButtonProps {
  readonly label: string;
  readonly command: string | undefined;
  readonly status: CommandStatus | null;
  readonly onCopy: (command: string) => void;
  readonly disabled?: boolean;
  readonly icon?: boolean;
  readonly note?: string;
  readonly variant?: "primary" | "secondary";
}

export function CommandButton({
  label,
  command,
  status,
  disabled = false,
  icon = false,
  note,
  onCopy,
  variant = "secondary",
}: CommandButtonProps) {
  const hintId = useId();
  const [suppressHover, setSuppressHover] = useState(false);
  const commandState = command !== undefined && status?.command === command ? status.state : null;
  const isCopied = commandState === "copied";
  const isFailed = commandState === "failed";
  const actionClass =
    isCopied || isFailed
      ? styles.actionCopied
      : suppressHover
        ? styles.actionSuppressed
        : styles.action;
  const buttonClass = [
    styles.button,
    variant === "primary" ? styles.primaryButton : styles.secondaryButton,
    icon && styles.iconButton,
    isCopied && styles.copiedButton,
    isFailed && styles.failedButton,
    disabled && styles.disabledButton,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <fieldset className={actionClass} onMouseLeave={() => setSuppressHover(false)}>
      <button
        type="button"
        className={buttonClass}
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={() => {
          if (command === undefined || disabled) return;
          setSuppressHover(true);
          onCopy(command);
        }}
      >
        {icon ? (
          <>
            <span className={styles.iconGlyph} aria-hidden="true">
              {isCopied ? "✓" : isFailed ? "X" : "+"}
            </span>
            <span className={styles.iconText}>
              {isCopied ? "Copied" : isFailed ? "Could not copy" : "Copy Command"}
            </span>
          </>
        ) : (
          label
        )}
      </button>
      <div id={hintId} className={styles.commandHint}>
        {command === undefined ? null : (
          <>
            <strong>
              {isCopied ? "Copied to clipboard" : isFailed ? "Could not copy" : "Command:"}
            </strong>
            <code>{command}</code>
          </>
        )}
        {note === undefined ? null : <small>{note}</small>}
      </div>
    </fieldset>
  );
}
