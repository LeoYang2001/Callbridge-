import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { requestToDraft } from '@shared/intake';
import { displayPhone } from '@shared/phone';
import { REALTIME_VOICES, type IntakeDraft } from '@shared/types';
import { useIntake } from '@/hooks/useIntake';
import { useIntakeContext } from '@/hooks/useIntakeContext';
import { usePhoneBook } from '@/hooks/usePhoneBook';
import { usePreferences } from '@/hooks/usePreferences';
import { useProfile } from '@/hooks/useProfile';
import { useStartCall } from '@/hooks/useStartCall';
import { getCall } from '@/lib/api';
import { useSignedIn } from '@/lib/session';
import { Body, Button, Card, Choice, ErrorText, Field, Label, Row, Screen, Title } from '@/ui/placeholder';

const STATUS_TEXT = {
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking…',
  searching: 'Looking it up…',
  speaking: 'Speaking',
  ended: 'Ended',
  error: 'Disconnected',
} as const;

const TIER_TEXT = { allowed: 'Allowed', limited: 'Allowed with limits', refused: 'Not allowed' } as const;

/**
 * Talking (or typing) to the assistant in the user's language: to set up a call, to follow up on
 * one (?followUp=<callId>), to call someone from the phone book (?contact=<id>), or the profile
 * interview (?mode=profile).
 */
export default function IntakeRoute() {
  const params = useLocalSearchParams<{ mode?: string; followUp?: string; contact?: string }>();
  const { conn, me } = useSignedIn();
  const { callSeed } = usePhoneBook();
  const [followUp, setFollowUp] = useState<{ callId: string; draft: IntakeDraft; headline?: string } | null | undefined>(params.followUp ? undefined : null);

  // Following up: load the finished call so the assistant starts from its request.
  useEffect(() => {
    if (!params.followUp) return;
    getCall(conn, params.followUp).then(
      (r) => setFollowUp({ callId: r.id, draft: requestToDraft(r.request), headline: r.result?.headlineInUserLanguage }),
      () => setFollowUp(null),
    );
  }, [conn, params.followUp]);

  if (followUp === undefined) return <Screen><Body muted>Loading the call…</Body></Screen>;
  const contact = params.contact ? me.profile.contacts.find((c) => c.id === params.contact) : undefined;
  return <Intake mode={params.mode === 'profile' ? 'profile' : 'call'} followUp={followUp ?? undefined} seed={contact ? callSeed(contact) : undefined} />;
}

function Intake({ mode, followUp, seed }: { mode: 'call' | 'profile'; followUp?: { callId: string; draft: IntakeDraft; headline?: string }; seed?: { draft: IntakeDraft; text: string } }) {
  const prefs = usePreferences();
  const context = useIntakeContext(prefs.voice);
  const intake = useIntake({ context, mode, followUp, seed });
  const { finishOnboarding } = useProfile();
  const [text, setText] = useState('');

  const send = () => {
    void intake.say(text);
    setText('');
  };

  return (
    <Screen>
      <Title>{mode === 'profile' ? "Let's get to know you" : followUp ? 'How did it go?' : 'Who should I call?'}</Title>
      <Body muted>
        {mode === 'profile'
          ? 'A few quick questions so future calls need fewer. Every question is optional.'
          : followUp
            ? "Tap the mic and I'll tell you the result. Ask me anything about the call, or have me call again."
            : `Tell me in ${context.userLanguage}: who to call, what you need, and when you're free.`}
      </Body>
      {followUp?.headline ? <Card><Body>{followUp.headline}</Body></Card> : null}

      {!intake.live && (
        <>
          <Label>Voice (the assistant and the call)</Label>
          <Choice options={REALTIME_VOICES} value={context.voice ?? 'marin'} onChange={prefs.setVoice} />
        </>
      )}

      <Button
        title={!intake.live ? (intake.hasDraft ? 'Tap to keep talking' : 'Tap to talk') : intake.micOn ? `Mic on · ${STATUS_TEXT[intake.status!]}` : 'Mic off'}
        onPress={intake.toggleMic}
        disabled={intake.status === 'connecting'}
      />
      {intake.live && (
        <Row>
          <Button kind="plain" title={intake.speakerOn ? 'Sound on' : 'Sound off'} onPress={intake.toggleSpeaker} />
          <Button kind="plain" title="End conversation" onPress={intake.stop} />
        </Row>
      )}
      <ErrorText>{intake.error}</ErrorText>

      {intake.lines.map((l) => (
        <Body key={l.id} muted={l.role === 'assistant'}>
          {l.role === 'user' ? 'You: ' : 'Assistant: '}
          {l.text}
        </Body>
      ))}

      <Field label="Or type" value={text} onChangeText={setText} onSubmitEditing={send} returnKeyType="send" placeholder="Type a message" />

      {intake.research && (
        <Card>
          <Body>{intake.research.answer}</Body>
          {intake.research.places.map((p) => (
            <Body key={p.phone ?? p.name} muted>
              {p.name} · {p.phone ? displayPhone(p.phone) : 'no number'}
              {p.inPhoneBookAs ? ` · in your phone book as ${p.inPhoneBookAs}` : ''}
              {p.verified ? '' : ' · unverified'}
            </Body>
          ))}
        </Card>
      )}

      {mode === 'profile' ? (
        <Button
          kind={intake.ready ? 'primary' : 'plain'}
          title={intake.ready ? 'Done' : 'Skip for now'}
          onPress={async () => {
            intake.stop();
            await finishOnboarding();
            router.back();
          }}
        />
      ) : (
        <Review draft={intake.draft} check={intake.check} canReview={intake.canReview} onStarted={intake.stop} />
      )}
    </Screen>
  );
}

/** What will be called and said, the server's ruling, stay-in-the-loop or hand off, and Start. */
function Review({ draft, check, canReview, onStarted }: { draft: IntakeDraft; check: ReturnType<typeof useIntake>['check']; canReview: boolean; onStarted: () => void }) {
  const prefs = usePreferences();
  const context = useIntakeContext(prefs.voice);
  const { buildRequest, start, submitting, error } = useStartCall();
  if (!canReview) return null;
  const ruling = check?.review;
  const refused = ruling?.tier === 'refused';

  return (
    <Card>
      <Label>Calling</Label>
      <Body>
        {draft.counterpartName || 'Unknown'} · {draft.phoneNumber ? displayPhone(`+1${draft.phoneNumber.replace(/\D/g, '').slice(-10)}`) : ''}
      </Body>
      <Label>To</Label>
      <Body>{draft.taskInUserLanguage || draft.task}</Body>
      <Label>In</Label>
      <Body>{draft.callLanguage || 'English'}</Body>
      {ruling && (
        <Body muted>
          {TIER_TEXT[ruling.tier]}
          {ruling.reasonInUserLanguage ? ` · ${ruling.reasonInUserLanguage}` : ''}
        </Body>
      )}
      {check?.problems.map((p) => <ErrorText key={p}>{p}</ErrorText>)}
      <Label>During the call</Label>
      <Choice
        options={['supervised', 'handoff'] as const}
        value={prefs.involvement}
        onChange={prefs.setInvolvement}
        labels={{ supervised: 'Keep me in the loop', handoff: 'Hand it off' }}
      />
      <Body muted>
        {prefs.involvement === 'supervised'
          ? 'If they ask for something outside what you agreed, the assistant puts them on hold and asks you here.'
          : 'The assistant never holds the line for you. Anything outside what you agreed is declined for you to follow up on.'}
      </Body>
      <Button
        title="Start call"
        busy={submitting}
        disabled={refused}
        onPress={async () => {
          const created = await start(buildRequest(draft, context, prefs.involvement));
          if (!created) return;
          onStarted();
          router.replace({ pathname: '/call/[id]', params: { id: created.id } });
        }}
      />
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
