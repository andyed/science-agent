#!/usr/bin/env node
'use strict';

/**
 * notebook-eval — regression harness for the notebook-audit claim grammar.
 *
 * Reads test-fixtures/notebook/manifest.json and asserts, per case:
 *   must_resolve   → these NB##:K## references are found AND resolve in the aggregate
 *   must_fire      → the case produces ≥1 issue of that type
 *   must_not_fire  → the case produces 0 issues of that type
 *   min_refs / min_claims_in_aggregate → floors on what the parser could see
 *
 * The floors are the point. This tool's failure mode was never a wrong answer; it
 * was parsing nothing and reporting a clean run, which is indistinguishable from
 * success unless something asserts that it still sees.
 *
 * Usage:
 *   node tools/notebook-eval.js [--verbose] [--case=<name>]
 *
 * Exit status: 0 = all assertions hold, 1 = at least one violated.
 */

const fs = require('fs');
const path = require('path');
const { auditNotebookClaims } = require('../src/notebook-audit');

const FIXTURE_DIR = path.join(__dirname, '..', 'test-fixtures', 'notebook');
const MANIFEST = path.join(FIXTURE_DIR, 'manifest.json');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const caseArg = argv.find(a => a.startsWith('--case='));
const caseFilter = caseArg ? caseArg.slice('--case='.length) : null;

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[90m', RESET = '\x1b[0m';

function run() {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
    const failures = [];
    let asserted = 0;

    for (const kase of manifest.cases) {
        if (caseFilter && kase.name !== caseFilter) continue;

        const dir = path.join(FIXTURE_DIR, kase.dir);
        if (!fs.existsSync(dir)) {
            failures.push({ case: kase.name, kind: 'missing',
                            detail: `fixture dir ${kase.dir} does not exist` });
            continue;
        }

        const result = auditNotebookClaims(dir, {
            aggregatePath: kase.aggregate ? path.join(FIXTURE_DIR, kase.aggregate) : null,
            notebookDir: kase.notebooks ? path.join(FIXTURE_DIR, kase.notebooks) : null,
        });

        const firedTypes = new Set(result.issues.map(i => i.type));
        const unresolved = new Set(
            result.issues.filter(i => i.type === 'missing_claim' || i.type === 'missing_notebook')
                         .map(i => i.ref));

        for (const want of kase.must_resolve || []) {
            asserted++;
            const seen = result.refs.find(r => `${r.notebook}:${r.claimId}` === want);
            if (!seen) {
                failures.push({ case: kase.name, kind: 'not_seen',
                                detail: `${want} was never parsed out of the prose` });
            } else if ([...unresolved].some(raw => raw && raw.includes(want))) {
                failures.push({ case: kase.name, kind: 'not_resolved',
                                detail: `${want} parsed but did not resolve in the aggregate` });
            }
        }

        for (const type of kase.must_fire || []) {
            asserted++;
            if (!firedTypes.has(type)) {
                failures.push({ case: kase.name, kind: 'silent',
                                detail: `expected issue type "${type}", got [${[...firedTypes].join(', ') || 'none'}]` });
            }
        }

        for (const type of kase.must_not_fire || []) {
            asserted++;
            if (firedTypes.has(type)) {
                const ex = result.issues.find(i => i.type === type);
                failures.push({ case: kase.name, kind: 'false_positive',
                                detail: `unexpected "${type}": ${ex && ex.message}` });
            }
        }

        if (kase.min_refs !== undefined) {
            asserted++;
            if (result.stats.totalRefs < kase.min_refs) {
                failures.push({ case: kase.name, kind: 'blind',
                                detail: `parsed ${result.stats.totalRefs} refs, floor is ${kase.min_refs}` });
            }
        }

        if (kase.min_claims_in_aggregate !== undefined) {
            asserted++;
            if (result.stats.claimsInAggregate < kase.min_claims_in_aggregate) {
                failures.push({ case: kase.name, kind: 'blind',
                                detail: `aggregate parsed ${result.stats.claimsInAggregate} claims, floor is ${kase.min_claims_in_aggregate}` });
            }
        }

        if (verbose) {
            console.log(`${DIM}${kase.name}: ${result.stats.totalRefs} refs, ` +
                        `${result.stats.claimsInAggregate} aggregate claims, ` +
                        `issues [${[...firedTypes].join(', ') || 'none'}]${RESET}`);
        }
    }

    console.log('');
    if (failures.length === 0) {
        console.log(`${GREEN}notebook-eval: ${asserted} assertions, 0 violations${RESET}\n`);
        return 0;
    }
    console.log(`${RED}notebook-eval: ${asserted} assertions, ${failures.length} violation(s)${RESET}\n`);
    for (const f of failures) {
        console.log(`  ${RED}✗${RESET} [${f.case}] ${f.kind}`);
        console.log(`    ${f.detail}`);
    }
    console.log('');
    return 1;
}

process.exit(run());
