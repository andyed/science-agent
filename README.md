# Science Agent

Improve scientific collaboration in AI-assisted research projects.

## Why

AI coding assistants accelerate research but introduce failure modes that undermine the collaboration they're supposed to support: confabulated citations misrepresent collaborators' work, wrong numbers get attributed to real papers, and the same parameter appears with different values across files. These errors erode trust with co-authors and reviewers.

Science Agent catches these problems before they ship. Citation validation is the first capability; claim verification and cross-file consistency are next.

See [FINDINGS.md](FINDINGS.md) for the audit that motivated this tool — 12% of BibTeX entries had issues in a real research project.

## Quick Start: Claude Code Agent

Drop `agent.md` into your project's `.claude/agents/` directory:

```bash
mkdir -p .claude/agents
cp path/to/science-agent/agent.md .claude/agents/science-agent.md
```

Then in Claude Code:
- Ask "check my citations" or "audit references in docs/"
- The agent activates automatically when it detects citation patterns
- Uses WebFetch to verify DOIs against CrossRef — no install needed

## CLI (requires Node.js)

```bash
# Install
git clone https://github.com/andyed/science-agent.git
cd science-agent && npm install

# Audit citations in a directory against a BibTeX file
node cli.js audit ./docs/specs --bibtex=./refs.bib

# Verify a single DOI against CrossRef
node cli.js verify 10.1038/nn.2889

# Search CrossRef by title
node cli.js search "Metamers of the ventral stream"
```

### Audit Output

```
═══ Science Agent Audit ═══

  Directory: ./docs/specs
  BibTeX:    ./refs.bib
  Citations: 62
  In BibTeX: 33
  Orphans:   29
  With DOI:  29
  Ambiguous: 1
  Issues:    30

── Issues ──

  ⚠ [ambiguous] Pelli & Tillman (2008)
    wave3_crowding_validation.md
    matches 2 BibTeX entries — disambiguate with DOI or journal

  ℹ [orphan] Schwartz (1980)
    cmf_mip_derivation.md
    has no BibTeX entry
```

## What It Catches

| Pattern | Example | How |
|---------|---------|-----|
| Wrong title | "Foveation for cortical magnification in visual AI" → actual: "A biologically-inspired foveated interface for deep vision models" | Fuzzy title matching against BibTeX |
| Fabricated co-authors | "Bowers, Tyson & Bhatt" → actual: Bowers, Gegenfurtner & Goettker | CrossRef verification |
| Wrong DOI | `10.1167/jov.25.1.1` resolves to a different paper | CrossRef DOI lookup |
| Compound confabulation | Two papers from same lab merged into one fake citation | CrossRef + title search |
| Ambiguous citation | "Rosenholtz 2012" = 3 different papers | Surname+year collision detection |
| Orphan citation | Inline reference with no BibTeX entry | BibTeX cross-reference |

## Capabilities

### Shipped
- [x] **Citation validation** — audit inline refs against BibTeX, verify DOIs via CrossRef, flag orphans and ambiguous citations
- [x] **Claude Code agent** — drop-in `.claude/agents/` definition, activates on citation patterns
- [x] **CLI** — `audit`, `verify`, `search` commands

### Next
- [ ] **Claim verification** — detect wrong numbers attributed to real papers, cross-file consistency for shared parameters
- [ ] **Research corpus index** — catalog local PDFs with extracted metadata, track what's been read

### Backlog
- [ ] **npm package** — `npx science-agent audit ./docs`
- [ ] **MCP server** — tools for any MCP client
- [ ] **PostToolUse hook** — warn on citation patterns in Write/Edit output

## Origin

Built after discovering AI-confabulated citations in [Scrutinizer](https://github.com/andyed/scrutinizer2025), an open-source peripheral vision simulator. A collaborator checked the arxiv reference to his own paper during a meeting and found the title was wrong. The [full audit](FINDINGS.md) revealed 12% of BibTeX entries had issues and one citation was completely fabricated.

## License

MIT
