'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Notebook Key Claims Auditor
 *
 * Validates that research notebooks follow the Key Claims contract:
 *   1. Every [NB##:K##] reference in prose resolves to an existing claim
 *   2. Cited values match the canonical aggregate
 *   3. Detects stale cross-repo references
 *   4. Flags anti-patterns (hardcoded values, missing Key Claims blocks)
 */

// One definition of the claim-ID grammar. It used to be written three times (ref
// pattern, aggregate row, notebook row scan) and all three said `K\d+`, so parallel
// ID namespaces — K-bbox-3, K-leak-7a, K-typed-12 — matched nowhere and were skipped
// in silence. Consumers mint those namespaces whenever a cascade supersedes a claim
// without renumbering it (see attentional-foraging CLAUDE.md), so they are the norm,
// not an edge case. Must start with K and end alphanumeric; dots, hyphens and
// underscores allowed between.
const K_ID = String.raw`K[A-Za-z0-9._-]*[A-Za-z0-9]`;

// Pattern: [NB13:K5], [NB11.5:K20], [NB21:K-bbox-3], and the tagged forms consumers
// actually write — [LAB, NB22:K3] or [LAB, AdSERP, organic, NB21:K-bbox-3]. The
// optional leading group is the regime / rank-type tag list; it is captured so a
// caller can report it, and deliberately cannot span [ or ].
const NB_REF_PATTERN = new RegExp(
    String.raw`\[(?:([^\[\]]*?),\s*)?NB(\d+(?:\.\d+)?):(${K_ID})\]`, 'g');

// Aggregate table row: | **K-bbox-1** | ... |  — tolerates a trailing retirement
// note in the ID cell (`**K11** (retired 2026-05-01: ...)`), which the convention
// spec calls for.
const AGG_ROW_ID_PATTERN = new RegExp(String.raw`^\*{0,2}(${K_ID})\*{0,2}(?:\s|$)`);

// Same row shape, scanned inside a notebook's Key Claims markdown cell.
const NB_ROW_SCAN_PATTERN = new RegExp(String.raw`\|\s*\*{0,2}${K_ID}\*{0,2}\s*\|`, 'g');

// Key Claims block marker (matches attentional-foraging convention)
const KEY_CLAIMS_MARKER = '## Key Claims';

// Verified date pattern: <!-- Verified: 2026-04-09 -->
const VERIFIED_DATE_PATTERN = /<!--\s*Verified:\s*(\d{4}-\d{2}-\d{2})\s*-->/;

/**
 * Extract all [NB##:K##] references from a text file.
 */
function extractClaimRefs(text, filepath) {
    const refs = [];
    let m;
    NB_REF_PATTERN.lastIndex = 0;
    while ((m = NB_REF_PATTERN.exec(text)) !== null) {
        // Get line number
        const before = text.slice(0, m.index);
        const line = before.split('\n').length;
        refs.push({
            raw: m[0],
            tags: m[1] ? m[1].split(',').map(t => t.trim()).filter(Boolean) : [],
            notebook: `NB${m[2]}`,
            claimId: m[3],
            file: filepath,
            line,
        });
    }
    return refs;
}

/**
 * Parse a notebook-key-claims.md aggregate file into a lookup.
 * Returns Map<string, Map<string, { id, text }>> — notebook → claimId → claim
 */
function parseAggregate(aggregatePath) {
    if (!fs.existsSync(aggregatePath)) return null;

    const text = fs.readFileSync(aggregatePath, 'utf-8');
    const notebooks = new Map();
    let currentNB = null;

    for (const line of text.split('\n')) {
        // Detect notebook section: ## NB14: `14_butterworth_cognitive_load` — ...
        const nbMatch = line.match(/^##\s+(NB\d+(?:\.\d+)?)[:\s]/);
        if (nbMatch) {
            currentNB = nbMatch[1];
            // Merge, never replace: two notebook files can map to one label
            // (18_learning_curve + 18_ripa2_vs_lfhf both → NB18), and a `set` here
            // silently discarded the first section's claims.
            if (!notebooks.has(currentNB)) notebooks.set(currentNB, new Map());
            continue;
        }

        // Detect claim row: | **K3** | ... | ... | or | K-bbox-1 | ... |
        if (currentNB && line.startsWith('|')) {
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 2) {
                const idMatch = cells[0].match(AGG_ROW_ID_PATTERN);
                if (idMatch) {
                    notebooks.get(currentNB).set(idMatch[1], {
                        id: idMatch[1],
                        text: cells.slice(1).join(' | '),
                    });
                }
            }
        }
    }

    return notebooks;
}

/**
 * Check if a Jupyter notebook has a Key Claims block.
 */
function checkNotebookForKeyClaims(notebookPath) {
    try {
        const nb = JSON.parse(fs.readFileSync(notebookPath, 'utf-8'));
        const cells = nb.cells || [];
        for (const cell of cells) {
            if (cell.cell_type === 'markdown') {
                const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
                if (source.includes(KEY_CLAIMS_MARKER)) {
                    // Extract verified date
                    const dateMatch = source.match(VERIFIED_DATE_PATTERN);
                    // Count K-IDs (may be plain K1, bold **K1**, or a parallel
                    // namespace like **K-bbox-1**)
                    NB_ROW_SCAN_PATTERN.lastIndex = 0;
                    const kIds = source.match(NB_ROW_SCAN_PATTERN) || [];
                    return {
                        hasBlock: true,
                        verifiedDate: dateMatch ? dateMatch[1] : null,
                        claimCount: kIds.length,
                    };
                }
            }
        }
        return { hasBlock: false, verifiedDate: null, claimCount: 0 };
    } catch {
        return { hasBlock: false, verifiedDate: null, claimCount: 0, error: 'parse error' };
    }
}

/**
 * Scan a directory for [NB##:K##] references and validate them.
 */
function auditNotebookClaims(dir, options = {}) {
    const {
        aggregatePath,
        extensions = ['.md', '.tex', '.html', '.py', '.ipynb'],
        exclude = ['node_modules', '.git', 'dist', '__pycache__', '.ipynb_checkpoints'],
        notebookDir,
    } = options;

    const issues = [];
    const allRefs = [];

    // Load aggregate if available
    const aggregate = aggregatePath ? parseAggregate(aggregatePath) : null;

    // Zero-parse guards. Every silent failure this tool has had took the same shape:
    // it parsed nothing and reported a clean run. "Nothing found" and "I could not
    // see" must not look alike, so a parse that yields nothing is an error.
    let claimsInAggregate = 0;
    if (aggregatePath) {
        if (!aggregate) {
            issues.push({
                severity: 'error',
                type: 'aggregate_not_found',
                file: aggregatePath,
                message: `Aggregate file not found: ${aggregatePath} — no reference could be validated`,
            });
        } else {
            for (const claims of aggregate.values()) claimsInAggregate += claims.size;
            if (claimsInAggregate === 0) {
                issues.push({
                    severity: 'error',
                    type: 'aggregate_parsed_empty',
                    file: aggregatePath,
                    message: `Aggregate parsed to 0 claims — headings must be "## NB##: ..." and rows "| **K1** | ...". Every reference below is unvalidated.`,
                });
            }
        }
    }

    // Walk directory for prose references
    function walk(dirPath) {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            if (exclude.some(e => entry.name === e || entry.name.startsWith('.'))) continue;
            const full = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                scanFile(full);
            }
        }
    }

    function scanFile(filepath) {
        let text;
        if (filepath.endsWith('.ipynb')) {
            try {
                const nb = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
                text = (nb.cells || [])
                    .filter(c => c.cell_type === 'markdown')
                    .map(c => Array.isArray(c.source) ? c.source.join('') : c.source)
                    .join('\n');
            } catch {
                return;
            }
        } else {
            text = fs.readFileSync(filepath, 'utf-8');
        }

        const relPath = path.relative(dir, filepath);
        const refs = extractClaimRefs(text, relPath);
        allRefs.push(...refs);

        // Validate each reference against aggregate
        if (aggregate) {
            for (const ref of refs) {
                const nb = aggregate.get(ref.notebook);
                if (!nb) {
                    issues.push({
                        severity: 'error',
                        type: 'missing_notebook',
                        ref: ref.raw,
                        file: ref.file,
                        line: ref.line,
                        message: `${ref.notebook} not found in aggregate Key Claims`,
                    });
                } else if (!nb.has(ref.claimId)) {
                    issues.push({
                        severity: 'error',
                        type: 'missing_claim',
                        ref: ref.raw,
                        file: ref.file,
                        line: ref.line,
                        message: `${ref.raw} — claim ${ref.claimId} not found in ${ref.notebook}`,
                    });
                }
            }
        }
    }

    walk(dir);

    // Claims exist to be cited; finding none means the ref pattern failed to see
    // them, not that the prose is clean.
    if (claimsInAggregate > 0 && allRefs.length === 0) {
        issues.push({
            severity: 'error',
            type: 'no_refs_parsed',
            file: path.relative(process.cwd(), dir) || dir,
            message: `Aggregate holds ${claimsInAggregate} claims but 0 references parsed from ${dir} — expected [NB##:K##], optionally tagged as [LAB, AdSERP, organic, NB##:K##]`,
        });
    }

    // Check notebooks for Key Claims blocks if notebook dir provided
    const notebookStatus = [];
    if (notebookDir && fs.existsSync(notebookDir)) {
        const nbFiles = fs.readdirSync(notebookDir)
            .filter(f => f.endsWith('.ipynb') && /^\d+/.test(f));

        const labelToFiles = new Map();

        for (const nbFile of nbFiles) {
            const full = path.join(notebookDir, nbFile);
            const status = checkNotebookForKeyClaims(full);
            notebookStatus.push({ file: nbFile, ...status });

            // A block that parsed to zero rows is the empty-success case again: it
            // renders as a checkmark while carrying no verifiable claim.
            if (status.hasBlock && status.claimCount === 0) {
                issues.push({
                    severity: 'warn',
                    type: 'empty_key_claims_block',
                    file: nbFile,
                    message: `${nbFile} has a Key Claims block that parsed to 0 rows — check for stdout fragments or placeholders in the value column`,
                });
            }

            // Flag notebooks referenced in prose but missing Key Claims
            const nbLabel = nbFile.match(/^(\d+(?:_\d+)?)/);
            if (nbLabel) {
                const label = `NB${nbLabel[1].replace('_', '.')}`;
                if (!labelToFiles.has(label)) labelToFiles.set(label, []);
                labelToFiles.get(label).push(nbFile);
                const isReferenced = allRefs.some(r => r.notebook === label);
                if (isReferenced && !status.hasBlock) {
                    issues.push({
                        severity: 'warn',
                        type: 'missing_key_claims_block',
                        file: nbFile,
                        message: `${label} is cited in prose but has no Key Claims block`,
                    });
                }
            }
        }

        // Two files under one label make every [NB##:K##] citing it ambiguous, and
        // the aggregate merges their claims into one section.
        for (const [label, files] of labelToFiles) {
            if (files.length > 1 && allRefs.some(r => r.notebook === label)) {
                issues.push({
                    severity: 'warn',
                    type: 'ambiguous_notebook_label',
                    file: files.join(', '),
                    message: `${label} maps to ${files.length} notebooks (${files.join(', ')}) — references to it cannot be resolved to one source`,
                });
            }
        }
    }

    // Stats
    const uniqueNBs = new Set(allRefs.map(r => r.notebook));
    const uniqueClaims = new Set(allRefs.map(r => `${r.notebook}:${r.claimId}`));

    return {
        refs: allRefs,
        issues,
        notebookStatus,
        stats: {
            totalRefs: allRefs.length,
            claimsInAggregate,
            uniqueNotebooks: uniqueNBs.size,
            uniqueClaims: uniqueClaims.size,
            issueCount: issues.length,
            errors: issues.filter(i => i.severity === 'error').length,
            warnings: issues.filter(i => i.severity === 'warn').length,
        },
    };
}

/**
 * Cross-repo audit: check if a downstream repo's cited values are current.
 * Scans for hardcoded values that match known pre-fix numbers.
 */
function auditCrossRepo(dir, staleValues = [], options = {}) {
    const { extensions = ['.md', '.py', '.tex'], exclude = ['node_modules', '.git'] } = options;
    const issues = [];

    function walk(dirPath) {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            if (exclude.some(e => entry.name === e)) continue;
            const full = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                const text = fs.readFileSync(full, 'utf-8');
                const relPath = path.relative(dir, full);
                const lines = text.split('\n');

                for (const sv of staleValues) {
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes(sv.value)) {
                            issues.push({
                                severity: 'warn',
                                type: 'potentially_stale',
                                file: relPath,
                                line: i + 1,
                                value: sv.value,
                                message: sv.message || `"${sv.value}" may be stale (pre-fix)`,
                                correction: sv.correction || null,
                            });
                        }
                    }
                }
            }
        }
    }

    walk(dir);
    return { issues };
}

module.exports = { auditNotebookClaims, auditCrossRepo, extractClaimRefs, parseAggregate, checkNotebookForKeyClaims };
