import { Platform, type TextStyle } from 'react-native';

/**
 * Design tokens. Identity (2026-10 redesign): indigo is the user, teal the person they call; see
 * the canvas "CallBridge translator redesign". Reference frame 390×844
 * pt. The "hold" state is amber everywhere (in-app and on the Dynamic Island), by decision.
 */

export const color = {
  ink: '#0e1726',
  secondary: '#5b6576',
  tertiary: '#9aa1ad',
  body: '#4a5468',

  white: '#ffffff',
  surface: '#f3f5f8',
  surface2: '#f7f8fa',
  surface3: '#fbfbfd',
  divider: '#eef0f3',
  line: '#e2e6ec',
  lineStrong: '#d5dae2',

  /** Indigo: the user (their captions, their actions). */
  blue: '#3346d3',
  bluePressed: '#2535a8',
  blueTint: '#e7eafc',
  /** Teal: the person they're calling. */
  teal: '#0b6e63',
  tealTint: '#e3f2ef',
  /** The dark ground of the connecting screen and the interpreter banner. */
  night: '#0e1726',
  nightCard: '#172238',
  green: '#12804a',
  greenText: '#12804a',
  greenTint: '#e1f5e8',
  violet: '#5b3cc4',
  violetTint: '#eee9fc',
  amberText: '#855600',
  amberTint: '#fff3d1',
  amberGlow: '#f3c45c',
  /** "Someone is on hold for you": the accent for hold UI (buttons, countdown). */
  amber: '#d48a00',
  red: '#c2352a',
  redText: '#c2352a',
  redTint: '#fdeceb',

  menuButton: 'rgba(14,23,38,0.05)',
  overlay: 'rgba(255,255,255,0.97)',
} as const;

/** Status pills in history and results. */
export const tag = {
  Booked: { bg: color.greenTint, fg: color.greenText },
  'No answer': { bg: '#eef0f3', fg: color.secondary },
  Delivered: { bg: color.blueTint, fg: color.blue },
  'Not booked': { bg: color.redTint, fg: color.redText },
  Answered: { bg: color.blueTint, fg: color.blue },
  Updated: { bg: color.greenTint, fg: color.greenText },
  'Needs you': { bg: color.amberTint, fg: color.amberText },
} as const;
export type TagName = keyof typeof tag;

/** On iOS the design uses SF Pro (system) with PingFang SC for Chinese; both are the system font. */
const sans = Platform.select({ ios: undefined, default: 'sans-serif' });
const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const font = { sans, mono };

const t = (size: number, weight: TextStyle['fontWeight'] = '400', extra: TextStyle = {}): TextStyle => ({
  fontFamily: sans,
  fontSize: size,
  fontWeight: weight,
  color: color.ink,
  ...extra,
});

export const type = {
  hero: t(36, '600', { letterSpacing: -0.6, lineHeight: 42 }),
  menu: t(40, '600', { letterSpacing: -0.8 }),
  title: t(30, '600', { letterSpacing: -0.4, lineHeight: 38 }),
  question: t(30, '500', { letterSpacing: -0.3, lineHeight: 40 }),
  transcript: t(31, '500', { letterSpacing: -0.3, lineHeight: 43 }),
  quote: t(28, '500', { letterSpacing: -0.3, lineHeight: 38 }),
  headline: t(40, '600', { letterSpacing: -0.8, lineHeight: 48 }),
  name: t(38, '600', { letterSpacing: -0.6 }),
  h2: t(26, '600', { letterSpacing: -0.3 }),
  h3: t(22, '600'),
  row: t(20, '600'),
  body: t(17),
  bodyStrong: t(17, '600'),
  callout: t(16),
  sub: t(15, '400', { color: color.secondary, lineHeight: 21 }),
  small: t(14, '400', { color: color.secondary, lineHeight: 20 }),
  caption: t(13, '400', { color: color.secondary }),
  /** Section labels: 12/600, +0.08em, uppercase. */
  label: t(12, '600', { letterSpacing: 1, textTransform: 'uppercase', color: color.secondary }),
  mono: { fontFamily: mono, fontSize: 17, color: color.ink } as TextStyle,
} as const;

export const radius = { pill: 99, card: 20, cardSmall: 18, sheet: 30, device: 56 } as const;

export const shadow = {
  card: { borderWidth: 1, borderColor: color.divider },
  mic: { shadowColor: color.blue, shadowOpacity: 0.28, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } },
  toast: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
} as const;

/** Edge-glow palettes ("brand" in the prototype). Each: light → dark. */
export const glowPalette = {
  assist: ['#e7eafc', '#8c9bff', '#3346d3', '#1a2280'],
  think: ['#efe6ff', '#b59cff', '#6a4bd6', '#2b1a78'],
  call: ['#e3f2ef', '#7fd8c6', '#0b6e63', '#06302b'],
  /** Hold is amber (decision); the prototype used violet here. */
  hold: ['#fff3d1', '#f3c45c', '#d48a00', '#855600'],
  fail: ['#fff3d1', '#f3c45c', '#d48a00', '#855600'],
  /** Looking something up: magenta into violet, its own color so it reads as "working on it". */
  search: ['#ffe0f1', '#ff5fb2', '#c13cff', '#5a1a8a'],
} as const;
