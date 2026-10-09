import { BlurMask, Canvas, DiffRect, Group, LinearGradient, Path, rect, rrect, Skia, SweepGradient, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Easing, useDerivedValue, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { radius } from '@/theme/tokens';
import { GLOW, type Band, type GlowMode, type GlowSpec, type Trace } from './modes';

/**
 * The edge glow, drawn once at the app root behind every screen (one Skia canvas that stays
 * mounted; screens only change its mode, see useGlow). Switching modes cross-fades over 0.6 s.
 * With Reduce Motion on, the bands hold still: no rotation, no pulsing.
 */

const FADE_MS = 600;

export function EdgeGlow({ mode, holdFraction = 1 }: { mode: GlowMode; holdFraction?: number }) {
  const { width, height } = useWindowDimensions();
  // The previous mode stays drawn while it fades out under the new one.
  const [layers, setLayers] = useState<{ mode: GlowMode; key: number }[]>([{ mode, key: 0 }]);

  useEffect(() => {
    setLayers((prev) => (prev.at(-1)?.mode === mode ? prev : [...prev.slice(-1), { mode, key: (prev.at(-1)?.key ?? 0) + 1 }]));
    const t = setTimeout(() => setLayers((prev) => prev.slice(-1)), FADE_MS + 50);
    return () => clearTimeout(t);
  }, [mode]);

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      {layers.map((l, i) =>
        l.mode === 'none' ? null : <GlowLayer key={l.key} spec={GLOW[l.mode]} visible={i === layers.length - 1} width={width} height={height} holdFraction={holdFraction} />,
      )}
    </Canvas>
  );
}

function GlowLayer({ spec, visible, width, height, holdFraction }: { spec: GlowSpec; visible: boolean; width: number; height: number; holdFraction: number }) {
  const still = useReducedMotion();
  const fade = useSharedValue(0);
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  const trace = useSharedValue(holdFraction);

  useEffect(() => {
    fade.value = withTiming(visible ? 1 : 0, { duration: FADE_MS });
  }, [visible, fade]);

  useEffect(() => {
    if (still) return;
    if (spec.rotate) spin.value = withRepeat(withTiming(Math.PI * 2, { duration: spec.rotate * 1000, easing: Easing.linear }), -1, false);
    if (spec.breathe) pulse.value = withRepeat(withTiming(1, { duration: (spec.breathe * 1000) / 2, easing: Easing.inOut(Easing.ease) }), -1, true);
    if (spec.heartbeat) {
      // Lub-dub, then a rest: a strong beat, a dip, a softer beat, and a long fade.
      const ms = spec.heartbeat * 1000;
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: ms * 0.13, easing: Easing.out(Easing.quad) }),
          withTiming(0.35, { duration: ms * 0.14, easing: Easing.in(Easing.quad) }),
          withTiming(0.85, { duration: ms * 0.12, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: ms * 0.61, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    }
  }, [still, spec.rotate, spec.breathe, spec.heartbeat, spin, pulse]);

  // The countdown shrinks smoothly between the once-a-second updates.
  useEffect(() => {
    trace.value = withTiming(Math.max(0, Math.min(1, holdFraction)), { duration: 1000, easing: Easing.linear });
  }, [holdFraction, trace]);

  const opacity = useDerivedValue(() => fade.value);
  return (
    <Group opacity={opacity}>
      {spec.bands.map((b, i) => (
        <BandRing key={i} band={b} width={width} height={height} spin={spin} pulse={pulse} still={still} />
      ))}
      {spec.traces?.map((t, i) => <TraceRing key={`t${i}`} trace={t} width={width} height={height} end={trace} />)}
    </Group>
  );
}

function BandRing({ band, width, height, spin, pulse, still }: { band: Band; width: number; height: number; spin: SharedValue<number>; pulse: SharedValue<number>; still: boolean }) {
  const R = radius.device;
  const outer = useMemo(() => rrect(rect(0, 0, width, height), R, R), [width, height, R]);
  const inner = useMemo(() => {
    const r = Math.max(0, R - band.width);
    return rrect(rect(band.width, band.width, width - band.width * 2, height - band.width * 2), r, r);
  }, [width, height, R, band.width]);
  const center = vec(width / 2, height / 2);
  const base = band.opacity ?? 1;
  const opacity = useDerivedValue(() => {
    if (!band.pulse || still) return base;
    const low = band.pulse === 'ring' ? 0.12 : band.pulse === 'beat' ? 0.2 : 0.6;
    return base * (low + (1 - low) * pulse.value);
  });
  const transform = useDerivedValue(() => [{ rotate: spin.value }]);

  return (
    <Group opacity={opacity}>
      <DiffRect outer={outer} inner={inner} color={band.fill ?? 'white'}>
        {band.blur ? <BlurMask blur={band.blur} style="normal" respectCTM /> : null}
        {band.colors ? <SweepGradient c={center} colors={[...band.colors]} origin={center} transform={transform} /> : null}
        {band.rise ? <LinearGradient start={vec(0, height)} end={vec(0, 0)} colors={band.rise.colors} positions={band.rise.positions} /> : null}
      </DiffRect>
    </Group>
  );
}

function TraceRing({ trace, width, height, end }: { trace: Trace; width: number; height: number; end: SharedValue<number> }) {
  const R = radius.device - 2;
  const path = useMemo(() => Skia.Path.RRect(rrect(rect(2, 2, width - 4, height - 4), R, R)), [width, height, R]);
  return (
    <Path path={path} style="stroke" strokeWidth={trace.width} strokeCap="round" start={0} end={end}>
      {trace.blur ? <BlurMask blur={trace.blur} style="normal" respectCTM /> : null}
      <LinearGradient start={vec(0, 0)} end={vec(width, height)} colors={[trace.from, trace.to]} />
    </Path>
  );
}
