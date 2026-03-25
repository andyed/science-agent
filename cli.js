#!/usr/bin/env node
'use strict';

/**
 * science-agent — Detect AI-confabulated academic citations
 *
 * Usage:
 *   science-agent audit <dir> --bibtex=<path>    Audit citations against BibTeX
 *   science-agent arxiv [count] [--cat=cs.AI]     Audit recent arXiv papers
 *   science-agent verify <doi>                    Verify a DOI against CrossRef
 *   science-agent search "title query"            Search CrossRef by title
 *
 * Examples:
 *   science-agent audit ./docs/specs --bibtex=./docs/arxiv-paper/references.bib
 *   science-agent verify 10.1167/jov.25.3.15
 *   science-agent search "Chromatic sensitivity across the visual field"
 */

const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const command = args[0];

function usage() {
    console.log(`
science-agent — Detect AI-confabulated academic citations

Usage:
  science-agent audit <dir> --bibtex=<path>    Audit citations against BibTeX
  science-agent arxiv [count] [--cat=cs.AI]     Audit recent arXiv papers
  science-agent verify <doi>                    Verify a DOI against CrossRef
  science-agent search "title query"            Search CrossRef by title

Options:
  --json           Output as JSON
  --verbose        Show all citations, not just issues
`);
    process.exit(1);
}

async function main() {
    if (!command) usage();

    const flags = {};
    const positional = [];
    for (const arg of args.slice(1)) {
        if (arg.startsWith('--')) {
            const [key, val] = arg.slice(2).split('=');
            flags[key] = val || true;
        } else {
            positional.push(arg);
        }
    }

    if (command === 'audit') {
        const dir = positional[0] || '.';
        const bibtex = flags.bibtex;
        if (!bibtex) {
            console.error('Error: --bibtex=<path> is required for audit');
            process.exit(1);
        }
        if (!fs.existsSync(bibtex)) {
            console.error(`Error: BibTeX file not found: ${bibtex}`);
            process.exit(1);
        }

        const { auditDirectory } = require('./src/audit');
        const result = auditDirectory(path.resolve(dir), path.resolve(bibtex));

        if (flags.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        // Pretty print
        console.log(`\n═══ Science Agent Audit ═══\n`);
        console.log(`  Directory: ${path.resolve(dir)}`);
        console.log(`  BibTeX:    ${path.resolve(bibtex)}`);
        console.log(`  Citations: ${result.stats.total}`);
        console.log(`  In BibTeX: ${result.stats.inBibTeX}`);
        console.log(`  Orphans:   ${result.stats.orphans}`);
        console.log(`  With DOI:  ${result.stats.withDOI}`);
        console.log(`  Ambiguous: ${result.stats.ambiguous}`);
        console.log(`  Issues:    ${result.stats.issueCount}\n`);

        if (result.issues.length > 0) {
            console.log(`── Issues ──\n`);
            for (const issue of result.issues) {
                const icon = issue.severity === 'warn' ? '⚠' : issue.severity === 'error' ? '✗' : 'ℹ';
                console.log(`  ${icon} [${issue.type}] ${issue.citation}`);
                console.log(`    ${issue.file}`);
                console.log(`    ${issue.message}\n`);
            }
        }

        if (flags.verbose) {
            console.log(`── All Citations ──\n`);
            for (const c of result.citations) {
                const status = c.inBibTeX ? (c.hasDOI ? '✓' : '~') : '?';
                console.log(`  ${status} ${c.raw}  (${c.file})`);
            }
            console.log('');
        }

        // Exit code
        const errors = result.issues.filter(i => i.severity === 'error').length;
        if (errors > 0) process.exit(1);

    } else if (command === 'arxiv') {
        const count = parseInt(positional[0]) || 10;
        const category = flags.cat || 'cs.AI';

        const { auditArxiv } = require('./src/arxiv');
        console.log(`\n═══ Science Agent: arXiv Audit ═══`);
        console.log(`Checking references in the ${count} most recent ${category} papers\n`);

        const result = await auditArxiv(count, { category });

        if (flags.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        for (const p of result.papers) {
            if (p.skipped) {
                console.log(`\n── ${p.id}: ${p.title.slice(0, 70)}...`);
                console.log(`   ${p.authors.slice(0, 3).join(', ')}${p.authors.length > 3 ? ' et al.' : ''}`);
                console.log(`   (${p.skipped})`);
            } else {
                console.log(`\n── ${p.id}: ${p.title.slice(0, 70)}...`);
                console.log(`   ${p.authors.slice(0, 3).join(', ')}${p.authors.length > 3 ? ' et al.' : ''}`);
                console.log(`   ${p.refs} references | Verified: ${p.verified} | Issues: ${p.issues}${p.skippedArxivDOIs > 0 ? ` (${p.skippedArxivDOIs} arXiv DOIs skipped)` : ''}`);
            }
        }

        console.log(`\n\n═══ Summary ═══`);
        console.log(`Papers audited:     ${result.stats.papersAudited}`);
        console.log(`Total references:   ${result.stats.totalRefs}`);
        console.log(`References checked: ${result.stats.refsChecked}`);
        console.log(`Issues found:       ${result.stats.issuesFound}`);
        console.log(`Issue rate:         ${(result.stats.issueRate * 100).toFixed(1)}%`);

        if (result.issues.length > 0) {
            console.log(`\n── Issues ──\n`);
            for (const i of result.issues) {
                console.log(`  ✗ [${i.issue}] ${i.paper}`);
                console.log(`    ${i.ref}`);
                if (i.claimed) console.log(`    claimed: ${i.claimed}`);
                if (i.actual) console.log(`    actual:  ${i.actual}`);
                if (i.bestMatch) console.log(`    best match: ${i.bestMatch}`);
                if (i.doi) console.log(`    DOI: ${i.doi}`);
                if (i.similarity !== undefined) console.log(`    similarity: ${i.similarity}`);
                console.log('');
            }
        } else {
            console.log(`\n  ✓ No citation issues detected.`);
        }

        if (result.stats.issuesFound > 0) process.exit(1);

    } else if (command === 'verify') {
        const doi = positional[0];
        if (!doi) {
            console.error('Error: DOI required. Usage: science-agent verify 10.1167/jov.25.3.15');
            process.exit(1);
        }

        const { verifyDOI } = require('./src/crossref');
        console.log(`Verifying DOI: ${doi}...`);
        const result = await verifyDOI(doi);

        if (flags.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        if (result.verified) {
            console.log(`\n  ✓ Verified`);
            console.log(`  Title:   ${result.title}`);
            console.log(`  Authors: ${result.authors.join('; ')}`);
            console.log(`  Journal: ${result.journal}`);
            console.log(`  Year:    ${result.year}\n`);
        } else {
            console.log(`\n  ✗ Not verified: ${result.error}\n`);
            process.exit(1);
        }

    } else if (command === 'search') {
        const query = positional.join(' ');
        if (!query) {
            console.error('Error: search query required');
            process.exit(1);
        }

        const { searchByTitle } = require('./src/crossref');
        console.log(`Searching CrossRef: "${query}"...\n`);
        const results = await searchByTitle(query);

        if (flags.json) {
            console.log(JSON.stringify(results, null, 2));
            return;
        }

        if (results.length === 0) {
            console.log('  No results found.\n');
        } else {
            for (const r of results) {
                console.log(`  ${r.doi}`);
                console.log(`  ${r.title}`);
                console.log(`  ${r.authors.slice(0, 3).join('; ')}${r.authors.length > 3 ? ' et al.' : ''}`);
                console.log(`  ${r.year}\n`);
            }
        }

    } else {
        console.error(`Unknown command: ${command}`);
        usage();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
