// Telemetry init shell (C0FFEE-55) — the one impure line of ADR-0008.
//
// All three pages import this single module, so the RUM config can never
// drift between documents. The decision of WHAT to send (and whether to send
// at all) is the pure config core's; this shell only reads the environment
// and makes the vendor call — the untested line, by shell discipline.

import { datadogRum } from '@datadog/browser-rum-slim';
import { rumConfig } from './lib/telemetry.ts';

// Replaced at build time with the package.json version (vite.config.ts
// `define`), so every RUM session is tagged with the vX.Y.Z release serving it.
declare const __C0FFEE_VERSION__: string;

const config = rumConfig(location.hostname, __C0FFEE_VERSION__);
if (config) {
  datadogRum.init(config);
}
