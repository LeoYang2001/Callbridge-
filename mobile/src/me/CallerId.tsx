import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { displayPhone } from '@shared/phone';
import { callerIdStatus, getMe, startCallerId } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useSignedIn } from '@/lib/session';
import { color, font, type } from '@/theme/tokens';
import { Row } from '@/ui/Rows';
import { Toggle } from '@/ui/Toggle';
import { useToast } from '@/ui/Toast';

/**
 * Calls from your own number (so friends recognize it), once it's verified: Twilio calls you and
 * you type the code shown here on the keypad. The server records the verification; the switch
 * here only turns it on and off.
 */
export function CallerIdRow({ onChange }: { onChange: (patch: Record<string, unknown>) => void }) {
  const { conn, me, setMe } = useSignedIn();
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const polling = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const verified = Boolean(me.profile.callerIdVerifiedAt);
  const enabled = verified && me.profile.useOwnCallerId !== false;

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

  if (verified) {
    return (
      <Row
        label="Call from my number"
        sub={enabled ? `Calls show ${displayPhone(me.phone)}, so friends know it's you` : "Calls show CallBridge's number"}
        right={<Toggle label="Call from my number" value={enabled} onChange={(useOwnCallerId) => onChange({ useOwnCallerId })} />}
      />
    );
  }
  return (
    <>
      <Row
        label="Call from my number"
        sub="Friends see your number instead of a stranger's"
        value={busy ? undefined : 'Set up'}
        onPress={busy ? undefined : () => void verify()}
        right={busy ? <ActivityIndicator size="small" color={color.blue} /> : undefined}
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
