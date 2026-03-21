# Citation Guardian

Detect AI-confabulated academic citations before they enter the scholarly record.

## The Problem

AI coding assistants confabulate citations at a measured rate of ~12% in real research codebases. The pattern: 95% correct (author surname, approximate title, journal, year), 5% fabricated (co-authors, exact title wording, article numbers, DOIs). This passes casual review and propagates through citation graphs.

See [FINDINGS.md](FINDINGS.md) for the full audit that motivated this tool.

## Quick Start: Claude Code Agent

Drop `agent.md` into your project's `.claude/agents/` directory:

```bash
mkdir -p .claude/agents
cp path/to/citation-guardian/agent.md .claude/agents/citation-guardian.md
```

Then in Claude Code:
- Ask "check my citations" or "audit references in docs/"
- The agent activates automatically when it detects citation patterns
- Uses WebFetch to verify DOIs against CrossRef — no install needed

## CLI (requires Node.js)

```bash
# Install
git clone https://github.com/andyed/citation-guardian.git
cd citation-guardian && npm install

# Audit citations in a directory against a BibTeX file
node cli.js audit ./docs/specs --bibtex=./refs.bib

# Verify a single DOI against CrossRef
node cli.js verify 10.1038/nn.2889

# Search CrossRef by title
node cli.js search "Metamers of the ventral stream"
```

### Audit Output

```
═══ Citation Guardian Audit ═══

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

## Roadmap

- [x] **Claude Code agent** — drop-in `.claude/agents/` definition
- [x] **CLI** — audit, verify, search
- [ ] **npm package** — `npx citation-guardian audit ./docs`
- [ ] **MCP server** — tools for any MCP client
- [ ] **PostToolUse hook** — warn on citation patterns in Write/Edit output
- [ ] **Phase 4: Claim auditor** — detect wrong numbers attributed to real papers

## Origin

Built after discovering AI-confabulated citations in [Scrutinizer](https://github.com/andyed/scrutinizer2025), an open-source peripheral vision simulator. A collaborator checked the arxiv reference to his own paper during a video call and found the title was wrong. The [full audit](FINDINGS.md) revealed 12% of BibTeX entries had issues and one citation was completely fabricated.

## License

MIT
