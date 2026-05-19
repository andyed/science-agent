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

**Engines available but currently dataless** (the JS detector exists; no rule entries fire them until populated):
`flagged-term-group`, `sentence-opener-group`, `synonym-group`, `colon-list-sequence` engine, `rule-of-three` engine.

**Optional muriel.aiism subprocess** (Python; auto-detected for `.md`/`.ipynb` only): adds engine-specific Python detectors not yet ported to JS — long-sentence detection, bold-density, em-dash-per-line. Skipped for `.tex` files and when `muriel` is not installed.

## Supported inputs

`.md`, `.ipynb` (markdown cells only), `.tex` (LaTeX is stripped to prose with newline-preserving substitution so line numbers map back to the source).

## Flags

- `--severity={info,warn,error}` — exit nonzero if any finding ≥ this severity (default `warn`)
- `--no-pencil` — don't skip pencil-locked sentences
- `--no-muriel` — skip the Python muriel.aiism pass (native rules only)
- `--no-native` — skip the native JSON-loaded rules (muriel only)
- `--summary` — one-line-per-file table instead of full findings
- `--json` — machine-readable output
