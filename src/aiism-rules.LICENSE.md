# License notes for `aiism-rules.json`

The rule data in `aiism-rules.json` is a **multi-source compilation**. Each rule entry declares its origin in a `source` field. The file as a whole is distributed under the union of those licenses — redistributors must honor every applicable source license.

The science-agent package overall is MIT-licensed (see `package.json`); the rule-data file is the exception. This file is not subject to MIT distribution terms because the underlying data carries its own attribution requirements.

## Sources

| Source | License | Rules in this JSON | Obligations |
|---|---|---|---|
| **muriel** (project-specific tics) | MIT-compatible (parent project) | `artifact-*` (LLM tooling residue), `phrase-locus-of`, `phrase-substrate-licenses`, `phrase-doing-its-share`, `phrase-observational-register`, `phrase-names-the-same-observation`, `phrase-the-hope-is-that`, `phrase-looking-into-the-corners`, `phrase-leaky-cursor-aside`, `phrase-earn-their-keep`, `phrase-regime`, project-specific repeated/cluster rules | Attribution preserved in `source` field. |
| **muriel → Vale / Wikipedia derivatives** | **CC-BY-SA-4.0** | Significance-inflation phrases, prescriptive-narrator framing, throat-clearing temporal openers, anthropomorphized research verbs, sourceless-authority hedges, and most cluster rules. Marked in muriel's `aiism.py` docstring. | **Share-alike**: any derivative redistribution that includes these rules must be made available under CC-BY-SA-4.0 (or a compatible license). Attribution to Wikipedia's "Signs of AI writing" article and `ammil-industries/vale-signs-of-ai-writing` must be preserved. |
| **First-party observation** | MIT (project license) | `em-dash-total`, `semicolon-density`, `binary-contrast`. Thresholds and structural detectors chosen by science-agent maintainer based on observed cleanup patterns in own drafts. | Attribution preserved in `source` field. |

## Practical guidance for redistribution

- **Standard use (including commercial)** — the JSON is MIT-distributable for first-party rules and CC-BY-SA-4.0-attributed for muriel/Vale-derived rules. No non-commercial restrictions apply (CC BY-NC content was removed in v2 of the JSON; see CHANGELOG).
- **Share-alike obligation** — any redistribution that retains the muriel → Vale/Wikipedia-derived rules must be made available under CC-BY-SA-4.0 (or compatible). Attribution to Wikipedia "Signs of AI writing" and `ammil-industries/vale-signs-of-ai-writing` must be preserved.
- **Subsetting the rules** — keep `source` fields intact for any rule you retain; per-rule attribution is the canonical record. If you want pure-MIT subset, filter to rules with `source` starting with `"first-party"` or `"muriel (project-specific"`.

## Source field convention

Each rule entry in `aiism-rules.json` includes a `source` field. Example values:

- `"first-party observation (...)"` — MIT (science-agent's parent license)
- `"muriel (project-specific; parent-project license)"` — unencumbered
- `"muriel → Wikipedia/Vale (CC-BY-SA-4.0)"` — share-alike

Note: an earlier draft of this file also referenced **CC BY-NC 4.0** rules ported from academic-research-skills v3.9.4. Those rules (flagged-term, throat-clearing, synonym-cycling, colon-list-sequence, rule-of-three) were removed in JSON v2 to eliminate non-commercial constraints. The engine code that handled those rule kinds is retained in `prose-audit.js` (MIT) and will fire if first-party rules of those kinds are added in future.

When in doubt, treat a rule as the most restrictive license among the declared sources.

## Why this file exists

Rule data in `aiism-rules.json` was assembled from multiple upstream sources, each with its own license. This document makes the per-rule provenance visible at the file level so distributors can satisfy upstream obligations without parsing the JSON.
