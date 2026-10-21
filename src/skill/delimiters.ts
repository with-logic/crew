/** Incremental frontmatter delimiter recognition for strings and ASCII read buffers (§9 step 4). */

const CARRIAGE_RETURN = 13;
const LINE_FEED = 10;
const DASH = 45;
const ASCII_INLINE_WHITESPACE = [9, 11, 12, 32];

type ScanInput = string | Uint8Array;

/** Track only delimiter candidates; incomplete or malformed headers retain no source bytes. */
export class FrontmatterDelimiters {
  kind: "pending" | "missing" | "unclosed" | "complete";
  headerStart = 0;
  headerEnd = 0;
  bodyStart = 0;
  lineBreaks = 0;
  private position = 0;
  private lineStart = 0;
  private previousBreak = 0;
  private opened = false;
  private dashes = 0;
  private trailingSpace = false;
  private invalid = false;
  private afterCr = false;

  constructor() {
    this.kind = "pending";
  }

  /** Consume decoded text or ASCII bytes; stop at the closing delimiter's first line ending. */
  write(input: ScanInput): void {
    this.lineBreaks = 0;
    for (let i = 0; i < input.length; i++, this.position++) {
      const char = typeof input === "string" ? input.charCodeAt(i) : input[i]!;
      if (char === CARRIAGE_RETURN || char === LINE_FEED) {
        this.lineBreaks++;
        if (this.afterCr && char === LINE_FEED) {
          if (this.headerStart === this.lineStart) this.headerStart++;
          this.lineStart++;
          this.afterCr = false;
          continue;
        }
        this.finishLine(this.position, this.position + 1);
        if (this.kind !== "pending") return;
        this.afterCr = char === CARRIAGE_RETURN;
      } else {
        this.afterCr = false;
        if (this.invalid) {
          // Once invalid, no later character on this line can make it a delimiter.
          let next = i + 1;
          while (next < input.length) {
            const nextChar = typeof input === "string" ? input.charCodeAt(next) : input[next]!;
            if (nextChar === CARRIAGE_RETURN || nextChar === LINE_FEED) break;
            next++;
          }
          this.position += next - i - 1;
          i = next - 1;
        } else if (
          ASCII_INLINE_WHITESPACE.includes(char) ||
          (char > 127 && String.fromCharCode(char).trim() === "")
        ) {
          this.trailingSpace ||= this.dashes > 0;
        } else if (char === DASH && this.dashes < 3 && !this.trailingSpace) this.dashes++;
        else {
          if (!this.opened) {
            this.kind = "missing";
            return;
          }
          this.invalid = true;
        }
      }
    }
  }

  /** Treat EOF as a final line boundary, without introducing a byte into the source. */
  end(): void {
    this.finishLine(this.position, this.position);
    if (this.kind === "pending") this.kind = this.opened ? "unclosed" : "missing";
  }

  private finishLine(end: number, next: number): void {
    const delimiter = this.dashes === 3 && !this.invalid;
    if (this.opened && delimiter) {
      this.headerEnd = Math.max(this.headerStart, this.previousBreak);
      this.bodyStart = next;
      this.kind = "complete";
      return;
    }
    if (!this.opened && this.dashes !== 0) {
      if (!delimiter) {
        this.kind = "missing";
        return;
      }
      this.opened = true;
      this.headerStart = next;
    }
    this.previousBreak = end;
    this.lineStart = next;
    this.dashes = 0;
    this.trailingSpace = false;
    this.invalid = false;
  }
}
