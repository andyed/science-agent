#!/usr/bin/env node
'use strict';

/**
 * prose-eval — two-sided regression harness for the prose-audit rule table.
 *
 * Reads test-fixtures/prose/manifest.json and asserts, per rule id:
 *   must_fire      → the fixture produces ≥1 finding for that rule
 *   must_not_fire  → the fixture produces 0 findings for that rule
 *
 * The must_not_fire half is the reason this exists. A rule table with no
 * false-positive corpus has unmeasured precision, and precision is what
 * decides whether the linter is still running by draft N.
 *
 * Usage:
 *   node tools/prose-eval.js [--verbose] [--rule=<id>]
 *
 * Exit status: 0 = all assertions hold, 1 = at least one violated.
 */

const fs = require('fs');
const path = require('path');
const { auditProse } = require('../src/prose-audit');

const FIXTURE_DIR = path.join(__dirname, '..', 'test-fixtures', 'prose');
const MANIFEST = path.join(FIXTURE_DIR, 'manifest.json');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const ruleFilterArg = argv.find(a => a.startsWith('--rule='));
const ruleFilter = ruleFilterArg ? ruleFilterArg.slice('--rule='.length) : null;

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[90m', RESET = '\x1b[0m';

function run() {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
    const failures = [];
    let asserted = 0;

    for (const kase of manifest.cases) {
        const filePath = path.join(FIXTURE_DIR, kase.file);
        if (!fs.existsSync(filePath)) {
            failures.push({ file: kase.file, rule: '(fixture)', kind: 'missing',
                            detail: 'file listed in manifest does not exist' });
            continue;
        }

        // Muriel's Python pass is skipped: this harness measures the native
        // JSON rule table, and a machine without muriel installed must get
        // the same result as one with it.
        const findings = auditProse(filePath, { muriel: false }).findings;
        const byRule = {};
        for (const f of findings) (byRule[f.rule] = byRule[f.rule] || []).push(f);

        if (verbose) {
            console.log(`${DIM}── ${kase.file} (${findings.length} findings)${RESET}`);
            for (const f of findings) {
                console.log(`${DIM}   ${f.line}:${f.column} [${f.rule}] ${f.excerpt}${RESET}`);
            }
        }

        for (const rule of kase.must_fire || []) {
            if (ruleFilter && rule !== ruleFilter) continue;
            asserted += 1;
            const hits = byRule[rule] || [];
            if (hits.length === 0) {
                failures.push({ file: kase.file, rule, kind: 'silent',
                                detail: 'expected ≥1 finding, got 0', why: kase.why });
            }
        }

        for (const rule of kase.must_not_fire || []) {
            if (ruleFilter && rule !== ruleFilter) continue;
            asserted += 1;
            const hits = byRule[rule] || [];
            if (hits.length > 0) {
                failures.push({
                    file: kase.file, rule, kind: 'false-positive',
                    detail: `expected 0 findings, got ${hits.length}`,
                    why: kase.why,
                    hits: hits.map(h => `${h.line}:${h.column} ${h.excerpt}`),
                });
            }
        }
    }

    console.log('');
    if (failures.length === 0) {
        console.log(`${GREEN}prose-eval: ${asserted} assertions, 0 violations${RESET}`);
        return 0;
    }

    const fp = failures.filter(f => f.kind === 'false-positive').length;
    const silent = failures.filter(f => f.kind === 'silent').length;
    console.log(`${RED}prose-eval: ${asserted} assertions, ${failures.length} violations ` +
                `(${fp} false-positive, ${silent} silent)${RESET}\n`);
    for (const f of failures) {
        console.log(`${RED}✗${RESET} ${f.file} [${f.rule}] — ${f.kind}: ${f.detail}`);
        if (f.why) console.log(`  ${DIM}fixture asserts: ${f.why}${RESET}`);
        for (const h of f.hits || []) console.log(`  ${DIM}fired at ${h}${RESET}`);
    }
    return 1;
}

process.exit(run());
