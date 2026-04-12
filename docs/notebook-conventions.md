# Notebook Conventions for Claim Verification

> Science-agent Phase 4 depends on research notebooks following a contract.
> This document defines the contract.

## The Key Claims Block

Every notebook containing load-bearing quantitative claims MUST include a **Key Claims block** as its first markdown cell (after the title). This is what science-agent's claim extractor targets.

### Format

```markdown
## Key Claims

| ID | Claim | Value | Source |
|----|-------|-------|--------|
| K1 | Trial count | 2,719 | Cell 3 output |
| K2 | Position × LF/HF | ρ = −0.618, p = 0.0426 | Cell 8 output |
| K3 | Clicked vs non-clicked | 22.24 vs 19.01 | Cell 10 output |
```

### Rules

1. **Stable IDs.** K-IDs are never renumbered. If a claim is retired, mark it `(retired 2026-04-09: reason)` and leave the row.
2. **Values from execution.** Every value in the table MUST be a direct transcription of executed cell output — never hand-typed or computed mentally.
3. **Date verified.** Include a metadata comment: `<!-- Verified: 2026-04-09 -->` after the table.
4. **Contract statement.** Include this sentence (or equivalent) above the table:
   > If prose in a paper draft cites a value that disagrees with a row below, the paper is wrong — not the notebook.

## Notebook Tiers

### Tier A: Canonical Analysis Notebooks

- Contain Key Claims blocks
- Referenced by `[NB##:K##]` notation in findings/papers
- Auto-aggregated by `update_key_claims.py` into `docs/notebook-key-claims.md`
- MUST be re-executed after upstream data changes
- Named with number prefix: `14_butterworth_cognitive_load.ipynb`

### Tier B: Producer Scripts

- Compute JSON/CSV data files consumed by Tier A notebooks
- No Key Claims blocks (they don't make claims — they produce data)
- Named as `scripts/compute_*.py` or `scripts/add_*.py`
- Output files documented in a manifest or README

### Tier C: Exploratory / Legacy

- No Key Claims blocks
- Not cited in papers
- May contain useful code but are not authoritative
- Stored in a separate directory (e.g., `notebooks/` vs `notebooks-v2/`)

## Cross-Reference Notation

All prose citing notebook claims uses this format:

```
[NB14:K3]  — specific claim row
[NB14]     — the notebook generally
```

This notation is:
- Greppable (science-agent can extract all claim references)
- Stable (survives notebook re-ordering)
- Auditable (can verify referenced K-ID exists)

## Aggregation Pipeline

```
Tier B scripts → JSON data files
                      ↓
Tier A notebooks load data → execute → Key Claims block outputs values
                      ↓
update_key_claims.py → docs/notebook-key-claims.md (aggregate)
                      ↓
findings.md cites [NB##:K##] → papers cite findings.md
```

## What Science-Agent Verifies (Phase 4)

### Declared vs Computed Claims

For each `[NB##:K##]` reference in prose:
1. Does the referenced notebook exist?
2. Does the K-ID exist in that notebook's Key Claims block?
3. Does the cited value match the Key Claims row?

### Cross-Repo Consistency

When a downstream repo (e.g., `approach-retreat`, `pupil-lfhf`) cites values:
1. Does it reference the upstream canonical source?
2. Are the cited values current (post any known corrections)?
3. Are hardcoded "quoted from upstream" values explicitly marked as such?

### Stale Claim Detection

A claim is potentially stale when:
- The data file it depends on has been modified since the notebook was last executed
- A correction (CHANGELOG entry) post-dates the notebook's `<!-- Verified: -->` timestamp
- An upstream repo documents a coordinate-space or methodology fix that affects the data

### Lit-Notes Integration

Literature notes (`docs/lit-notes/`) connect external papers to internal claims:
- Each lit-note has "What they claim" and "Gaps your work fills" sections
- Gap claims that reference `[NB##:K##]` are subject to the same verification
- If a lit-note's gap analysis references a Key Claim that has been retired or corrected, science-agent flags it

## Anti-Patterns to Detect

| Pattern | Why it's bad | Example |
|---------|-------------|---------|
| Hardcoded values in validation scripts | Can't re-verify | `print(f'K5: ρ = −0.650')` without computing |
| Claims in CHANGELOG not in Key Claims | Declared but unverifiable | "K9-K15: steep phase..." with no matching code |
| Stale README numbers post-fix | Misleading readers | "2.36× arc ratio" when corrected to 1.50 |
| Typo magnitudes | Order-of-magnitude errors | "17×" when data shows 1.7× |
| Missing Key Claims block in Tier A | Unauditable notebook | NB23 with analysis but no K-IDs |

## Implementation Status

- [x] Convention documented (this file)
- [ ] `src/claims.js` — claim extractor (Phase 4.1)
- [ ] `src/consistency.js` — cross-file checker (Phase 4.2)
- [ ] `src/notebook-audit.js` — Key Claims block validator
- [ ] Claude Code hook for `[NB##:K##]` reference checking
- [ ] Pre-commit warning on unverified claims
