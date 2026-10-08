import { Link, router } from 'expo-router';
import { RefreshControl, ScrollView } from 'react-native';
import { displayPhone } from '@shared/phone';
import { useCalls } from '@/hooks/useCalls';
import { useSignedIn } from '@/lib/session';
import { Body, Button, Card, ErrorText, Row, Title } from '@/ui/placeholder';

/** Home: start a call, and the call history. New users are sent to the profile interview first. */
export default function Home() {
  const { me } = useSignedIn();
  const { calls, error, refreshing, refresh } = useCalls();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Title>{me.profile.name ? `Hi, ${me.profile.name}` : 'Hi'}</Title>
      {!me.profile.onboarded && (
        <Card>
          <Body>A few quick questions so future calls need fewer. Every question is optional.</Body>
          <Button title="Set up my profile" onPress={() => router.push({ pathname: '/intake', params: { mode: 'profile' } })} />
        </Card>
      )}
      <Button title="New call" onPress={() => router.push('/intake')} />
      <Row>
        <Link href="/contacts">Phone book</Link>
        <Link href="/profile">Profile</Link>
      </Row>

      <Title>Calls</Title>
      <ErrorText>{error}</ErrorText>
      {calls?.length === 0 && <Body muted>No calls yet.</Body>}
      {calls?.map((c) => (
        <Card key={c.id}>
          <Link href={{ pathname: '/call/[id]', params: { id: c.id } }}>
            <Body>
              {c.counterpartName || displayPhone(c.to)} · {c.status}
            </Body>
          </Link>
          {c.headline ? <Body muted>{c.headline}</Body> : null}
          <Body muted>{new Date(c.createdAt).toLocaleString()}</Body>
        </Card>
      ))}
    </ScrollView>
  );
}
