# 0007 — Channel colors are faithful pure RGB, never stylized

The R/G/B channel-identity colors throughout the console — slider tracks, the **Additive Venn** circles, the **Hex field**'s channel dots, and the active/solo channel labels — and the `--c0ffee-r/g/b` design tokens are the **pure** primaries: `#FF0000`, `#00FF00`, `#0000FF`. They replace the muted, "designed" values used previously (`#c0392b`, `#1e8449`, `#2471a3`).

## Why

The site teaches how RGB color actually works. A tasteful muted green is a *lie* — it hides how aggressive `#00FF00` genuinely is on a display. Faithfulness is the teaching; the jarring purity is the point. The console's whole credibility rests on "what you see is the real color," so its channel signifiers must be the real channel colors.

## Considered options

- **Muted/branded channel colors** (the previous `#c0392b/#1e8449/#2471a3`): easier on the eyes, more cohesive with a designed dark UI — **rejected**: it misrepresents the primaries the site exists to teach.

## Consequences

- `#00FF00` will look garish next to a designer's instinct for a tasteful palette. **Do not soften it.** If a future change mutes these "for aesthetics," it silently breaks the lesson — that is the regression this ADR exists to prevent.
- This is **only** about channel-*identity* color. Neutral UI chrome (text, surfaces, hairlines) stays tastefully muted — and is muted by *opacity off `--c0ffee-fg`*, never by inventing grey tokens.
- The rule is the **principle, not the surface list**: the pure channel color is reserved for the channel *signifier*, wherever that signifier lives. The console's signifiers are all "where the light shows" (the Additive Venn, the slider tracks, the Hex field pairs), so its resting labels can afford to be neutral. A surface that carries none of those - the **Hex Color crossword** (C0FFEE-12) has no Venn, no sliders, and a deliberately hueless grid - still owes the player a channel signifier, so it carries the identity in pure channel color on a *structural* signifier instead: the active Slot's channel-pair **outline** (the replacement for the console's channel dots). This is the principle kept, not an exception to it.
- Identity is colored; **status is not**. The per-channel feedback glyph (the check or the higher/lower arrow) stays neutral, so status never reads as color and "green = correct" can never collide with "green = the green channel." The one allowance is a *transient* toast, which may carry subtle, icon-backed semantic color because it appears briefly to grab attention and then leaves; a *persistent* status mark (e.g. a wrong-clue mark in the clue list) stays neutral.
- Channel colors stay pure even at the cost of contrast/comfort; legibility concerns are solved by layout and surrounding neutrals, not by desaturating the channel.
