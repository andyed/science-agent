---
name: science-agent
description: Verify what AI writes about science — catch confabulated citations, drifted notebook numbers, and stale figure captions before they ship. Use when adding or reviewing academic citations, BibTeX entries, DOIs, or empirical claims in .md/.tex/.bib/.ipynb files; when writing a literature review; or when the user says "check citations", "verify references", "audit", or "science-agent".
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
science-agent audit ./docs --bibtex=./refs.bib

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
```

Add `--json` to any command for machine-readable output.

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

If a citation can't be confirmed, say so explicitly rather than asserting it.

## More

Full toolkit, methodology, and the confabulation taxonomy: https://github.com/andyed/science-agent
