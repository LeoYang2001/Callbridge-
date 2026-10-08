import { afterEach, describe, expect, it, vi } from 'vitest';
import { newCallRecord } from '../src/calls/callSession';
import { ExpoPush, finishedNotification, questionNotification } from '../src/push/push';
import { dentistRequest } from './fixtures';

describe('push notifications', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says who is holding and asks the question in the user's language", () => {
    const record = newCallRecord('c1', { ...dentistRequest(), counterpartName: 'Bright Smile Dental' });
    const n = questionNotification(record, { id: 'q1', askedAt: 0, expiresAt: 60_000, category: 'additional_cost', question: 'Add an $80 X-ray?', questionInUserLanguage: '要加 80 美元的 X 光吗？', status: 'pending' });
    expect(n).toEqual({ title: 'Bright Smile Dental is on hold', body: '要加 80 美元的 X 光吗？', data: { kind: 'question', callId: 'c1', questionId: 'q1' } });
  });

  it('reports a finished call by its headline, and a failed one by its reason', () => {
    const record = newCallRecord('c1', dentistRequest());
    record.status = 'failed';
    record.failureReason = 'The line was busy.';
    expect(finishedNotification(record)).toMatchObject({ body: 'The line was busy.', data: { kind: 'failed' } });
  });

  it('sends through Expo and returns tokens that are no longer registered', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] })));
    vi.stubGlobal('fetch', fetch);
    const msg = { title: 't', body: 'b', data: { kind: 'finished' as const, callId: 'c1' } };
    const dead = await new ExpoPush().send([{ ...msg, to: 'ExpoPushToken[a]' }, { ...msg, to: 'ExpoPushToken[b]' }]);
    expect(dead).toEqual(['ExpoPushToken[b]']);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(JSON.parse(init.body as string)[0]).toMatchObject({ to: 'ExpoPushToken[a]', priority: 'high', channelId: 'calls' });
  });
});
