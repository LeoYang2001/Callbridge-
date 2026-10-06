import type { CallRecord, CallRequest, PolicyDecision, Weekday } from '../../shared/types';
import { WEEKDAYS } from '../../shared/types';

/**
 * Demo mode: plays a scripted dentist call in the browser so the whole UI can be tried on a
 * phone without a server, Twilio or OpenAI. Nothing is dialed.
 */

const DAY_NAME: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
const ZH_DAY: Record<Weekday, string> = { mon: '周一', tue: '周二', wed: '周三', thu: '周四', fri: '周五', sat: '周六', sun: '周日' };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const spoken = (hhmm: string) => {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekday = (d: Date) => WEEKDAYS[(d.getDay() + 6) % 7]!;

/** First allowed slot in the next two weeks: 90 minutes after a window opens. */
function pickSlot(req: CallRequest) {
  const w = req.constraints.availability.find((x) => x.days.length > 0);
  if (!w) return null;
  const startMin = Math.min(toMin(w.start) + 90, toMin(w.end) - 30);
  const time = toHHMM(Math.max(toMin(w.start), Math.round(startMin / 30) * 30));
  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (w.days.includes(weekday(d))) return { date: ymd(d), day: weekday(d), time };
  }
  return null;
}

/** A day the user is NOT available, for the assistant to decline. */
function pickBadDay(req: CallRequest): Weekday {
  const allowed = new Set(req.constraints.availability.flatMap((w) => w.days));
  return (['fri', 'mon', 'tue', 'sat'] as Weekday[]).find((d) => !allowed.has(d)) ?? 'sun';
}

export function simulateCall(req: CallRequest, onUpdate: (r: CallRecord) => void): () => void {
  const name = req.user.name.trim() || 'the caller';
  const lang = req.user.preferredLanguage || 'another language';
  const zh = /chinese|mandarin|cantonese|中文/i.test(lang);
  const slot = pickSlot(req);
  const bad = pickBadDay(req);
  const t0 = Date.now();

  const rec: CallRecord = {
    id: `demo-${t0}`,
    createdAt: t0,
    updatedAt: t0,
    status: 'preparing',
    request: req,
    providerCallId: 'DEMO',
    transcript: [],
    decisions: [],
    commitments: [],
    unresolvedQuestions: [],
    metrics: { turnLatenciesMs: [], interruptions: 0, toolCalls: 0 },
    events: [],
  };

  const timers: number[] = [];
  let n = 0;
  const emit = () => {
    rec.updatedAt = Date.now();
    onUpdate(structuredClone(rec));
  };
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => (fn(), emit()), ms));
  const log = (type: string, detail?: string) => rec.events.push({ at: Date.now(), type, detail });
  const say = (ms: number, speaker: 'assistant' | 'counterpart', text: string) => {
    const id = `t${n++}`;
    at(ms, () => {
      rec.transcript.push({ id, speaker, text: '', at: Date.now(), pending: true });
      if (speaker === 'assistant') rec.metrics.turnLatenciesMs.push(550 + Math.round(Math.random() * 350));
    });
    at(ms + 900, () => {
      const e = rec.transcript.find((x) => x.id === id)!;
      e.text = text;
      e.pending = false;
    });
  };
  const decide = (ms: number, d: Omit<PolicyDecision, 'id' | 'at'>) =>
    at(ms, () => {
      rec.decisions.push({ ...d, id: `d${n++}`, at: Date.now() });
      rec.metrics.toolCalls++;
      log('ai.tool_call', `${d.tool} ${d.request}`);
    });
  const status = (ms: number, s: CallRecord['status']) => at(ms, () => ((rec.status = s), log('call.status', s)));

  status(0, 'preparing');
  status(900, 'dialing');
  at(900, () => (rec.metrics.dialedAt = Date.now()));
  at(3600, () => {
    rec.status = 'connected';
    rec.metrics.answeredAt = Date.now();
    log('call.status', 'connected');
  });

  say(4200, 'counterpart', 'Thank you for calling Smile Dental, this is Maria. How can I help you?');
  status(4300, 'in_progress');
  at(5400, () => (rec.metrics.firstAssistantAudioAt = Date.now()));
  say(5400, 'assistant', `Hi Maria, I'm ${name}'s AI language assistant. I'm calling on ${name}'s behalf because ${name} primarily speaks ${lang}. I'd like to schedule a teeth cleaning.`);
  say(9800, 'counterpart', 'Oh, okay. Am I talking to a real person?');
  say(11600, 'assistant', `No, I'm an AI assistant authorized by ${name} to help communicate in English. If something needs ${name}'s approval, I'll confirm it with them.`);

  if (!slot) {
    say(15500, 'counterpart', 'Sure, what days work?');
    say(17200, 'assistant', `I'm sorry, I don't have ${name}'s availability yet. I'll need to confirm it with ${name} and call back. Thank you, goodbye!`);
    at(19500, () => (rec.unresolvedQuestions.push('Which days and times are you available?'), (rec.endReason = 'needs_user_follow_up')));
  } else {
    const dayName = DAY_NAME[slot.day];
    say(15500, 'counterpart', `Let me see… I have ${DAY_NAME[bad]} at 10 AM, or ${dayName} at ${spoken(slot.time)}.`);
    decide(16700, { tool: 'check_appointment_slot', request: `${DAY_NAME[bad]} 10:00`, category: 'schedule', outcome: 'rejected', reason: `${DAY_NAME[bad]} is outside ${name}'s availability.` });
    decide(16900, { tool: 'check_appointment_slot', request: `${slot.date} ${slot.time}`, category: 'schedule', outcome: 'accepted', reason: `${dayName} at ${spoken(slot.time)} is within ${name}'s availability.` });
    say(17300, 'assistant', `${DAY_NAME[bad]} morning doesn't work for ${name}, but ${dayName} at ${spoken(slot.time)} would be great.`);
    say(20600, 'counterpart', "Perfect. Would they also like a full set of X-rays while they're here? That's $80 extra.");
    decide(21800, {
      tool: 'request_decision',
      request: 'Add a full set of X-rays for $80?',
      category: 'additional_cost',
      outcome: req.constraints.maxAdditionalCostUsd >= 80 ? 'authorized' : 'requires_user_approval',
      reason: req.constraints.maxAdditionalCostUsd >= 80 ? `Within the $${req.constraints.maxAdditionalCostUsd} limit.` : `$80 exceeds what ${name} authorized ($${req.constraints.maxAdditionalCostUsd}).`,
    });
    at(21800, () => {
      if (req.constraints.maxAdditionalCostUsd < 80) rec.unresolvedQuestions.push('Add a full set of X-rays for $80?');
    });
    say(22300, 'assistant', `I'm not able to agree to that without checking with ${name} first, so just the cleaning for now, please.`);
    say(25800, 'counterpart', "No problem. Do you have their insurance member ID?");
    decide(27000, { tool: 'request_decision', request: 'Insurance member ID?', category: 'information_not_provided', outcome: 'unknown_information', reason: `${name} did not provide this information.` });
    at(27000, () => rec.unresolvedQuestions.push('Insurance member ID?'));
    say(27400, 'assistant', `I don't have that information. I'll need to confirm it with ${name}.`);
    say(30200, 'counterpart', `That's fine, they can bring the card. You're all set for ${dayName} at ${spoken(slot.time)}.`);
    at(31200, () => {
      rec.decisions.push({ id: `d${n++}`, at: Date.now(), tool: 'confirm_agreement', request: 'Teeth cleaning', category: 'appointment', outcome: 'accepted', reason: 'Within authorized constraints.' });
      rec.commitments.push({ id: 'c1', at: Date.now(), type: 'appointment', description: 'Teeth cleaning', date: slot.date, startTime: slot.time });
      rec.metrics.toolCalls++;
    });
    say(31600, 'assistant', `Thank you, Maria! To confirm: a teeth cleaning on ${dayName} at ${spoken(slot.time)}, no additional services. Have a great day, goodbye!`);
    at(35000, () => (rec.endReason = 'objective_completed'));
  }

  const endAt = slot ? 35200 : 19800;
  at(endAt, () => {
    rec.status = 'analyzing';
    rec.metrics.endedAt = Date.now();
    log('call.status', 'analyzing');
  });
  at(endAt + 2200, () => {
    const apt = rec.commitments[0];
    const when = apt ? `${DAY_NAME[slot!.day]} ${apt.date} at ${spoken(apt.startTime!)}` : '';
    const summary = apt
      ? `Teeth cleaning booked for ${when}. The office offered $80 X-rays, which the assistant declined pending ${name}'s decision. They asked for the insurance member ID, which ${name} still needs to provide.`
      : `No appointment was booked because no availability was provided.`;
    const zhSummary = apt
      ? `已为您预约 ${apt.date}（${ZH_DAY[slot!.day]}）${apt.startTime} 洗牙。诊所提出加做 $80 的X光检查，助手未同意，需要您决定。诊所还需要您的保险会员号。`
      : '未能预约：您没有提供可预约的时间。';
    rec.status = 'completed';
    rec.result = {
      status: 'completed',
      success: Boolean(apt),
      objective: 'schedule_dental_cleaning',
      appointment: apt ? { date: apt.date!, time: apt.startTime!, notes: apt.description } : null,
      commitments: rec.commitments,
      additionalChargesAuthorized: false,
      unresolvedQuestions: [...rec.unresolvedQuestions],
      refusedDecisions: rec.decisions
        .filter((d) => d.outcome === 'requires_user_approval')
        .map((d) => ({ request: d.request, reason: d.reason, source: 'policy' as const })),
      followUpsForUser: apt ? ['Bring your insurance card to the appointment.', 'Decide whether you want the $80 X-rays.'] : ['Add your availability and try again.'],
      summary,
      summaryInUserLanguage: zh ? zhSummary : summary,
      policyWarnings: [],
    };
    log('call.finished', 'completed');
  });

  emit();
  return () => timers.forEach((t) => clearTimeout(t));
}
