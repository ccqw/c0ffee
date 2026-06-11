// RUM config core (C0FFEE-55) — the telemetry posture, pinned by tests.
//
// ADR-0008: telemetry is anonymous by construction and runs only on the
// production hostname. All posture values live in one pure function,
// `rumConfig(hostname, version) → config | null`, so the posture is enforced
// here rather than remembered. Production gets the full anonymous config;
// every other hostname (localhost, vite preview, GH Pages previews, forks)
// gets `null` — sends nothing, bills nothing, pollutes nothing.

import { describe, it, expect } from 'vitest';
import { rumConfig } from './telemetry.ts';

describe('rumConfig on the production hostname', () => {
  const config = rumConfig('c0ffee.cafe', '1.2.3');

  it('returns an init config', () => {
    expect(config).not.toBeNull();
  });

  it('pins the anonymous, no-replay posture (ADR-0008)', () => {
    expect(config?.sessionSampleRate).toBe(100);
    expect(config?.sessionReplaySampleRate).toBe(0);
    expect(config?.defaultPrivacyLevel).toBe('mask-user-input');
  });

  it('enables the out-of-box tracking set', () => {
    expect(config?.trackUserInteractions).toBe(true);
    expect(config?.trackResources).toBe(true);
    expect(config?.trackLongTasks).toBe(true);
  });

  it('threads the release version through, verbatim', () => {
    expect(config?.version).toBe('1.2.3');
    expect(rumConfig('c0ffee.cafe', '9.9.9')?.version).toBe('9.9.9');
  });

  it('targets the c0ffee RUM application on us1', () => {
    expect(config?.site).toBe('datadoghq.com');
    expect(config?.service).toBe('c0ffee');
    expect(config?.env).toBe('production');
    // The credentials are public-by-design browser values (ADR-0008); pin
    // their shape so a placeholder or a paste accident can't ship.
    expect(config?.applicationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(config?.clientToken).toMatch(/^pub[0-9a-f]{32}$/);
  });
});

describe('rumConfig anywhere else', () => {
  const offProduction = [
    'localhost',
    '127.0.0.1',
    'ccqw.github.io', // GH Pages previews and forks
    'www.c0ffee.cafe', // the gate is exact: apex only
    'c0ffee.cafe.evil.example', // prefix spoof
    '',
  ];

  for (const hostname of offProduction) {
    it(`${hostname || '(empty hostname)'} → null`, () => {
      expect(rumConfig(hostname, '1.2.3')).toBeNull();
    });
  }
});
