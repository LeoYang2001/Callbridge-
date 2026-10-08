import { Text } from 'react-native';
import { useGlow } from '@/glow/GlowContext';
import { MenuButton } from '@/nav/MenuButton';
import { type } from '@/theme/tokens';
import { Screen, TopBar } from '@/ui/Screen';

/** Import from the phone's contacts (the library phase fills this in). */
export default function Import() {
  useGlow('none');
  return (
    <Screen top={<TopBar right={<MenuButton />} />}>
      <Text style={type.title}>Import contacts</Text>
      <Text style={type.sub}>Pick people from your contacts in the Phone book for now.</Text>
    </Screen>
  );
}
