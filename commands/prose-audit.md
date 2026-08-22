---
description: Lint paper drafts for AI-tell prose patterns. Args: <file-or-dir> [--severity=warn] [--no-pencil] [--no-muriel] [--no-native] [--summary] [--json]
---

Run the science-agent prose audit with the user's arguments:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" prose-audit $ARGUMENTS
```

Then summarize. Lead with the highest-severity rule clusters (where the same rule fires many times — that's the actionable signal). If `$ARGUMENTS` is empty, ask the user for a file or directory.

## Rule sources

Rule data lives in [`src/aiism-rules.json`](../src/aiism-rules.json); detection engines live in [`src/prose-audit.js`](../src/prose-audit.js). Per-rule attribution is recorded in each entry's `source` field; see [`src/aiism-rules.LICENSE.md`](../src/aiism-rules.LICENSE.md).

**Active rule categories (from JSON):**

- First-party threshold rules — `em-dash-total` (≤3/paper), `semicolon-density` (≤2/1000 words), `binary-contrast` (≤2/paper).
- `muriel`-derived project-specific rules — hard LLM-tool artifacts (oaicite tokens, sandbox paths, knowledge-cutoff disclaimers, etc.), Andy-specific phrase tics, intensifier-repetition detectors, definitional-cleft proximity. All MIT-compatible; CC-BY-SA-4.0-attributed rules were removed in v0.4.0 (see CHANGELOG).
- MIT-skill-corpus rules (JSON v6) — general AI-tell coverage rebuilt after the licence purges: `copula-avoidance`, `significance-inflation`, `participial-significance-tail`, `actorless-evidence` (actorless / anthropomorphic claims), and `weasel-attribution` (uncited authority claims). `weasel-attribution` is citation-aware — it stays silent when a citation follows within the same paragraph, which is why `stripLatex` now substitutes `\cite` with a length-preserving `[CITE]` marker instead of blanking it.

**Engines available but currently dataless** (the JS detector exists; no rule entries fire them until populated):
`flagged-term-group`, `sentence-opener-group`, `synonym-group`, `colon-list-sequence` engine, `rule-of-three` engine.

**All rule kinds now have a native engine.** `repeated-phrase` (5 rules) and `proximity` (1 rule) previously had JSON data but no JS dispatch, so they fired only through the optional Python `muriel.aiism` pass — which is skipped for `.tex`. On a LaTeX draft `repeat-load-bearing` (the `error`-severity slogan rule) and `doubled-cleft` did not run at all. Both engines mirror the muriel semantics exactly: repeated-phrase reports *every* occurrence once the document exceeds `max_count`, and proximity reports the earlier member of each pair within `max_distance_chars`.

**Findings are deduplicated across sources** on `rule@line:column`, native winning. muriel and the native table share 26 rule ids, so before this every shared rule reported twice on `.md` input whenever muriel was installed.

**`suppress_pattern`** (optional, `single-phrase` only) clears a match whose left context — 40 chars back through the end of the match — matches the pattern. Expected to be `$`-anchored so the benign collocation must terminate at the flagged token; a two-sided window would clear a real tell that merely sits near a benign one. Currently used by `phrase-regime` to leave "scotopic regime" / "linear regime" / "saturation regime" alone while still flagging the political sense. Ported from muriel's `RULE_SUPPRESS`, which native previously lacked, so `.tex` files got the false positives that `.md` files did not.

**Optional muriel.aiism subprocess** (Python; auto-detected for `.md`/`.ipynb` only): adds engine-specific Python detectors not yet ported to JS — long-sentence detection, bold-density, em-dash-per-line. Skipped for `.tex` files and when `muriel` is not installed.

## Precision harness

`npm run test:prose` runs `tools/prose-eval.js` against `test-fixtures/prose/`, a
two-sided corpus: fixtures that must fire a named rule, and human-scientific-prose
fixtures that must not. Assertions are per-rule. Add a `negative/` case whenever a
rule misfires on real writing; add a `positive/` case in the same commit as any new
rule. See `test-fixtures/prose/README.md`.

## Supported inputs

`.md`, `.ipynb` (markdown cells only), `.tex` (LaTeX is stripped to prose with newline-preserving substitution so line numbers map back to the source).

## Flags

- `--severity={info,warn,error}` — exit nonzero if any finding ≥ this severity (default `warn`)
- `--no-pencil` — don't skip pencil-locked sentences
- `--no-muriel` — skip the Python muriel.aiism pass (native rules only)
- `--no-native` — skip the native JSON-loaded rules (muriel only)
- `--summary` — one-line-per-file table instead of full findings
- `--json` — machine-readable output
