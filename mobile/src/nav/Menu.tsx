import { router, usePathname, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { languageCode } from '@shared/languages';
import { clock, useActiveCall, useCallSeconds } from '@/call/ActiveCall';
import { EdgeGlow } from '@/glow/EdgeGlow';
import { useSession } from '@/lib/session';
import { color, type } from '@/theme/tokens';
import { Icon } from '@/ui/Icon';

/**
 * The full-screen menu (no tab bar): Call / Calls / Phone book / Me, the live call when there
 * is one, and links to Notifications and Import contacts. Each item shows its name in the
 * user's language beside the English label.
 */

const ITEMS: { href: Href; match: (p: string) => boolean; en: string; local: Record<string, string> }[] = [
  { href: '/', match: (p) => p === '/', en: 'Call', local: { zh: '打电话', es: 'Llamar', vi: 'Gọi', ko: '전화', tl: 'Tumawag', ja: '電話する' } },
  { href: '/calls', match: (p) => p.startsWith('/calls'), en: 'Calls', local: { zh: '通话记录', es: 'Llamadas', vi: 'Cuộc gọi', ko: '통화 기록', tl: 'Mga tawag', ja: '通話履歴' } },
  { href: '/contacts', match: (p) => p.startsWith('/contacts'), en: 'Phone book', local: { zh: '电话簿', es: 'Agenda', vi: 'Danh bạ', ko: '전화번호부', tl: 'Phone book', ja: '電話帳' } },
  { href: '/me', match: (p) => p.startsWith('/me'), en: 'Me', local: { zh: '我的设置', es: 'Yo', vi: 'Tôi', ko: '나', tl: 'Ako', ja: '設定' } },
];

const MenuContext = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useMenu = () => useContext(MenuContext);

export function MenuProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const open = useCallback(() => setShown(true), []);
  const close = useCallback(() => setShown(false), []);
  return (
    <MenuContext.Provider value={{ open, close }}>
      {children}
      {shown && <MenuOverlay onClose={close} />}
    </MenuContext.Provider>
  );
}

function MenuOverlay({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { state } = useSession();
  const me = state.status === 'signedIn' ? state.me : null;
  const code = me ? languageCode(me.profile.preferredLanguage) : undefined;
  const { call, live } = useActiveCall();
  const seconds = useCallSeconds(call);

  // Closing after navigating, once the new screen is in place.
  const pending = useRef(false);
  useEffect(() => {
    if (pending.current) onClose();
  }, [path, onClose]);
  const go = (href: Href) => {
    pending.current = true;
    if (href === path) onClose();
    else router.navigate(href);
  };

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.overlay]}>
      <EdgeGlow mode="idle" />
      <View style={{ height: insets.top }} />
      <View style={s.head}>
        <Text style={type.caption}>
          {me?.profile.name || 'You'} · {me?.profile.preferredLanguage.replace(/^Chinese \((.+)\)$/, '$1') ?? ''}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} hitSlop={8} style={s.close}>
          <Icon name="close" size={15} />
        </Pressable>
      </View>

      <View style={s.items}>
        {ITEMS.map((item, i) => (
          <Animated.View key={item.en} entering={FadeInUp.duration(350).delay(i * 50)}>
            <Pressable accessibilityRole="link" onPress={() => go(item.href)} style={[s.item, i < ITEMS.length - 1 && s.divider]}>
              <Text style={[type.menu, item.match(path) && { color: color.blue }]}>{item.en}</Text>
              {code && item.local[code] ? <Text style={type.sub}>{item.local[code]}</Text> : null}
            </Pressable>
          </Animated.View>
        ))}
      </View>

      {call && live && (
        <Pressable onPress={() => go({ pathname: '/call/[id]', params: { id: call.id } })} style={s.live}>
          <View style={s.liveDot} />
          <Text style={[type.small, { color: color.greenText, fontWeight: '600' }]}>Live</Text>
          <Text style={[type.small, { color: color.ink, flex: 1 }]} numberOfLines={1}>
            {call.request.counterpartName || call.request.to} · {clock(seconds)}
          </Text>
          <Text style={[type.small, { color: color.ink, fontWeight: '600' }]}>Open</Text>
        </Pressable>
      )}

      <View style={[s.links, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={type.caption} onPress={() => go('/notifications')}>
          Notifications
        </Text>
        <Text style={type.caption} onPress={() => go('/contacts/import')}>
          Import contacts
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: { backgroundColor: color.overlay, zIndex: 40 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 26, paddingRight: 18, paddingTop: 8 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  items: { flex: 1, justifyContent: 'center', paddingHorizontal: 30, gap: 6 },
  item: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: color.divider },
  live: { marginHorizontal: 18, marginBottom: 14, height: 50, borderRadius: 25, backgroundColor: color.greenTint, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.green },
  links: { flexDirection: 'row', gap: 18, paddingHorizontal: 30 },
});
