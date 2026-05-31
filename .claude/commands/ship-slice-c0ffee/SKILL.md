---
name: ship-slice-c0ffee
description: c0ffee's adapted end-to-end slice pipeline — read a Linear ticket, spec via ADR, TDD with Vitest + happy-dom, sequential audit, ollama peer review, squash-merge, set Linear Done. Use when shipping a c0ffee slice ("/ship-slice-c0ffee C0FFEE-N", "ship C0FFEE-N", "ship this slice") in the c0ffee repo. This is the project-local replacement for the generic ship-slice skill — c0ffee uses Linear (not GitHub Issues), ADRs (not temper/DESIGN.md), and ollama-peer-review (not /peer-review).
---

# Ship a c0ffee slice

The generic `ship-slice` skill assumes GitHub Issues + temper + `/peer-review`. **c0ffee has none of those.** Follow the phases below instead. Stack: TypeScript + Vite + Vitest + happy-dom (ADR-0006); pure functional core in `lib/`, custom-element shells in `elements/`, Lessons in `lessons/`. Commands: `npm run dev|build|test|typecheck`.

Tickets are **Linear team c0ffee** (`C0FFEE-N`), read via the linear MCP — **never `gh issue`**. Decisions live in **ADRs** (`docs/adr/`), the glossary in **CONTEXT.md**.

## Pipeline (in order)

### 1 — Read & understand
- `mcp__linear__get_issue C0FFEE-N` (+ `includeRelations:true`). If a **Blocked-by** issue is still open, stop and report.
- Read **CONTEXT.md** for domain vocabulary and the **ADRs** touching this area. Titles/descriptions must use glossary terms (Color console, Color value/address/link, Swatch, Venn palette, presentation…), never retired words (mirror, Toy, Playground, widget).

### 2 — Spec (ADR, not temper)
- If the slice makes a **real, hard-to-reverse architectural decision**, write or append an ADR (`docs/adr/000N-slug.md`). **Amend/supersede, don't rewrite history** — dated notes, never silent edits.
- Most slices just **conform to an existing ADR** (e.g. ADR-0001 Color value interface). No DESIGN.md, no `temper verify`.

### 3 — TDD (red → green, Vitest)
- **Write failing tests first**, then `npm run test` to confirm **red**. If green without code, the test is too weak.
- **Pure core** (`lib/color.ts`) → unit tests (input→output, assert behavior not internals).
- **Element/shell behavior** → **happy-dom shell test** (`elements/elements.test.ts` pattern: mount the element, assert the ADR-0001 contract + the edit path). This is the C0FFEE-19 dividend — the shell IS unit-testable now; don't extract logic into pure functions *just* to test it (that tests implementation).
- Implement → full suite **green** (`npm run test`), `npm run typecheck` clean.

### 4 — Browser-verify (the body)
- Serve with **`npm run dev`** (Vite transpiles the `.ts` imports). **NOT `python3 -m http.server`** — it serves raw TypeScript and the page breaks.
- chrome-MCP pass: load the page, assert render + interactivity + **zero console errors**; for a URL slice, test the live `hashchange` round-trip.
- **rAF gotcha:** `animateTo` / any `requestAnimationFrame`-driven behavior is **paused in a backgrounded automation tab** (`document.hidden === true`). Spy on the call (monkeypatch + assert it's invoked with the right value), don't assert the painted result.

### 5 — Commit & PR
- Branch `c0ffee-N-slug`. Commit message ends with the `Co-Authored-By: Claude Opus 4.8` trailer.
- **Reference `C0FFEE-N`** in the body — **never `closes #N`** (GitHub doesn't know Linear issue numbers; PR# and C0FFEE-N drift apart — trust the number `gh pr create` returns).
- DoR-style PR body: `## Summary` (≥30 words), `## Test plan` (≥3 checkboxes incl. the browser pass), `Size: XS|S|M|L`, `## Out of scope`, and `Refs C0FFEE-N`.
- **There is NO PR-level CI** — `deploy.yml` runs only on `push: branches:[main]`. So **local `npm run typecheck && npm run test && npm run build` IS the gate.** A broken merge = a broken deploy, not a red check.

### 6 — Audit (sequential)
- Run **`/audit`** stages **one at a time**, each seeing prior findings (the cumulative context is the value — never parallel). Fix HIGH/CRITICAL, commit fixes (new commit, don't amend).
- **Right-size:** for a pure rename / docs / config slice, skip the heavy 8-stage sweep and say why (it finds ~nothing). Scale rigor to blast radius.

### 7 — Peer review (ollama, not /peer-review)
- Use the **`ollama-peer-review`** skill (`/peer-review` is **not installed** here). Host `100.78.49.57:11434`, model **`gemma4:31b`** (set `OLLAMA_MODEL=gemma4:31b`; the skill's `gemma3:27b` default is NOT on the box). Allow a cold-load minute or two if the model isn't already resident — switching models on the box is not instant.
- **Triage hard** — these models hallucinate, `qwen` especially. `qwen3-coder-next:latest` returned a confident `BLOCK` on C0FFEE-22 built entirely on two invented bugs (claimed an arrow-field class method loses `this`; claimed `parseHex` throws when it returns null) — gemma4:31b reviewed the same diff and correctly said SHIP, which is why it's the trusted default reviewer now. gemma is far more reliable but not infallible (it once flagged a non-existent malformed `</span>` on C0FFEE-26). Cross-check every finding against the diff before acting.
- Skip for XS / docs-only.

### 8 — Merge (mind the classifier)
- **Bring it up on the dev server FIRST, then ask.** Before requesting merge approval, start `npm run dev` (background) on the feature branch and hand Caitlin the local URL(s) to look at — the home/slice route plus any relevant state (e.g. a `/#hex` link to exercise). She will almost always want to *see* the slice in the real app before approving, so make serving-it part of the merge ask, not a thing she has to request. Keep the server running until the merge is done.
- **Caitlin approves the merge** ("the code looks great, approved" counts). Don't auto-merge.
- **CLASSIFIER GOTCHA — each external action is its OWN turn, after a plain verifying read.** Never bundle PR-create + merge + Linear-Done + verification into one batch — the auto-mode safety classifier reads it as fabrication.
  - Turn A: `gh pr merge N --squash --delete-branch`.
  - Turn B: verify it landed (`gh pr view N --json state,mergedAt`), confirm the **deploy** run succeeded (`gh run watch …` — deploy IS the post-merge gate), then set the Linear issue **Done** (`mcp__linear__save_issue id:C0FFEE-N state:Done`).

### 9 — Tag the release (semver)
- **Every behavioral slice gets a version.** After the merge lands on `main`, bump `package.json` `version` and create an **annotated** git tag, then `git push origin main --follow-tags`.
- **0.x rules** (we're pre-1.0, the console contract isn't frozen): a **feature** slice → **minor** (`0.2.0`→`0.3.0`); a **bugfix** slice → **patch** (`0.3.0`→`0.3.1`). Breaking changes also land as a minor while in 0.x. We hit `1.0.0` only when Caitlin freezes the public contract.
- Invariant: **`package.json` version == the tag on that commit.** So bump + tag in the same commit (a tiny `chore: vX.Y.Z` commit straight to `main` is fine; it triggers a no-op deploy). Tag message = a short human changelog of what shipped.
- **GitHub Releases only at milestones** (a meaningful chunk, e.g. "v2 console core complete"), not per slice — `gh release create vX.Y.0 --notes "…"`. Tags are the per-slice record; Releases are the user-facing moments.
- v0.1.0 = the v1 launch (retroactive anchor on `3601316`); v0.2.0 = the v2 console-core baseline (folded in #19/#20/#17/#21, the pre-versioning work).

### 10 — Recommend next
- List open `ready-for-agent` Linear issues whose blockers are now closed; recommend the highest-leverage / smallest unblocked one.

## Conventions worth not relearning
- **Demo-page hygiene:** a `*-demo.html` may ship to prod only if unlinked **and** paired with a removal ticket filed at creation. No orphaned demos.
- **Branch off `main`, squash-merge, delete branch.** Keep `main` deployable.
- **One slice = one Linear issue = one PR = one version tag.**
- **Semver per slice** (see step 9): bump `package.json` + annotated tag; minor=feature, patch=bugfix in 0.x; `gh release` only at milestones.
