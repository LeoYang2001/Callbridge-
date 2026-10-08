import { LANGUAGES } from '@shared/languages';
import { useSignIn } from '@/hooks/useSignIn';
import { Body, Button, Choice, ErrorText, Field, Screen, Title } from '@/ui/placeholder';

export default function SignIn() {
  const f = useSignIn();
  return (
    <Screen>
      <Title>CallBridge</Title>
      <Body muted>Tell the assistant who to call in your language. It makes the call for you.</Body>
      {f.step === 'phone' ? (
        <>
          <Field label="Your mobile number (+1)" value={f.phone} onChangeText={f.setPhone} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder="(901)-455-3148" />
          <Body muted>I speak</Body>
          <Choice options={LANGUAGES} value={f.language} onChange={f.setLanguage} />
          <Button title="Text me a code" onPress={f.sendCode} disabled={!f.phoneComplete} busy={f.busy} />
        </>
      ) : (
        <>
          <Body>We texted a code to +1 {f.phone}.</Body>
          <Field label="6-digit code" value={f.code} onChangeText={f.setCode} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" autoFocus />
          <Button title="Sign in" onPress={f.verify} disabled={f.code.length !== 6} busy={f.busy} />
          <Button title="Use a different number" kind="plain" onPress={f.changeNumber} />
        </>
      )}
      <ErrorText>{f.error}</ErrorText>
    </Screen>
  );
}
