---
name: science-agent
description: Verify what AI writes about science — catch confabulated citations, drifted notebook numbers, stale figure captions, and analysis producers that report a new number without reproducing a shipped one. Use when adding or reviewing academic citations, BibTeX entries, DOIs, or empirical claims in .md/.tex/.bib/.ipynb files; when writing a literature review; when reporting numbers from an analysis pipeline after a refactor, port, or substrate change; or when the user says "check citations", "verify references", "audit", or "science-agent".
---

# Science Agent

Catch AI-confabulated academic citations and claim drift. AI assistants get citations ~95% right — correct author surname, approximate title, right journal and year — then fabricate the remaining ~5% (co-authors, exact title wording, article numbers, DOIs). That passes casual review and propagates through citation graphs. This skill drives the `science-agent` CLI to verify against CrossRef and BibTeX.

## Setup

Runs straight from GitHub with Node ≥18 — no install, no API keys:

```bash
npx github:andyed/science-agent <command>
```

Or put it on `$PATH`:

```bash
npm install -g github:andyed/science-agent
```

## Commands

```bash
# Audit every citation in a directory against a BibTeX file
# (DOI-bearing entries are verified against Crossref by default)
science-agent audit ./docs --bibtex=./refs.bib

# Local linkage check only; explicitly skips BibTeX metadata verification
science-agent audit ./docs --bibtex=./refs.bib --offline

# Verify a single DOI resolves to the claimed paper
science-agent verify 10.1167/jov.25.3.15

# Find the real paper by title (CrossRef)
science-agent search "Metamers of the ventral stream"

# Search arXiv; surfaces a preprint's published DOI ready to verify
science-agent arxiv-search "peripheral vision crowding" --max=5

# Audit [NB##:K##] notebook claim references in prose against the notebooks
science-agent notebook-audit ./docs --aggregate=./docs/notebook-key-claims.md

# Verify figure-caption numerics against summary.json sidecars
science-agent figure-audit ./figures/INDEX.md

# Check that producers reproduced a shipped number before reporting a new one
science-agent repro-audit ./scripts/output
science-agent repro-audit ./scripts/output --require-gate

# Lint .md/.tex/.ipynb drafts for AI-tell prose; flags uncited authority claims
science-agent prose-audit ./paper --summary
```

Add `--json` to any command for machine-readable output.

Do not describe an `--offline` audit as citation metadata verification. It only
checks whether inline author/year citations map to local BibTeX entries.

## The reproduction gate

Every command above is consumer-side: it reads what a producer already wrote
and asks whether the prose is faithful to it. None of them can see the failure
one step earlier — a script computing a **new** number on a stream whose
**already-published** number it can no longer reproduce. The prose then quotes
a wrong value faithfully, and every other audit passes.

So gate the producer: before it reports a new number, it recomputes a shipped
one on the same inputs, same pool, same label, and aborts if the value does
not come back. It records the outcome in its `summary.json`:

```json
"gate": {
  "status": "ok",
  "shipped": 0.691, "reproduced": 0.691, "delta": 0.0, "tolerance": 5e-4,
  "source": "scripts/output/m4_cursor_only_downstream/summary.json",
  "source_path": "section_4_3.deployable_M4_7.pooled_auc"
}
```

`repro-audit` reads those blocks and flags gates that are missing, failing,
skipped without a reason, or pinned to a value the cited source no longer
carries. Pin to a `source` + `source_path` rather than a literal — a literal
pin keeps passing forever after the number it pins moves upstream.

The yield is two-sided. A gate catches defects, and a *passing* gate licenses a
difference: when two pools disagree, a reproduced baseline is what lets you
report the gap as real instead of spending a day deciding whether it is a port
error. A new number is exactly as trustworthy as the old number the same code
path can still return.

A `repro-audit` run that scans zero sidecars exits 2. Zero findings from a
blind run is indistinguishable from a fully gated repo, so it is never reported
as clean.

## The find → verify pattern

When a citation is suspect or has no DOI, resolve it, then confirm it:

```bash
science-agent arxiv-search "the paper title or topic" --json   # find the published DOI
science-agent verify <that-doi>                                 # confirm it against CrossRef
```

`arxiv-search` extracts arXiv's `arxiv:doi` / `arxiv:journal_ref`, so a preprint-only reference can be pinned to its journal DOI and verified. This is the step a retrieval agent (one that *finds* papers) should call before trusting what it wrote.

## When to run it

- **Before any commit** that adds or changes citations in `.md`, `.tex`, `.html`, `.bib`, or `.ipynb`.
- **When writing a literature review** or adding references.
- **Proactively** — when you're about to output a citation from memory, stop and verify it first. Do not generate DOIs or full author lists from memory.

## What it flags

- **wrong title** — claimed title doesn't match the DOI's actual paper
- **fabricated co-author** — author list doesn't match CrossRef
- **wrong DOI** — DOI resolves to a different paper (worse than no DOI)
- **ambiguous** — same surname+year matches multiple BibTeX entries; disambiguate with a DOI
- **orphan** — inline citation with no BibTeX entry
- **dangling [NB:K] reference** — notebook claim cited in prose that doesn't exist in the notebook
- **stale value** — downstream prose quotes a pre-fix number from an upstream notebook
- **ungated producer** — new numbers reported without reproducing a shipped one
- **failed gate** — the producer could not reproduce its own shipped number
- **stale pin** — a gate still passing against a value its cited source has since moved off

If a citation can't be confirmed, say so explicitly rather than asserting it.

## More

Full toolkit, methodology, and the confabulation taxonomy: https://github.com/andyed/science-agent
