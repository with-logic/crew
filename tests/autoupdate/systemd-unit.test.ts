/**
 * systemd unit rendering tests (§10.2, C-AUTO).
 *
 * Keeps the unit-text assertions separate from command flow tests.
 */

import { describe, expect, test } from "bun:test";
import { serviceUnit, timerUnit } from "../../src/autoupdate/systemd.ts";
import { CrewError } from "../../src/core/errors.ts";

describe("systemd unit rendering", () => {
  test("C-AUTO-01/02 service invokes crew update with pinned env", () => {
    const unit = serviceUnit("/tmp/crew bin", "/tmp/crew.log", "/tmp/crew home");
    expect(unit).toContain("Description=Homecrew Skill Autoupdate");
    expect(unit).toContain('Environment="CREW_HOME=/tmp/crew home"');
    expect(unit).toContain("Environment=CREW_AUTOUPDATE_LOG=1");
    expect(unit).toContain('ExecStart="/tmp/crew bin" update --quiet');
    expect(unit).toContain("StandardOutput=append:/tmp/crew.log");
  });

  test("systemd unit values escape specifiers and reject newlines", () => {
    const unit = serviceUnit("/tmp/100%/crew", "/tmp/crew%.log", "/tmp/crew%home");
    expect(unit).toContain('Environment="CREW_HOME=/tmp/crew%%home"');
    expect(unit).toContain('ExecStart="/tmp/100%%/crew" update --quiet');
    expect(unit).toContain('StandardOutput="append:/tmp/crew%%.log"');
    expect(() => serviceUnit("/tmp/crew\nbad", "/tmp/crew.log", "/tmp/crew")).toThrow(CrewError);
    expect(() => serviceUnit("/tmp/crew\rbad", "/tmp/crew.log", "/tmp/crew")).toThrow(
      /cannot contain newlines/,
    );
  });

  test("C-AUTO-02 timer carries the configured interval", () => {
    const unit = timerUnit(1800);
    expect(unit).toContain("OnBootSec=1800s");
    expect(unit).toContain("OnUnitActiveSec=1800s");
    expect(unit).toContain("Unit=sh.crew.autoupdate.service");
    expect(unit).toContain("WantedBy=timers.target");
  });
});
