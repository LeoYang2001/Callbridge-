import { router } from 'expo-router';
import { errandStatusText } from '@shared/client/errands';
import { displayPhone } from '@shared/phone';
import type { Errand } from '@shared/types';
import { useErrands } from '@/hooks/useErrands';
import { Body, Button, Card, ErrorText, Label, Row, Screen, Title } from '@/ui/placeholder';

/** The errand queue: what's waiting, what's being called, and how the rest went. */
export default function Errands() {
  const q = useErrands();
  return (
    <Screen>
      <Body muted>
        The assistant calls these on its own, one at a time, within calling hours. You'll get a notification if one needs you, and a summary when they're done.
      </Body>
      <ErrorText>{q.error}</ErrorText>
      {q.errands?.length === 0 && <Body muted>No errands yet. Set up a call and choose “Add to errands”.</Body>}
      {q.active.length > 0 && <Title>In the queue</Title>}
      {q.active.map((e) => (
        <ErrandCard key={e.id} e={e} action={<Button kind="danger" title="Cancel" onPress={() => void q.cancel(e.id)} />} />
      ))}
      {q.finished.length > 0 && <Title>Finished</Title>}
      {q.finished.map((e) => (
        <ErrandCard key={e.id} e={e} action={e.status !== 'done' ? <Button kind="plain" title="Try again" onPress={() => void q.retry(e.id)} /> : null} />
      ))}
    </Screen>
  );
}

function ErrandCard({ e, action }: { e: Errand; action: React.ReactNode }) {
  return (
    <Card>
      <Label>{errandStatusText(e)}</Label>
      <Body>{e.request.counterpartName || displayPhone(e.request.to)}</Body>
      <Body muted>{e.request.taskInUserLanguage || e.request.instructions}</Body>
      {e.outcome ? <Body>{e.outcome}</Body> : null}
      <Row>
        {e.callId && (
          <Button kind="plain" title={e.status === 'calling' ? 'Open live call' : 'See the call'} onPress={() => router.push({ pathname: '/call/[id]', params: { id: e.callId! } })} />
        )}
        {action}
      </Row>
    </Card>
  );
}
