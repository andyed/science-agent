# Changelog

## 0.1.0 (2026-04-14)

First public release. Citation verification for AI-assisted research.

### Features

- **`audit`** — Scan directories for citation keys, match against BibTeX, flag orphans and ambiguous references
- **`verify`** — Verify a single DOI against CrossRef API
- **`search`** — Fuzzy-search CrossRef by title
- **`arxiv`** — Audit recent arXiv papers for citation quality (spot-check the literature)
- **`aggregate`** — Generate key-claims summary from Jupyter notebooks with `## Key Claims` sections
- **`notebook-audit`** — Verify `[NB##:K##]` claim references in prose against notebook sources
- **`--cross-repo`** — Scan downstream repos for stale numeric values
- **`--json`** flag for machine-readable output on all commands
- **`agent.md`** — Drop-in Claude Code agent definition for embedded verification

### Improvements

- `aggregate` and `notebook-audit` degrade gracefully when the user hasn't set up Key Claims conventions — explains what to do instead of erroring
- Lightweight: 2 dependencies (`bibtex-parse-js`, `fuse.js`), no build step
- Works via `npx science-agent` with zero configuration for basic citation auditing
