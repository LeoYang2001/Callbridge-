import { Text } from 'react-native';
import { useGlow } from '@/glow/GlowContext';
import { MenuButton } from '@/nav/MenuButton';
import { type } from '@/theme/tokens';
import { Screen, TopBar } from '@/ui/Screen';

/** Notification settings (the library phase fills this in). */
export default function Notifications() {
  useGlow('none');
  return (
    <Screen top={<TopBar right={<MenuButton />} />}>
      <Text style={type.title}>Notifications</Text>
      <Text style={type.sub}>Hold questions always notify you. More settings are coming.</Text>
    </Screen>
  );
}
