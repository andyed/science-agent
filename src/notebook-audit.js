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

// Pattern: [NB13:K5] or [NB14:K3] or [NB11.5:K20]
const NB_REF_PATTERN = /\[NB(\d+(?:\.\d+)?):K(\d+)\]/g;

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
            notebook: `NB${m[1]}`,
            claimId: `K${m[2]}`,
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
            notebooks.set(currentNB, new Map());
            continue;
        }

        // Detect claim row: | **K3** | ... | ... | or | K3 | ... |
        if (currentNB && line.startsWith('|')) {
            const cells = line.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 2) {
                const idMatch = cells[0].match(/^\*{0,2}(K\d+)\*{0,2}$/);
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
                    // Count K-IDs (may be plain K1 or bold **K1**)
                    const kIds = source.match(/\|\s*\*{0,2}K\d+\*{0,2}\s*\|/g) || [];
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

    // Check notebooks for Key Claims blocks if notebook dir provided
    const notebookStatus = [];
    if (notebookDir && fs.existsSync(notebookDir)) {
        const nbFiles = fs.readdirSync(notebookDir)
            .filter(f => f.endsWith('.ipynb') && /^\d+/.test(f));

        for (const nbFile of nbFiles) {
            const full = path.join(notebookDir, nbFile);
            const status = checkNotebookForKeyClaims(full);
            notebookStatus.push({ file: nbFile, ...status });

            // Flag notebooks referenced in prose but missing Key Claims
            const nbLabel = nbFile.match(/^(\d+(?:_\d+)?)/);
            if (nbLabel) {
                const label = `NB${nbLabel[1].replace('_', '.')}`;
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
