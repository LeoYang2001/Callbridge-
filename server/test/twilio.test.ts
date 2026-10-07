import { describe, expect, it } from 'vitest';
import { TwilioTelephony } from '../src/providers/telephony/twilio';

const TRIAL_ERROR = 'Invalid or disallowed parameters provided - trial accounts have limited parameter access, upgrade your account to unlock full functionality';

/** Fake Twilio client whose calls.create rejects options a Limited trial account disallows. */
function fakeClient(disallowed: (opts: Record<string, unknown>) => boolean, otherError?: string) {
  const seen: Record<string, unknown>[] = [];
  const client = {
    calls: Object.assign((sid: string) => ({ fetch: async () => ({ sid, status: 'ringing' }) }), {
      create: async (opts: Record<string, unknown>) => {
        seen.push(opts);
        if (otherError) throw new Error(otherError);
        if (disallowed(opts)) throw new Error(TRIAL_ERROR);
        return { sid: `CA${seen.length}` };
      },
    }),
  };
  return { client: client as never, seen };
}

const opts = { accountSid: 'AC1', authToken: 't', fromNumber: '+15555550100', publicBaseUrl: 'https://x.trycloudflare.com' };
const params = { callId: 'c1', to: '+14155550123', streamToken: 'tok', maxDurationSeconds: 600 };

describe('TwilioTelephony call setup fallbacks', () => {
  it('uses the full setup when Twilio accepts it', async () => {
    const { client, seen } = fakeClient(() => false);
    const t = new TwilioTelephony(opts, client);
    expect(await t.placeCall(params)).toEqual({ providerCallId: 'CA1' });
    expect(seen[0]).toMatchObject({ timeLimit: 600, statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'] });
    expect(String(seen[0]!.twiml)).toContain('<Parameter name="token" value="tok"/>');
  });

  it('falls back step by step on trial restrictions and remembers what worked', async () => {
    const logs: string[] = [];
    const { client, seen } = fakeClient((o) => 'twiml' in o || 'statusCallbackEvent' in o);
    const t = new TwilioTelephony(opts, client, (m) => logs.push(m));
    await t.placeCall(params);
    expect(seen).toHaveLength(4);
    expect(seen[3]).toMatchObject({ url: 'https://x.trycloudflare.com/twilio/twiml?callId=c1', statusCallback: expect.any(String) });
    expect(seen[3]).not.toHaveProperty('statusCallbackEvent');
    expect(logs.at(-1)).toContain('completion callback only');
    // The next call goes straight to the setup that worked.
    await t.placeCall({ ...params, callId: 'c2' });
    expect(seen).toHaveLength(5);
  });

  it('explains when every setup is rejected, and does not retry other errors', async () => {
    const rejectAll = new TwilioTelephony(opts, fakeClient(() => true).client);
    await expect(rejectAll.placeCall(params)).rejects.toThrow(/upgrade the account to Full access/);
    const other = fakeClient(() => false, 'The number +1415 is unverified');
    await expect(new TwilioTelephony(opts, other.client).placeCall(params)).rejects.toThrow(/unverified/);
    expect(other.seen).toHaveLength(1);
  });

  it('reads call state for polling', async () => {
    const t = new TwilioTelephony(opts, fakeClient(() => false).client);
    expect(await t.getCallState('CA9')).toBe('ringing');
  });
});
