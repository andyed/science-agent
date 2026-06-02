

# Changelog

## Unreleased

- **`hypothesis-card` command + spec** — `/science-agent:hypothesis-card "<falsifiable claim>"` drafts a pre-registration card (claim, metric + evaluation protocol, named baseline, pass threshold, compute budget, leakage screen, priming citations) per [`docs/hypothesis-card-spec.md`](docs/hypothesis-card-spec.md). Notebook Key Claims gain an optional `[H##]` column tying an executed result back to the card it was registered against — see the Hypothesis Carry-Forward section in [`docs/notebook-conventions.md`](docs/notebook-conventions.md). Prompt-only (no CLI subcommand); the card is the pre-commit discipline that `notebook-audit` later verifies.
- **`arxiv-search` command** — search arXiv by free text or `--id`, returning structured metadata including the published `arxiv:doi` and `arxiv:journal_ref`. Surfaces a preprint's journal DOI ready to pipe into `verify` (the find→verify pattern). Clean-room Node reimplementation of the `literature_search_arxiv` capability in [google-deepmind/science-skills](https://github.com/google-deepmind/science-skills) (Apache-2.0) — built against the public arXiv API, no Python dependency, repo stays MIT. Adds slash command `/science-agent:arxiv-search`; `--json` output is clean (header suppressed) for chaining.
- **skills.sh distribution** — added [`skills/science-agent/SKILL.md`](skills/science-agent/SKILL.md) so the toolkit installs into any skills.sh-compatible agent via `npx skills add andyed/science-agent`, alongside the existing Claude Code plugin path.
- **Related work** — added google-deepmind/science-skills to the README comparison table (retrieval vs. verification framing).
- **Docs: `prose-audit` plugin status corrected** — the README still said `prose-audit` was "not in the plugin yet" and required a Python/muriel install; it has shipped natively (rules in [`src/aiism-rules.json`](src/aiism-rules.json), engine in [`src/prose-audit.js`](src/prose-audit.js)) with muriel/Python as an optional pass. Reconciled the README plugin section and the marketplace.json description to advertise `/science-agent:prose-audit` (and `/science-agent:hypothesis-card`).
- **TODO.md** — captured two follow-ups inspired by science-skills: a native-Node shared lib to unblock `prose-audit`, and a skill-creator meta-skill for the Phase 4 claim-audit.

## 0.6.0 (2026-05-19)

- **Added 4 sentence-fragment detectors** triggered by AllSERP paper cleanup (non-sentence-sentence patterns):
  - `fragment-discourse-marker` — "Such as / Including / Especially / For example / Importantly / Hence / etc." opener followed by ≤60 chars and a period (e.g. "We collected gaze data. Including pixel-accurate bboxes. Then…").
  - `fragment-participial` — Participial phrase ("Resulting in / Following / Given / Based on / Building on / etc.") as standalone sentence (e.g. "Then we ran the pipeline. Resulting in 2,776 trials.").
  - `fragment-relative-clause` — Relative clause ("Which / That / Who") as standalone sentence (e.g. "The data validated. Which is why we trust it.").
  - `fragment-standalone-adverb` — One-word "sentences" like "Importantly." / "Notably." / "Hence." — common in AI prose, fix by attaching to the following sentence.
- All four are single-phrase rules with length-bounded patterns (≤60 chars between opener and period) so they don't false-positive on legitimate long sentences that happen to start with the same words. Verified zero false positives on allserp-paper/paper.tex (the freshly cleaned-up source).
- Source attribution: first-party observation grounded in this project's own AllSERP cleanup. These patterns are widely documented in academic writing style guides; the specific regex bounds and message text are first-party.

## 0.5.0 (2026-05-19)

- **Activated two more native rule-kind engines: `single-phrase` and `hard-artifact`** in [`src/prose-audit.js`](src/prose-audit.js). These engines were missing from the dispatcher in 0.4.0, which meant 19 muriel-derived rules already in the JSON (8 hard-artifact LLM-tooling detectors, 11 single-phrase project-specific tics) were sitting unused. They now fire.
- **Added 4 BSD-3-Clause rules sourced from amperser/proselint v3**: `metadiscourse` (5 meta-commentary phrases), `professional-narcissism` ("In recent years, an increasing number of Xists have…"), `hedging-phrases` (I would argue that / to a certain degree), `apologizing-more-research` ("More research is needed"). Each entry's `source` field cites proselint and its BSD-3-Clause license. The license file ([`src/aiism-rules.LICENSE.md`](src/aiism-rules.LICENSE.md)) now reproduces the proselint LICENSE verbatim per BSD-3-Clause redistribution requirements.
- **What this recovers from the 0.4.0 cleanup**: re-establishes meta-commentary detection (was `phrase-it-is-important`), hedging detection (was implicit in cluster-hedges), and a narrower throat-clearing pattern. Doesn't fully replace the 25 CC-BY-SA-4.0 rules removed in 0.4.0 — but adds 4 cleanly-licensed alternatives and activates 19 previously-dormant ones, for a net gain of 23 firing rules.
- **Known follow-up**: `hard-artifact` engine receives stripped text (loses `oaicite` tokens that sit inside markdown backticks). The fix is to pass raw text to that engine specifically; small refactor.

## 0.4.0 (2026-05-19)

- **Removed CC-BY-SA-4.0 (Wikipedia/Vale-derived) muriel rules from `aiism-rules.json`** — Drops the 25 rules attributed to `muriel → Wikipedia/Vale (CC-BY-SA-4.0)`: significance-inflation phrases (`phrase-testament-to`, `phrase-plays-a-role`, `phrase-underscores`, `phrase-stands-as`, `phrase-serves-as`, `phrase-rich-heritage`, `phrase-indelible-mark`, `phrase-contributes-to`, `phrase-reminder-of`), prescriptive-narrator framing (`phrase-it-is-important`, `phrase-one-must`, `phrase-needless-to-say`, `phrase-worth-mentioning`), throat-clearing temporal openers (`phrase-recent-years`, `phrase-past-decade`, `phrase-todays-world`, `phrase-modern-era`), anthropomorphized research verbs (`phrase-research-unveiled`), sourceless-authority hedges (`phrase-vague-attribution`), and four cluster detectors (`cluster-padded-vocab`, `cluster-hedges`, `cluster-firstly-thirdly`, `cluster-significance-verbs`).
- **Why:** share-alike would have required any redistribution of the JSON to remain CC-BY-SA-4.0, constraining commercial use of science-agent and downstream consumers. Removing leaves the JSON cleanly MIT-distributable.
- **What stays (32 rules):** 8 muriel hard-artifact detectors (project-specific LLM-tooling residue), 11 muriel project-specific phrase tics, 5 muriel intensifier-repetition rules, `doubled-cleft`, 3 engine declarations (sentence-too-long, bold-overuse, density-em-dash-line), 3 first-party threshold rules (em-dash-total, semicolon-density, binary-contrast).
- **What's lost:** universal AI-tell coverage — the Vale/Wikipedia patterns applied to anyone's prose. Replacements can be added over time as first-party rule entries grounded in observed cleanups.
- **JS engines unchanged.** All rule-kind handlers in `prose-audit.js` still exist and will fire if matching JSON entries are added.
- **License file** ([`src/aiism-rules.LICENSE.md`](src/aiism-rules.LICENSE.md)) updated: only MIT and parent-project sources remain in the obligations table; CC-BY-SA-4.0 and CC BY-NC 4.0 moved to a "History" section noting both removals.
- **Follow-up planned for muriel** itself — the inline tables in `muriel/aiism.py` still contain the same 25 CC-BY-SA-4.0 rules. Cleaning muriel matches science-agent's commercial-use posture; tracked as a separate change.

## 0.3.0 (2026-05-19)

- **Removed all CC BY-NC 4.0 content from `aiism-rules.json`** — The ARS-derived rule lists shipped briefly in 0.2.0 (`flagged-term` 25-word list, `throat-clearing` 12-opener list, `synonym-cycling` 6-group list, plus the `colon-list-sequence` and `rule-of-three` engine entries) carried a non-commercial restriction that would have constrained downstream use of science-agent and any consumer (muriel, plugins). They are gone in JSON v2.
- **Retained as first-party thresholds**: `em-dash-total` (≤3/paper), `semicolon-density` (≤2/1000w), `binary-contrast` (≤2/paper). These are simple numeric/structural rules supported by direct observation in this project's own draft cleanups (paper.tex had 13 em-dashes, 20 semicolons, and a "Two flavors, two stories" binary-contrast tic). The numbers are the maintainer's threshold call; the detector code is MIT (mine).
- **JS engine code unchanged.** `auditFlaggedTerms`, `auditThroatClearing`, `auditSynonymCycling`, etc. still exist in `prose-audit.js` (MIT). If the JSON later gains first-party rule entries of those kinds (e.g., a `flagged-term-group` rule populated from observed cleanups in this repo's own drafts), the engine fires them. Removing the data didn't remove the machinery.
- **License file updated**: [`src/aiism-rules.LICENSE.md`](src/aiism-rules.LICENSE.md) now describes only the two surviving license regimes — first-party (MIT) and muriel-derived (CC-BY-SA-4.0 + project-specific).

## 0.2.0 (2026-05-18)

- **`aiism-rules.json` — canonical rule data** — Extracted the native rule definitions (patterns, thresholds, messages, alternatives, synonym groups, throat-clearing openers) from inline JS into [`src/aiism-rules.json`](src/aiism-rules.json). Detection engines stay in [`src/prose-audit.js`](src/prose-audit.js); rule parameters live in JSON and are loaded once at startup. New rules can be added without code changes. Schema documented inline in the JSON (8 rule kinds: `flagged-term-group`, `doc-count-limit`, `doc-rate-limit`, `sentence-opener-group`, `synonym-group`, plus `engine` entries for `rule-of-three`, `colon-list-sequence`, `binary-contrast`). Planned: `muriel/aiism.py` adopts the same JSON in a follow-up so both engines share one source of truth.
- **`prose-audit` native rule set + `.tex` support** — Ported the AI-tell detection rules from `academic-research-skills` v3.9.4 (CC BY-NC 4.0) into native JavaScript so `prose-audit` no longer depends on a Python sidecar for the new categories. Four new rule families:
  - **Flagged terms** (`flagged-term`) — 25 overused AI-text words (delve, tapestry, pivotal, leverage, robust, …) with context-dependent alternatives.
  - **Punctuation density** — `em-dash-total` (≤3 per paper, both Unicode `—` and LaTeX `---`/`--`), `semicolon-density` (≤2 per 1000 words), `colon-list-sequence` (2+ consecutive colon-intro→list paragraphs).
  - **Throat-clearing openers** (`throat-clearing`) — 12 sentence-starter clichés ("In the realm of…", "It's important to note that…", "In order to…", …).
  - **Structure patterns** — `rule-of-three` (every list in a section has exactly 3 items), `synonym-cycling` (3+ near-synonyms in one paragraph across six concept groups), `binary-contrast` ("Not X. Y." > 2 per paper).
  - **`.tex` files now audited** alongside `.md` and `.ipynb`. LaTeX is stripped to prose with newline-preserving substitution so reported line numbers map back to the source file. Comments, math, `\cite/\ref/\label`, and verbatim/CCSXML environments are dropped; `\textbf{…}`, `\section{…}`, etc. are unwrapped in place.
  - Muriel pass-through is retained for `.md`/`.ipynb` when `python3` and `muriel.aiism` are available — findings are merged and tagged with `source: native | muriel`. The native rules run unconditionally, removing the hard Python dependency that previously blocked plugin distribution.
- **`hypothesis-card`** — Slash command + spec for pre-registering a single falsifiable claim. Schema: claim, dataset, metric+protocol, baseline, threshold (effect size + uncertainty), compute budget, **leakage screen**, citations. H-IDs cross-reference into Key Claims via a new `H` column, closing the loop between pre-commitment and executed measurement. Schema lifted from Lossfunk `ai-scientist-artefacts-v1` (Agents4Science 2025) with two project-specific additions: a required leakage-screen field (forced by the AdSERP `final_dist` lesson) and a *Tested by* / *Result* block that threads back into the notebook substrate. Spec at `docs/hypothesis-card-spec.md`; carry-forward conventions in `docs/notebook-conventions.md`.
- **Claude Code plugin** — `/plugin install andyed/science-agent` registers sub-agents and slash commands (`/science-agent:audit`, `:figure-audit`, `:notebook-audit`, `:verify`, `:search`, `:aggregate`, `:arxiv`, `:prose-audit`). SessionStart hook installs npm deps into `${CLAUDE_PLUGIN_DATA}` so the CLI works out of the box. Manifest at `.claude-plugin/plugin.json`. `prose-audit` can now ship in the plugin because its core rules are native Node (Python muriel remains an optional augmentation).
- **`prose-audit`** — Lint paper drafts for AI-tell prose patterns. Bridges to `muriel.aiism` (Python; canonical rule table) via subprocess for `.md`/`.ipynb`, plus the native rule set above. Surfaces em-dash addiction, intensifier repetition, definitional clefts, "What X is Y" / "not X but Y" tics, "already-Y" compounds, mid-paragraph bold, and overlong sentences. Pencil-aware (skips locked sentences). Sibling agent at `agents/prose-audit.md`.
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
