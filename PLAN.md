# Science Agent — Plan

> **Status:** Planning
> **Goal:** Improve scientific collaboration in AI-assisted research. Citation validation is capability #1; claim verification and research corpus management are next.

## Problem

AI coding assistants confabulate academic citations at a measurable rate (~12% of entries in our corpus had issues). The pattern: 95% correct (author, title, journal), 5% confabulated (co-authors, exact titles, article numbers). Passes casual review. Propagates through citation graphs.

Discovered via Scrutinizer project audit (2026-03-19): 34 BibTeX entries, ~70 inline citations, 30+ spec files. 1 complete fabrication, 5 partial confabulations, multiple title/author inconsistencies.

## Architecture

### Core: Citation Index

A local-first citation database built from:
1. **PDF corpus** — research papers stored locally, metadata extracted (title, authors, year, DOI, abstract)
2. **BibTeX files** — parsed and indexed as the project's source of truth
3. **CrossRef API** — external validation of DOIs, titles, author lists
4. **Semantic Scholar API** — fallback for papers not in CrossRef

The index maps: `(author_surname, year)` → `[{title, authors, doi, journal, volume, pages, local_pdf_path}]`

### Mode 1: Claude Code Agent (`.claude/agents/science-agent.md`)

An agent definition that can be invoked within Claude Code sessions:
- `/citation-check` — audit all citations in current file or directory
- `/citation-add <doi>` — add a paper to the index from DOI, download PDF if available
- `/citation-verify "Author 2024"` — look up and verify a specific citation

The agent has access to: Read, Grep, Glob, WebFetch (for CrossRef/Semantic Scholar APIs), Write (for index updates).

### Mode 2: PostToolUse Hook

A lightweight hook that watches for citation patterns in written content:
- Regex detects `Author (Year)`, `Author et al. (Year)`, BibTeX entries
- Cross-references against the local index
- Flags: unknown citations, ambiguous (same author+year, multiple papers), missing DOI
- Does NOT block — warns and suggests verification

### Mode 3: Standalone CLI

```bash
science-agent audit ./docs/specs/          # audit all citations in directory
science-agent verify "Blauch 2026"         # look up specific citation
science-agent add 10.1167/jov.25.3.15     # add paper by DOI
science-agent index ./docs/research/       # index local PDF corpus
science-agent diff refs.bib ./docs/specs/  # check BibTeX ↔ inline consistency
```

## Data Model

```
~/.science-agent/
  index.json          # citation index (author, title, year, doi, source)
  pdfs/               # local PDF corpus (optional)
  config.json         # API keys, project paths, thresholds
```

Each citation entry:
```json
{
  "id": "blauch2026",
  "authors": ["Blauch, Nicholas M.", "Alvarez, George A.", "Konkle, Talia"],
  "title": "FOVI: A biologically-inspired foveated interface for deep vision models",
  "year": 2026,
  "journal": "arXiv preprint",
  "doi": null,
  "arxiv": "2602.03766",
  "local_pdf": "docs/research/Blauch-Alvarez-Konkle-2026-FOVI-arXiv.pdf",
  "verified": true,
  "verified_source": "pdf_metadata",
  "added": "2026-03-19"
}
```

## Validation Rules

### Hard failures (block/flag)
- Citation not in index AND no DOI → "unverified citation"
- Author list differs from index entry → "author mismatch"
- Title differs from index entry (fuzzy match < 0.8) → "title mismatch"
- Year differs → "year mismatch"

### Warnings
- Same author+year maps to multiple papers → "ambiguous — add DOI or journal"
- "et al." used without full author list in index → "expand authors"
- No DOI in index entry → "add DOI for verification"
- Article/issue number present but not in index → "verify article number"

### Passes
- DOI matches CrossRef → verified
- Title fuzzy match > 0.95 against index → likely correct
- PDF metadata matches inline citation → verified from source

## Tech Stack

- **Node.js** — matches Scrutinizer's ecosystem, runs as CLI or Claude Code agent
- **CrossRef API** — free, no auth needed for basic queries (`api.crossref.org/works/{doi}`)
- **Semantic Scholar API** — free tier, good for arxiv papers (`api.semanticscholar.org/graph/v1/paper/`)
- **pdf-parse** — extract metadata from local PDFs
- **bibtex-parse** — parse BibTeX files
- **fuse.js** — fuzzy title matching

## Repo Structure

```
science-agent/
  src/
    index.js          # citation index CRUD
    audit.js          # scan files for citations, cross-reference
    verify.js         # single citation lookup
    crossref.js       # CrossRef API client
    semantic.js       # Semantic Scholar API client
    pdf-extract.js    # PDF metadata extraction
    bibtex.js         # BibTeX parser
    patterns.js       # regex patterns for citation detection
  cli.js              # CLI entry point
  agent.md            # Claude Code agent definition
  hook.js             # PostToolUse hook for Claude Code
  package.json
  README.md
  CLAUDE.md
```

## Phase 4: Claim Auditor (Content Accuracy)

> **Origin:** Citation-guardian v1 catches structural errors (wrong titles, missing DOIs).
> It cannot catch *semantic* errors: wrong numbers attributed to real papers, mechanism
> descriptions that don't match what the paper actually says, or uncited empirical claims.
> In the Scrutinizer audit (2026-03-19), 4 of the 9 urgent issues were semantic — correct
> citation, wrong claim: Curcio photoreceptor count off by 10x, Queen N=20 was actually N=10,
> Kuffler cited for DoG model he didn't formalize, SNIF-ACT mechanism misdescribed.

### 4.1 Claim Extractor (`src/claims.js`)

Scans `.tex`, `.md`, `.js`, `.frag` files for empirical claim patterns near citations:

**Pattern types:**
1. **Quantitative claims** — numbers near citations: `N=20`, `~0.5s`, `4-5x`, `2:1 ratio`, percentages, degree values. Regex: `/[\d.]+[x×%°]|[Nn]\s*[=≈~]\s*\d+/` within ±200 chars of a citation.
2. **Mechanism claims** — "showed that", "demonstrated", "found that", "established", "measured" followed by a declarative clause, near a citation.
3. **Parameter attributions** — `param = value` or `param: value` near a `(Author Year)` pattern. E.g., `a = 2.78 (Blauch 2026)`.
4. **Uncited empirical claims** — sentences containing quantitative assertions with no citation within ±300 chars. Heuristic: sentence has a number + a domain-specific noun (eccentricity, sensitivity, acuity, threshold, etc.) but no `\cite`, `(Author`, or footnote.

**Output:** For each claim:
```json
{
  "file": "peripheral.frag",
  "line": 724,
  "claim_text": "at 15 deg, RG approx 29%, YV approx 79%",
  "citation": "Bowers (2025)",
  "claim_type": "quantitative",
  "numbers": ["15", "29%", "79%"],
  "confidence": "low",
  "verified": false
}
```

### 4.2 Cross-File Consistency Checker (`src/consistency.js`)

Detects when the same parameter or finding is stated differently across files:

1. Extract all `(parameter, value, citation)` tuples across the codebase
2. Group by parameter name + citation
3. Flag groups where values disagree

**Known example:** `rg_decay` is 0.072 in `peripheral.frag:70` and 0.085 in `chromatic_pooling.md`. Both attribute to Bowers (2025). Can't both be right.

Also catches:
- Oblique effect fade "~10 deg" (shader) vs "8-18 deg" (spec)
- Bouma constant "~0.5" vs "0.75" (different papers but same concept — link them)

### 4.3 Verification Workflow

Claims are extracted → written to `claims.json` → user marks each `verified: true/false/fixed`.
On subsequent runs, only new/changed claims are flagged. Verified claims are cached with a content hash so they're re-flagged if the surrounding text changes.

```bash
science-agent claims ./docs/           # extract all empirical claims
science-agent claims --unverified      # show only unverified
science-agent claims --inconsistent    # show cross-file conflicts
science-agent claims --uncited         # show quantitative assertions without citations
```

### 4.4 Confidence Heuristics

Auto-assign confidence levels:
- **LOW** (verify urgently): specific number + recent paper (≥2020) + no DOI provenance in research log
- **LOW**: number from blog post or non-peer-reviewed source
- **MEDIUM**: well-known finding but specific number (ratios, thresholds, sample sizes)
- **HIGH**: textbook-level claim (center-surround, Bouma's law direction, etc.)

Boost confidence if:
- The citation's URL appears in the research log (paper was actually fetched/read)
- The citation has a verified DOI matching CrossRef metadata
- The claim appears in the paper's abstract (available via Semantic Scholar API)

### 4.5 Integration Points

- **Claude Code hook:** After any Write/Edit to `.tex`/`.md` files, extract new claims and warn if unverified
- **Pre-commit hook:** Run `claims --unverified` and warn (don't block) if count increased
- **CI:** `science-agent claims --exit-code` returns non-zero if any LOW-confidence unverified claims exist

## MVP Scope

Phase 1 (ship fast):
- [ ] CLI: `audit`, `verify`, `add`, `index` commands
- [ ] Local PDF metadata extraction
- [ ] BibTeX parsing + cross-reference against inline citations
- [ ] CrossRef DOI verification
- [ ] Fuzzy title matching
- [ ] JSON report output

Phase 2:
- [ ] Claude Code agent definition
- [ ] PostToolUse hook
- [ ] Semantic Scholar fallback
- [ ] Ambiguity detection (same author+year)
- [ ] "et al." expansion from index

Phase 3:
- [ ] Web UI for browsing citation index
- [ ] Integration with Qdrant (semantic search over paper abstracts)
- [ ] Auto-suggest DOIs for unverified citations
- [ ] CI integration (fail build on unverified citations)

## Origin Story

Built after discovering AI-confabulated citations in the Scrutinizer project (a peripheral vision simulator). A collaborator (Nick Blauch, Harvard/NVIDIA) checked the arxiv reference to his own paper during a meeting and found the title was wrong. Audit revealed 12% of BibTeX entries and 1 complete fabrication across 70+ citations. The confabulations follow a "95% correct, 5% fabricated" pattern that passes casual review — the most dangerous kind of error for scientific writing.

Blog post: [link to ai-citation-confabulation post when published]
Scrutinizer: https://github.com/andyed/scrutinizer2025
