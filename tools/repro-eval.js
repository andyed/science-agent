#!/usr/bin/env node
'use strict';

/**
 * repro-eval — regression harness for the reproduction-gate auditor.
 *
 * Reads test-fixtures/repro/manifest.json and asserts, per case:
 *   must_fire            → the case produces ≥1 finding of that type
 *   must_not_fire        → the case produces 0 findings of that type
 *   min_producers        → floor on sidecars the walk could actually see
 *   min_checks           → floor on shipped/reproduced pairs it could parse
 *   expect_scanned       → exact sidecar count (0 for the empty fixture)
 *   expect_nonzero_exit  → the CLI must refuse to call this a clean run
 *
 * The floors and the empty-fixture case are the point. A gate auditor that
 * reads nothing reports nothing, and a repo with no gates at all then looks
 * identical to a repo where every producer is gated. Something has to assert
 * it can still see.
 *
 * Usage:
 *   node tools/repro-eval.js [--verbose] [--case=<name>]
 *
 * Exit status: 0 = all assertions hold, 1 = at least one violated.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { auditRepro } = require('../src/repro-audit');

const ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'test-fixtures', 'repro');
const MANIFEST = path.join(FIXTURE_DIR, 'manifest.json');

const argv = process.argv.slice(2);
const verbose = argv.includes('--verbose');
const caseArg = argv.find(a => a.startsWith('--case='));
const caseFilter = caseArg ? caseArg.slice('--case='.length) : null;

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[90m', RESET = '\x1b[0m';

/** Every finding type produced anywhere in an audit result. */
function firedTypes(audit) {
    const set = new Set();
    for (const s of audit.sidecars) for (const f of s.findings) set.add(f.type);
    return set;
}

function countChecks(audit) {
    return audit.sidecars.reduce((n, s) => n + s.checks.length, 0);
}

/** Run the CLI to observe the real exit code, not just the library return. */
function cliExitCode(dir) {
    try {
        execFileSync(process.execPath, [path.join(ROOT, 'cli.js'), 'repro-audit', dir],
            { stdio: 'pipe' });
        return 0;
    } catch (e) {
        return typeof e.status === 'number' ? e.status : -1;
    }
}

function run() {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
    const failures = [];
    let asserted = 0;

    // The empty fixture is an empty directory, which git does not carry on its
    // own. Recreate it so the case that matters most cannot vanish from a
    // fresh clone and take its assertion with it.
    fs.mkdirSync(path.join(FIXTURE_DIR, 'empty'), { recursive: true });

    for (const kase of manifest.cases) {
        if (caseFilter && kase.name !== caseFilter) continue;

        const dir = path.join(FIXTURE_DIR, kase.dir);
        if (!fs.existsSync(dir)) {
            failures.push({ case: kase.name, kind: 'missing',
                            detail: `fixture dir ${kase.dir} does not exist` });
            continue;
        }

        let audit;
        try {
            audit = auditRepro(dir);
        } catch (e) {
            failures.push({ case: kase.name, kind: 'threw', detail: e.message });
            continue;
        }

        const fired = firedTypes(audit);
        const checks = countChecks(audit);

        if (verbose) {
            console.log(`${DIM}${kase.name}: ${audit.scanned} scanned, `
                + `${audit.producers} producers, ${checks} checks, `
                + `fired [${[...fired].join(', ') || 'none'}]${RESET}`);
        }

        if (typeof kase.expect_scanned === 'number') {
            asserted++;
            if (audit.scanned !== kase.expect_scanned) {
                failures.push({ case: kase.name, kind: 'expect_scanned',
                    detail: `expected ${kase.expect_scanned} sidecar(s), saw ${audit.scanned}` });
            }
        }

        if (typeof kase.min_producers === 'number') {
            asserted++;
            if (audit.producers < kase.min_producers) {
                failures.push({ case: kase.name, kind: 'min_producers',
                    detail: `saw ${audit.producers} producer sidecar(s), floor is ${kase.min_producers} `
                        + '— the walk is reading less than it should, so every clean verdict below is meaningless' });
            }
        }

        if (typeof kase.min_checks === 'number') {
            asserted++;
            if (checks < kase.min_checks) {
                failures.push({ case: kase.name, kind: 'min_checks',
                    detail: `parsed ${checks} shipped/reproduced pair(s), floor is ${kase.min_checks} `
                        + '— the gate reader is not recognising the schema it is supposed to read' });
            }
        }

        for (const type of kase.must_fire || []) {
            asserted++;
            if (!fired.has(type)) {
                failures.push({ case: kase.name, kind: 'must_fire',
                    detail: `${type} did not fire (fired: ${[...fired].join(', ') || 'nothing'})` });
            }
        }

        for (const type of kase.must_not_fire || []) {
            asserted++;
            if (fired.has(type)) {
                const msgs = audit.sidecars
                    .flatMap(s => s.findings.filter(f => f.type === type).map(f => `${s.file}: ${f.message}`));
                failures.push({ case: kase.name, kind: 'must_not_fire',
                    detail: `${type} fired but should not have → ${msgs.join(' | ')}` });
            }
        }

        if (kase.expect_nonzero_exit) {
            asserted++;
            const code = cliExitCode(dir);
            if (code === 0) {
                failures.push({ case: kase.name, kind: 'expect_nonzero_exit',
                    detail: 'CLI exited 0 on a run that checked nothing — a blind audit is reporting success' });
            }
        }
    }

    console.log('');
    if (failures.length === 0) {
        console.log(`${GREEN}✓ repro-eval: ${asserted} assertion(s) hold across `
            + `${manifest.cases.length} case(s).${RESET}\n`);
        return 0;
    }

    console.log(`${RED}✗ repro-eval: ${failures.length} violation(s) `
        + `of ${asserted} assertion(s).${RESET}\n`);
    for (const f of failures) {
        console.log(`  ${RED}${f.case}${RESET} [${f.kind}] ${f.detail}`);
    }
    console.log('');
    return 1;
}

process.exit(run());
