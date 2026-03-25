# AI Citation Confabulation: Findings from the Scrutinizer Corpus

> **Share this document.** It's the full audit with methodology, data, and patterns.
> The [science-agent](https://github.com/andyed/science-agent) tool was built in response to these findings.

## What happened

A collaborator checked the arxiv reference to his own paper during a video call. The title in our docs was wrong — not a typo, but a plausible-sounding variant the AI had generated. We audited the rest of our citation corpus. It wasn't isolated.

## The corpus

- **Project:** [Scrutinizer](https://github.com/andyed/scrutinizer2025), an open-source peripheral vision simulator
- **34 papers** in BibTeX (`references.bib`)
- **~70 inline citations** across 30+ spec/design documents
- **All written with AI coding assistant** (Claude Code / Claude Opus) over 3 months of active development
- **Real research project** with published collaborators — not a synthetic benchmark

## Audit 1: Structural errors (2026-03-19)

Cross-referenced every inline citation against BibTeX and checked for internal consistency.

### What we found

| Category | Count | Example |
|----------|-------|---------|
| **Fabricated co-authors** | 2 | "Bowers, Tyson & Bhatt" — real authors: Bowers, Gegenfurtner & Goettker |
| **Wrong paper title** | 4 | "Foveation for cortical magnification in visual AI" — actual: "A biologically-inspired foveated interface for deep vision models" |
| **Fully fabricated citation** | 1 | Zhang et al. 2015 — title from a different paper (Pelli et al. 2004), authors/year/volume all invented |
| **Wrong article numbers** | 1 | eLife article e84205 attributed to wrong authors |
| **Misattributed title** | 1 | Pelli 2008 given the title of Pelli et al. 2004 |
| **Author order reversed** | 2 | "Blauch, Konkle & Alvarez" — correct: Blauch, Alvarez & Konkle |

**BibTeX entries with issues:** 4/34 (12%)
**Orphan citations with issues:** 3/~70 (~4%)

### The 95/5 pattern

The model gets 95% right — correct author surname, approximate title, right journal, right year. Then confabulates the remaining 5%: specific co-authors, exact title wording, article/volume numbers. This is the most dangerous class of error because it passes casual review. You'd have to open the actual paper to catch it.

## Audit 2: CrossRef verification (2026-03-20)

Verified the 8 highest-risk citations against CrossRef API. **3 of 8 had errors:**

### Bowers et al. 2025

This paper provides the shader's chromatic decay constants (`rg_decay`, `yv_decay`). The science was correct — right lab, right topic. Three of six BibTeX fields were wrong:

- **Wrong first name:** "Nils" → actual: "Norick R."
- **Wrong title:** "Chromatic sensitivity across the visual field" → actual: "Chromatic and achromatic contrast sensitivity in the far periphery"
- **Wrong DOI:** `10.1167/jov.25.1.1` resolved to a completely different paper (Hirata & Kawai 2025). Correct DOI: `10.1167/jov.25.11.7`

### Jiang et al. 2022

This paper provides the suprathreshold exponent (~0.5) used in the shader. Again, the science was correct but the metadata was fabricated:

- **Wrong first name:** "Yijun" → actual: "Zhuohan"
- **Wrong title:** "Suprathreshold chromatic contrast perception across the visual field" (appears to be an ARVO abstract title) → actual full paper: "Achromatic and chromatic perceived contrast are reduced in the visual periphery"
- **Wrong DOI:** `10.1167/jov.22.14.4319` returns HTTP 404. Correct DOI: `10.1167/jov.22.12.3`

### Barbot et al. 2021 — compound confabulation

The most alarming pattern. The model merged two real papers from the same lab into one fake citation:

- **Entry claimed:** Barbot, Xue & Carrasco (2021). "Cortical magnification eliminates differences..." *eLife*, 10, e84205
- **Actual eLife paper e84205:** Jigo, Tavdy, Himmelberg & Carrasco (2023) — different authors, different year, different title
- **Actual Barbot paper:** Barbot, Xue & Carrasco (2021). "Asymmetries in visual acuity around the visual field." *JOV* 21(1):2 — different title, different journal

The model knew the Carrasco lab's work but couldn't keep two papers separate. It generated a citation with the right first author + the wrong paper's article number + a fabricated title that sounds like a plausible blend of both.

### Cleared (no errors)

- Ashraf et al. 2024 (castleCSF) — all fields correct, DOI resolves
- Pelli et al. 2007 — exists as cited
- Campbell et al. 1966 — exists as cited

## What predicts confabulation

| Factor | Effect | Evidence |
|--------|--------|----------|
| **DOI present** | Strongly protective | 0% confabulation rate when DOI was in the citation |
| **Classic papers (pre-2000)** | Immune | 0/8 confabulated — Bouma, Schwartz, Kuffler all clean |
| **Article/issue numbers** | Highest-risk field | Both verified-wrong DOIs looked plausible but pointed elsewhere |
| **"et al." shorthand** | Hides errors | Zhang "et al." concealed 5 fabricated authors |
| **Prolific author + same year** | Disambiguation failure | "Rosenholtz 2012" mapped to 3 different papers |
| **First names** | Confabulated | Norick→Nils, Zhuohan→Yijun — model invents plausible alternatives |
| **Same-lab papers** | Merged | Barbot/Jigo compound confabulation: right lab, wrong paper |

### What does NOT predict it

| Factor | Finding |
|--------|---------|
| **Citation frequency** | FOVI cited 64 times — still wrong. Repetition propagates the first confabulation, doesn't correct it. |
| **BibTeX presence** | 12% error rate WITH a BibTeX entry. The entry itself can be confabulated. |
| **Document type** | Planning docs and implementation docs had similar rates |

## New failure modes (Audit 2)

Three patterns not seen in the first audit:

1. **DOIs that resolve to the wrong paper.** Both Bowers and Jiang had DOIs that looked plausible but pointed to completely different papers. A human scanning the BibTeX would see a valid-looking DOI and assume it's correct.

2. **Compound confabulation.** Merging two real papers from the same research group into one fake citation. The model has distributional knowledge of the lab's output but can't maintain boundaries between individual papers.

3. **First name fabrication.** The model generates plausible first names when it doesn't have the exact one. "Norick" becomes "Nils." "Zhuohan" becomes "Yijun." Both sound like real names; neither is correct.

## Why this matters

- **Citation graphs propagate errors.** If Paper A cites a confabulated reference, Paper B citing Paper A inherits the error. The confabulation enters the scholarly record.
- **AI-assisted writing is already standard.** This isn't a future risk — researchers are using AI assistants for literature reviews, spec documents, and paper drafts right now.
- **Peer reviewers don't check citation metadata.** They verify that the cited claim supports the argument. They don't open each paper to confirm the title matches.
- **Preprints have no editorial citation check at all.** A confabulated citation in a preprint can propagate before anyone notices.

## Mitigation

### What works now

1. **Require DOI for every citation.** Strongest protective factor (0% error rate). A DOI is a verifiable link to the canonical record.
2. **Expand "et al."** — always list full author names. The shorthand hides confabulated co-authors.
3. **Verify against CrossRef.** `science-agent verify <doi>` checks a DOI in seconds.
4. **Disambiguate prolific authors.** "Rosenholtz 2012" is not a citation — it's an ambiguous pointer to 3 different papers. Add the journal or DOI.

### What we built

**[science-agent](https://github.com/andyed/science-agent)** — a CLI tool that:

```bash
science-agent audit ./docs --bibtex=refs.bib    # find orphans, ambiguous citations
science-agent verify 10.1167/jov.25.11.7        # check a DOI against CrossRef
science-agent search "chromatic sensitivity"     # find the real paper
```

Built in response to this audit. Open source (MIT). Node.js, CrossRef API, fuzzy title matching.

### What the field needs

- Citation verification as a standard step in AI-assisted writing pipelines
- Preprint servers flagging citations that don't resolve to real DOIs
- AI tools distinguishing "I know this citation" from "I'm generating a plausible citation" — current architectures can't make this distinction, but the failure mode should be documented
- Academic style guides updated for AI-assisted writing: "verify every citation against its DOI" as a checklist item

## Replication: ClickSense corpus (2026-03-22)

The Scrutinizer audit raised the question: is this a domain-specific problem (vision science is niche, maybe the model's training data is thin) or a systemic one? We ran the same audit methodology on a second project — [ClickSense](https://github.com/andyed/clicksense), a mouse click dynamics library — covering HCI, motor control, and cognitive psychology literature. Different domain, different papers, different co-author.

### The corpus

- **Project:** ClickSense — mousedown-to-mouseup hold duration as cognitive signal
- **Three documents audited:**
  - `clicksense-paper.md` (human-written, 4 citations) — **0% error rate**
  - `RELATED_PARADIGMS.md` (human-written with AI assist, 14 citations) — **7% error rate** (1 wrong vol/pages)
  - `related-paradigms.md` (AI-generated research survey, 25 citations) — **24% error rate** (6 errors)

### What we found

**AI-generated document (related-paradigms.md):** 6 of 25 citations had errors.

| Citation | Error Type | What Happened |
|----------|-----------|---------------|
| "Shadmehr et al. 2025" TICS | **Wrong authors** | Paper is by Thura, Haith, Derosiere & Duque. Model assigned it to the most famous researcher in the vigor field. |
| Yoon et al. 2018 | **Wrong venue + title** | Published in PNAS, not JEEA. Title was confabulated. |
| "Davarpanah Jazi & Heath 2017" | **Wrong authors** | Article 11703 in Sci Rep is by Nashed, Diamond, Gallivan, Wolpert & Flanagan. |
| "Pantic & Rothkrantz 2004" BIT | **Wrong authors** | That BIT paper is by Macaulay. Pantic & Rothkrantz published a different paper (IEEE, 2003). |
| "Kaixin et al. 2024" ACM | **Fabricated first author** | First author is Khan (Simon Khan). "Kaixin" doesn't appear among the authors. |
| "Freihaut & Göritz 2022" | **Wrong year, volume, pages, author count** | Published 2021 not 2022, vol 53 not 54, 4 authors not 2. |

**Human-written documents:** 1 error across 18 citations (Yu et al. 2012 had wrong volume/issue/pages in the original RELATED_PARADIGMS.md). The human-written clicksense-paper.md had 4 citations, all verified clean against CrossRef.

**Commercial repo paper (i2lab/clicksense):** 14 citations, 1 error — Azzopardi et al. cited as 2013/36th SIGIR, actually 2018/41st SIGIR. This is a human memory error (wrong year), not an AI confabulation pattern.

### The pattern replicates

| Pattern | Scrutinizer | ClickSense |
|---------|------------|------------|
| 95/5 rule (right paper, wrong metadata) | Yes | Yes |
| Famous-author misattribution | Blauch given wrong co-author order | Shadmehr attributed a paper he didn't write |
| Compound confabulation (two papers merged) | Barbot + Jigo merged into one | Pantic & Rothkrantz (IEEE 2003) merged with Macaulay (BIT 2004) |
| First name fabrication | Norick→Nils, Zhuohan→Yijun | "Kaixin" (doesn't exist) for Khan |
| Venue swap | — | PNAS paper cited as JEEA |
| Year/volume drift | DOI resolved to wrong paper | 2021→2022, vol 53→54 |
| Human-written vs AI-generated | 12% in BibTeX (AI-generated) | 0% human-only, 24% AI-generated |

### New findings from the replication

1. **The error rate scales with AI involvement.** Human-written citations: ~4-7% error rate (mostly minor). AI-generated research surveys: 24% error rate with wrong author attributions. The more the AI writes without human verification, the worse it gets.

2. **Famous-author gravity.** The model attributes papers to the most prominent researcher in a field, even when they're not an author. Shadmehr didn't write the 2025 TICS paper on vigor co-regulation — but he wrote the foundational work, so the model assumes he's on every vigor paper. Same pattern as Scrutinizer: Carrasco lab papers merged because Carrasco is the most cited name in the peripheral vision field.

3. **This is not domain-specific.** Vision science, HCI, motor control, cognitive psychology — four different subfields, same failure modes. The confabulation patterns are properties of the language model, not properties of any particular training data gap.

4. **The fix works across domains.** CrossRef DOI verification caught every error in both corpora. The `science-agent verify` workflow is domain-agnostic.

## The closing observation

The fix isn't "don't use AI for research." The fix is "verify the 5% the AI is most likely to get wrong." In our corpus, that's co-author lists, exact titles, and article numbers. A DOI resolves all three. The cost of adding a DOI to every citation is trivial. The cost of propagating fabricated references through the scientific literature is not.

---

**Project:** [Scrutinizer](https://github.com/andyed/scrutinizer2025) — open-source peripheral vision simulator
**Tool:** [science-agent](https://github.com/andyed/science-agent) — detect AI-confabulated citations
**Author:** Andy Edmonds ([@andyed](https://github.com/andyed))
