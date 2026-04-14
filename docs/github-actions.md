# GitHub Actions: Citation Audit on Every PR

Run Science Agent in CI to catch confabulated citations before they merge. Works regardless of which AI assistant wrote the code.

## Quick setup

Create `.github/workflows/citation-audit.yml` in your repo:

```yaml
name: Citation Audit
on:
  pull_request:
    paths:
      - '**.md'
      - '**.tex'
      - '**.bib'
      - '**.rst'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Audit citations
        run: npx github:andyed/science-agent audit . --bibtex=refs.bib
```

That's it. Any PR that touches markdown, LaTeX, or BibTeX files gets audited. The job fails if citation errors are found (orphans, ambiguous matches, missing DOIs).

## Customize

### Different BibTeX location

```yaml
      - name: Audit citations
        run: npx github:andyed/science-agent audit ./paper --bibtex=./paper/references.bib
```

### Multiple directories

```yaml
      - name: Audit docs
        run: npx github:andyed/science-agent audit ./docs --bibtex=./refs.bib

      - name: Audit paper
        run: npx github:andyed/science-agent audit ./paper --bibtex=./paper/refs.bib
```

### JSON output for downstream tools

```yaml
      - name: Audit citations (JSON)
        run: npx github:andyed/science-agent audit . --bibtex=refs.bib --json > citation-report.json

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: citation-report
          path: citation-report.json
```

### With notebook claim verification

If your project uses the `[NB##:K##]` Key Claims convention:

```yaml
      - name: Generate aggregate
        run: npx github:andyed/science-agent aggregate ./notebooks -o /tmp/key-claims.md

      - name: Audit citations
        run: npx github:andyed/science-agent audit ./docs --bibtex=./refs.bib

      - name: Audit notebook claims
        run: |
          npx github:andyed/science-agent notebook-audit ./docs \
            --aggregate=/tmp/key-claims.md \
            --notebooks=./notebooks
```

### arXiv spot-check (scheduled)

Run a weekly check on recent papers in your field to calibrate your expectations:

```yaml
name: arXiv Citation Spot-Check
on:
  schedule:
    - cron: '0 9 * * 1'  # Mondays at 9am UTC

jobs:
  arxiv-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Spot-check recent cs.AI papers
        run: npx github:andyed/science-agent arxiv 20 --cat=cs.AI
```

## What gets checked

| Check | Fails on |
|-------|----------|
| Orphan citations | Inline `Author (Year)` with no BibTeX entry |
| Ambiguous citations | `Pelli (2008)` matches 2+ BibTeX entries |
| Missing DOI | BibTeX entry has no DOI (warning, not error) |

The tool does NOT call external APIs in CI by default — it only matches against your local BibTeX file. This keeps builds fast and offline-capable. Use `verify` or `search` commands for online verification in local development.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Clean — no errors |
| 1 | Errors found (orphans, ambiguous, or verification failures) |

Warnings (missing DOIs, info-level notes) do not cause a non-zero exit.

## Requirements

- Node.js 18+
- No API keys needed
- No authentication
- Runs on `ubuntu-latest`, `macos-latest`, or `windows-latest`
