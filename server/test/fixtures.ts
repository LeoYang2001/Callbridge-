import type { CallRequest } from '../../shared/types';

/** The Phase 0 acceptance scenario. 2026-10-06 is a Tuesday. */
export const dentistRequest = (overrides: Partial<CallRequest> = {}): CallRequest => ({
  to: '+14155550123',
  user: { name: 'Leo', preferredLanguage: 'Chinese (Mandarin)' },
  callLanguage: 'English',
  timezone: 'America/Los_Angeles',
  authorizedInfo: [
    { label: 'Phone number', value: '+1 415 555 0199' },
    { label: 'Date of birth', value: 'March 3, 1990' },
  ],
  instructions:
    'Schedule a dental cleaning for Leo. Wednesday or Thursday after 2 PM. Do not agree to additional procedures or charges.',
  constraints: {
    availability: [{ days: ['wed', 'thu'], start: '14:00', end: '18:00' }],
    maxAdditionalCostUsd: 0,
  },
  ...overrides,
});
