#!/usr/bin/env node
'use strict';

/**
 * bibtex-eval — regression harness for the in-repo BibTeX parser.
 *
 * Reads test-fixtures/bibtex/manifest.json and asserts:
 *   valid    → edge-cases.bib yields exactly the listed entries, macros and
 *              normalized index rows, and none of the commented-out keys
 *   invalid  → each file is rejected with a BibTeXParseError on the stated line
 *   empty    → each file with no entries is refused by parseBibTeX
 *   duplicates → a repeated citation key keeps its first entry and is
 *              reported as duplicate_key, online and with --offline
 *   cli      → `audit --bibtex=<bad file>` exits non-zero, names the file, and
 *              prints no stack trace and no report
 *
 * The invalid and empty cases are the point. Every bibliography check runs
 * against the index this parser builds; a parser that returned the entries it
 * managed to read, or none, would let those checks pass on a fraction of the
 * reference list. Unreadable input has to be an error.
 *
 * Usage:
 *   node tools/bibtex-eval.js [--verbose]
 *
 * Exit status: 0 = all assertions hold, 1 = at least one violated.
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseBibTeXText, BibTeXParseError } = require('../src/bibtex-parser');
const { parseBibTeX, buildLookup } = require('../src/bibtex');
const { auditBibTeX, duplicateKeyIssues } = require('../src/bib-audit');

const ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'test-fixtures', 'bibtex');
const MANIFEST = path.join(FIXTURE_DIR, 'manifest.json');

// Floors on the manifest itself, so a truncated manifest cannot pass.
const MIN_VALID_ENTRIES = 8;
const MIN_INVALID_CASES = 12;
const MIN_EMPTY_CASES = 3;

const verbose = process.argv.includes('--verbose');
const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[90m', RESET = '\x1b[0m';

const failures = [];
let asserted = 0;

function check(name, fn) {
    asserted++;
    try {
        fn();
        if (verbose) console.log(`  ${DIM}ok${RESET}  ${name}`);
    } catch (err) {
        failures.push({ name, detail: err.message.split('\n').slice(0, 12).join('\n      ') });
    }
}

// Tags come back on a null-prototype object; compare as plain data.
const plain = value => JSON.parse(JSON.stringify(value));

function runCli(args) {
    try {
        const stdout = execFileSync(process.execPath, [path.join(ROOT, 'cli.js'), ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, out: stdout, err: '' };
    } catch (err) {
        return { code: err.status, out: err.stdout || '', err: err.stderr || '' };
    }
}

function expectParseError(fn) {
    try {
        fn();
    } catch (err) {
        assert(err instanceof BibTeXParseError, `threw ${err.name}, expected BibTeXParseError: ${err.message}`);
        return err;
    }
    throw new Error('parsed without error; unreadable input must not produce a result');
}

function validCases(valid) {
    const file = path.join(FIXTURE_DIR, valid.file);
    const text = fs.readFileSync(file, 'utf-8');
    let result = null;
    check(`${valid.file} parses`, () => { result = parseBibTeXText(text, { file }); });
    if (!result) return;

    check('manifest lists enough valid entries', () => {
        assert(valid.entries.length >= MIN_VALID_ENTRIES,
            `${valid.entries.length} entries listed, floor is ${MIN_VALID_ENTRIES}`);
    });
    check('entry keys, in file order', () => {
        assert.deepStrictEqual(result.entries.map(e => e.citationKey), valid.entries.map(e => e.citationKey));
    });
    for (const expected of valid.entries) {
        check(`entry ${expected.citationKey}: ${expected.covers}`, () => {
            const actual = result.entries.find(e => e.citationKey === expected.citationKey);
            assert(actual, 'entry missing');
            assert.strictEqual(actual.entryType, expected.entryType);
            assert.deepStrictEqual(plain(actual.entryTags), expected.entryTags);
        });
    }
    check('@string macros', () => assert.deepStrictEqual(plain(result.strings), valid.strings));
    check('@comment blocks skipped', () => assert.strictEqual(result.comments, valid.comments));
    check('@preamble blocks skipped', () => assert.strictEqual(result.preambles, valid.preambles));
    check('commented-out entries stay out', () => {
        const keys = result.entries.map(e => e.citationKey);
        for (const key of valid.must_not_contain_keys) assert(!keys.includes(key), `${key} was parsed as an entry`);
    });
    check('entries record their source line', () => {
        const first = result.entries[0];
        assert.strictEqual(text.split('\n')[first.line - 1].trim().toLowerCase(),
            `@article{${first.citationKey.toLowerCase()},`);
    });

    // Encoding and line-ending variants of the same file must read the same.
    const variants = {
        'CRLF line endings': text.replace(/\n/g, '\r\n'),
        'UTF-8 byte order mark': `﻿${text}`,
        'no trailing newline': text.replace(/\s+$/, ''),
    };
    for (const [label, variant] of Object.entries(variants)) {
        check(`same result with ${label}`, () => {
            const other = parseBibTeXText(variant);
            assert.deepStrictEqual(
                plain(other.entries.map(({ line, ...rest }) => rest)),
                plain(result.entries.map(({ line, ...rest }) => rest)),
            );
        });
    }

    // The shape src/audit.js and src/bib-audit.js consume.
    let index = null;
    check(`${valid.file} builds an index`, () => { index = parseBibTeX(file); });
    if (!index) return;
    check('index holds every entry under its lowercased key', () => {
        assert.deepStrictEqual([...index.keys()], valid.entries.map(e => e.citationKey.toLowerCase()));
    });
    for (const [id, expected] of Object.entries(valid.index)) {
        check(`index row ${id}`, () => {
            const { raw, ...row } = index.get(id);
            assert.deepStrictEqual(row, { id, ...expected });
            assert.strictEqual(raw.citationKey.toLowerCase(), id);
            assert.strictEqual(typeof raw.entryType, 'string');
        });
    }
    check('surname+year lookup', () => {
        const lookup = buildLookup(index);
        assert.deepStrictEqual(lookup.get('quoted_2021').map(e => e.id), ['nested:braces/2021']);
        assert.deepStrictEqual(lookup.get('wrapped_2022').map(e => e.id), ['wrapped']);
    });
}

function invalidCases(invalid) {
    check('manifest lists enough invalid cases', () => {
        assert(invalid.length >= MIN_INVALID_CASES, `${invalid.length} cases listed, floor is ${MIN_INVALID_CASES}`);
    });
    for (const c of invalid) {
        const file = path.join(FIXTURE_DIR, c.file);
        check(`${c.file} is rejected on line ${c.line}`, () => {
            const text = fs.readFileSync(file, 'utf-8');
            // Each fixture opens with a valid entry: the failure being guarded
            // against is returning that entry and dropping the rest.
            assert(/@article\{good2020,/.test(text), 'fixture lost its leading valid entry');
            const err = expectParseError(() => parseBibTeXText(text, { file }));
            assert.strictEqual(err.line, c.line, `error on line ${err.line}: ${err.message}`);
            assert(err.reason.includes(c.message), `message was: ${err.reason}`);
            assert(err.message.startsWith(`${file}:${c.line}:`), `message does not locate the error: ${err.message}`);
        });
        check(`${c.file} is rejected by parseBibTeX`, () => {
            expectParseError(() => parseBibTeX(file));
        });
    }
}

function emptyCases(empty) {
    check('manifest lists enough empty cases', () => {
        assert(empty.length >= MIN_EMPTY_CASES, `${empty.length} cases listed, floor is ${MIN_EMPTY_CASES}`);
    });
    for (const name of empty) {
        const file = path.join(FIXTURE_DIR, name);
        check(`${name} has no entries and is refused`, () => {
            const result = parseBibTeXText(fs.readFileSync(file, 'utf-8'), { file });
            assert.strictEqual(result.entries.length, 0, 'fixture is supposed to hold no entries');
            const err = expectParseError(() => parseBibTeX(file));
            assert(/no BibTeX entries found/.test(err.message), err.message);
            assert(err.message.includes(file), 'message does not name the file');
        });
    }
}

// A repeated key drops an entry from the index. That is only acceptable if the
// audit says so: these cases fail if the repeat goes unreported, or if the
// entry kept is not the one BibTeX keeps.
async function duplicateCases(dup) {
    const file = path.join(FIXTURE_DIR, dup.file);
    let index = null;
    check(`${dup.file} builds an index`, () => { index = parseBibTeX(file); });
    if (!index) return;

    check('each key is indexed once, in order of first definition', () => {
        assert.deepStrictEqual([...index.keys()], dup.keys);
    });
    check('a repeated key keeps its first entry', () => {
        for (const [id, title] of Object.entries(dup.kept_titles)) {
            assert.strictEqual(index.get(id).title, title, id);
            assert.strictEqual(index.get(id).raw.line, dup.duplicateKeys.find(d => d.id === id).lines[0], id);
        }
    });
    check('repeats are listed with every line and whether they differ', () => {
        assert.deepStrictEqual(index.duplicateKeys,
            dup.duplicateKeys.map(({ id, lines, identical }) => ({ id, lines, identical })));
    });
    check('a bibliography without repeats lists none', () => {
        assert.deepStrictEqual(parseBibTeX(path.join(FIXTURE_DIR, 'edge-cases.bib')).duplicateKeys, []);
    });

    const expected = dup.duplicateKeys.map(({ id, severity, lines }) => ({ citation: id, severity, lines }));
    const shape = issues => issues.filter(i => i.type === 'duplicate_key')
        .map(({ citation, severity, lines }) => ({ citation, severity, lines }));

    check('duplicate_key issues: differing repeats are errors, exact copies are warnings', () => {
        const issues = duplicateKeyIssues(index, file);
        assert.deepStrictEqual(shape(issues), expected);
        for (const issue of issues) {
            assert.strictEqual(issue.file, file);
            for (const line of issue.lines) assert(issue.message.includes(String(line)), issue.message);
        }
    });

    // No entry in the fixture has a DOI, so the verifier must never be called.
    let audit = null;
    try {
        audit = await auditBibTeX(file, { verifyDOI: () => { throw new Error('unexpected Crossref request'); } });
    } catch (err) {
        audit = err;
    }
    check('auditBibTeX reports duplicate_key and counts it', () => {
        assert(!(audit instanceof Error), audit.message);
        assert.deepStrictEqual(shape(audit.issues), expected);
        assert.strictEqual(audit.stats.duplicateKey, expected.length);
        assert.strictEqual(audit.stats.total, dup.keys.length);
    });

    check('cli audit --offline reports duplicate_key and exits 1', () => {
        const { code, out } = runCli(['audit', path.join(ROOT, 'test-fixtures'), `--bibtex=${file}`, '--offline', '--json']);
        assert.strictEqual(code, 1, `exited ${code}; a differing repeat is an error`);
        const result = JSON.parse(out);
        assert.deepStrictEqual(shape(result.issues), expected);
        assert.strictEqual(result.bibtex.stats.duplicateKey, expected.length);
    });
    check('cli audit --offline prints each repeated key', () => {
        const { out } = runCli(['audit', path.join(ROOT, 'test-fixtures'), `--bibtex=${file}`, '--offline']);
        for (const { id } of dup.duplicateKeys) assert(out.includes(`[duplicate_key] ${id}`), `${id} not printed`);
    });
}

function cliCases(manifest) {
    const dir = path.join(ROOT, 'test-fixtures');
    const bad = [manifest.invalid[0].file, ...manifest.empty];
    for (const name of bad) {
        const file = path.join(FIXTURE_DIR, name);
        for (const mode of [['--offline'], ['--offline', '--json']]) {
            check(`cli audit --bibtex=${name} ${mode.join(' ')} fails without a report`, () => {
                const { code, out, err } = runCli(['audit', dir, `--bibtex=${file}`, ...mode]);
                assert.notStrictEqual(code, 0, 'exited 0 on a bibliography it could not read');
                assert(err.includes(file), `stderr does not name the file: ${err}`);
                assert(!/\n\s+at .*\(/.test(err), 'stderr carries a stack trace');
                assert.strictEqual(out.trim(), '', 'printed a report for a bibliography it could not read');
            });
        }
    }
    check('cli audit on the valid fixture counts every entry', () => {
        const file = path.join(FIXTURE_DIR, manifest.valid.file);
        const { code, out } = runCli(['audit', dir, `--bibtex=${file}`, '--offline', '--json']);
        assert.strictEqual(code, 0);
        assert.strictEqual(JSON.parse(out).stats.bibEntries, manifest.valid.entries.length);
    });
}

async function run() {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
    validCases(manifest.valid);
    invalidCases(manifest.invalid);
    emptyCases(manifest.empty);
    await duplicateCases(manifest.duplicates);
    cliCases(manifest);

    if (failures.length === 0) {
        console.log(`${GREEN}✓ bibtex-eval: ${asserted} assertion(s) hold `
            + `(${manifest.valid.entries.length} entries, ${manifest.invalid.length} invalid, `
            + `${manifest.empty.length} empty, ${manifest.duplicates.duplicateKeys.length} repeated keys).${RESET}\n`);
        return 0;
    }

    console.log(`${RED}✗ bibtex-eval: ${failures.length} violation(s) of ${asserted} assertion(s).${RESET}\n`);
    for (const f of failures) {
        console.log(`  ${RED}${f.name}${RESET}\n      ${f.detail}`);
    }
    console.log('');
    return 1;
}

run().then(code => process.exit(code)).catch(err => {
    console.error(`bibtex-eval failed: ${err.stack || err.message}`);
    process.exit(1);
});
