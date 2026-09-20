#!/usr/bin/env node
'use strict';

/**
 * cli-guard-eval — asserts that no src/ module can be run directly.
 *
 * Every file in src/ is a library. Node happily executes one: it loads,
 * defines its exports, reaches the end, and exits 0 having printed nothing.
 * For an audit tool that output is indistinguishable from a clean result,
 * and the wrong invocation is an easy one to reach for — `node
 * src/prose-audit.js paper.md` looks exactly like a command.
 *
 * This harness is the same argument repro-eval makes about gates that read
 * nothing: a silent pass has to be impossible, not merely unlikely. Each
 * module must refuse direct invocation with a non-zero exit and a message
 * naming the real command.
 *
 * Usage:
 *   node tools/cli-guard-eval.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

const SRC = path.join(__dirname, '..', 'src');

function runDirect(file) {
    try {
        const stdout = execFileSync(process.execPath, [path.join(SRC, file)], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, out: stdout };
    } catch (err) {
        return { code: err.status, out: (err.stderr || '') + (err.stdout || '') };
    }
}

function run() {
    const modules = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
    if (modules.length === 0) {
        console.log(`${RED}✗ cli-guard-eval: no modules found in src/.${RESET}\n`);
        return 1;
    }

    const failures = [];
    let asserted = 0;

    for (const file of modules) {
        const { code, out } = runDirect(file);

        asserted++;
        if (code === 0) {
            failures.push({
                case: file,
                kind: 'silent-pass',
                detail: 'exited 0 when run directly — a clean report that audited nothing',
            });
            continue;
        }

        asserted++;
        if (!/cli\.js/.test(out)) {
            failures.push({
                case: file,
                kind: 'no-redirect',
                detail: 'refused to run but did not name the cli.js command to use instead',
            });
        }
    }

    if (failures.length === 0) {
        console.log(`${GREEN}✓ cli-guard-eval: ${asserted} assertion(s) hold across `
            + `${modules.length} module(s).${RESET}\n`);
        return 0;
    }

    console.log(`${RED}✗ cli-guard-eval: ${failures.length} violation(s) `
        + `of ${asserted} assertion(s).${RESET}\n`);
    for (const f of failures) {
        console.log(`  ${RED}${f.case}${RESET} [${f.kind}] ${f.detail}`);
    }
    console.log('');
    return 1;
}

process.exit(run());
