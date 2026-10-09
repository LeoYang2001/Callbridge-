import { Image, type ImageStyle, type StyleProp } from 'react-native';

/**
 * The CallBridge mark (two speech bubbles). color: blue and green, for headers; blue: one-color,
 * for small or quiet places (footers); white: on blue or dark surfaces; pale: frosted, for
 * watermarks. Originals are in design/logo.
 */

const SOURCES = {
  color: require('../../assets/images/brand/mark-color.png'),
  blue: require('../../assets/images/brand/mark-blue.png'),
  white: require('../../assets/images/brand/mark-white.png'),
  pale: require('../../assets/images/brand/mark-pale.png'),
} as const;

// Width / height of each trimmed mark.
const ASPECT = { color: 1.114, blue: 1.186, white: 1.125, pale: 1.139 } as const;

export function Logo({ variant = 'color', size = 28, style }: { variant?: keyof typeof SOURCES; size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={SOURCES[variant]}
      style={[{ width: size * ASPECT[variant], height: size }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessible={false}
    />
  );
}
