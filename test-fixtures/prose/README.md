# Prose-audit evaluation corpus

Two-sided regression corpus for `src/prose-audit.js` + `src/aiism-rules.json`.

- **`positive/`** — text that *must* fire a named rule. Guards against a rule
  silently breaking (a bad regex edit, an engine that stops dispatching).
- **`negative/`** — defensible human scientific prose that *must not* fire a
  named rule. Guards against over-firing, which is the failure mode that gets
  a linter switched off.

The second half is the point. A rule table with no false-positive corpus has
no measured precision, and precision is what decides whether anyone keeps
running the tool on draft N.

## Contract

`manifest.json` maps each fixture to the rules it asserts:

```json
{
  "file": "negative/cited-authority.tex",
  "must_not_fire": ["weasel-attribution"],
  "why": "Every authority claim carries a \\cite within the sentence."
}
```

- `must_fire` — the run must produce ≥1 finding for each listed rule id.
- `must_not_fire` — the run must produce 0 findings for each listed rule id.

Assertions are per-rule, not per-file: a negative fixture asserting
`weasel-attribution` says nothing about whether `em-dash-total` fires on the
same text. This keeps fixtures readable as prose instead of degenerating into
text engineered to be globally silent.

## Running

```bash
npm run test:prose
```

Exits nonzero on any violated assertion. `--verbose` prints every finding for
each fixture, which is how you triage a new failure.

## Adding a case

When a rule misfires on real writing, add the sentence that misfired to
`negative/` and cite it in `manifest.json`. When a rule is added, add a
`positive/` case in the same commit. Fixtures are hand-written; they are not
excerpts from drafts, reviews, or correspondence, so this directory stays
publishable.
