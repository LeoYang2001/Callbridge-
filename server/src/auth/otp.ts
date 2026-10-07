import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import twilio from 'twilio';

/** Sends and checks one-time sign-in codes for a phone number. */
export interface OtpSender {
  readonly channel: 'sms' | 'log';
  send(phone: string): Promise<void>;
  check(phone: string, code: string): Promise<boolean>;
}

/**
 * Twilio Verify: Twilio sends the SMS (no A2P 10DLC registration needed for it) and checks the
 * code. About $0.05 per verification.
 */
export class TwilioVerifyOtp implements OtpSender {
  readonly channel = 'sms' as const;
  private readonly client: ReturnType<typeof twilio>;

  constructor(
    accountSid: string,
    authToken: string,
    private readonly serviceSid: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async send(phone: string) {
    await this.client.verify.v2.services(this.serviceSid).verifications.create({ to: phone, channel: 'sms' });
  }

  async check(phone: string, code: string) {
    try {
      const result = await this.client.verify.v2.services(this.serviceSid).verificationChecks.create({ to: phone, code });
      return result.status === 'approved';
    } catch {
      // Twilio answers 404 once a verification has expired or been used.
      return false;
    }
  }
}

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const hash = (s: string) => createHash('sha256').update(s).digest();

/**
 * For testing without SMS: the code is printed in the server log (only the laptop owner sees
 * it). Never use this on a server other people can reach.
 */
export class LogOtp implements OtpSender {
  readonly channel = 'log' as const;
  private readonly codes = new Map<string, { hash: Buffer; expires: number; attempts: number }>();

  constructor(private readonly print: (message: string) => void) {}

  async send(phone: string) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.codes.set(phone, { hash: hash(code), expires: Date.now() + CODE_TTL_MS, attempts: 0 });
    this.print(`Sign-in code for ${phone}: ${code}`);
  }

  async check(phone: string, code: string) {
    const entry = this.codes.get(phone);
    if (!entry || entry.expires < Date.now() || entry.attempts >= MAX_ATTEMPTS) return false;
    entry.attempts++;
    const ok = timingSafeEqual(entry.hash, hash(code.trim()));
    if (ok) this.codes.delete(phone);
    return ok;
  }
}

/** Limits how often codes can be requested, per number and per network address. */
export class OtpRateLimit {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly perHour: number,
    private readonly now = () => Date.now(),
  ) {}

  allow(key: string): boolean {
    const hourAgo = this.now() - 3_600_000;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > hourAgo);
    if (recent.length >= this.perHour) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(this.now());
    this.hits.set(key, recent);
    return true;
  }
}
