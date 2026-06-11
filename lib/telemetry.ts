// RUM config core (C0FFEE-55) — pure: (hostname, version) → config | null.
//
// The entire telemetry posture lives in this one function (ADR-0008), pinned by
// lib/telemetry.test.ts: anonymous, replay-less, production-only. Any hostname
// other than the production apex — localhost, vite preview, GH Pages previews,
// forks — gets `null`: sends nothing, bills nothing, pollutes nothing.

import type { RumInitConfiguration } from '@datadog/browser-rum-slim';

/** The only hostname that ever sends telemetry (ADR-0008): the apex, exactly. */
const PRODUCTION_HOSTNAME = 'c0ffee.cafe';

export function rumConfig(
  hostname: string,
  version: string,
): RumInitConfiguration | null {
  if (hostname !== PRODUCTION_HOSTNAME) return null;

  return {
    // The c0ffee RUM application (org on us1). These are public-by-design
    // browser values — they ship in the served bundle on every Datadog
    // customer's site — so they live in source, not in secret management.
    applicationId: '21c421d5-47be-4d91-8a6c-5a390bdf889b',
    clientToken: 'pub4e1c267ca2480cbf9b02b24f616c28ae',
    site: 'datadoghq.com',
    service: 'c0ffee',
    env: 'production', // only production ever inits, so no other env exists
    version,
    // Anonymous, no-banner posture: full sampling (traffic is small), Session
    // Replay 0 (also absent from the slim bundle by package choice), inputs
    // masked. No user identity is ever set.
    sessionSampleRate: 100,
    sessionReplaySampleRate: 0,
    defaultPrivacyLevel: 'mask-user-input',
    // Out-of-box collection only: interactions, resources, long tasks.
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
  };
}
