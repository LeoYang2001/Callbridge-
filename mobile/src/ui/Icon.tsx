import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { AndroidSymbol } from 'expo-symbols';
import { color as palette } from '@/theme/tokens';

/** The design's stroke icons, as SF Symbols on iOS and Material Symbols on Android. */
const ICONS = {
  phone: { ios: 'phone', android: 'call' },
  phoneDown: { ios: 'phone.down.fill', android: 'call_end' },
  mic: { ios: 'mic.fill', android: 'mic' },
  headphones: { ios: 'headphones', android: 'headphones' },
  message: { ios: 'bubble.left', android: 'chat_bubble' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  back: { ios: 'chevron.left', android: 'chevron_left' },
  close: { ios: 'xmark', android: 'close' },
  globe: { ios: 'globe', android: 'language' },
  search: { ios: 'magnifyingglass', android: 'search' },
  list: { ios: 'list.bullet', android: 'list' },
  hold: { ios: 'pause.circle.fill', android: 'pause_circle' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  alert: { ios: 'exclamationmark.circle.fill', android: 'error' },
  speaker: { ios: 'speaker.wave.2.fill', android: 'volume_up' },
  speakerOff: { ios: 'speaker.slash.fill', android: 'volume_off' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  plus: { ios: 'plus', android: 'add' },
  keyboard: { ios: 'keyboard', android: 'keyboard' },
  send: { ios: 'arrow.up.circle.fill', android: 'send' },
  directions: { ios: 'arrow.triangle.turn.up.right.diamond.fill', android: 'directions' },
  star: { ios: 'star.fill', android: 'star' },
  store: { ios: 'storefront', android: 'storefront' },
} as const satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color = palette.ink }: { name: IconName; size?: number; color?: string }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}
