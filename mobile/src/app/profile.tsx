import { router } from 'expo-router';
import { Alert } from 'react-native';
import { LANGUAGES } from '@shared/languages';
import { displayPhone } from '@shared/phone';
import { useProfile } from '@/hooks/useProfile';
import { Body, Button, Card, Choice, Label, Screen, Title } from '@/ui/placeholder';

/** What the assistant knows about the user: built by talking, added to by every call. */
export default function Profile() {
  const { me, profile, update, signOut, deleteAccount } = useProfile();

  return (
    <Screen>
      <Title>{profile.name || 'Your profile'}</Title>
      <Body muted>{displayPhone(me.phone)}</Body>
      <Button title="Update by talking" onPress={() => router.push({ pathname: '/intake', params: { mode: 'profile' } })} />

      <Label>I speak</Label>
      <Choice options={LANGUAGES} value={profile.preferredLanguage} onChange={(preferredLanguage) => void update({ preferredLanguage })} />

      <Card>
        <Label>Time zone</Label>
        <Body>{profile.timezone}</Body>
        {profile.pronouns ? <><Label>Pronouns</Label><Body>{profile.pronouns}</Body></> : null}
        {profile.usualAvailability.length > 0 && (
          <>
            <Label>Usually free</Label>
            {profile.usualAvailability.map((w, i) => <Body key={i}>{w.days.join(', ')} {w.start}–{w.end}</Body>)}
          </>
        )}
        {profile.shareable.length > 0 && (
          <>
            <Label>OK to share on calls</Label>
            {profile.shareable.map((f) => <Body key={f.label}>{f.label}: {f.value}</Body>)}
          </>
        )}
        {profile.preferences.length > 0 && (
          <>
            <Label>Preferences</Label>
            {profile.preferences.map((p) => <Body key={p}>• {p}</Body>)}
          </>
        )}
        {profile.appointments.length > 0 && (
          <>
            <Label>Upcoming</Label>
            {profile.appointments.map((a) => <Body key={a.id}>{a.date} {a.time} · {a.with}</Body>)}
          </>
        )}
      </Card>

      <Button kind="plain" title="Sign out" onPress={signOut} />
      <Button
        kind="danger"
        title="Delete my account"
        onPress={() =>
          Alert.alert('Delete your account?', 'Your profile, phone book and call history are deleted. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void deleteAccount() },
          ])
        }
      />
    </Screen>
  );
}
