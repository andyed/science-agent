# Science Agent

Verify what AI writes about science — citations, claims, and cross-file consistency.

> A README linked to [PMID 12078741](https://pubmed.ncbi.nlm.nih.gov/12078741/) as the foundational paper on Restricted Focus Viewers in vision science. The actual paper at that ID? "Determination of true ileal amino acid digestibility... in barley samples for growing-finishing pigs." The correct PMID was 12723780 — off by 645,039.

## Try it now

```bash
npx github:andyed/science-agent audit ./docs --bibtex=./refs.bib
```

Or verify a single DOI against CrossRef:

```bash
npx github:andyed/science-agent verify 10.1038/nn.2889
```

No install, no clone — runs straight from this repo.

## What it does

### Citation Verification (shipped)

Catches AI-confabulated academic citations before they ship. Verifies inline references against BibTeX and CrossRef:

| Pattern | How |
|---------|-----|
| Wrong title | Fuzzy title matching against BibTeX + CrossRef |
| Fabricated co-authors | CrossRef author list verification |
| Wrong DOI | CrossRef DOI resolution — checks that the DOI points to the claimed paper |
| Compound confabulation | CrossRef + title search detects merged citations |
| Ambiguous citation | Surname+year collision detection across BibTeX entries |
| Orphan citation | Inline reference with no BibTeX entry |

### Notebook Claim Verification (shipped)

Audits `[NB##:K##]` claim references in research prose — the convention where quantitative findings are traced to specific rows in notebook Key Claims blocks:

```bash
science-agent notebook-audit ./docs \
  --aggregate=./docs/notebook-key-claims.md \
  --notebooks=./notebooks-v2 \
  --cross-repo=../downstream-repo
```

Detects:
- **Dangling references** — `[NB14:K3]` cited in prose but K3 doesn't exist in NB14
- **Missing Key Claims blocks** — notebook is cited but has no auditable claims table
- **Stale cross-repo values** — downstream repo quotes pre-fix numbers from upstream

See [`docs/notebook-conventions.md`](docs/notebook-conventions.md) for the full notebook contract.

### Claude Code Agent (shipped)

Drop `agent.md` into your project's `.claude/agents/` directory:

```bash
git clone https://github.com/andyed/science-agent.git
mkdir -p .claude/agents
cp science-agent/agent.md .claude/agents/science-agent.md
```

Then in Claude Code:
- Ask "check my citations" or "audit references in docs/"
- The agent activates automatically when it detects citation patterns
- Uses WebFetch to verify DOIs against CrossRef — no install needed

## CLI

```bash
# Install
git clone https://github.com/andyed/science-agent.git
cd science-agent && npm install

# Audit citations in a directory against a BibTeX file
node cli.js audit ./docs/specs --bibtex=./refs.bib

# Audit notebook claim references
node cli.js notebook-audit ./docs --aggregate=./docs/notebook-key-claims.md

# Audit recent arXiv papers (baseline check)
node cli.js arxiv 10 --cat=cs.AI

# Verify a single DOI against CrossRef
node cli.js verify 10.1038/nn.2889

# Search CrossRef by title
node cli.js search "Metamers of the ventral stream"
```

### Audit output

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

## Why this exists

AI coding assistants confabulate academic citations at a measurable rate. The model gets 95% right — correct author surname, approximate title, right journal, right year — then fabricates the remaining 5%. This is dangerous because it passes casual review.

| Source | Error rate |
|--------|-----------|
| Human-authored arXiv papers (our spot-check) | **0%** |
| Human-written project docs ([our audit](FINDINGS.md)) | 0–7% |
| AI-assisted project docs ([our audit](FINDINGS.md)) | **12–24%** |
| AI-generated citations across 13 LLMs ([GhostCite](https://arxiv.org/abs/2602.06718)) | **14–95%** |

The fix: **require a DOI for every citation. Verify it against CrossRef.** In our corpus, DOI presence had a 0% confabulation rate. Science Agent automates this.

See [FINDINGS.md](FINDINGS.md) for the complete audit with methodology, data, patterns, and the 95/5 confabulation taxonomy.

## Roadmap

- **Claim content verification** — detect wrong numbers attributed to real papers, cross-file consistency for shared parameters
- **Research corpus index** — catalog local PDFs with extracted metadata, track what's been read
- **MCP server** — tools for any MCP client

## Related work

| Project | What it does | How science-agent differs |
|---------|-------------|--------------------------|
| [GhostCite / CiteVerifier](https://github.com/NKU-AOSP-Lab/CiteVerifier) | DBLP-based citation title verification | We use CrossRef (broader coverage), verify DOIs + authors + titles, and work as a Claude Code agent |
| [CiteAudit](https://arxiv.org/abs/2602.23452) | Multi-agent verification pipeline + web service | Not open source. Science-agent is local-first, CLI, and embeds in your dev workflow |
| [CiteME](https://arxiv.org/abs/2407.12861) | Benchmark: can LLMs identify source papers from excerpts? | Benchmark, not a tool. Different task (retrieval vs. verification) |
| [Context Rot](https://github.com/chroma-core/context-rot) | Measures general LLM degradation with context length | Methodology foundation for understanding why hallucination worsens under load |
| [Claude Scholar](https://github.com/Galaxy-Dawn/claude-scholar) | Full research lifecycle config for Claude Code | Workflow orchestrator with prompt-based citation checking. Science-agent could serve as its verification backend via MCP |

![Go-go gadget peer review](assets/gogogadget-peer-review.png)

*The arms are AI. The microscope is yours.*

[**andre-inter-collab-llc/research-workflow-assistant**](https://github.com/andre-inter-collab-llc/research-workflow-assistant) — Andre Nogueira's open-source Research Workflow Assistant: a VS Code + GitHub Copilot stack of custom agents and MCP servers (PubMed, OpenAlex, Semantic Scholar, Europe PMC, CrossRef, Zotero) for systematic reviews and academic writing. Different domain (biomedical research workflows vs citation verification), same underlying bet: researchers already have VS Code, git, and Markdown — give them an LLM with the right agent scaffolding and they can assemble their own compliant research assistants.

## Origin

Built after discovering AI-confabulated citations in [Scrutinizer](https://github.com/andyed/scrutinizer2025), an open-source peripheral vision simulator. A collaborator checked the arxiv reference to his own paper during a meeting and found the title was wrong. The [full audit](FINDINGS.md) revealed systematic patterns that replicated across a second project in a different domain.

## License

MIT
