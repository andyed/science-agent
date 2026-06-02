---
description: Draft a pre-registration hypothesis card. Args: <claim sentence> [--dir=hypotheses/]
---

Draft a hypothesis card per the spec at `${CLAUDE_PLUGIN_ROOT}/docs/hypothesis-card-spec.md`. The card pre-commits a falsifiable claim, a metric + evaluation protocol, a named baseline, a pass threshold, a compute budget, a leakage screen, and priming citations — *before* the experiment runs.

## Workflow

1. **Read the spec** at `${CLAUDE_PLUGIN_ROOT}/docs/hypothesis-card-spec.md` first if you haven't this session.
2. **Locate the project's hypotheses directory.** Default `hypotheses/` at the repo root. Create it if it doesn't exist.
3. **Pick the next H-ID.** Scan existing files (`H01_*.md`, `H02_*.md`, ...) and use the next integer. H-IDs never renumber.
4. **Draft the card** using the schema in the spec. For each field:
   - **Claim** — User's sentence, sharpened. The negation must be coherent. If the user gave a research direction rather than a claim ("cursor features help"), push back: ask for a specific effect size or rewrite to a falsifiable form yourself and surface the rewrite in your reply.
   - **Dataset** — Named cohort + N. If unknown, mark `<TBD>` and flag it.
   - **Metric** — Pre-committed primary metric *and* evaluation protocol (LOSO 47-fold / random k-fold / holdout). If the user didn't specify, propose one and ask them to confirm.
   - **Baseline** — A named model with a pinned number, ideally with a `[NB##:K##]` reference. If no baseline exists, the first thing to do is write a separate H to establish one — say so.
   - **Threshold** — Effect size + uncertainty. "+X with 95% CI excluding Y" form. Don't ship a card without a CI condition.
   - **Budget** — Compute + wall-clock cap. Default ≤4 hr M3 + ≤2 days human-in-the-loop unless the user specifies otherwise.
   - **Leakage screen** — Required. Ask: "what would make this feature trivially predict the label, and what's the screen that rules it out?" For cursor features, this is typically a click-buffer Δ ∈ {0, 200, 500, 1000} ms truncation grid. For gaze features, dwell-after-decision exclusion. If you can't think of one, the card isn't ready.
   - **Citations** — Priming lit. Pull from the project's BibTeX if available; flag any uncertain ones with `[UNVERIFIED]` for the science-agent citation pass.
5. **Set Status to `proposed`.**
6. **Leave Tested by and Result empty** with placeholder lines.
7. **Write the file** to `hypotheses/H##_<slug>.md` and report the path.
8. **Surface gaps.** End with a short "Open questions before this card is ready to run" list — anything you marked `<TBD>` or pushed back on.

## When to push back

- User gives a direction, not a claim → ask for the effect size or rewrite to falsifiable form.
- No baseline exists → propose writing a baseline-establishing H first.
- Leakage screen unclear → don't ship the card; the screen is the discipline this whole thing exists for.
- Budget is open-ended → cap it.

## Example invocation

```
/hypothesis-card Adding cursor-retreat geometry to a rank+ad-types LR baseline raises LOSO AUC by ≥0.02 with 95% CI excluding 0
```

The slash command's argument is `$ARGUMENTS`. Treat the whole arg string as the user's draft claim.
