import { StyleSheet, Text, View } from 'react-native';
import { displayPhone } from '@shared/phone';
import type { IntakeCheckResult, IntakeDraft } from '@shared/types';
import type { Involvement } from '@/hooks/usePreferences';
import { color, font, type } from '@/theme/tokens';
import { PillButton } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Segmented } from '@/ui/Segmented';

const MODE_NOTE: Record<Involvement, string> = {
  supervised: 'The assistant asks you before agreeing to anything you haven’t allowed.',
  handoff: 'The assistant won’t interrupt you. Anything outside your limits gets politely declined.',
};

/** Review & confirm: the details, stay in the loop or hand it off, and Call now. */
export function Review({
  draft,
  check,
  userName,
  involvement,
  onInvolvement,
  onCall,
  onQueue,
  busy,
  error,
}: {
  draft: IntakeDraft;
  check: IntakeCheckResult | null;
  userName: string;
  involvement: Involvement;
  onInvolvement: (v: Involvement) => void;
  onCall: () => void;
  onQueue: () => void;
  busy: boolean;
  error: string | null;
}) {
  const digits = (draft.phoneNumber ?? '').replace(/\D/g, '');
  const number = digits.length === 10 ? displayPhone(`+1${digits}`) : draft.phoneNumber ?? '—';
  const charges = draft.maxAdditionalCostUsd ? `Up to $${draft.maxAdditionalCostUsd}` : 'Ask me first';
  const refused = check?.review?.tier === 'refused';
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 30, paddingTop: 18, gap: 4 }}>
        <Text style={type.title}>Confirm this call</Text>
        <Text style={type.small}>Check the details before the assistant dials.</Text>
      </View>
      <View style={s.card}>
        <Row label="Calling">
          <Text style={[s.value, { fontWeight: '600' }]}>{draft.counterpartName || '—'}</Text>
        </Row>
        <Row label="Number">
          <Text style={[s.value, { fontFamily: font.mono, fontSize: 13.5 }]}>{number}</Text>
        </Row>
        <Row label="Speaks">
          <Text style={s.value}>{draft.callLanguage || 'English'}</Text>
        </Row>
        <Row label="Goal">
          <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
            <Text style={[s.value, { textAlign: 'right' }]}>{draft.taskInUserLanguage || draft.task}</Text>
            {draft.taskInUserLanguage && draft.task ? (
              <Text style={[type.caption, { fontSize: 12.5, textAlign: 'right' }]} numberOfLines={3}>
                {draft.task}
              </Text>
            ) : null}
          </View>
        </Row>
        <Row label="Extra charges" last>
          <Text style={s.value}>{charges}</Text>
        </Row>
      </View>
      {check?.review?.tier === 'limited' && check.review.reasonInUserLanguage ? <Text style={[s.note, { color: color.amberText }]}>{check.review.reasonInUserLanguage}</Text> : null}
      {refused ? <Text style={[s.note, { color: color.redText }]}>{check?.review?.reasonInUserLanguage}</Text> : null}
      <View style={{ marginHorizontal: 22, marginTop: 12 }}>
        <Segmented
          options={[
            { value: 'supervised', label: 'Stay in the loop' },
            { value: 'handoff', label: 'Hand it off' },
          ]}
          value={involvement}
          onChange={onInvolvement}
        />
      </View>
      <Text style={s.note}>
        The assistant will say it's an AI calling for {userName || 'you'}. {MODE_NOTE[involvement]}
      </Text>
      <View style={{ marginTop: 'auto', paddingHorizontal: 22, gap: 10 }}>
        {error ? <Text style={[type.small, { color: color.redText }]}>{error}</Text> : null}
        <PillButton title="Call now" kind="green" height={58} onPress={onCall} busy={busy} disabled={refused} icon={<Icon name="phone" size={18} color={color.white} />} />
        <Text style={[type.caption, { textAlign: 'center', color: color.blue, fontWeight: '600' }]} onPress={refused || busy ? undefined : onQueue}>
          Add to errands instead
        </Text>
      </View>
    </View>
  );
}

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.divider]}>
      <Text style={[type.small, { fontSize: 14.5 }]} numberOfLines={1}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 22, marginTop: 16, backgroundColor: color.white, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: color.divider },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: color.divider },
  value: { ...type.callout, fontSize: 14.5, flexShrink: 1 },
  note: { ...type.caption, fontSize: 12.5, lineHeight: 19, marginHorizontal: 30, marginTop: 12 },
});
