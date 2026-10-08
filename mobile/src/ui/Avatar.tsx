import { Text, View } from 'react-native';

/** Initials on a soft color picked from the name, as in the phone book. */
const PAIRS: [string, string][] = [
  ['#e1f5e8', '#137a3a'],
  ['#ffe3ef', '#b0306a'],
  ['#fff3d1', '#855600'],
  ['#eee9fc', '#5b3cc4'],
  ['#e6edfd', '#2557e8'],
];

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  // CJK names: the first character reads best.
  if (/[㐀-鿿]/.test(words[0]!)) return words[0]!.slice(0, 1);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const [bg, fg] = PAIRS[h % PAIRS.length]!;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '600', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}
