import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, shadow, type } from '@/theme/tokens';

/** Black pill toasts near the top, 2.2 s ("Hold the button while you speak"). */
const ToastContext = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const show = useCallback((t: string) => {
    clearTimeout(timer.current);
    setText(t);
    timer.current = setTimeout(() => setText(null), 2200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {text && (
        <View pointerEvents="none" style={[s.wrap, { top: insets.top + 10 }]}>
          <Animated.View entering={FadeInUp.duration(250)} exiting={FadeOut.duration(200)} style={[s.toast, shadow.toast]}>
            <Text style={[type.small, { color: color.white, fontWeight: '500' }]}>{text}</Text>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  toast: { backgroundColor: color.ink, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11 },
});
