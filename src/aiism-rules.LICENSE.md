# License notes for `aiism-rules.json`

The rule data in `aiism-rules.json` is distributed under the science-agent project's **MIT license**. All rules carry a `source` field; per-rule attribution is preserved as a matter of provenance, not because any source imposes additional obligations.

## Sources

| Source | License | Rules in this JSON | Obligations |
|---|---|---|---|
| **First-party observation** | MIT (project license) | `em-dash-total`, `semicolon-density`, `binary-contrast`. Thresholds and structural detectors chosen by maintainer based on cleanup patterns in own drafts. | Attribution preserved in `source` field. |
| **muriel** (project-specific tics) | MIT-compatible (parent project) | `artifact-*` (LLM tooling residue), `phrase-locus-of`, `phrase-substrate-licenses`, `phrase-doing-its-share`, `phrase-observational-register`, `phrase-names-the-same-observation`, `phrase-the-hope-is-that`, `phrase-looking-into-the-corners`, `phrase-leaky-cursor-aside`, `phrase-earn-their-keep`, `phrase-not-just-but`, `phrase-regime`, project-specific repeated rules (`load-bearing`, `structurally`, `materially`, `meaningfully`, `already-compound`), `doubled-cleft`, three `engine` declarations. | Attribution preserved in `source` field. |

## Practical guidance

- **Use, including commercial, is unencumbered.** The JSON is MIT-distributable. No share-alike or non-commercial restrictions apply.
- **Subsetting / forking the rules** — keep `source` fields intact for any rule you retain; per-rule attribution is the canonical record.

## Source field convention

Each rule entry includes a `source` field. Current values:

- `"first-party observation (...)"` — MIT (science-agent's parent license)
- `"muriel (project-specific; parent-project license)"` — unencumbered

## History

Earlier drafts of this JSON included rules ported from two outside sources, both removed to keep the file commercial-use-clean:

- **CC BY-NC 4.0** rules from academic-research-skills v3.9.4 (flagged-term lists, throat-clearing openers, synonym groups, plus colon-list-sequence and rule-of-three engine entries) — removed in JSON **v2** (CHANGELOG 0.3.0).
- **CC-BY-SA-4.0** rules derived from Wikipedia "Signs of AI writing" and `ammil-industries/vale-signs-of-ai-writing` via muriel (significance-inflation phrases, prescriptive-narrator framing, throat-clearing temporal openers, anthropomorphized research verbs, sourceless-authority hedges, four cluster detectors) — removed in JSON **v3** (CHANGELOG 0.4.0).

The detection engines for all removed rule kinds are retained in `prose-audit.js` (MIT). If first-party rule entries of those kinds are added in future (based on this project's own observations), the engines fire automatically.

## Why this file exists

To document the license history of `aiism-rules.json` and keep the provenance trail clear for forks or audits, even after the externally-sourced rules were removed.
