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
 * It also pins the entry point's exit contract: --help and --version exit 0,
 * an unknown command or a bare invocation exits 1, and no path-taking
 * command exits 0 (or dumps a stack trace) when handed a path that is not there.
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

function runCli(args) {
    try {
        const stdout = execFileSync(process.execPath, [path.join(__dirname, '..', 'cli.js'), ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, out: stdout, err: '' };
    } catch (err) {
        return { code: err.status, out: (err.stdout || ''), err: (err.stderr || '') };
    }
}

// The entry point's own exit contract. Help and version are answers, so they
// exit 0; an unrecognised command or a bare invocation is a mistake and must
// not look like a run that passed.
function entryPointFailures() {
    const version = require('../package.json').version;
    const cases = [
        { args: ['--version'], code: 0, stdout: (o) => o.trim() === version, want: `print ${version}` },
        { args: ['--help'], code: 0, stdout: (o) => /repro-audit/.test(o), want: 'list the commands' },
        { args: ['not-a-command'], code: 1 },
        { args: [], code: 1 },
    ];
    // A path that does not exist is a typo, never a clean audit. Every
    // path-taking command must refuse it, without a stack trace.
    const missing = path.join(__dirname, '..', 'test-fixtures', 'no-such-path');
    const bib = path.join(__dirname, '..', 'test-fixtures', 'refs.bib');
    for (const args of [
        ['audit', missing, `--bibtex=${bib}`, '--offline'],
        ['notebook-audit', missing],
        ['aggregate', missing],
        ['figure-audit', missing],
        ['repro-audit', missing],
        ['prose-audit', missing],
    ]) {
        cases.push({ args, nonzero: true, stderr: (e) => !/\n\s+at .*\(/.test(e), want: 'fail without a stack trace' });
    }
    const failures = [];
    for (const c of cases) {
        const label = `cli.js ${c.args.map((a) => path.basename(a)).join(' ') || '(no args)'}`;
        const { code, out, err } = runCli(c.args);
        if (c.nonzero ? code === 0 : code !== c.code) {
            failures.push({
                case: label,
                kind: 'exit-code',
                detail: `exited ${code}, expected ${c.nonzero ? 'nonzero' : c.code}`,
            });
        } else if ((c.stdout && !c.stdout(out)) || (c.stderr && !c.stderr(err))) {
            failures.push({ case: label, kind: 'output', detail: `did not ${c.want}` });
        }
    }
    return { failures, asserted: cases.length };
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

    const entry = entryPointFailures();
    asserted += entry.asserted;
    failures.push(...entry.failures);

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
