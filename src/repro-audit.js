'use strict';

/**
 * Reproduction-gate auditor — producer-side, unlike its siblings.
 *
 * `audit`, `notebook-audit`, `figure-audit` and `prose-audit` all read what
 * a producer already wrote and check the prose against it. They cannot see
 * the failure that happens one step earlier: a script that computes a NEW
 * number on a stream whose ALREADY-PUBLISHED number it can no longer
 * reproduce. Every downstream audit then passes, because the prose faithfully
 * quotes a value that was computed wrong.
 *
 * The discipline this enforces: before a producer reports a new number, it
 * recomputes a shipped one on the same inputs and aborts if it does not come
 * back. In the run that motivated this module the gate caught a 663-row label
 * defect and, having passed, established that a 0.680-vs-0.691 gap was a real
 * pool difference rather than a port error. A new number is only as
 * trustworthy as the old number the same code path can still return.
 *
 * This auditor does not execute producers. It reads the `gate` block they
 * emit into their summary.json sidecars and answers four questions:
 *
 *   1. Is there a gate at all?           → `ungated`
 *   2. Did it pass?                      → `gate_failed`
 *   3. Was a skip justified?             → `gate_skipped_undocumented`
 *   4. Is the pin still the shipped
 *      value at its cited source?        → `stale_pin`
 *
 * (4) is the one that decays silently. A gate pinned to a literal keeps
 * passing forever after the number it pins moved upstream; the producer then
 * certifies itself against a retired value. Citing `source` + `source_path`
 * instead of a literal is what makes that checkable.
 *
 * Emitted-gate schema (both shapes accepted):
 *
 *   "gate": {
 *     "status": "ok" | "FAILED" | "skipped",
 *     "reason": "...",                  // required when skipped
 *     "shipped": 0.691,                 // flat form: one check
 *     "reproduced": 0.691,
 *     "delta": 0.0,
 *     "tolerance": 5e-4,
 *     "source": "scripts/output/m4_cursor_only_downstream/summary.json",
 *     "source_path": "section_4_3.deployable_M4_7.pooled_auc"
 *   }
 *
 *   "gate": { "status": "ok", "checks": [ {...}, {...} ] }   // multi-check form
 */

const fs = require('fs');
const path = require('path');

/** Default tolerances, used when a check declares none. */
const DEFAULT_ABS_TOLERANCE = 5e-4;   // for |value| <= 1: AUCs, correlations, rates
const DEFAULT_REL_TOLERANCE = 1e-3;   // for larger magnitudes

// Key aliases. Producers name these differently across a repo's history and
// the point is to read the gates that exist, not to legislate one spelling.
const GATE_KEYS = ['gate', 'gates', 'reproduction_gate', 'repro_gate'];
const SHIPPED_KEYS = ['shipped', 'target', 'expected', 'pinned', 'published', 'reference'];
const REPRODUCED_KEYS = ['reproduced', 'actual', 'observed', 'recomputed', 'got'];
const PROVENANCE_KEYS = ['provenance', 'inputs', 'input_provenance', 'substrate'];

/** summary.json, foo_summary.json, and the failure sidecar a tripped gate leaves. */
const SIDECAR_RE = /^(summary|.*[-_]summary)(\.FAILED)?\.json$/i;

/**
 * Read a sidecar, tolerating Python's JSON dialect.
 *
 * `json.dump` emits bare NaN / Infinity / -Infinity, which are legal to
 * Python and rejected by JSON.parse. Most real producer sidecars in a stats
 * pipeline carry at least one of them (an empty-group median, a divide-by-zero
 * rho), so a strict reader reports "cannot parse" on the majority of the tree
 * and sees none of the gates inside it.
 *
 * Strict parse first; only a file that already failed gets the substitution,
 * and only in value position, so a string containing "NaN" is untouched.
 * Returns { doc, nonstandard }.
 */
function readSidecar(filePath) {
    const text = fs.readFileSync(filePath, 'utf-8');
    try {
        return { doc: JSON.parse(text), nonstandard: false };
    } catch (e) {
        const patched = text.replace(
            /([:[,]\s*)(-?Infinity|NaN)(\s*[,\]}])/g,
            (m, pre, _tok, post) => `${pre}null${post}`
        );
        // Two passes: adjacent values (`[NaN, NaN]`) share a delimiter, so the
        // first pass consumes it and the second catches what it skipped.
        const twice = patched.replace(
            /([:[,]\s*)(-?Infinity|NaN)(\s*[,\]}])/g,
            (m, pre, _tok, post) => `${pre}null${post}`
        );
        return { doc: JSON.parse(twice), nonstandard: true };
    }
}

/**
 * Find a key on `obj` by alias list, tolerating case and a `_value` suffix.
 * Returns { key, value } or null.
 */
function pick(obj, aliases) {
    if (!obj || typeof obj !== 'object') return null;
    const keys = Object.keys(obj);
    for (const alias of aliases) {
        for (const k of keys) {
            const norm = k.toLowerCase();
            if (norm === alias || norm.startsWith(alias + '_') || norm.endsWith('_' + alias)) {
                return { key: k, value: obj[k] };
            }
        }
    }
    return null;
}

/** Resolve a dotted/bracketed path against a parsed JSON object. */
function resolvePath(obj, dotted) {
    if (!dotted) return undefined;
    const parts = String(dotted)
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .filter(Boolean);
    let cur = obj;
    for (const p of parts) {
        if (cur === null || cur === undefined) return undefined;
        cur = cur[p];
    }
    return cur;
}

/** Tolerance a check declares, or the magnitude-appropriate default. */
function toleranceFor(check) {
    const declared = check.tolerance ?? check.tol ?? check.atol;
    if (typeof declared === 'number' && isFinite(declared)) {
        return { value: declared, kind: 'declared' };
    }
    const mag = Math.abs(Number(check.shipped));
    if (!isFinite(mag) || mag <= 1) {
        return { value: DEFAULT_ABS_TOLERANCE, kind: 'default-abs' };
    }
    return { value: mag * DEFAULT_REL_TOLERANCE, kind: 'default-rel' };
}

/**
 * Normalise one raw check object into
 * { name, shipped, reproduced, delta, tolerance, source, source_path, pool }.
 * Returns null if it carries no shipped/reproduced pair at all.
 */
function normalizeCheck(raw, fallbackName) {
    if (!raw || typeof raw !== 'object') return null;
    const shipped = pick(raw, SHIPPED_KEYS);
    const reproduced = pick(raw, REPRODUCED_KEYS);
    if (!shipped || !reproduced) return null;
    if (typeof shipped.value !== 'number' || typeof reproduced.value !== 'number') return null;

    const delta = typeof raw.delta === 'number'
        ? raw.delta
        : reproduced.value - shipped.value;

    return {
        name: raw.name || raw.check || shipped.key || fallbackName,
        shipped: shipped.value,
        shipped_key: shipped.key,
        reproduced: reproduced.value,
        delta,
        tolerance: raw.tolerance ?? raw.tol ?? raw.atol ?? null,
        source: raw.source || raw.shipped_source || null,
        source_path: raw.source_path || raw.shipped_path || null,
        pool: raw.pool || null,
        n_records: raw.n_records ?? null,
    };
}

/** Pull the gate block out of a sidecar and normalise its checks. */
function extractGate(doc) {
    const found = pick(doc, GATE_KEYS);
    if (!found) return null;
    const gate = found.value;
    if (!gate || typeof gate !== 'object') return null;

    const status = String(gate.status ?? gate.result ?? '').toLowerCase();
    const reason = gate.reason || gate.why || gate.note || null;

    let rawChecks;
    if (Array.isArray(gate.checks)) {
        rawChecks = gate.checks;
    } else if (Array.isArray(gate)) {
        rawChecks = gate;
    } else {
        rawChecks = [gate];   // flat form: the gate object is itself one check
    }

    const checks = rawChecks
        .map((c, i) => normalizeCheck(c, `check ${i + 1}`))
        .filter(Boolean);

    return { key: found.key, status, reason, checks, raw: gate };
}

/** Does the sidecar tie its inputs to a hash / commit / explicit version? */
function hasProvenance(doc) {
    const prov = pick(doc, PROVENANCE_KEYS);
    if (prov && prov.value && typeof prov.value === 'object'
        && Object.keys(prov.value).length > 0) return true;
    // A top-level hash-ish key counts too.
    return Object.keys(doc || {}).some(k => /sha256|sha1|md5|checksum|commit|input_hash/i.test(k));
}

/** Count leaf numerics, so "this producer reported numbers" is a fact not a guess. */
function countNumerics(node, depth = 0) {
    if (depth > 12 || node === null || node === undefined) return 0;
    if (typeof node === 'number') return isFinite(node) ? 1 : 0;
    if (Array.isArray(node)) return node.reduce((n, v) => n + countNumerics(v, depth + 1), 0);
    if (typeof node === 'object') {
        return Object.entries(node).reduce((n, [k, v]) => {
            if (GATE_KEYS.includes(k.toLowerCase())) return n;   // the gate isn't a result
            return n + countNumerics(v, depth + 1);
        }, 0);
    }
    return 0;
}

/**
 * Audit one sidecar file.
 *
 * `requireGate` decides the severity of `ungated`. It defaults off because a
 * research output tree is mostly descriptive dumps — AOI counts, corpus
 * descriptives — that have no shipped number to reproduce and never will.
 * Erroring on all of them buries the findings that matter (a gate that exists
 * and is broken) under a hundred that do not. Turn it on for a directory whose
 * producers are all supposed to be in a lineage.
 */
function auditSidecar(filePath, rootDir, { requireGate = false } = {}) {
    const rel = path.relative(rootDir, filePath) || path.basename(filePath);
    const result = {
        file: rel,
        abs: filePath,
        findings: [],
        checks: [],
        gate_status: null,
        numerics: 0,
        provenance: false,
    };

    let doc;
    try {
        const read = readSidecar(filePath);
        doc = read.doc;
        result.nonstandard_json = read.nonstandard;
    } catch (e) {
        result.findings.push({
            type: 'parse_error', severity: 'error',
            message: `cannot parse: ${e.message}`,
        });
        return result;
    }

    result.numerics = countNumerics(doc);
    result.provenance = hasProvenance(doc);

    // A tripped gate that left its failure sidecar on disk is itself the signal.
    if (/\.FAILED\.json$/i.test(filePath)) {
        result.findings.push({
            type: 'gate_failed', severity: 'error',
            message: 'failure sidecar present on disk — a gate tripped and this run was not reported',
        });
    }

    const gate = extractGate(doc);

    if (!gate) {
        if (result.numerics > 0) {
            result.findings.push({
                type: 'ungated', severity: requireGate ? 'error' : 'warn',
                message: `no gate block; ${result.numerics} numeric value(s) reported without reproducing a shipped number`,
            });
            // No separate unanchored_input here: `ungated` already says the
            // producer certified nothing, and repeating it per sidecar is what
            // turns a 170-file output tree into an unreadable report.
        } else {
            result.findings.push({
                type: 'no_results', severity: 'info',
                message: 'no gate block and no numeric results — not a producer sidecar',
            });
        }
        return result;
    }

    result.gate_status = gate.status || 'unknown';

    if (gate.status === 'skipped') {
        result.findings.push(gate.reason
            ? { type: 'gate_skipped', severity: 'info',
                message: `gate skipped: ${gate.reason}` }
            : { type: 'gate_skipped_undocumented', severity: 'error',
                message: 'gate skipped with no reason; a skip has to say why the stream has no shipped number' });
    } else if (gate.status === 'failed') {
        result.findings.push({
            type: 'gate_failed', severity: 'error',
            message: 'gate status is FAILED — the producer could not reproduce its shipped number',
        });
    }

    if (gate.checks.length === 0 && gate.status !== 'skipped') {
        result.findings.push({
            type: 'gate_empty', severity: 'error',
            message: `gate block present but carries no shipped/reproduced pair (looked for ${SHIPPED_KEYS[0]}/${REPRODUCED_KEYS[0]})`,
        });
    }

    for (const check of gate.checks) {
        const tol = toleranceFor(check);
        const within = Math.abs(check.delta) <= tol.value;
        const entry = {
            name: check.name,
            shipped: check.shipped,
            reproduced: check.reproduced,
            delta: check.delta,
            tolerance: tol.value,
            tolerance_kind: tol.kind,
            within,
            pool: check.pool,
            source: check.source,
            source_path: check.source_path,
            pin_status: 'unchecked',
        };

        if (!within) {
            result.findings.push({
                type: 'gate_failed', severity: 'error',
                message: `"${check.name}": reproduced ${check.reproduced} vs shipped ${check.shipped} `
                    + `(Δ ${check.delta >= 0 ? '+' : ''}${check.delta.toExponential(2)}, tolerance ${tol.value.toExponential(2)})`,
            });
        }

        // --- pin staleness: is the literal still what the cited source says? ---
        if (check.source && check.source_path) {
            const srcPath = path.isAbsolute(check.source)
                ? check.source
                : path.resolve(path.dirname(filePath), check.source);
            const altPath = path.resolve(rootDir, check.source);
            const use = fs.existsSync(srcPath) ? srcPath
                : (fs.existsSync(altPath) ? altPath : null);

            if (!use) {
                entry.pin_status = 'unresolvable';
                result.findings.push({
                    type: 'unresolvable_pin', severity: 'warn',
                    message: `"${check.name}": cited source not found: ${check.source}`,
                });
            } else {
                let live;
                try {
                    live = resolvePath(readSidecar(use).doc, check.source_path);
                } catch (e) {
                    live = undefined;
                }
                if (typeof live !== 'number') {
                    entry.pin_status = 'unresolvable';
                    result.findings.push({
                        type: 'unresolvable_pin', severity: 'warn',
                        message: `"${check.name}": ${check.source_path} is not a number in ${check.source}`,
                    });
                } else if (Math.abs(live - check.shipped) > tol.value) {
                    entry.pin_status = 'stale';
                    entry.live_source_value = live;
                    result.findings.push({
                        type: 'stale_pin', severity: 'error',
                        message: `"${check.name}": pinned to ${check.shipped}, but ${check.source_path} `
                            + `in ${check.source} now reads ${live}. The gate is certifying against a retired value.`,
                    });
                } else {
                    entry.pin_status = 'current';
                    entry.live_source_value = live;
                }
            }
        } else if (gate.status !== 'skipped') {
            entry.pin_status = 'uncited';
            result.findings.push({
                type: 'uncited_pin', severity: 'warn',
                message: `"${check.name}": shipped value is a literal with no source/source_path; `
                    + 'staleness cannot be checked',
            });
        }

        result.checks.push(entry);
    }

    if (!result.provenance) {
        result.findings.push({
            type: 'unanchored_input', severity: 'warn',
            message: 'no provenance hash tying the inputs to this sidecar — the gate proves the code, not the stream',
        });
    }

    return result;
}

/** Recursively collect sidecar paths under `dir`. */
function findSidecars(dir, acc = [], depth = 0) {
    if (depth > 8) return acc;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        return acc;
    }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (['node_modules', '.git', '__pycache__', '.venv'].includes(e.name)) continue;
            findSidecars(full, acc, depth + 1);
        } else if (SIDECAR_RE.test(e.name)) {
            acc.push(full);
        }
    }
    return acc;
}

/**
 * Top-level entry. Accepts a directory (walked for sidecars) or a single
 * sidecar path.
 *
 * A run that parsed zero sidecars is a failure state, not a clean run — it is
 * indistinguishable from a repo where every producer is gated, and that
 * ambiguity is exactly how a silent auditor survives for months. The caller
 * is expected to treat `parsed === 0` as a nonzero exit.
 */
function auditRepro(target, options = {}) {
    const abs = path.resolve(target);
    const stat = fs.statSync(abs);
    const rootDir = stat.isDirectory() ? abs : path.dirname(abs);
    const files = stat.isDirectory() ? findSidecars(abs) : [abs];

    const opts = { requireGate: options.requireGate === true };
    const sidecars = files.map(f => auditSidecar(f, rootDir, opts))
        .sort((a, b) => a.file.localeCompare(b.file));

    const producers = sidecars.filter(s => s.numerics > 0 || s.gate_status);
    const counts = { error: 0, warn: 0, info: 0 };
    for (const s of sidecars) {
        for (const f of s.findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
    }

    return {
        target: abs,
        require_gate: opts.requireGate,
        scanned: files.length,
        parsed: sidecars.filter(s => !s.findings.some(f => f.type === 'parse_error')).length,
        producers: producers.length,
        // Verified, not self-reported: a sidecar that says status ok while its
        // own delta blows its tolerance, or whose pin has gone stale, is not gated.
        gated: producers.filter(s => s.gate_status === 'ok'
            && !s.findings.some(f => f.severity === 'error')).length,
        ungated: producers.filter(s => s.findings.some(f => f.type === 'ungated')).length,
        severity_counts: counts,
        sidecars,
    };
}

const GLYPH = { error: '✗', warn: '⚠', info: '·', clean: '✓' };

function formatReport(audit, options = {}) {
    const lines = [];
    lines.push(`Reproduction-gate audit: ${audit.target}`);
    lines.push(`  ${audit.scanned} sidecar(s) scanned, ${audit.producers} producer(s), `
        + `${audit.gated} gated ok, ${audit.ungated} ungated.`);
    lines.push('');

    if (audit.scanned === 0) {
        lines.push('  No summary.json / *_summary.json sidecars found under this path.');
        lines.push('  Nothing was checked. This is a failure state, not a clean run —');
        lines.push('  point the audit at the directory your producers write into.');
        return lines.join('\n');
    }

    // Sidecars whose only finding is "no gate" are listed once, compactly, at
    // the end. Expanding a hundred identical blocks buries the gates that
    // exist and are broken, which are the findings worth reading.
    const ungatedOnly = [];

    for (const s of audit.sidecars) {
        if (options.verbose !== true && s.findings.length === 1
            && s.findings[0].type === 'no_results') continue;

        if (options.verbose !== true && s.checks.length === 0
            && s.findings.length === 1 && s.findings[0].type === 'ungated') {
            ungatedOnly.push(s);
            continue;
        }

        const worst = s.findings.some(f => f.severity === 'error') ? 'error'
            : s.findings.some(f => f.severity === 'warn') ? 'warn'
            : s.findings.length ? 'info' : 'clean';
        lines.push(`  ${GLYPH[worst]} ${s.file}`);

        for (const c of s.checks) {
            const d = `${c.delta >= 0 ? '+' : ''}${c.delta.toExponential(2)}`;
            const pin = c.pin_status === 'stale' ? '  PIN STALE'
                : c.pin_status === 'current' ? ''
                : `  [pin ${c.pin_status}]`;
            lines.push(`      ${c.within ? 'ok  ' : 'FAIL'}  ${c.name}: `
                + `shipped ${c.shipped}  reproduced ${c.reproduced}  Δ ${d}`
                + `${c.pool ? `  pool=${c.pool}` : ''}${pin}`);
        }

        for (const f of s.findings) {
            if (f.type === 'no_results' && options.verbose !== true) continue;
            lines.push(`      ${GLYPH[f.severity]} ${f.type}: ${f.message}`);
        }
        lines.push('');
    }

    if (ungatedOnly.length) {
        const glyph = audit.require_gate ? GLYPH.error : GLYPH.warn;
        lines.push(`  ${glyph} ungated — reported numbers without reproducing a shipped one `
            + `(${ungatedOnly.length} sidecar${ungatedOnly.length === 1 ? '' : 's'}):`);
        const cap = options.cap || 12;
        for (const s of ungatedOnly.slice(0, cap)) {
            lines.push(`      ${s.file}  (${s.numerics} numeric${s.numerics === 1 ? '' : 's'})`);
        }
        if (ungatedOnly.length > cap) {
            lines.push(`      … and ${ungatedOnly.length - cap} more (--verbose to list, --json for all)`);
        }
        if (!audit.require_gate) {
            lines.push('      Warned, not errored: a descriptive dump has no shipped number to');
            lines.push('      reproduce. Use --require-gate where every producer is in a lineage.');
        }
        lines.push('');
    }

    const c = audit.severity_counts;
    lines.push(`  ${c.error || 0} error · ${c.warn || 0} warn · ${c.info || 0} info`);
    return lines.join('\n');
}

module.exports = {
    auditRepro,
    readSidecar,
    auditSidecar,
    extractGate,
    normalizeCheck,
    resolvePath,
    toleranceFor,
    findSidecars,
    formatReport,
    SIDECAR_RE,
};


// Running a src/ module directly exits 0 and prints nothing, which for an
// audit tool is indistinguishable from a clean result. Fail loudly instead.
if (require.main === module) {
    console.error(
        `science-agent: src/repro-audit.js is a library, not a command.\n` +
        'Invoking it directly produces no output and no findings, whatever the input.\n' +
        'Use:\n' +
        '  node cli.js repro-audit <dir-or-sidecar>\n'
    );
    process.exit(2);
}
