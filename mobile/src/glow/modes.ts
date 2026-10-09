import { glowPalette as P } from '@/theme/tokens';

/**
 * The edge-glow system: light around the inner edge of the screen whose type, color and tempo
 * say what's happening. Aura = the assistant is talking with you; hairline = a phone line is
 * involved; color = who's involved (blue assistant, green the other party / success, amber
 * waiting on you or didn't work); tempo = urgency. Specs: mobile/design/README.md.
 */

export type GlowMode = 'none' | 'idle' | 'listen' | 'speak' | 'think' | 'search' | 'ready' | 'ring' | 'hair' | 'msg' | 'hold' | 'done' | 'fail';

/** One ring around the screen edge. */
export interface Band {
  /** Ring thickness (pt). */
  width: number;
  /** Blur radius (pt); 0 for a crisp line. */
  blur?: number;
  opacity?: number;
  /** A rotating sweep gradient of these colors... */
  colors?: readonly string[];
  /** ...or a flat color. */
  fill?: string;
  /** ...or a vertical gradient: [colors, positions], bottom to top. */
  rise?: { colors: string[]; positions: number[] };
  /** Opacity pulse: 'breathe' 0.6↔1, 'ring' 0.12↔1. */
  pulse?: 'breathe' | 'ring';
}

/** A stroke traced around the screen whose length is the hold countdown. */
export interface Trace {
  width: number;
  blur?: number;
  from: string;
  to: string;
}

export interface GlowSpec {
  bands: Band[];
  traces?: Trace[];
  /** Seconds per rotation of the sweep gradients; omitted = still. */
  rotate?: number;
  /** Seconds per opacity pulse. */
  breathe?: number;
}

const aura = [P.assist[1], P.assist[2], P.think[1], P.call[1], P.assist[1]];
const hairline = [P.call[1], P.call[2], P.assist[1], P.call[1]];
const ready = [P.assist[1], P.assist[2], P.think[1], P.assist[1]];
const done = [P.call[0], P.call[1], P.call[2], P.assist[1], P.call[1]];
// One lit segment of the edge, travelling round it: transparent most of the way, then a tail
// fading up into a bright head (the sweep turns clockwise, so the head leads).
const clear = 'rgba(255,95,178,0)';
const comet = [clear, clear, clear, clear, clear, clear, clear, 'rgba(255,95,178,0.35)', P.search[1], P.search[2], clear];

const hair: Band[] = [
  { width: 14, blur: 14, colors: hairline, opacity: 0.7 },
  { width: 3, colors: hairline },
];

export const GLOW: Record<Exclude<GlowMode, 'none'>, GlowSpec> = {
  idle: { rotate: 14, breathe: 4, bands: [{ width: 30, blur: 26, colors: aura, opacity: 0.5, pulse: 'breathe' }, { width: 3, colors: aura, opacity: 0.5 }] },
  listen: {
    rotate: 12,
    breathe: 3.2,
    bands: [{ width: 34, blur: 26, colors: aura, pulse: 'breathe' }, { width: 10, blur: 8, colors: aura, opacity: 0.9 }, { width: 3, colors: aura, opacity: 0.9 }],
  },
  speak: { rotate: 5, breathe: 1.3, bands: [{ width: 44, blur: 30, colors: aura, pulse: 'breathe' }, { width: 12, blur: 8, colors: aura }, { width: 3, colors: aura }] },
  think: { breathe: 2.2, bands: [{ width: 30, blur: 26, fill: P.think[1], opacity: 0.55, pulse: 'breathe' }, { width: 2.5, fill: P.think[1], opacity: 0.7, pulse: 'breathe' }] },
  search: {
    rotate: 2.2,
    bands: [
      // A faint ring so the edge never goes dark, and the comet going round on it.
      { width: 3, fill: P.search[1], opacity: 0.22 },
      { width: 42, blur: 30, colors: comet },
      { width: 12, blur: 8, colors: comet },
      { width: 3, colors: comet },
    ],
  },
  ready: { rotate: 22, bands: [{ width: 14, blur: 14, colors: ready, opacity: 0.6 }, { width: 3, colors: ready }] },
  ring: { rotate: 16, breathe: 1.5, bands: [{ width: 20, blur: 16, colors: hairline, pulse: 'ring' }, { width: 3, colors: hairline, pulse: 'ring' }] },
  hair: { rotate: 16, bands: hair },
  msg: {
    rotate: 16,
    breathe: 2.4,
    bands: [...hair, { width: 70, blur: 36, rise: { colors: [P.assist[1], P.assist[2], 'transparent'], positions: [0, 0.12, 0.34] }, pulse: 'breathe' }],
  },
  hold: {
    breathe: 1.6,
    bands: [{ width: 40, blur: 30, fill: P.hold[1], opacity: 0.35, pulse: 'breathe' }],
    traces: [
      { width: 26, blur: 14, from: P.hold[1], to: P.hold[2] },
      { width: 6, from: P.hold[1], to: P.hold[2] },
    ],
  },
  done: { rotate: 14, breathe: 4, bands: [{ width: 44, blur: 32, colors: done, pulse: 'breathe' }, { width: 10, blur: 8, colors: done }, { width: 3, colors: done }] },
  fail: { bands: [{ width: 12, blur: 12, fill: P.fail[1], opacity: 0.5 }, { width: 2.5, fill: P.fail[2], opacity: 0.9 }] },
};
