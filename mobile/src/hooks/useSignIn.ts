import { useState } from 'react';
import { languageFromLocale } from '@shared/languages';
import { formatUsPhone, usNationalDigits } from '@shared/phone';
import { startSignIn, verifySignIn } from '@/lib/api';
import { deviceLocale, useSession } from '@/lib/session';

/**
 * Phone-number sign-in: send a code by SMS, then verify it. The first sign-in creates the
 * account, starting in the phone's language and time zone (the profile interview can change them).
 */
export function useSignIn() {
  const { conn, signedIn } = useSession();
  const [phone, setPhoneDigits] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState(() => languageFromLocale(deviceLocale().languageTag));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const e164 = `+1${phone}`;

  return {
    /** The number as typed, formatted like (901)-455-3148; always a US number (+1). */
    phone: formatUsPhone(phone),
    setPhone: (text: string) => setPhoneDigits(usNationalDigits(text)),
    phoneComplete: phone.length === 10,
    code,
    setCode: (text: string) => setCode(text.replace(/\D/g, '').slice(0, 6)),
    language,
    setLanguage,
    step,
    busy,
    error,
    sendCode: () => run(async () => {
      await startSignIn(conn, e164);
      setStep('code');
    }),
    verify: () => run(async () => {
      await signedIn(await verifySignIn(conn, { phone: e164, code, language, timezone: deviceLocale().timezone }));
    }),
    changeNumber: () => {
      setStep('phone');
      setCode('');
      setError(null);
    },
  };
}
