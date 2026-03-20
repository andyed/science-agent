# Citation Guardian — Plan

> **Status:** Planning
> **Goal:** Standalone tool + Claude Code agent that validates academic citations against source documents, prevents AI confabulation in research writing

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

### Mode 1: Claude Code Agent (`.claude/agents/citation-guardian.md`)

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
citation-guardian audit ./docs/specs/          # audit all citations in directory
citation-guardian verify "Blauch 2026"         # look up specific citation
citation-guardian add 10.1167/jov.25.3.15     # add paper by DOI
citation-guardian index ./docs/research/       # index local PDF corpus
citation-guardian diff refs.bib ./docs/specs/  # check BibTeX ↔ inline consistency
```

## Data Model

```
~/.citation-guardian/
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
citation-guardian/
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
