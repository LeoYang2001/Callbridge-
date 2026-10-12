import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { displayPhone } from '@shared/phone';
import { callerIdStatus, getMe, startCallerId } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSignedIn } from '@/lib/session';
import { color, font, type } from '@/theme/tokens';
import { Row } from '@/ui/Rows';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/Toast';

/**
 * Which number calls show: yours (so friends recognize it) or CallBridge's. Yours needs a one-time
 * verification: picking it starts one, Twilio calls you and you type the code shown here on the
 * keypad. The server records the verification; the choice here only switches between the two.
 */
export function CallerIdRow({ onChange }: { onChange: (patch: Record<string, unknown>) => void }) {
  const { conn, me, setMe } = useSignedIn();
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const polling = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const verified = Boolean(me.profile.callerIdVerifiedAt);
  const enabled = verified && me.profile.useOwnCallerId !== false;

  // The choice moves at the tap; the saved profile catches up a moment later.
  const [picked, setPicked] = useState<'mine' | 'callbridge' | null>(null);
  useEffect(() => setPicked(null), [enabled]);

  useEffect(() => () => clearInterval(polling.current), []);

  const done = async () => {
    setMe(await getMe(conn));
    setCode(null);
    setBusy(false);
    haptic.success();
    toast('Verified. Your calls now show your number.');
  };

  const verify = async () => {
    haptic.tap();
    setBusy(true);
    try {
      const r = await startCallerId(conn);
      if (r.verified) return void (await done());
      setCode(r.validationCode ?? null);
      // Twilio calls now; check every few seconds for up to two minutes.
      let tries = 0;
      clearInterval(polling.current);
      polling.current = setInterval(async () => {
        tries++;
        const s = await callerIdStatus(conn).catch(() => null);
        if (s?.verified) {
          clearInterval(polling.current);
          await done();
        } else if (tries >= 40) {
          clearInterval(polling.current);
          setCode(null);
          setBusy(false);
          toast("It wasn't verified. Try again, and enter the code when Twilio calls.");
        }
      }, 3000);
    } catch (e) {
      setBusy(false);
      toast((e as Error).message);
    }
  };

  const shown = picked ?? (enabled ? 'mine' : 'callbridge');
  const pick = (v: 'mine' | 'callbridge') => {
    if (v === 'callbridge') {
      setPicked(v);
      if (enabled) onChange({ useOwnCallerId: false });
    } else if (verified) {
      setPicked(v);
      if (!enabled) onChange({ useOwnCallerId: true });
    } else if (!busy) void verify();
  };

  return (
    <>
      <Row
        label="Calls show"
        sub={
          busy
            ? 'Verifying your number…'
            : shown === 'mine'
              ? `Your number, ${displayPhone(me.phone)}, so friends know it's you`
              : verified
                ? "CallBridge's number. Friends may not pick up a stranger's call."
                : "CallBridge's number. Pick My number to verify yours once."
        }
        right={busy ? <ActivityIndicator size="small" color={color.blue} /> : undefined}
        below={
          <Segmented
            options={[
              { value: 'mine', label: 'My number' },
              { value: 'callbridge', label: "CallBridge's" },
            ]}
            value={shown}
            onChange={pick}
          />
        }
      />
      {code ? (
        <View style={s.code}>
          <Text style={type.small}>Twilio is calling {displayPhone(me.phone)} now. When it asks, type this code on the keypad:</Text>
          <Text style={s.digits}>{code}</Text>
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  code: { backgroundColor: color.blueTint, borderRadius: 16, padding: 14, gap: 8, marginBottom: 10 },
  digits: { fontFamily: font.mono, fontSize: 30, letterSpacing: 6, color: color.ink, textAlign: 'center' },
});
