import { Switch } from 'react-native';
import { color } from '@/theme/tokens';

/** The design's 51×31 switch, green when on (the system switch, tinted). */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: color.green, false: color.line }} />;
}
