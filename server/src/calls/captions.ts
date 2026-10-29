import type { CaptionLine } from '../../../shared/types';

/**
 * Turns one speaker's streaming transcript and translation (append-only text, no sentence
 * boundaries) into caption lines. A pause starts a new line. The translation trails the speech,
 * so it fills the oldest line still waiting for one, and moves on after its own pause.
 */
export class CaptionTrack {
  private lines: CaptionLine[] = [];
  /** The line the speech goes into, and the one the translation goes into. */
  private sourceAt = -1;
  private translationAt = -1;
  private lastSource = 0;
  private lastTranslation = 0;

  constructor(
    private readonly speaker: CaptionLine['speaker'],
    private readonly onChange: (line: CaptionLine) => void,
    private readonly gapMs = 1200,
    private readonly now: () => number = Date.now,
  ) {}

  source(delta: string) {
    const t = this.now();
    if (this.sourceAt < 0 || t - this.lastSource > this.gapMs) this.sourceAt = this.newLine(t);
    this.lastSource = t;
    const line = this.lines[this.sourceAt]!;
    line.original += delta;
    this.onChange(line);
  }

  translation(delta: string) {
    const t = this.now();
    if (this.translationAt < 0) {
      this.translationAt = this.lines.length ? 0 : this.newLine(t);
    } else if (t - this.lastTranslation > this.gapMs && this.translationAt < this.lines.length - 1) {
      // A pause in the translation, and newer speech exists: that line's translation is done.
      this.finish(this.translationAt);
      this.translationAt++;
    }
    this.lastTranslation = t;
    const line = this.lines[this.translationAt]!;
    line.translation += delta;
    this.onChange(line);
  }

  /** The call is over: everything shown is final. */
  close() {
    for (let i = 0; i < this.lines.length; i++) this.finish(i);
  }

  private newLine(at: number) {
    this.lines.push({ id: `${this.speaker}-${this.lines.length + 1}-${at}`, speaker: this.speaker, original: '', translation: '', at, final: false });
    return this.lines.length - 1;
  }

  private finish(i: number) {
    const line = this.lines[i]!;
    if (line.final) return;
    line.original = line.original.trim();
    line.translation = line.translation.trim();
    line.final = true;
    this.onChange(line);
  }
}
