'use strict';

/**
 * Figure caption ↔ summary.json validator.
 *
 * For each figure in an INDEX.md, verify that numerics quoted in the
 * caption match values in the figure's *_summary.json sidecar.
 *
 * Sibling to `prose-audit` (AI-tell linting) and `audit` (citation
 * structure). Where prose-audit catches stylistic drift, this catches
 * factual drift between a figure caption and its underlying stats dump.
 *
 * The matching strategy:
 *   - Extract numeric tokens from prose with surrounding context.
 *   - Walk the JSON sidecar and collect (path, value) for every leaf
 *     numeric.
 *   - For each prose number, find candidate matches in the JSON (exact
 *     for plain integers, ±tolerance for approximated values marked with
 *     ~ / ≈ / "approximately").
 *   - When multiple JSON candidates match the value, use prose-context
 *     words (the preceding ~30 chars) to score against the JSON path.
 *   - Report: matched (prose↔JSON pair), unverified (prose number with
 *     no match in JSON), mismatch (closest candidate is outside
 *     tolerance — likely stale prose).
 *
 * Limitations on purpose:
 *   - Doesn't try to evaluate scientific notation expressions.
 *   - Doesn't infer which JSON file a figure references if the link is
 *     missing — explicit "Stats dump: [link]" required.
 *   - Doesn't validate values that aren't in the JSON. Captions often
 *     cite legacy comparators or external numbers; unverified is a
 *     prompt for human review, not necessarily a bug.
 */

const fs = require('fs');
const path = require('path');

// Integer with optional thousand-separators (comma or space; the European-
// style "1 854" appears throughout the AdSERP prose), or float, or
// percentage. Captures the raw string and parses to a Number.
const NUM_RE = /(?<![\w.])(\d{1,3}(?:[\s,]\d{3})+|\d+\.\d+|\d+)\s*(%)?(?!\w)/g;
const APPROX_MARKERS = /[~≈]|\b(?:approximately|about|roughly|nearly)\b/i;

// Tolerances:
//   - exact: integer prose, integer JSON, no approximation marker
//   - relative: 1% (±) for approximated values
//   - percentage-mismatch: prose may say "36 %" while JSON has 0.36 (fraction) or 36 (already pct)
const TOL_REL = 0.01; // 1%
const TOL_PCT_PP = 0.5; // 0.5pp slack for explicit percentages

function parseNumber(raw) {
    return parseFloat(raw.replace(/[\s,]/g, ''));
}

/**
 * Walk a JSON value recursively. Yields { path, value } for every
 * numeric leaf.
 */
function* walkNumerics(value, prefix = '') {
    if (typeof value === 'number' && Number.isFinite(value)) {
        yield { path: prefix, value };
        return;
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            yield* walkNumerics(value[i], `${prefix}[${i}]`);
        }
        return;
    }
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            const childPrefix = prefix ? `${prefix}.${k}` : k;
            yield* walkNumerics(v, childPrefix);
        }
    }
}

/**
 * Pre-strip text patterns that contain numerals we should never treat as
 * substantive prose claims:
 *   - ISO dates (2026-05-02), date fragments (05-02), times (14:00)
 *   - HTML/markdown attributes (width="720", `[link](url)` URLs)
 *   - Section refs (§4.1, §3.2.1)
 *   - Fenced code spans (`code`) which often hold variable names with digits
 *   - Citation tokens (CHIIR '25, CIKM '08, SIGIR '21, CHI EA 2001)
 *   - URLs (https://...)
 *
 * Replaces with same-length whitespace so byte offsets remain valid.
 */
function preMaskText(text) {
    const patterns = [
        /\b\d{4}-\d{2}-\d{2}\b/g,                      // ISO date
        /\b\d{2}-\d{2}\b/g,                            // mm-dd date fragment
        /\b\d{2}:\d{2}(?::\d{2})?\b/g,                 // time
        /\bwidth\s*=\s*"[^"]*"/gi,                     // HTML width
        /\bheight\s*=\s*"[^"]*"/gi,                    // HTML height
        /\balt\s*=\s*"[^"]*"/gi,                       // HTML alt
        /§\s*\d+(?:\.\d+)*/g,                          // section refs
        /`[^`\n]*`/g,                                  // inline code
        /\[[^\]]*\]\([^)]*\)/g,                        // markdown links
        /https?:\/\/\S+/g,                             // URLs
        /\b(?:CHI|CHIIR|CIKM|SIGIR|WSDM|WWW|ETRA|TOCHI|JEMR|PACMHCI)\s+(?:EA\s+)?'?\d{2,4}\b/gi,
    ];
    let masked = text;
    for (const p of patterns) {
        masked = masked.replace(p, (m) => ' '.repeat(m.length));
    }
    return masked;
}

/** Extract a list of numerics with surrounding context from prose. */
function extractProseNumerics(text) {
    const masked = preMaskText(text);
    const out = [];
    let m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(masked)) !== null) {
        const raw = m[1];
        const isPct = !!m[2];
        const value = parseNumber(raw);
        if (!Number.isFinite(value)) continue;

        const start = m.index;
        const end = start + m[0].length;
        const before = text.slice(Math.max(0, start - 8), start);
        // Skip 4-digit years.
        if (/^\d{4}$/.test(raw) && value >= 1900 && value <= 2099) continue;
        // Skip if directly preceded by a hyphen or slash (likely a fragment
        // we missed in the mask — e.g., date or version)
        if (/[-/]$/.test(before)) continue;

        const ctxBefore = text.slice(Math.max(0, start - 40), start).trim();
        const ctxAfter = text.slice(end, Math.min(text.length, end + 40)).trim();
        const approximated = APPROX_MARKERS.test(ctxBefore.slice(-15)) ||
                             /[~≈]\s*$/.test(ctxBefore);

        // Use the original (unmasked) text for the displayed raw value
        const origRaw = text.slice(start, end).trim();

        out.push({
            raw: origRaw,
            value,
            isPct,
            approximated,
            ctxBefore,
            ctxAfter,
            offset: start,
        });
    }
    return out;
}

/** Score how well a JSON path's name tokens match prose context. */
function pathContextScore(path, ctx) {
    const pathTokens = path.toLowerCase().split(/[._\[\]]+/).filter(Boolean);
    const ctxLower = ctx.toLowerCase();
    let score = 0;
    for (const tok of pathTokens) {
        if (tok.length < 3) continue;
        if (ctxLower.includes(tok)) score += 1;
        // Loose stem match: 'clicked' vs 'click', 'deferred' vs 'defer'
        else if (tok.length >= 5 && ctxLower.includes(tok.slice(0, -2))) score += 0.5;
    }
    return score;
}

/**
 * Match a single prose number against the JSON numeric pool.
 * Returns { status, matched?, candidates?, message? } where status is:
 *   'matched'    — a JSON value within tolerance
 *   'unverified' — no JSON value within tolerance
 *   'mismatch'   — closest JSON value is outside tolerance (stale prose
 *                  probable)
 */
function matchProseNumber(prose, jsonPool) {
    const candidates = [];
    for (const { path: jpath, value: jval } of jsonPool) {
        // Exact integer match
        if (Number.isInteger(prose.value) && Number.isInteger(jval) && jval === prose.value) {
            candidates.push({ path: jpath, value: jval, delta: 0, exact: true });
            continue;
        }
        // Float with relative tolerance
        const denom = Math.max(Math.abs(prose.value), Math.abs(jval), 1e-9);
        const relDelta = Math.abs(prose.value - jval) / denom;
        if (relDelta <= TOL_REL) {
            candidates.push({ path: jpath, value: jval, delta: relDelta, exact: false });
            continue;
        }
        // Percentage form mismatch: prose "36 %" → JSON 0.36 or 36
        if (prose.isPct) {
            const asFrac = prose.value / 100;
            const fracDenom = Math.max(Math.abs(asFrac), Math.abs(jval), 1e-9);
            if (Math.abs(asFrac - jval) / fracDenom <= TOL_REL) {
                candidates.push({ path: jpath, value: jval, delta: Math.abs(asFrac - jval) / fracDenom, pctForm: 'fraction' });
            }
        }
    }

    if (candidates.length === 0) {
        // Find the closest near-miss. To surface as MISMATCH (rather than
        // unverified), require all of:
        //   - prose number has NO approximation marker (~, ≈ — those imply
        //     rounding and shouldn't be flagged when 1-3% off)
        //   - closest JSON value is within 3%
        //   - prose context has at least one word in common with the JSON
        //     path (otherwise the closest value is likely coincidental)
        if (prose.approximated) return { status: 'unverified' };

        let best = null;
        for (const { path: jpath, value: jval } of jsonPool) {
            const denom = Math.max(Math.abs(prose.value), Math.abs(jval), 1e-9);
            const relDelta = Math.abs(prose.value - jval) / denom;
            if (best === null || relDelta < best.delta) {
                best = { path: jpath, value: jval, delta: relDelta };
            }
        }
        if (best && best.delta < 0.03 /* < 3% */) {
            const ctxScore = pathContextScore(best.path, prose.ctxBefore + ' ' + prose.ctxAfter);
            if (ctxScore >= 1) {
                return { status: 'mismatch', closest: best };
            }
        }
        return { status: 'unverified' };
    }

    // Disambiguate when multiple candidates match: pick by context score
    if (candidates.length > 1) {
        for (const c of candidates) {
            c.contextScore = pathContextScore(c.path, prose.ctxBefore + ' ' + prose.ctxAfter);
        }
        candidates.sort((a, b) =>
            (b.contextScore - a.contextScore) || (a.delta - b.delta)
        );
    }

    return {
        status: 'matched',
        matched: candidates[0],
        alternates: candidates.slice(1, 4),
    };
}

/**
 * Parse INDEX.md into figure sections. Each section starts with a `### `
 * heading (which contains the figure file name).
 *
 * Returns: [{ figureName, body, summaryLink? }]
 */
function parseIndex(indexText) {
    const sections = [];
    const lines = indexText.split('\n');
    let cur = null;
    for (const line of lines) {
        const m = /^###\s+(.+\.png)\s*$/.exec(line);
        if (m) {
            if (cur) sections.push(cur);
            cur = { figureName: m[1].trim(), body: '', summaryLink: null };
            continue;
        }
        if (!cur) continue;
        cur.body += line + '\n';
        // First Stats dump link wins.
        if (!cur.summaryLink) {
            const linkM = /\[`?([\w./-]+_summary\.json)`?\]\(([^)]+)\)/.exec(line);
            if (linkM) cur.summaryLink = linkM[2];
        }
    }
    if (cur) sections.push(cur);
    return sections;
}

/**
 * Audit a single figure: load its summary.json, walk its caption prose,
 * match every numeric.
 */
function auditFigure(section, indexDir) {
    const result = {
        figure: section.figureName,
        summary: section.summaryLink,
        prose_numerics: 0,
        matched: 0,
        unverified: [],
        mismatched: [],
    };

    if (!section.summaryLink) {
        result.error = 'no Stats dump link in section';
        return result;
    }

    const summaryPath = path.resolve(indexDir, section.summaryLink);
    if (!fs.existsSync(summaryPath)) {
        result.error = `summary.json not found at ${summaryPath}`;
        return result;
    }

    let summary;
    try {
        summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    } catch (e) {
        result.error = `summary.json parse error: ${e.message}`;
        return result;
    }

    const jsonPool = Array.from(walkNumerics(summary));
    const proseNums = extractProseNumerics(section.body);
    result.prose_numerics = proseNums.length;
    result.json_numerics = jsonPool.length;

    for (const p of proseNums) {
        const m = matchProseNumber(p, jsonPool);
        if (m.status === 'matched') {
            result.matched += 1;
        } else if (m.status === 'mismatch') {
            result.mismatched.push({
                prose_value: p.raw,
                ctx: p.ctxBefore.slice(-30) + ' [' + p.raw + '] ' + p.ctxAfter.slice(0, 30),
                closest_json: m.closest,
            });
        } else {
            result.unverified.push({
                prose_value: p.raw,
                ctx: p.ctxBefore.slice(-30) + ' [' + p.raw + '] ' + p.ctxAfter.slice(0, 30),
            });
        }
    }
    return result;
}

/** Top-level entry. Audits every figure section in INDEX.md. */
function auditIndex(indexPath, options = {}) {
    const indexText = fs.readFileSync(indexPath, 'utf-8');
    const sections = parseIndex(indexText);
    const indexDir = path.dirname(indexPath);
    return {
        index: indexPath,
        n_figures: sections.length,
        figures: sections.map(s => auditFigure(s, indexDir)),
    };
}

function formatReport(audit, options = {}) {
    const lines = [];
    lines.push(`Figure audit: ${audit.index}`);
    lines.push(`  ${audit.n_figures} figure section(s) parsed.`);
    lines.push('');

    let totProse = 0, totMatched = 0, totUnv = 0, totMis = 0;
    for (const f of audit.figures) {
        if (f.error) {
            lines.push(`  ✗ ${f.figure}: ${f.error}`);
            continue;
        }
        const head = `${f.matched}/${f.prose_numerics} matched`;
        const flags = [];
        if (f.unverified.length) flags.push(`${f.unverified.length} unverified`);
        if (f.mismatched.length) flags.push(`${f.mismatched.length} MISMATCH`);
        const tag = flags.length ? `  (${flags.join(', ')})` : '';
        const glyph = f.mismatched.length ? '✗' : (f.unverified.length ? '⚠' : '✓');
        lines.push(`  ${glyph} ${f.figure}: ${head}${tag}`);

        if (f.mismatched.length) {
            for (const m of f.mismatched) {
                lines.push(`      MISMATCH: prose "${m.prose_value}"  ctx: …${m.ctx.replace(/\s+/g, ' ').trim()}…`);
                lines.push(`        closest in JSON: ${m.closest_json.value}  at  ${m.closest_json.path}  (Δ = ${(m.closest_json.delta * 100).toFixed(2)}%)`);
            }
        }
        if (f.unverified.length && options.showUnverified !== false) {
            for (const u of f.unverified.slice(0, 3)) {
                lines.push(`      unverified: "${u.prose_value}"  ctx: …${u.ctx.replace(/\s+/g, ' ').trim()}…`);
            }
            if (f.unverified.length > 3) {
                lines.push(`      … and ${f.unverified.length - 3} more unverified`);
            }
        }

        totProse += f.prose_numerics;
        totMatched += f.matched;
        totUnv += f.unverified.length;
        totMis += f.mismatched.length;
    }

    lines.push('');
    lines.push(`  Totals: ${totMatched}/${totProse} matched, ${totUnv} unverified, ${totMis} mismatched`);
    return lines.join('\n');
}

module.exports = {
    auditIndex,
    auditFigure,
    parseIndex,
    extractProseNumerics,
    walkNumerics,
    matchProseNumber,
    formatReport,
};
