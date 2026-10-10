import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addToCalendar, destinationOf, openDirections } from '@/lib/afterCall';
import { haptic } from '@/lib/haptics';
import type { CallRecord } from '@shared/types';
import { color, type } from '@/theme/tokens';
import { PillButton } from '@/ui/Button';
import { outcomeOf } from './outcome';

/** The result: what happened in one line, the details as bullets, and what to do next. */
export function Result({
  call,
  english,
  onDone,
  onTryAgain,
  onTalk,
  onTranscript,
  retrying,
}: {
  call: CallRecord;
  english: boolean;
  onDone: () => void;
  onTryAgain: () => void;
  onTalk: () => void;
  onTranscript: () => void;
  retrying: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const destination = destinationOf(call);
  const r = call.result;
  const o = outcomeOf(call);
  const headline = r?.headlineInUserLanguage || r?.summaryInUserLanguage || call.failureReason || 'The call ended.';
  const bullets: { text: string; dot: string }[] = [];
  if (r?.appointment) {
    bullets.push({
      text: `${r.appointment.date} ${r.appointment.time}${r.appointment.notes ? ` · ${r.appointment.notes}` : ''}${r.appointmentConfirmedByCounterpart === false ? ' (not confirmed by them yet)' : ''}`,
      dot: r.appointmentConfirmedByCounterpart === false ? color.amberGlow : color.green,
    });
  }
  for (const step of r?.nextStepsInUserLanguage ?? []) bullets.push({ text: step, dot: color.blue });
  for (const q of r?.unresolvedQuestions ?? []) bullets.push({ text: q, dot: color.amberGlow });
  if (!r && call.failureReason && call.failureReason !== headline) bullets.push({ text: call.failureReason, dot: color.amberGlow });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 30, gap: 12 }}>
        <Text style={[type.label, { color: o.tint }]}>{o.label}</Text>
        <Text style={type.headline}>{headline}</Text>
        {!english && r?.summary && r.summary !== headline ? (
          <Text style={[type.sub, { fontSize: 15 }]} numberOfLines={3}>
            {r.summary}
          </Text>
        ) : null}
        <View style={{ gap: 10, marginTop: 8 }}>
          {bullets.slice(0, 5).map((b, i) => (
            <View key={i} style={s.bullet}>
              <View style={[s.dot, { backgroundColor: b.dot }]} />
              <Text style={[type.callout, { flex: 1, lineHeight: 22 }]}>{b.text}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: 22, gap: 10 }}>
        {note ? <Text style={[type.small, { color: color.redText, textAlign: 'center' }]}>{note}</Text> : null}
        {o.good && r?.appointment ? (
          <PillButton
            title={added ? 'Added to calendar' : 'Add to calendar'}
            disabled={added}
            onPress={async () => {
              const err = await addToCalendar(call);
              setNote(err);
              if (!err) {
                setAdded(true);
                haptic.success();
              }
            }}
          />
        ) : o.good ? (
          <PillButton title="Done" onPress={onDone} />
        ) : (
          <PillButton title="Try again" onPress={onTryAgain} busy={retrying} />
        )}
        {o.good && destination ? <PillButton title="Get directions" kind="white" height={50} onPress={() => void openDirections(destination)} /> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PillButton title="Talk it over" kind="white" height={50} onPress={onTalk} style={{ flex: 1 }} />
          <PillButton title="Transcript" kind="white" height={50} onPress={onTranscript} style={{ flex: 1 }} />
        </View>
        {/* Always a way out: Done is the main button only on a plain good result. */}
        {o.good && !r?.appointment ? null : <PillButton title="Done" kind="ghost" height={44} onPress={onDone} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bullet: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
});
