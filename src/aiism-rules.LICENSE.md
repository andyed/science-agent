# License notes for `aiism-rules.json`

The rule data in `aiism-rules.json` is distributed under the science-agent project's **MIT license**. All rules carry a `source` field; per-rule attribution is preserved as a matter of provenance, not because any source imposes additional obligations.

## Sources

| Source | License | Rules in this JSON | Obligations |
|---|---|---|---|
| **First-party observation** | MIT (project license) | `em-dash-total`, `semicolon-density`, `binary-contrast`. Thresholds and structural detectors chosen by maintainer based on cleanup patterns in own drafts. | Attribution preserved in `source` field. |
| **muriel** (project-specific tics) | MIT-compatible (parent project) | `artifact-*` (LLM tooling residue), `phrase-locus-of`, `phrase-substrate-licenses`, `phrase-doing-its-share`, `phrase-observational-register`, `phrase-names-the-same-observation`, `phrase-the-hope-is-that`, `phrase-looking-into-the-corners`, `phrase-leaky-cursor-aside`, `phrase-earn-their-keep`, `phrase-not-just-but`, `phrase-regime`, project-specific repeated rules (`load-bearing`, `structurally`, `materially`, `meaningfully`, `already-compound`), `doubled-cleft`, three `engine` declarations. | Attribution preserved in `source` field. |
| **proselint** v3 | **BSD-3-Clause** (Copyright © 2014–2015 Jordan Suchow, Michael Pacer, Lara A. Ross; github.com/amperser/proselint) | `metadiscourse`, `professional-narcissism`, `hedging-phrases`, `apologizing-more-research`. Each rule's pattern and intent matches a corresponding check in `proselint/checks/misc/` or `proselint/checks/hedging.py`. | **Attribution required**: this LICENSE file preserves the proselint copyright. **No-endorsement**: the proselint author names may not be used to promote derivative products without their permission. |

## Practical guidance

- **Use, including commercial, is unencumbered.** All sources in this JSON are commercial-use-friendly (MIT-compatible, BSD-3-Clause permissive). No share-alike or non-commercial restrictions apply.
- **Attribution must be preserved.** BSD-3-Clause requires that copyright notices and the license text remain in any redistribution; this file satisfies that.
- **No-endorsement.** The names of proselint authors may not be used to promote derivative products without their written permission.
- **Subsetting / forking the rules** — keep `source` fields intact for any rule you retain; per-rule attribution is the canonical record.

## proselint BSD-3-Clause license text

The following is the proselint LICENSE.md, reproduced verbatim per BSD-3-Clause redistribution requirements:

> Copyright © 2014–2015, Jordan Suchow, Michael Pacer, and Lara A. Ross
> All rights reserved.
>
> Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
> 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

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
