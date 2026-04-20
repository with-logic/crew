/**
 * Unit tests for the default synchronous prompt (§16.4).
 *
 * The prompt is the TTY-backed seam everyday production runs hit. The
 * CLI tests exercise the install command's prompt hook via an injected
 * PromptFn stub — these tests cover the real stdin/stderr read path
 * through a PromptIO seam.
 */

import { describe, expect, test } from "bun:test";
import { defaultPrompt, type PromptIO } from "../../src/cli/prompt.ts";

/** Make a fake PromptIO that replays fixed bytes and captures stderr. */
function fakeIO(bytes: string, opts: { isTTY?: boolean; throwOnRead?: boolean } = {}) {
  const queued = Buffer.from(bytes, "utf8");
  let pos = 0;
  let stderr = "";
  const io: PromptIO = {
    isTTY: () => opts.isTTY ?? true,
    writeStderr: (s) => {
      stderr += s;
    },
    readByte: (buf) => {
      if (opts.throwOnRead) throw new Error("read failed");
      if (pos >= queued.length) return 0;
      buf[0] = queued[pos]!;
      pos++;
      return 1;
    },
  };
  return { io, stderr: () => stderr };
}

describe("defaultPrompt", () => {
  test("non-TTY returns abort without reading or writing", () => {
    const { io, stderr } = fakeIO("", { isTTY: false });
    expect(defaultPrompt("prompt? ", io)).toBe("abort");
    expect(stderr()).toBe("");
  });

  test("empty input (just enter) is yes", () => {
    const { io, stderr } = fakeIO("\n");
    expect(defaultPrompt("prompt? ", io)).toBe("yes");
    expect(stderr()).toBe("prompt? ");
  });

  test("`y` is yes; `yes` is yes; uppercase too", () => {
    expect(defaultPrompt("", fakeIO("y\n").io)).toBe("yes");
    expect(defaultPrompt("", fakeIO("yes\n").io)).toBe("yes");
    expect(defaultPrompt("", fakeIO("YES\n").io)).toBe("yes");
  });

  test("`n` and `no` are no", () => {
    expect(defaultPrompt("", fakeIO("n\n").io)).toBe("no");
    expect(defaultPrompt("", fakeIO("no\n").io)).toBe("no");
    expect(defaultPrompt("", fakeIO("N\n").io)).toBe("no");
  });

  test("garbage input is no", () => {
    expect(defaultPrompt("", fakeIO("wat\n").io)).toBe("no");
  });

  test("EOF with no bytes is abort", () => {
    expect(defaultPrompt("", fakeIO("").io)).toBe("abort");
  });

  test("read error with no bytes is abort", () => {
    expect(defaultPrompt("", fakeIO("", { throwOnRead: true }).io)).toBe("abort");
  });

  test("read error after partial bytes returns what was read", () => {
    expect(defaultPrompt("", fakeIO("y").io)).toBe("yes");
  });

  test("read error mid-line falls back to whatever was read", () => {
    // Three good bytes then a throw — exercises the catch branch with
    // chars already buffered ("yes" parses as yes after trim/lower).
    const queued = Buffer.from("yes", "utf8");
    let pos = 0;
    const io = {
      isTTY: () => true,
      writeStderr: () => {},
      readByte: (buf: Buffer) => {
        if (pos >= 3) throw new Error("read failed");
        buf[0] = queued[pos]!;
        pos++;
        return 1;
      },
    };
    expect(defaultPrompt("", io)).toBe("yes");
  });
});

describe("defaultPrompt real IO seam", () => {
  test("default call uses process.stdin.isTTY (non-TTY in tests → abort)", () => {
    // Under `bun test`, process.stdin is not a TTY, so we hit the
    // realIO.isTTY path and short-circuit to abort without reading.
    expect(defaultPrompt("should not print")).toBe("abort");
  });

  test("realIO.writeStderr is wired to process.stderr.write", () => {
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    const origWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    (process.stderr as { write: (s: string) => boolean }).write = (s: string) => {
      captured += s;
      return true;
    };
    try {
      // The TTY gate passes; writeStderr is called; then readByte is
      // called against the test runner's stdin — which is at EOF, so
      // the prompt returns abort. The stderr write happened before
      // the EOF read, so we can assert on it.
      const result = defaultPrompt("hello ");
      expect(result).toBe("abort");
      expect(captured).toBe("hello ");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        value: origIsTTY,
        configurable: true,
      });
      (process.stderr as { write: (s: string) => boolean }).write = origWrite as unknown as (
        s: string,
      ) => boolean;
    }
  });
});
