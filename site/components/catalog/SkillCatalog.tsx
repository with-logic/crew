"use client";

import { useMemo, useState } from "react";
import type { SkillCatalogTap } from "../../lib/generated/skillCatalog";
import { CommandButton, type CommandStatus } from "./CommandButton";
import { filterTaps, installSkillCommand, skillLabel, tapRef, type VisibleTap } from "./helpers";
import styles from "./SkillCatalog.module.css";
import rowStyles from "./SkillCatalogRows.module.css";

interface SkillCatalogProps {
  readonly taps: readonly SkillCatalogTap[];
}

export function SkillCatalog({ taps }: SkillCatalogProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [copyStatus, setCopyStatus] = useState<CommandStatus | null>(null);
  const visible = useMemo(() => filterTaps(taps, query), [taps, query]);
  const copyCommand = async (command: string) => {
    const setCopyResult = (state: CommandStatus["state"]) => {
      setCopyStatus({ command, state });
      window.setTimeout(() => {
        setCopyStatus((current) => (current?.command === command ? null : current));
      }, 1800);
    };
    if (navigator.clipboard === undefined) {
      setCopyResult("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(command);
      setCopyResult("copied");
    } catch {
      setCopyResult("failed");
    }
  };
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <div className={styles.catalog}>
      <div className={styles.toolbar}>
        <label className={styles.searchLabel}>
          <span>Search taps and skills</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="postgres, design, prompt, cloudflare..."
            className={styles.search}
          />
        </label>
      </div>

      <div className={styles.layout}>
        <aside className={styles.toc} aria-label="Catalog taps">
          {visible.map((entry) => (
            <a key={entry.tap.name} href={`#tap-${entry.tap.name}`}>
              {entry.tap.name}
            </a>
          ))}
        </aside>
        <div className={styles.results}>
          {visible.map((entry) => (
            <TapRow
              key={entry.tap.name}
              entry={entry}
              copyStatus={copyStatus}
              expanded={expanded}
              onCopy={copyCommand}
              onToggle={toggle}
            />
          ))}
          {visible.length === 0 ? (
            <div className={styles.empty}>No taps or skills match that search.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface TapRowProps {
  readonly entry: VisibleTap;
  readonly copyStatus: CommandStatus | null;
  readonly expanded: ReadonlySet<string>;
  readonly onCopy: (command: string) => void;
  readonly onToggle: (id: string) => void;
}

function TapRow({ entry, copyStatus, expanded, onCopy, onToggle }: TapRowProps) {
  const { tap, skills } = entry;
  const isDefault = tap.source === "default";
  const tapCommand = isDefault ? undefined : `crew tap add ${tapRef(tap)} ${tap.name}`;
  return (
    <article className={rowStyles.tap} id={`tap-${tap.name}`}>
      <div className={rowStyles.tapMain}>
        <div>
          <div className={rowStyles.tapTitle}>
            <h2>{tap.name}</h2>
            {tap.source === "default" ? null : <span className={rowStyles.badge}>{tap.trust}</span>}
          </div>
          <p>{tap.description}</p>
        </div>
        <div className={rowStyles.actions}>
          {isDefault ? null : (
            <div className={rowStyles.tapButtons}>
              <CommandButton
                label="Add Tap"
                command={tapCommand}
                status={copyStatus}
                icon
                note="Adds this tap to your configured taps."
                onCopy={onCopy}
                variant="primary"
              />
            </div>
          )}
          <a href={tap.url}>source</a>
        </div>
      </div>

      {skills.length > 0 ? (
        <div className={rowStyles.skills}>
          {skills.map((skill) => {
            const id = `${tap.name}/${skill.namespace ?? ""}/${skill.name}`;
            return (
              <SkillRow
                key={id}
                id={id}
                tap={tap}
                skill={skill}
                copyStatus={copyStatus}
                expanded={expanded.has(id)}
                onCopy={onCopy}
                onToggle={onToggle}
              />
            );
          })}
        </div>
      ) : (
        <p className={rowStyles.noSkills}>No individual skills match the current search.</p>
      )}
    </article>
  );
}

interface SkillRowProps {
  readonly id: string;
  readonly tap: SkillCatalogTap;
  readonly skill: SkillCatalogTap["skills"][number];
  readonly copyStatus: CommandStatus | null;
  readonly expanded: boolean;
  readonly onCopy: (command: string) => void;
  readonly onToggle: (id: string) => void;
}

function SkillRow({ id, tap, skill, copyStatus, expanded, onCopy, onToggle }: SkillRowProps) {
  const description = skill.description.trim();
  const long = description.length > 180;
  const text = !long || expanded ? description : `${description.slice(0, 177)}...`;
  const note = tap.source === "default" ? undefined : `Tap ${tap.name} before installing.`;
  return (
    <div className={rowStyles.skill}>
      <div className={rowStyles.skillHead}>
        <code>{skillLabel(skill)}</code>
        <CommandButton
          label="Install"
          command={installSkillCommand(tap, skill)}
          status={copyStatus}
          icon
          {...(note === undefined ? {} : { note })}
          onCopy={onCopy}
        />
      </div>
      <span>
        {text}
        {long ? (
          <button
            type="button"
            className={rowStyles.expand}
            aria-expanded={expanded}
            onClick={() => onToggle(id)}
          >
            {expanded ? "show less" : "show more"}
          </button>
        ) : null}
      </span>
    </div>
  );
}
