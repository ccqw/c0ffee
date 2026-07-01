# 0008 — Anonymous Datadog RUM telemetry, production-only (C0FFEE-55)

**Status:** Accepted (2026-06-11). Amended 2026-07-01 (first custom action, C0FFEE-80).

The site adds Datadog Real User Monitoring via **`@datadog/browser-rum-slim`** — the
repo's **first runtime dependency** and the first data flow off the site. Collection
is out-of-box only (page views, Core Web Vitals, JS errors, automatic interaction /
resource / long-task tracking), runs **only on the production hostname**
(`c0ffee.cafe`), and is **anonymous by construction**: no Session Replay, no user
identity, no consent UI.

## Context

- Every slice ends at "deploy green," which proves the build published — not that
  the console works, performs, or stays error-free on real devices. The only error
  report channel was "Caitlin happens to notice."
- The site is static with no backend, so RUM credentials (`applicationId`,
  `clientToken`) are public-by-design browser values — they ship in the bundle on
  every Datadog customer's site. No secret management is needed or possible.
- The site promise "you land directly in the interactive" rules out a consent
  banner, which constrains the posture: nothing collected may require consent
  (no identity, no replay, input masking on).

## Decision

- **SDK**: `@datadog/browser-rum-slim` via npm. The CDN snippet was rejected
  (config duplicated across three documents, no typechecking). The slim package is
  chosen over `@datadog/browser-rum` so Session Replay is excluded by **package
  choice, not just config** — replay is permanently 0 in this posture.
- **Core/shell split (ADR-0003)**: a pure config core `rumConfig(hostname, version)
  → config | null` in `lib/telemetry.ts` holds every posture value and the
  production-hostname gate; tests pin the posture. A thin init shell
  (`telemetry.ts`) calls the core and invokes the vendor `init()` once, no-oping on
  `null` — the vendor call is the only untested line. All three pages import the
  one shell module, so config can never drift between documents.
- **Posture values**: session sample rate 100 (small traffic, full visibility),
  Session Replay sample rate 0, `defaultPrivacyLevel: 'mask-user-input'`,
  automatic interaction/resource/long-task tracking ON, **no user identity ever
  set**, first-party cookies only, no consent flow.
- **Gating**: any hostname other than `c0ffee.cafe` (localhost, vite preview,
  GH Pages previews, forks) gets `null` — sends nothing, bills nothing, pollutes
  nothing.
- **Release tagging**: `version` is threaded from `package.json` at build time
  (Vite `define`), `service: c0ffee`, `env: production` (only production ever
  inits) — sessions map onto the existing vX.Y.Z release stream.
- **URL hash**: view URLs are sent as-is, hash included. The hash carries a Color
  link and nothing else (site invariant), so it is useful signal — which shared
  colors arrive — not PII.
- **Datadog site**: the org is on us1 → `site: 'datadoghq.com'`.

## Consequences

- These constraints **bind future telemetry work**: no identity, no replay, no
  consent debt, prod-only. Custom instrumentation (color edits, beat progression)
  is deliberately deferred until the out-of-box data proves insufficient.
- `node_modules` now contains runtime code that ships to visitors; rum-slim is the
  largest JS the site serves (tens of KB gzipped on an otherwise few-KB site).
  Accepted for v1 — the resource timing it collects will itself show whether it
  hurts.
- Local work proves the *negative* (no intake requests off-hostname); the
  *positive* is only provable post-deploy (events arriving in the Datadog RUM
  application, queryable via the Datadog MCP server).
- Datadog-side configuration (dashboards, monitors) stays out of the repo.

## Amendment (2026-07-01, C0FFEE-80): the first custom action

The crossword share control emits `datadogRum.addAction('puzzle_shared')` — the first
custom instrumentation, superseding this ADR's "deliberately deferred" consequence for
this one event. The out-of-box data cannot see it: a share is a *success* signal
(automatic interaction tracking records a click, not whether the share sheet resolved
or the clipboard write landed), and it is the C0FFEE-57 feature's whole point. The
posture is unchanged: the action carries a name and **no payload** (nothing about the
puzzle, the time, or the target), and the emit call is inert off-production because
`init()` never ran (the SDK buffers pre-init calls and sends nothing). Further custom
actions still need to clear this same bar — invisible to out-of-box data, anonymous by
construction — not ride this amendment.
