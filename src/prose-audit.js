'use strict';

/**
 * Prose audit — anti-AI-tell linting for paper drafts.
 *
 * Rule data is loaded from src/aiism-rules.json (the canonical source of
 * truth for AI-tell rule definitions). The detection engines live in this
 * file; rule parameters (patterns, thresholds, messages, alternatives) come
 * from JSON so they can be edited without code changes — and so that
 * sibling engines (muriel/aiism.py, planned) can load the same file.
 *
 * Optional second source: muriel.aiism (Python subprocess) — the legacy
 * canonical rule table still covers some rules not yet migrated to JSON
 * (intensifier repetition, definitional clefts, hard LLM-tool artifacts,
 * etc.). Loaded if python3 + muriel are available; otherwise skipped.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_PYTHON = process.env.PYTHON || 'python3';
const DEFAULT_MURIEL = process.env.MURIEL_DIR ||
    path.join(process.env.HOME || '', 'Documents/dev/muriel');
const RULES_PATH = path.join(__dirname, 'aiism-rules.json');


// ---------------------------------------------------------------------------
// Rule loader
// ---------------------------------------------------------------------------

let _RULES_CACHE = null;
function loadRules(rulesPath = RULES_PATH) {
    if (_RULES_CACHE && _RULES_CACHE.__path === rulesPath) return _RULES_CACHE;
    const data = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    const byId = {};
    const byKind = {};
    for (const rule of data.rules) {
        byId[rule.id] = rule;
        (byKind[rule.kind] = byKind[rule.kind] || []).push(rule);
    }
    _RULES_CACHE = { __path: rulesPath, data, byId, byKind };
    return _RULES_CACHE;
}

/** Fill {placeholder} tokens from a values object. Unknown tokens left as-is. */
function fillTemplate(tmpl, values) {
    return tmpl.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}


// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

/**
 * Strip LaTeX commands/environments down to readable prose, **preserving
 * line offsets** so finding line numbers map back to the source file.
 *
 * Every drop is replaced with same-length whitespace (newlines kept).
 * Every unwrap keeps the content text in place, blanking only the
 * surrounding \cmd{...} braces. No transformation adds or removes
 * newlines; column offsets may drift slightly but line numbers don't.
 *
 * Drops: comments, \cite/\ref/\label/..., math (both inline and display),
 * verbatim/CCSXML/tikzpicture environments, \begin{}/\end{} markers.
 * Unwraps: \textbf, \emph, \texttt, \section, etc. — keeps inner prose.
 * Converts: --- → — (so em-dash density counts LaTeX em-dashes too).
 */
function stripLatex(src) {
    let s = src;

    // Helper: replace match with same-length whitespace, keeping newlines.
    const blank = (m) => m.replace(/[^\n]/g, ' ');
    // Helper: unwrap a \cmd{X} match — blank everything except the last
    // brace-group contents (or a named capture). Length preserved.
    const unwrap = (m, content) => {
        const open = m.lastIndexOf('{');
        const close = m.lastIndexOf('}');
        if (open < 0 || close <= open) return blank(m);
        const pre = m.slice(0, open + 1);
        const mid = m.slice(open + 1, close);
        const post = m.slice(close);
        // Verify content matches mid (it should for a clean unwrap).
        const out = blank(pre) +
            (mid === content ? content : blank(mid)) +
            blank(post);
        return out;
    };

    // 1. Strip line comments (handle escaped \%).
    s = s.split('\n').map(line => {
        let cut = -1;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '%' && (i === 0 || line[i - 1] !== '\\')) {
                cut = i;
                break;
            }
        }
        if (cut < 0) return line;
        return line.slice(0, cut) + ' '.repeat(line.length - cut);
    }).join('\n');

    // 2. Drop verbatim-style and metadata-XML environments wholesale.
    s = s.replace(/\\begin\{(verbatim|lstlisting|minted|Verbatim|alltt|filecontents\*?|CCSXML|tikzpicture|comment)\}[\s\S]*?\\end\{\1\}/g, blank);

    // 3. Drop math environments and inline math.
    s = s.replace(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|displaymath|eqnarray\*?)\}[\s\S]*?\\end\{\1\}/g, blank);
    s = s.replace(/\$\$[\s\S]*?\$\$/g, blank);
    s = s.replace(/\\\[[\s\S]*?\\\]/g, blank);
    s = s.replace(/\\\([\s\S]*?\\\)/g, blank);
    s = s.replace(/\$(?:\\.|[^$\\])*\$/g, blank);

    // 4. Drop reference-type commands entirely (with arg).
    const dropCommands = ['cite', 'citep', 'citet', 'citeauthor', 'citeyear',
                          'ref', 'eqref', 'autoref', 'pageref', 'label',
                          'bibliography', 'bibliographystyle', 'input',
                          'include', 'includegraphics', 'url', 'path',
                          'index', 'nocite'];
    for (const cmd of dropCommands) {
        const re = new RegExp(`\\\\${cmd}\\*?(?:\\[[^\\]]*\\])?(?:\\{[^{}]*\\})+`, 'g');
        s = s.replace(re, blank);
    }

    // 5. Unwrap formatting commands — keep contents.
    const unwrapCommands = ['textbf', 'textit', 'textsl', 'textsc', 'texttt',
                            'textrm', 'textsf', 'emph', 'mbox', 'uline',
                            'underline', 'textnormal'];
    for (const cmd of unwrapCommands) {
        const re = new RegExp(`\\\\${cmd}\\{([^{}]*)\\}`, 'g');
        // Run twice to catch nested cases like \textbf{\emph{X}}.
        s = s.replace(re, unwrap);
        s = s.replace(re, unwrap);
    }

    // 6. Section headings — unwrap in place (no extra newlines).
    const headingCommands = ['part', 'chapter', 'section', 'subsection',
                             'subsubsection', 'paragraph', 'subparagraph'];
    for (const cmd of headingCommands) {
        const re = new RegExp(`\\\\${cmd}\\*?(?:\\[[^\\]]*\\])?\\{([^{}]*)\\}`, 'g');
        s = s.replace(re, unwrap);
    }

    // 7. Drop remaining \begin{...} / \end{...} markers (keep inner prose).
    s = s.replace(/\\begin\{[^{}]*\}(?:\[[^\]]*\])?/g, blank);
    s = s.replace(/\\end\{[^{}]*\}/g, blank);

    // 8. \item → list marker (length-preserving).
    s = s.replace(/\\item(?:\[[^\]]*\])?/g, m => '- ' + ' '.repeat(m.length - 2));

    // 9. Convert dashes and tildes. LaTeX --- (3 chars) → — (1 char) padded.
    s = s.replace(/~/g, ' ');
    s = s.replace(/---/g, '—  ');     // em-dash + 2 spaces (length 3)
    s = s.replace(/--/g, '– ');        // en-dash + 1 space (length 2)

    // 9b. Common escaped punctuation: \%, \&, etc. — keep the literal char
    //     and blank the backslash. \, \; \: → spaces. \! → drop (length 2 → 2 spaces).
    s = s.replace(/\\([%&$#_])/g, ' $1');
    s = s.replace(/\\[,;:]/g, '  ');
    s = s.replace(/\\!/g, '  ');

    // 10. Drop any other commands with one brace arg, keep contents
    //     (best-effort — handles \frac{...}, \mathit{...}-like residue).
    let prev;
    do {
        prev = s;
        s = s.replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, unwrap);
    } while (s !== prev);

    // 11. Drop standalone command tokens like \LaTeX, \noindent, \newline.
    //     \\ → newline (line-break in source already implies a paragraph),
    //     but to preserve line offsets we keep \\ as 2 spaces.
    s = s.replace(/\\\\/g, '  ');
    s = s.replace(/\\[a-zA-Z@]+\*?/g, blank);

    return s;
}

/** Strip fenced code, inline code, and HTML comments from markdown (whitespace-preserving). */
function stripMarkdownCodeAndMath(text) {
    const out = text.split('');
    let inFence = false;
    let i = 0;
    let lineStart = 0;
    const n = text.length;
    while (i < n) {
        if (text[i] === '\n') { lineStart = i + 1; i += 1; continue; }
        if (!inFence) {
            if (i === lineStart && text.slice(i, i + 3) === '```') {
                inFence = true;
                while (i < n && text[i] !== '\n') { out[i] = ' '; i += 1; }
                continue;
            }
            if (text.slice(i, i + 4) === '<!--') {
                const end = text.indexOf('-->', i + 4);
                const stop = end < 0 ? n : end + 3;
                for (let j = i; j < stop; j++) if (text[j] !== '\n') out[j] = ' ';
                i = stop;
                continue;
            }
            if (text[i] === '`') {
                const end = text.indexOf('`', i + 1);
                if (end > 0 && text.slice(i, end).indexOf('\n') < 0) {
                    for (let j = i; j <= end; j++) out[j] = ' ';
                    i = end + 1;
                    continue;
                }
            }
        } else {
            if (text.slice(i, i + 3) === '```') {
                inFence = false;
                for (let j = i; j < Math.min(i + 3, n); j++) out[j] = ' ';
                i += 3;
                continue;
            }
            if (text[i] !== '\n') out[i] = ' ';
        }
        i += 1;
    }
    return out.join('');
}


// ---------------------------------------------------------------------------
// Native rule implementations
// ---------------------------------------------------------------------------

function offsetToLineCol(text, offset) {
    let line = 1;
    let col = 1;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') { line += 1; col = 1; } else col += 1;
    }
    return [line, col];
}

function excerpt(text, offset, span = 80) {
    const start = Math.max(0, offset - 10);
    const end = Math.min(text.length, offset + span);
    return text.slice(start, end).replace(/\n/g, ' ').trim();
}

function wordCount(text) {
    const m = text.match(/\b[\w']+\b/g);
    return m ? m.length : 0;
}

/** A. Flagged terms — per-occurrence warn. */
function auditFlaggedTerms(text, rule) {
    const findings = [];
    for (const term of rule.terms) {
        const re = new RegExp(`\\b${term.lemma}\\b`, 'gi');
        let m;
        while ((m = re.exec(text)) !== null) {
            const [line, column] = offsetToLineCol(text, m.index);
            findings.push({
                line, column, severity: rule.severity,
                rule: rule.id,
                message: fillTemplate(rule.message_template,
                    { term: m[0], alternatives: term.alternatives }),
                excerpt: excerpt(text, m.index),
            });
        }
    }
    return findings;
}

/** B1. Em-dash density — total > limit (Unicode — and LaTeX ---/--). */
function auditEmDashTotal(text, rule) {
    const findings = [];
    const re = new RegExp(rule.pattern, 'g');
    const matches = [...text.matchAll(re)];
    if (matches.length <= rule.limit) return findings;
    matches.forEach((m, i) => {
        if (i < rule.limit) return;
        const [line, column] = offsetToLineCol(text, m.index);
        findings.push({
            line, column, severity: rule.severity,
            rule: rule.id,
            message: fillTemplate(rule.message_template,
                { n: i + 1, total: matches.length, limit: rule.limit }),
            excerpt: excerpt(text, m.index),
        });
    });
    return findings;
}

/** B2. Semicolon-style density — count > rate per 1000 words. */
function auditDocRateLimit(text, rule) {
    const findings = [];
    const re = new RegExp(rule.pattern, 'g');
    const matches = [...text.matchAll(re)];
    if (matches.length === 0) return findings;
    const words = wordCount(text);
    if (words === 0) return findings;
    const allowed = Math.ceil((rule.per_1000_words * words) / 1000);
    if (matches.length <= allowed) return findings;
    const rate = ((matches.length * 1000) / words).toFixed(2);
    matches.forEach((m, i) => {
        if (i < allowed) return;
        const [line, column] = offsetToLineCol(text, m.index);
        findings.push({
            line, column, severity: rule.severity,
            rule: rule.id,
            message: fillTemplate(rule.message_template,
                { n: i + 1, total: matches.length, rate, limit: rule.per_1000_words }),
            excerpt: excerpt(text, m.index),
        });
    });
    return findings;
}

/** B3. Colon-list sequences — 2+ consecutive (colon-intro → list) pairs. */
function auditColonListSequences(text, rule) {
    const findings = [];
    // Build blocks split by blank lines.
    const blocks = [];
    let offset = 0;
    for (const chunk of text.split(/(\n\s*\n)/)) {
        if (chunk.trim()) blocks.push({ offset, text: chunk });
        offset += chunk.length;
    }
    const itemRe = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/;
    // Classify each block: 'colon-intro' (last non-blank line ends with :),
    // 'list' (starts with a list marker), or 'other'.
    const kind = blocks.map(b => {
        const lines = b.text.split('\n').filter(l => l.trim());
        if (lines.length && itemRe.test(lines[0])) return 'list';
        const last = lines[lines.length - 1] || '';
        if (/:\s*$/.test(last)) return 'colon-intro';
        // Also covers a block that contains both intro and list (no blank line),
        // e.g. "Three steps:\n- one\n- two".
        const firstNonList = lines.find(l => !itemRe.test(l)) || '';
        if (/:\s*$/.test(firstNonList) && lines.some(l => itemRe.test(l))) {
            return 'colon-list-combined';
        }
        return 'other';
    });
    // Detect runs of (colon-intro followed by list) OR (combined) pairs.
    let runs = 0;
    let runStart = -1;
    for (let i = 0; i < blocks.length; i++) {
        let isColonList = false;
        if (kind[i] === 'colon-list-combined') isColonList = true;
        else if (kind[i] === 'colon-intro' && kind[i + 1] === 'list') {
            isColonList = true;
        }
        if (isColonList) {
            if (runs === 0) runStart = i;
            runs += 1;
            if (runs >= 2) {
                const [line, column] = offsetToLineCol(text, blocks[i].offset);
                findings.push({
                    line, column, severity: rule.severity,
                    rule: rule.id,
                    message: `Consecutive colon+list paragraph (#${runs} in a row). Integrate items into prose or consolidate into one list.`,
                    excerpt: excerpt(text, blocks[i].offset),
                });
            }
            // If combined-style, consume only this block; if intro+list pair, skip the list block.
            if (kind[i] === 'colon-intro') i += 1;
        } else if (kind[i] !== 'list') {
            // Reset on any non-list, non-pair block.
            runs = 0;
            runStart = -1;
        }
    }
    return findings;
}

/** C. Throat-clearing openers — per-occurrence at sentence start. */
function auditThroatClearing(text, rule) {
    const findings = [];
    for (const opener of rule.openers) {
        const re = new RegExp(
            `(?:^|(?<=[.!?]\\s)|(?<=\\n))\\s*(?:[->*+]\\s+)?(${opener.pattern})`, 'gim');
        let m;
        while ((m = re.exec(text)) !== null) {
            const groupOffset = m.index + m[0].indexOf(m[1]);
            const [line, column] = offsetToLineCol(text, groupOffset);
            findings.push({
                line, column, severity: rule.severity,
                rule: rule.id,
                message: fillTemplate(rule.message_template,
                    { opener: m[1], note: opener.note }),
                excerpt: excerpt(text, groupOffset),
            });
        }
    }
    return findings;
}

/** D1. Rule-of-three compulsion — flag when every list (≥M lists) under a
 *  heading has exactly N items. Document-level signal: one per section. */
function auditRuleOfThree(text, rule) {
    const findings = [];
    const minLists = (rule.config && rule.config.min_lists_per_section) || 2;
    const exact = (rule.config && rule.config.exact_items) || 3;
    // Segment text by markdown ATX headings (#, ##, ...) or by paragraph if no headings.
    const lines = text.split('\n');
    const sections = [];
    let cur = { start: 0, heading: '(prologue)', lines: [] };
    let charOffset = 0;
    for (const ln of lines) {
        if (/^#{1,6}\s+/.test(ln)) {
            if (cur.lines.length) sections.push(cur);
            cur = { start: charOffset, heading: ln.replace(/^#+\s+/, '').trim(), lines: [] };
        } else {
            cur.lines.push({ offset: charOffset, text: ln });
        }
        charOffset += ln.length + 1;
    }
    if (cur.lines.length) sections.push(cur);

    for (const sec of sections) {
        // Find contiguous list runs in this section. A list item begins with
        // -, *, +, 1., 1), or a leading "- " (post-strip latex form).
        const itemRe = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/;
        const lists = [];
        let curList = null;
        for (const { offset, text: ln } of sec.lines) {
            if (itemRe.test(ln)) {
                if (!curList) curList = { startOffset: offset, items: 0 };
                curList.items += 1;
            } else if (/^\s{4,}\S/.test(ln) && curList) {
                // indented continuation of the current item — keep list open
            } else if (curList) {
                lists.push(curList);
                curList = null;
            }
        }
        if (curList) lists.push(curList);
        if (lists.length < minLists) continue;
        const allMatch = lists.every(l => l.items === exact);
        if (!allMatch) continue;
        const [line, column] = offsetToLineCol(text, lists[0].startOffset);
        findings.push({
            line, column, severity: rule.severity,
            rule: rule.id,
            message: `Section "${sec.heading}" has ${lists.length} lists, all exactly ${exact} items. Real analysis rarely decomposes into trios — use as many points as the evidence warrants.`,
            excerpt: excerpt(text, lists[0].startOffset),
        });
    }
    return findings;
}

/** D2. Synonym cycling — N+ distinct members of one group in scope. */
function auditSynonymCycling(text, rule) {
    const findings = [];
    const threshold = rule.threshold || 3;
    const paragraphs = [];
    let offset = 0;
    for (const chunk of text.split(/(\n\s*\n)/)) {
        if (chunk.trim()) paragraphs.push({ offset, text: chunk });
        offset += chunk.length;
    }
    for (const para of paragraphs) {
        for (const group of rule.groups) {
            const distinct = new Set();
            let firstHit = -1;
            for (const member of group.members) {
                const re = new RegExp(`\\b${member}\\b`, 'i');
                const m = para.text.match(re);
                if (m) {
                    distinct.add(member);
                    const idx = para.text.toLowerCase().indexOf(member.toLowerCase());
                    if (firstHit < 0 || idx < firstHit) firstHit = idx;
                }
            }
            if (distinct.size >= threshold) {
                const off = para.offset + Math.max(0, firstHit);
                const [line, column] = offsetToLineCol(text, off);
                findings.push({
                    line, column, severity: rule.severity,
                    rule: rule.id,
                    message: fillTemplate(rule.message_template, {
                        count: distinct.size,
                        group: group.name,
                        members: [...distinct].join(', '),
                    }),
                    excerpt: excerpt(text, off),
                });
            }
        }
    }
    return findings;
}

/** D3. Binary contrast overuse — "Not X. Y." / "Not just X — Y." > limit per paper. */
function auditBinaryContrast(text, rule) {
    const findings = [];
    const limit = (rule.config && rule.config.limit_per_paper) || 2;
    const patterns = [
        /(?:^|\n|(?<=[.!?]\s))\s*Not\s+[^.\n]{1,80}\.\s+[A-Z]/g,
        /\bit'?s\s+not\s+about\s+[^.\n—–-]{1,60}[—–-]+\s*(?:it'?s\s+about|but)\s+/gi,
        /\bnot\s+just\s+[^.\n—–-]{1,60}[—–-]+\s*\w/gi,
    ];
    const all = [];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(text)) !== null) {
            all.push({ index: m.index, len: m[0].length });
        }
    }
    if (all.length <= limit) return findings;
    all.sort((a, b) => a.index - b.index);
    all.forEach((hit, i) => {
        if (i < limit) return;
        const [line, column] = offsetToLineCol(text, hit.index);
        findings.push({
            line, column, severity: rule.severity,
            rule: rule.id,
            message: `"Not X. Y." pattern #${i + 1} of ${all.length}. Effective once; becomes a tic when repeated. Limit ≤${limit} per paper.`,
            excerpt: excerpt(text, hit.index),
        });
    });
    return findings;
}


// Dispatch table: rule.kind → engine function. Engine-specific rules use
// rule.id as the dispatch key since their detectors aren't data-driven.
const ENGINE_BY_KIND = {
    'flagged-term-group':     auditFlaggedTerms,
    'doc-count-limit':        auditEmDashTotal,
    'doc-rate-limit':         auditDocRateLimit,
    'sentence-opener-group':  auditThroatClearing,
    'synonym-group':          auditSynonymCycling,
};
const ENGINE_BY_ID = {
    'colon-list-sequence':    auditColonListSequences,
    'rule-of-three':          auditRuleOfThree,
    'binary-contrast':        auditBinaryContrast,
};

/**
 * Run all native rules against a text body. Iterates rules loaded from
 * aiism-rules.json and dispatches each to the appropriate engine.
 *
 * @param {string} text — already pre-processed (LaTeX-stripped / code-stripped)
 * @param {object} [opts]
 * @param {string[]} [opts.rules] — only run these rule ids
 * @returns {object[]} findings
 */
function runNativeRules(text, opts = {}) {
    const { byKind, data } = loadRules();
    const ruleFilter = opts.rules ? new Set(opts.rules) : null;
    const findings = [];
    for (const rule of data.rules) {
        if (ruleFilter && !ruleFilter.has(rule.id)) continue;
        const engine = ENGINE_BY_KIND[rule.kind] || ENGINE_BY_ID[rule.id];
        if (!engine) continue;       // engine entries with no JS implementation
        findings.push(...engine(text, rule));
    }
    findings.sort((a, b) =>
        a.line - b.line ||
        a.column - b.column ||
        a.rule.localeCompare(b.rule));
    return findings;
}


// ---------------------------------------------------------------------------
// muriel.aiism subprocess (existing behavior)
// ---------------------------------------------------------------------------

function auditViaMuriel(filePath, { respectPencil, rules, python, murielDir }) {
    const args = ['-m', 'muriel.aiism', filePath, '--json', '--no-color'];
    if (respectPencil) args.push('--respect-pencil');
    if (rules) for (const r of rules) args.push('--rule', r);
    const env = { ...process.env };
    if (murielDir) env.PYTHONPATH = murielDir + (env.PYTHONPATH ? `:${env.PYTHONPATH}` : '');
    const result = spawnSync(python, args, { env, encoding: 'utf-8' });
    if (result.error) {
        return { available: false, reason: `spawn failed: ${result.error.message}` };
    }
    if (result.status === 2) {
        return { available: false, reason: `usage error: ${result.stderr.slice(0, 200)}` };
    }
    try {
        return { available: true, payload: JSON.parse(result.stdout) };
    } catch (err) {
        return {
            available: false,
            reason: `non-JSON output (muriel not installed at ${murielDir}?): ${result.stderr.slice(0, 160)}`,
        };
    }
}


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Audit a single file. Combines muriel.aiism findings (if available) with
 * native JS rules. Native rules always run; muriel runs for .md/.ipynb when
 * installed. For .tex files the LaTeX is stripped to plain prose first and
 * native rules run on the stripped text; muriel is skipped (it expects .md).
 *
 * @param {string} filePath
 * @param {object} options
 * @param {boolean} [options.respectPencil=true]
 * @param {string[]} [options.rules] — filter to specific rule ids
 * @param {boolean} [options.native=true]
 * @param {boolean} [options.muriel=true]
 * @returns {{file: string, findings: object[], summary: object, sources: string[]}}
 */
function auditProse(filePath, options = {}) {
    const {
        respectPencil = true,
        rules = null,
        native = true,
        muriel = true,
        python = DEFAULT_PYTHON,
        murielDir = DEFAULT_MURIEL,
    } = options;

    if (!fs.existsSync(filePath)) {
        throw new Error(`prose-audit: file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const isTex = ext === '.tex';
    const isNotebook = ext === '.ipynb';

    const sources = [];
    let allFindings = [];

    // Source 1: muriel (for .md and .ipynb — its existing input formats).
    if (muriel && !isTex) {
        const m = auditViaMuriel(filePath, { respectPencil, rules, python, murielDir });
        if (m.available) {
            sources.push('muriel.aiism');
            for (const f of m.payload.findings) {
                allFindings.push({ ...f, source: 'muriel' });
            }
        }
    }

    // Source 2: native JS rules.
    if (native) {
        let raw = fs.readFileSync(filePath, 'utf-8');
        if (isNotebook) {
            // Extract markdown cells, same logic as muriel._read_file.
            try {
                const nb = JSON.parse(raw);
                const chunks = [];
                for (const cell of (nb.cells || [])) {
                    if (cell.cell_type !== 'markdown') continue;
                    const src = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
                    if (src.trim()) chunks.push(src.trimEnd() + '\n');
                }
                raw = chunks.join('\n');
            } catch (_) { /* fall through with raw text */ }
        }
        const prose = isTex ? stripLatex(raw) : stripMarkdownCodeAndMath(raw);
        const nativeFindings = runNativeRules(prose, { rules });
        sources.push('native');
        for (const f of nativeFindings) {
            allFindings.push({ ...f, source: 'native' });
        }
    }

    // Re-sort and tally.
    allFindings.sort((a, b) =>
        a.line - b.line ||
        a.column - b.column ||
        a.rule.localeCompare(b.rule));

    const summary = { total: allFindings.length, error: 0, warn: 0, info: 0 };
    for (const f of allFindings) {
        summary[f.severity] = (summary[f.severity] || 0) + 1;
    }

    return { file: filePath, findings: allFindings, summary, sources };
}

/**
 * Audit a directory of paper drafts. Walks .md / .ipynb / .tex files.
 *
 * @param {string} dir
 * @param {object} options
 * @returns {{file: string, findings: object[], summary: object}[]}
 */
function auditDirectory(dir, options = {}) {
    const {
        extensions = ['.md', '.ipynb', '.tex'],
        exclude = ['node_modules', '.git', 'dist', 'build', '__pycache__',
                   '.ipynb_checkpoints', '.claude', '.venv', 'venv',
                   '.next', '.cache'],
        excludePatterns = [
            /-rendersafe\.md$/,
            /-annotated\.md$/,
        ],
        onProgress = null,
    } = options;
    const files = [];

    function walk(d) {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            if (exclude.includes(entry.name)) continue;
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                if (excludePatterns.some(p => p.test(entry.name))) continue;
                files.push(full);
            }
        }
    }
    walk(dir);

    const results = [];
    for (let i = 0; i < files.length; i++) {
        const full = files[i];
        if (onProgress) onProgress(i + 1, files.length, full);
        try {
            results.push(auditProse(full, options));
        } catch (err) {
            results.push({
                file: full,
                findings: [],
                summary: { error: 1, warn: 0, info: 0, total: 0 },
                sources: [],
                _error: err.message,
            });
        }
    }
    return results;
}

/** Format an array of results as a one-line-per-file summary table. */
function formatSummary(results) {
    const rows = results
        .filter(r => r.summary && r.summary.total > 0)
        .sort((a, b) => (b.summary.error - a.summary.error) ||
                        (b.summary.warn - a.summary.warn) ||
                        (b.summary.total - a.summary.total));
    if (!rows.length) {
        return `clean — no findings across ${results.length} file(s).\n`;
    }
    const lines = [
        '| err | warn | info | tot | file |',
        '|---:|---:|---:|---:|:---|',
    ];
    for (const r of rows) {
        const file = r.file.replace(process.env.HOME || '~', '~');
        lines.push(`| ${r.summary.error} | ${r.summary.warn} | ${r.summary.info} | ${r.summary.total} | ${file} |`);
    }
    return lines.join('\n') + '\n';
}

/** Format a single audit result as a Markdown report fragment. */
function formatReport(result) {
    const { file, findings, summary } = result;
    if (result._error) {
        return `### ${file}\n\n_audit failed: ${result._error}_\n`;
    }
    if (!findings.length) {
        return `### ${file}\n\n_clean — no AI-tell patterns detected._\n`;
    }
    const lines = [
        `### ${file}`,
        '',
        `**${summary.error} error · ${summary.warn} warn · ${summary.info} info** (${summary.total} total)`,
        '',
        '| line | sev | src | rule | message |',
        '|---:|:---|:---|:---|:---|',
    ];
    for (const f of findings) {
        const msg = f.message.replace(/\|/g, '\\|');
        const src = (f.source || '').slice(0, 4);
        lines.push(`| ${f.line} | ${f.severity} | ${src} | \`${f.rule}\` | ${msg} |`);
    }
    return lines.join('\n') + '\n';
}

module.exports = {
    auditProse,
    auditDirectory,
    formatReport,
    formatSummary,
    // exported for tests
    runNativeRules,
    stripLatex,
    stripMarkdownCodeAndMath,
};
