# Notebook Conventions for Claim Verification

A contract for research notebooks that makes quantitative claims auditable by humans and machines.

## Quick Start: Adding Key Claims to a Notebook

**Step 1.** After your notebook produces a key result, add a markdown cell at the top (below the title):

```markdown
## Key Claims

> If prose cites a value that disagrees with a row below, the prose is wrong — not the notebook.

| ID | Claim | Value | Verified |
|----|-------|-------|----------|
| K1 | Sample size after exclusions | N = 2,719 trials | 2026-04-09 |
| K2 | Main effect | ρ = −0.618, p = 0.0426 | 2026-04-09 |
| K3 | Group comparison | 22.24 vs 19.01, U = 287431, p = 3.1e-04 | 2026-04-09 |
```

**Step 2.** When writing about this result elsewhere (README, paper draft, another notebook), cite it as:

```
The position × cognitive load correlation [NB14:K2] suggests...
```

**Step 3.** Run `science-agent notebook-audit` to verify all references resolve:

```bash
science-agent notebook-audit ./docs --aggregate=./docs/notebook-key-claims.md
```

That's it. Everything below is the full spec.

---

## The Key Claims Block

### What goes in it

A number is "load-bearing" if any of these are true:
- A paper or README cites it
- Another notebook depends on it
- Changing it would change a conclusion

If you're unsure, leave it out. You can always add K-IDs later (append; never renumber).

### Format requirements

```markdown
## Key Claims

> If prose cites a value that disagrees with a row below, the prose is wrong — not the notebook.

| ID | Claim | Value | Verified |
|----|-------|-------|----------|
| **K1** | [short description] | [value from cell output] | [YYYY-MM-DD] |
```

- **ID column:** `K1`, `K2`, ... (optionally bold: `**K1**`). Never renumber. Retired claims stay in the table marked `(retired YYYY-MM-DD: reason)`.
- **Claim column:** One-line description. Be specific enough to grep for.
- **Value column:** Direct transcription of executed cell output. Never hand-type or round.
- **Verified column:** Date you last confirmed the value matches current cell output.

### Rules

1. **Values from execution only.** Copy-paste from cell output. If you can't point to the cell that produced a number, it doesn't belong in Key Claims.
2. **Stable IDs.** K-IDs are permanent addresses. Papers cite `[NB14:K3]` — if you renumber, citations break.
3. **Re-verify after data changes.** If upstream data or methodology changes, re-execute the notebook and update the Verified date. If values shift, update them and grep for the old values in all prose that cites this notebook.

## Cross-Reference Notation

When prose cites a Key Claim:

```
[NB14:K3]   — specific claim (notebook 14, claim K3)
[NB14]      — the notebook generally
```

This notation is designed to be:
- **Greppable** — `grep -r '\[NB14:K3\]'` finds every citation
- **Stable** — survives cell reordering, notebook renaming
- **Machine-auditable** — science-agent can verify every reference resolves

### Naming notebooks

Use a numeric prefix that becomes the NB label:

```
14_butterworth_cognitive_load.ipynb  →  NB14
05_lhipa.ipynb                       →  NB05
```

For sub-notebooks: `11_5_chattiness.ipynb` → `NB11.5`

## Notebook Tiers

### Tier A: Canonical Analysis

- Has a Key Claims block
- Cited via `[NB##:K##]` in papers/findings
- Must be re-executed when upstream data changes
- Named with numeric prefix

### Tier B: Data Producers

- Scripts that compute intermediate data (JSON, CSV) consumed by Tier A
- No Key Claims blocks — they produce data, not claims
- Named as `scripts/compute_*.py` or `scripts/build_*.py`

### Tier C: Exploratory

- No Key Claims blocks, not cited in papers
- May contain useful analysis but is not authoritative
- Keep in a separate directory from Tier A if possible

## The Aggregation Pipeline

For projects with many notebooks, maintain a single aggregate doc:

```
Tier B scripts → data files (JSON/CSV)
                      ↓
Tier A notebooks load data → compute → Key Claims block
                      ↓
aggregation script → docs/notebook-key-claims.md
                      ↓
prose cites [NB##:K##] → papers/README cite prose
```

### Aggregate file format

```markdown
# Notebook Key Claims

## NB14: `14_butterworth_cognitive_load`

| ID | Claim | Value | Verified |
|----|-------|-------|----------|
| **K1** | Trials with usable data | 2,719 | 2026-04-09 |
| **K2** | Position × LF/HF | ρ = −0.618, p = 0.0426 | 2026-04-09 |

## NB05: `05_lhipa`

| ID | Claim | Value | Verified |
...
```

The heading format `## NB##: \`filename_stem\`` is what `science-agent notebook-audit --aggregate` parses.

### Writing an aggregation script

Your script should:
1. Read each Tier-A notebook's markdown cells
2. Find the Key Claims block (look for `## Key Claims`)
3. Extract the table
4. Write all tables into one file with notebook-labeled sections

See `attentional-foraging/notebooks-v2/update_key_claims.py` for a reference implementation (uses nbformat to read .ipynb files).

## Multi-Repo Projects

When findings from one repo are validated or cited by another:

### Upstream repo (owns the claims)
- Maintains Key Claims blocks and aggregate
- Documents corrections in CHANGELOG with before/after values
- Runs `science-agent notebook-audit` to self-verify

### Downstream repo (cites upstream claims)
- References upstream values with explicit attribution: "(NB14:K3, post coordinate-space audit 2026-04-09)"
- If a value can't be reproduced locally, marks it: "Value from upstream NB05:K5 (not locally reproducible)"
- Runs `science-agent notebook-audit --cross-repo=.` to detect stale values

### When upstream corrects a claim
1. Upstream updates Key Claims and CHANGELOG
2. Downstream greps for old values and updates
3. If downstream has a validation script, re-run it

## What Science-Agent Audits

```bash
# Check all [NB##:K##] references resolve
science-agent notebook-audit ./docs --aggregate=./docs/notebook-key-claims.md

# Also check notebooks have Key Claims blocks
science-agent notebook-audit ./docs --aggregate=./docs/notebook-key-claims.md --notebooks=./notebooks/

# Check a downstream repo for stale pre-fix values
science-agent notebook-audit ./docs --aggregate=./docs/notebook-key-claims.md --cross-repo=../downstream/
```

### What it catches

| Issue | Severity | Example |
|-------|----------|---------|
| Dangling reference | Error | `[NB14:K3]` but K3 doesn't exist in NB14's aggregate |
| Missing notebook | Error | `[NB99:K1]` but NB99 isn't in the aggregate at all |
| No Key Claims block | Warning | Notebook is cited in prose but has no auditable claims table |
| Potentially stale value | Warning | Downstream repo contains a known pre-fix number |

### What it doesn't catch (yet)

- Value drift (prose says "0.82" but Key Claims says "0.79") — requires NLP extraction
- Uncited claims (a number in prose with no `[NB##:K##]` reference)
- Execution staleness (notebook hasn't been re-run since data changed)

## Anti-Patterns

| Pattern | Why it's bad | Fix |
|---------|-------------|-----|
| Hand-typed values in Key Claims | Will drift from actual output | Re-execute, copy from cell output |
| Hardcoded values in validation scripts | Can't re-verify | Compute from data, or explicitly mark as "quoted" |
| Claims in CHANGELOG/README with no K-ID | Unauditable | Add to notebook Key Claims first, then cite |
| Renumbering K-IDs | Breaks all citations | Retire old IDs, append new ones |
| Order-of-magnitude typos | "17×" when data says "1.7×" | Always copy-paste from output |
