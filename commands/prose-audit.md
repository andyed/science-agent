---
description: Lint paper drafts for AI-tell prose patterns. Args: <file-or-dir> [--severity=warn] [--no-pencil] [--no-muriel] [--no-native] [--summary] [--json]
---

Run the science-agent prose audit with the user's arguments:

```bash
NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules" node "${CLAUDE_PLUGIN_ROOT}/cli.js" prose-audit $ARGUMENTS
```

Then summarize. Lead with the highest-severity rule clusters (where the same rule fires many times — that's the actionable signal). If `$ARGUMENTS` is empty, ask the user for a file or directory.

## Rule sources

- **Native JS rules** (always on; ported from academic-research-skills v3.9.4):
  - `flagged-term` — 25 overused AI-text words with suggested alternatives
  - `em-dash-total` — paper-wide ≤3 limit (Unicode `—` and LaTeX `---`)
  - `semicolon-density` — paper-wide ≤2 per 1000 words
  - `colon-list-sequence` — 2+ consecutive colon-intro→list paragraphs
  - `throat-clearing` — 12 sentence-starter clichés
  - `rule-of-three` — every list in a section has exactly 3 items
  - `synonym-cycling` — 3+ near-synonyms in one paragraph
  - `binary-contrast` — "Not X. Y." pattern > 2 per paper

- **muriel.aiism** (Python; auto-detected): em-dash addiction per-line, intensifier repetition, definitional clefts, "What X is Y" / "not X but Y" tics, overlong sentences, hard LLM-tool artifacts. Skipped for `.tex` files and when `muriel` is not installed.

## Supported inputs

`.md`, `.ipynb` (markdown cells only), `.tex` (LaTeX is stripped to prose with newline-preserving substitution so line numbers map back to the source).

## Flags

- `--severity={info,warn,error}` — exit nonzero if any finding ≥ this severity (default `warn`)
- `--no-pencil` — don't skip pencil-locked sentences
- `--no-muriel` — skip the Python muriel.aiism pass (native rules only)
- `--no-native` — skip the native ARS rule set (muriel only)
- `--summary` — one-line-per-file table instead of full findings
- `--json` — machine-readable output
