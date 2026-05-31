# 0005 — Mobile-first; the desktop layout is the widened variant (supersedes ADR-0004's left-pin)

The site is designed **mobile-first**: every layout is authored for narrow screens first, and the wide-screen (desktop) layout is the *widened variant* that falls out — not the primary design. This **supersedes ADR-0004's commitment to a left-pinned Companion console**. Everything else in ADR-0004 stands; only the word "left" is replaced.

## What changes

- **The Companion console's pin axis is now responsive.** On narrow screens it pins to the **top** (the console as a sticky band; lesson prose scrolls beneath it). On wide screens it widens into the **beside-the-prose** split ADR-0004 described. The scroll-driven **Active beat** (Intersection Observer), the single shared **Companion console**, the dimming of inactive beats, and the animated loads are all **unchanged** — this ADR only swaps a fixed left-pin for a responsive pin axis.
- **On mobile the console renders in a compact presentation.** The sticky band has a limited height budget, so it shows the **Swatch + the active beat's relevant view**; the full controls (RGB/HSV panels) live in a **pull-up drawer (bottom sheet)**, so hands-on driving never costs the reader the narration. "Compact" is a **presentation** — an attribute on the one console — never a second element (forced by ADR-0002; only the console can show or hide its own shadow-DOM parts).
- **The site root (`/`) shows the flagship console solo.** Home *is* the flagship console, full-bleed — so its mobile experience is the product's first impression, which is the strongest reason mobile leads.

## Why

- **The mobile Lesson layout was the weakest part of v1.** A side-by-side canvas+prose split is a desktop idiom that cramps on a phone. Authoring mobile-first fixes the worst case directly, and a wide screen is then the *easy* case (more room, widen the split).
- **Home = the console shown solo**, so the console's narrow-screen experience is the front door — designing it first is designing the thing users hit first.
- **"Prioritise mobile and desktop falls out for free"** is made literal: the desktop split is a derived wide-screen variant of the mobile top-pinned layout, not a separate design.

## Considered options

- **Keep ADR-0004's left-pin everywhere, shrink on mobile** — rejected; that *is* the cramped status quo this ADR exists to fix.
- **Drop the pinned console on mobile, let it scroll inline** — rejected; it kills the always-visible shared canvas ADR-0004 is built around ("this red… now white… now black" needs the console present).
- **Amend ADR-0004 in place** — rejected; ADRs are immutable history. Supersede the one clause instead and leave 0004 readable as the original decision.

## Consequences

- ADR-0004's "pinned on the left" is **superseded** by "responsive pin axis (top on narrow, beside on wide)." The rest of ADR-0004 remains in force.
- The console must support a **compact presentation** and a **controls drawer**; presentations are attribute-selected on the one console (ADR-0002).
- Every page is now authored **narrow-first**; the desktop layout is the widened variant. New interactives should follow the same discipline.
- **Beat-driven compactness** — letting the Active beat declare *which parts* the compact console shows — is enabled by ADR-0004 (the beat already owns the console) but is **deferred to the roadmap**; not in this decision.
- ADR-0004's wording was updated from "mirror" to "console" in the C0FFEE-20 rename pass (done 2026-05-31).
