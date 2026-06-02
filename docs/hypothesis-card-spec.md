# Hypothesis Card Spec

A pre-registration contract for a single empirical claim. Forces a sharp claim, a pre-committed metric, a named baseline, a pass threshold, a compute budget, and a leakage screen — *before* any experiment runs.

The card is the unit of scientific discipline. Notebooks test cards; papers cite cards via the `[H##]` notation, mirroring the `[NB##:K##]` notation for executed claims.

## Why this exists

Cold-start LLM-driven research generates ideas faster than it can vet them. The Lossfunk `ai-scientist-artefacts-v1` pipeline (1/4 success at Agents4Science 2025) and the Trehan & Chopra "Why LLMs Aren't Scientists Yet" failure-mode taxonomy both name the same gap: weak scientific taste. The hypothesis card is the smallest discipline that closes the gap without requiring the agent to *be* a scientist — it makes the questions a scientist would ask explicit, structured, and grep-able.

## Schema

Every card is a markdown file at `hypotheses/H##_<slug>.md` with the following block:

```markdown
# H03 — Cursor retreat geometry predicts non-click

| Field | Value |
|-------|-------|
| **Status** | proposed / running / passed / failed / retired |
| **Claim** | One sentence, falsifiable. The opposite must be a coherent statement. |
| **Dataset** | Named corpus + cohort. Row count if relevant. |
| **Metric** | Pre-committed primary metric. Include evaluation protocol (LOSO, k-fold, holdout). |
| **Baseline** | Named comparator. "Vs random" is not a baseline. |
| **Threshold** | Pass condition. Effect size + uncertainty. |
| **Budget** | Compute + wall-clock cap. |
| **Leakage screen** | Pre-committed exclusion of features that could trivially leak the label. |
| **Citations** | Priming literature (BibTeX keys or DOIs). Carried forward into any paper that cites this H. |

## Tested by
- [NB##:K##] — notebook key claim that records the result
- scripts/output/<artifact> — supporting artifact

## Result (filled in post-test)
Date, decision (passed / failed / inconclusive), one-paragraph what-changed.
```

### Field rules

**Claim.** A single sentence. The negation must also be a coherent claim — if you can't write the null, the claim isn't falsifiable. "Cursor features improve click prediction" is not a claim; "Adding cursor-retreat geometry to a rank+ad-types LR baseline raises LOSO AUC by ≥0.02 with the 95% CI excluding 0" is.

**Dataset.** Named cohort, not "the dataset." Include the screen ("typed-gapfill, N=18,218") so the same H tested on a different cohort gets a new card.

**Metric.** Pre-committed *and* evaluation protocol. AUC alone isn't enough — AUC under what split? LOSO 47-fold? Random 80/20? Per-trial or per-session?

**Baseline.** A named model with a published or notebook-pinned number. Not "vs no cursor features." If the baseline isn't already established, write a separate H to establish it first.

**Threshold.** A pass condition that the result either meets or doesn't. Include uncertainty — "+0.02 AUC" without a CI is hope, not a threshold.

**Budget.** Cap *before* you start. Lossfunk's prompt enforces ≤6 GPU-h on A100 40GB; for our domain that's typically ≤4 wall-clock hours on M3 + ≤2 days human-in-the-loop. The point is the cap, not the number.

**Leakage screen.** *Our addition to the Lossfunk schema.* The most expensive lesson from the CIKM paper-v5 revision was that `final_dist` and `retreat_dist` were structurally leaky for click prediction (they encode the click location). Every card that proposes a feature must declare what would make the feature trivially predict the label, and the screen that rules that out. For cursor work this is typically a click-buffer Δ ∈ {0, 200, 500, 1000} ms truncation grid; for gaze work it's the dwell-after-decision exclusion.

**Citations.** Carry forward into any paper that cites this H. Reproducibility scaffolding: a reader who pulls the paper's bib should be able to walk back to the H-card to see what the authors had read when they pre-committed.

## Lifecycle

```
proposed  →  running  →  passed | failed | inconclusive
                                       ↓
                                    retired (status note + date + reason)
```

- **proposed** — card written, not yet executed. Anyone can read the card to predict the result.
- **running** — notebook(s) underway. Lock the card; new evidence appends to *Tested by*.
- **passed** / **failed** / **inconclusive** — post-test. The Result block is filled in. Inconclusive means the budget was hit before the threshold was; record what was needed.
- **retired** — superseded or deprecated. Card stays (citations carry forward), status changes.

H-IDs never renumber. Failed cards are part of the record, not a mistake to hide.

## File layout

```
project-root/
  hypotheses/
    H01_butterworth_position_gradient.md
    H02_four_class_taxonomy_predictiveness.md
    H03_cursor_retreat_geometry.md
    ...
    INDEX.md            # auto-generated table of all cards + status
  notebooks-v2/
    14_butterworth_cognitive_load.ipynb   # tests H01
    21_click_prediction.ipynb             # tests H03
    ...
  docs/
    notebook-key-claims.md                # K-claims cite H-IDs back
    paper-v5.md                           # paper cites both [H03] and [NB21:K3]
```

## What this is not

- **Not a research plan.** A research plan can hold dozens of cards; one card is one falsifiable claim.
- **Not a proposal-stage document.** A card commits to an experiment that is about to run, with a budget and a screen. Vague speculation belongs in a research log, not a card.
- **Not a hedge against negative results.** A failed card is a successful card — it ruled something out. Retiring or deleting failed cards undermines the whole substrate.

## Provenance

Schema lifted from `Lossfunk/ai-scientist-artefacts-v1` (`prompts/hypotheses_generation/hypothesis_suite_generation_prompt.md`), with two project-specific additions:

1. **Leakage screen** — required field. Forced by the AdSERP `final_dist` lesson.
2. **Tested by / Result** — closes the loop with notebook Key Claims via `[NB##:K##]` and `[H##]` cross-references. Lossfunk's pipeline ends at the paper; ours threads back into the executed-notebook substrate.
