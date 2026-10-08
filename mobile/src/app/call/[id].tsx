import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { displayPhone } from '@shared/phone';
import type { UserQuestion } from '@shared/types';
import { useCall, useListen } from '@/hooks/useCall';
import { Body, Button, Card, ErrorText, Field, Label, Row, Screen, Title } from '@/ui/placeholder';

/**
 * One call: live (status, transcript with translations, the assistant's questions, a message box,
 * listen in, hang up) and then its result. Notifications open this screen.
 */
export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCall(id);
  const listen = useListen(id);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const call = c.call;

  if (!call) return <Screen><Body muted>{c.error ?? 'Loading…'}</Body></Screen>;
  const them = call.request.counterpartName || displayPhone(call.request.to);
  const result = call.result;

  return (
    <Screen>
      <Title>{them}</Title>
      <Body muted>
        {call.status}
        {call.request.involvement === 'handoff' ? ' · handed off' : ''}
      </Body>
      <ErrorText>{c.error ?? note}</ErrorText>

      {c.live && (
        <Row>
          <Button kind="plain" title={listen.listening ? 'Stop listening' : 'Listen live'} busy={listen.starting} onPress={listen.toggle} />
          <Button kind="danger" title="Hang up" onPress={async () => setNote(await c.hangUp())} />
        </Row>
      )}
      {listen.note ? <Body muted>{listen.note}</Body> : null}

      {c.pending.map((q) => (
        <Question key={q.id} q={q} them={them} onAnswer={c.answer} />
      ))}

      {c.live && call.request.involvement !== 'handoff' && (
        <>
          <Field label="Tell the assistant something" value={message} onChangeText={setMessage} placeholder="e.g. Ask if Saturday works" />
          <Button
            kind="plain"
            title="Send"
            disabled={!message.trim()}
            onPress={async () => {
              const err = await c.message(message.trim());
              setNote(err);
              if (!err) setMessage('');
            }}
          />
        </>
      )}

      {result && (
        <Card>
          <Label>Result</Label>
          <Body>{result.headlineInUserLanguage || result.summaryInUserLanguage}</Body>
          {result.appointment && (
            <Body>
              {result.appointment.date} {result.appointment.time}
              {result.appointmentConfirmedByCounterpart === false ? ' (not confirmed by them yet)' : ''}
            </Body>
          )}
          {result.nextStepsInUserLanguage?.map((step) => <Body key={step}>• {step}</Body>)}
          <Body muted>{result.summaryInUserLanguage}</Body>
          <Button title="Follow up" onPress={() => router.push({ pathname: '/intake', params: { followUp: call.id } })} />
        </Card>
      )}
      {call.status === 'failed' && !result && <ErrorText>{call.failureReason}</ErrorText>}

      <Label>Transcript</Label>
      {call.transcript.map((t) => (
        <Body key={t.id} muted={t.speaker !== 'counterpart'}>
          {t.speaker === 'counterpart' ? `${them}: ` : t.speaker === 'assistant' ? 'Assistant: ' : ''}
          {t.translation ?? t.text}
        </Body>
      ))}
    </Screen>
  );
}

/** The other party is on hold until the user answers here or time runs out. */
function Question({ q, them, onAnswer }: { q: UserQuestion; them: string; onAnswer: ReturnType<typeof useCall>['answer'] }) {
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const secondsLeft = Math.max(0, Math.round((q.expiresAt - Date.now()) / 1000));
  const answer = async (a: Parameters<typeof onAnswer>[1]) => {
    setBusy(true);
    setError(await onAnswer(q.id, a));
    setBusy(false);
  };
  return (
    <Card>
      <Label>{them} is on hold · about {secondsLeft}s left</Label>
      <Body>{q.questionInUserLanguage || q.question}</Body>
      <Row>
        <Button title="Yes" busy={busy} onPress={() => answer({ decision: 'approve' })} />
        <Button kind="plain" title="No" disabled={busy} onPress={() => answer({ decision: 'decline' })} />
      </Row>
      <Field label="Or answer" value={reply} onChangeText={setReply} />
      <Button kind="plain" title="Send answer" disabled={!reply.trim() || busy} onPress={() => answer({ decision: 'reply', text: reply.trim() })} />
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
