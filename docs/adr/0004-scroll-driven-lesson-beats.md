# 0004 — Lessons are scroll-driven sequences of beats with a pinned Companion mirror

> **Status:** partially superseded by **ADR-0005** — the fixed *left*-pin is replaced by a responsive pin axis (top on narrow screens, beside the prose on wide). Everything else here still holds. ("Companion mirror" is also renamed **Companion console**; see the `mirror → console` rename.)

A Lesson splits into authored **beats** (teaching steps). The layout pins one **Companion mirror** on the left; prose scrolls on the right (a flipped-Codecademy split). Scrolling activates whichever beat enters the focus zone (via an Intersection Observer); inactive beats are **dimmed**, and the active beat owns the mirror. Click-to-load interactions animate the mirror's Color value.

## Why

- **The text↔mirror tie must be legible.** With one always-visible mirror and many prose beats, the reader needs to know which paragraph is currently driving the toy. Dimming the inactive beats makes the active one obvious with zero extra chrome.
- **Scroll-driven feels native to reading.** No "next" buttons to invent; the reader just reads and the canvas keeps pace ("scrollytelling"). One good default beats a configurable system we can't yet justify.
- **Pinned mirror matches the prose.** The draft lesson keeps referring to "this red… now white… now black" — a single shared canvas is exactly what that narration wants.
- **Animated loads make addition felt.** Because every view re-renders from one Color value, animating a load is just tweening that value over ~300ms — the journey (channels climbing to white) is shown, not just the destination. Nearly free given ADR-0001.

## Considered options

- **Click-to-advance / "next" button:** more explicit control, but adds UI and breaks reading flow — deferred to roadmap as an alternate interface mode.
- **Active-beat styling via box/arrow:** heavier-handed than dimming — deferred; dimming first.
- **Expand-in-place / popover / per-beat mirrors** (instead of one pinned mirror): rejected in favor of a single Companion mirror — avoids scroll-confusion and "which toy lit up?".

## Consequences

- Scroll-driven activation needs an Intersection Observer (native, cheap) and can feel twitchy with very short beats or fast scrolling — beats should be substantial enough to settle in the focus zone.
- "Click vs scroll" and a user-facing interface-mode preference are explicitly out of scope for v1 (roadmap).
- Beat boundaries are authored, so the Lesson HTML must mark them (a structural element per beat).
