# UI polish — unfinished design notes

Date: 2026-08-24
Status: **incomplete.** Two decisions taken, design not written, nothing implemented.

Saved so the survey findings and decisions are not lost. Resume by continuing the
brainstorming from the open question at the bottom.

## Scope decomposition

"Polish the ported UI" is five independent efforts, not one. Each needs its own design
and its own review surface:

1. **Accessibility** — chosen to go first.
2. **Responsive behaviour**
3. **Dark mode** (a semantic colour-token layer replacing hardcoded palette classes)
4. **Motion and transitions**
5. **Loading/empty states** — largely already done; needs an audit, not a build. The port
   has `LoadingState`, `EmptyState` and `ErrorState`, and the stage-1 final review added
   the missing `loading` gates to `/alerts` and `/feeding`.

Recommended order: accessibility → responsive → dark mode → motion. Accessibility first
because it changes markup and structure rather than classes, so it is the hardest to
retrofit; dark mode after it, so contrast can be validated against real semantics, and
because doing it earlier doubles the surface of every later change.

## Decisions taken

- **First area: accessibility.**
- **Target: WCAG 2.1 AA.** Every control has an accessible name; keyboard operable end to
  end with visible focus; 4.5:1 text contrast; form errors announced; no keyboard traps;
  live regions for toasts and cycle status.

## Survey findings (verified against the code, 2026-08-24)

- **Zero accessibility coverage.** No `aria-*` attribute or `role=` anywhere in `app/` or
  `components/` — 0 files of ~40.
- **Focus styling exists on two primitives only**, `Button` and `Input`, inherited from the
  original's class strings. Nothing else has a visible focus state.
- **Five icon-only buttons have no accessible name:** the header's menu, demo-panel toggle
  and alerts bell; the sidebar's mobile close; and `Modal`'s close.
- **`Modal` handles Escape but has no focus management** — no focus trap, no restoration on
  close, no `role="dialog"`, no `aria-modal`, no labelled title. Opening the quick-feed
  confirmation leaves keyboard focus on the page behind it.
- **The mobile drawer scrim is a `div` with `onClick`** — not keyboard reachable.
- **Responsive is partial:** 87 breakpoint usages, concentrated in page grids and the shell.
  `FeedingHistoryTable` has none and no horizontal scroll container, so a nine-column table
  probably breaks the layout on a phone. (Belongs to the responsive effort, not this one.)

## Open question — resume here

How should the accessibility work be verified? This is the fork worth deciding carefully,
because it reverses a stage-1 decision.

Stage 1's spec ruled **no component tests**: the 46-test suite is pure logic in a node
environment, and ported UI was verified by comparison against the original. That reasoning
does not extend to accessibility — this is new behaviour with no original to compare
against, and it regresses silently the moment someone edits a component.

The candidate answers, with the recommendation first:

1. **Automated axe plus a manual pass.** Add jsdom, React Testing Library and vitest-axe;
   assert zero violations on the nine routes and the primitives; add a manual keyboard and
   focus pass for what axe cannot see. Deliberately reverses the no-component-tests
   decision. Costs real test infrastructure, and axe alone catches only about a third of
   WCAG issues, so the manual pass is not optional.
2. **Manual audit only** — keeps the test architecture untouched, guards nothing.
3. **Browser-driven verification** — closest to real experience, catches focus-order bugs,
   but a one-off rather than a permanent guard.
4. **Axe in CI only** — cheap permanent guard, but passes an app whose focus order is
   nonsense and whose live regions announce every 400 ms tick.

One design constraint already identified regardless of the answer: the feeding cycle
updates telemetry every 400 ms. A naive `aria-live="polite"` region over cycle status would
announce continuously and be unusable. Announcements must be debounced to meaningful state
transitions — detected, identified, dispensing, complete — not raw telemetry ticks.
