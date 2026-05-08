# Changelog

## Unreleased

- **Claude Code plugin** — `/plugin install andyed/science-agent` registers sub-agents and slash commands (`/science-agent:audit`, `:figure-audit`, `:notebook-audit`, `:verify`, `:search`, `:aggregate`, `:arxiv`). SessionStart hook installs npm deps into `${CLAUDE_PLUGIN_DATA}` so the CLI works out of the box. Manifest at `.claude-plugin/plugin.json`. Note: `prose-audit` is excluded from the plugin until its rule table is ported from `muriel` (Python) to native Node — shipping a plugin that requires a Python sidecar would be a poor install experience.
- **`prose-audit`** — Lint paper drafts for AI-tell prose patterns. Bridges to `muriel.aiism` (Python; canonical rule table) via subprocess. Surfaces em-dash addiction, "load-bearing" / "structurally" / "materially" intensifiers, definitional clefts, "What X is Y" / "not X but Y" tics, "already-Y" compounds, mid-paragraph bold, and overlong sentences. Pencil-aware (skips locked sentences). Sibling agent at `agents/prose-audit.md`.
- **`figure-audit`** — Verify figure caption numerics against `*_summary.json` sidecars. For each `### figure.png` section in an `INDEX.md`, walks the linked stats dump, extracts numerics from the caption prose, and matches them. Catches stale prose where a value drifted between figure regeneration and caption update. Pre-strips dates, HTML attributes, inline code, markdown links, URLs, and citation tokens before extraction; handles space-separated thousands ("1 854" = 1854). Three-tier reporting: matched / unverified / mismatch (the primary stale-prose signal). Sibling agent at `agents/figure-audit.md`.

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
