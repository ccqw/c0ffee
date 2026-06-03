# 0007 — Channel colors are faithful pure RGB, never stylized

The R/G/B channel-identity colors throughout the console — slider tracks, the **Additive Venn** circles, the **Hex field**'s channel dots, and the active/solo channel labels — and the `--c0ffee-r/g/b` design tokens are the **pure** primaries: `#FF0000`, `#00FF00`, `#0000FF`. They replace the muted, "designed" values used previously (`#c0392b`, `#1e8449`, `#2471a3`).

## Why

The site teaches how RGB color actually works. A tasteful muted green is a *lie* — it hides how aggressive `#00FF00` genuinely is on a display. Faithfulness is the teaching; the jarring purity is the point. The console's whole credibility rests on "what you see is the real color," so its channel signifiers must be the real channel colors.

## Considered options

- **Muted/branded channel colors** (the previous `#c0392b/#1e8449/#2471a3`): easier on the eyes, more cohesive with a designed dark UI — **rejected**: it misrepresents the primaries the site exists to teach.

## Consequences

- `#00FF00` will look garish next to a designer's instinct for a tasteful palette. **Do not soften it.** If a future change mutes these "for aesthetics," it silently breaks the lesson — that is the regression this ADR exists to prevent.
- This is **only** about channel-*identity* color. Neutral UI chrome (text, surfaces, hairlines) stays tastefully muted — and is muted by *opacity off `--c0ffee-fg`*, never by inventing grey tokens.
- Channel colors stay pure even at the cost of contrast/comfort; legibility concerns are solved by layout and surrounding neutrals, not by desaturating the channel.
