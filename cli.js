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
  science-agent notebook-audit <dir>            Audit [NB##:K##] claim references
    --aggregate=<path>                            Path to notebook-key-claims.md
    --notebooks=<dir>                             Path to notebooks directory
    --cross-repo=<dir>                            Scan downstream repo for stale values
  science-agent aggregate <notebooks-dir>       Generate key-claims aggregate
    -o <path>                                     Output file (default: stdout)
  science-agent prose-audit <file-or-dir>       Lint paper drafts for AI-tell prose
                                                  (.md, .ipynb, .tex; native JS rules +
                                                   muriel.aiism when available)
    --severity=warn                               Exit nonzero at this severity (info|warn|error)
    --no-pencil                                   Don't skip pencil-locked sentences
    --no-muriel                                   Skip the Python muriel.aiism pass (native only)
    --no-native                                   Skip the native ARS rule set (muriel only)
  science-agent figure-audit <INDEX.md>         Verify figure caption numerics against summary.json sidecars

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
    const slicedArgs = args.slice(1);
    for (let i = 0; i < slicedArgs.length; i++) {
        const arg = slicedArgs[i];
        if (arg.startsWith('--')) {
            const [key, val] = arg.slice(2).split('=');
            flags[key] = val || true;
        } else if (arg === '-o' && i + 1 < slicedArgs.length) {
            flags.o = slicedArgs[++i];
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

    } else if (command === 'aggregate') {
        const dir = positional[0];
        if (!dir) {
            console.log(`
  science-agent aggregate — Generate a Key Claims summary from Jupyter notebooks

  Usage: science-agent aggregate <notebooks-dir> [-o <output.md>]

  This scans .ipynb files for "## Key Claims" sections and compiles them
  into a single reference file. Other commands (notebook-audit) use this
  aggregate to verify claim references in prose.

  Example:
    science-agent aggregate ./notebooks/ -o docs/key-claims.md
`);
            process.exit(0);
        }
        if (!fs.existsSync(dir)) {
            console.error(`Error: directory not found: ${dir}`);
            process.exit(1);
        }

        const { aggregate, formatMarkdown } = require('./src/aggregate');
        const result = aggregate(path.resolve(dir));

        // Graceful: if no notebooks with claims found, explain instead of erroring
        if (result.stats.notebooksWithClaims === 0) {
            console.log(`\n═══ Science Agent: Aggregate ═══\n`);
            console.log(`  Scanned ${result.stats.notebooksScanned} notebook(s) in ${path.resolve(dir)}`);
            console.log(`  No "## Key Claims" sections found.\n`);
            console.log(`  To use this feature, add a Key Claims block to your notebooks:`);
            console.log(`    ## Key Claims`);
            console.log(`    - **K1**: Finding description (p < .05, d = 0.8)`);
            console.log(`    - **K2**: Another finding\n`);
            console.log(`  See: https://github.com/andyed/science-agent/blob/main/docs/notebook-conventions.md\n`);
            process.exit(0);
        }

        if (flags.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        const md = formatMarkdown(result);

        if (flags.o) {
            fs.writeFileSync(flags.o, md);
            console.log(`\n═══ Science Agent: Aggregate ═══\n`);
            console.log(`  Notebooks scanned: ${result.stats.notebooksScanned}`);
            console.log(`  With Key Claims:   ${result.stats.notebooksWithClaims}`);
            console.log(`  Without:           ${result.stats.notebooksWithout}`);
            console.log(`  Total claims:      ${result.stats.totalClaims}`);
            console.log(`\n  Written to: ${flags.o}\n`);
        } else {
            process.stdout.write(md);
        }

    } else if (command === 'notebook-audit') {
        const dir = positional[0] || '.';

        // Graceful degradation: check if the directory has any [NB##:K##] references
        const targetDir = path.resolve(dir);
        if (!fs.existsSync(targetDir)) {
            console.log(`\n  ℹ Directory not found: ${targetDir}`);
            console.log(`  This command audits [NB##:K##] claim references in prose files.`);
            console.log(`  See: science-agent aggregate --help for setting up Key Claims.\n`);
            process.exit(0);
        }

        const { auditNotebookClaims, auditCrossRepo } = require('./src/notebook-audit');

        const result = auditNotebookClaims(targetDir, {
            aggregatePath: flags.aggregate ? path.resolve(flags.aggregate) : null,
            notebookDir: flags.notebooks ? path.resolve(flags.notebooks) : null,
        });

        // If no claim references found at all, explain what this command is for
        if (result.stats.totalRefs === 0 && result.issues.length === 0) {
            console.log(`\n═══ Science Agent: Notebook Claims Audit ═══\n`);
            console.log(`  Directory: ${targetDir}`);
            console.log(`  No [NB##:K##] claim references found in this directory.\n`);
            console.log(`  This command verifies notebook-style claim references.`);
            console.log(`  To get started with Key Claims:`);
            console.log(`    1. Add a "## Key Claims" section to your notebooks`);
            console.log(`    2. Reference claims in prose as [NB01:K1], [NB01:K2], etc.`);
            console.log(`    3. Run: science-agent aggregate ./notebooks/ -o key-claims.md`);
            console.log(`    4. Then: science-agent notebook-audit ./docs --aggregate=key-claims.md\n`);
            console.log(`  See: https://github.com/andyed/science-agent/blob/main/docs/notebook-conventions.md\n`);
            process.exit(0);
        }

        if (flags.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        console.log(`\n═══ Science Agent: Notebook Claims Audit ═══\n`);
        console.log(`  Directory:        ${path.resolve(dir)}`);
        console.log(`  Claim references: ${result.stats.totalRefs}`);
        console.log(`  Unique notebooks: ${result.stats.uniqueNotebooks}`);
        console.log(`  Unique claims:    ${result.stats.uniqueClaims}`);
        console.log(`  Issues:           ${result.stats.issueCount}`);

        if (result.notebookStatus.length > 0) {
            console.log(`\n── Notebook Key Claims Status ──\n`);
            for (const nb of result.notebookStatus) {
                const icon = nb.hasBlock ? '✓' : '✗';
                const detail = nb.hasBlock
                    ? `${nb.claimCount} claims${nb.verifiedDate ? `, verified ${nb.verifiedDate}` : ''}`
                    : 'no Key Claims block';
                console.log(`  ${icon} ${nb.file}  (${detail})`);
            }
        }

        if (result.issues.length > 0) {
            console.log(`\n── Issues ──\n`);
            for (const issue of result.issues) {
                const icon = issue.severity === 'error' ? '✗' : '⚠';
                const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
                console.log(`  ${icon} [${issue.type}] ${issue.ref || ''}`);
                console.log(`    ${loc}`);
                console.log(`    ${issue.message}\n`);
            }
        } else {
            console.log(`\n  ✓ All claim references resolve correctly.\n`);
        }

        // Cross-repo scan
        if (flags['cross-repo']) {
            const crossDir = path.resolve(flags['cross-repo']);
            console.log(`\n── Cross-repo scan: ${crossDir} ──\n`);

            // Default stale values from the coordinate-space audit
            const staleValues = [
                { value: '0.827', message: 'Pre-fix M3 AUC (corrected to 0.792)', correction: '0.792' },
                { value: '0.821', message: 'Pre-fix M4 AUC (corrected to 0.792)', correction: '0.792' },
                { value: '994', message: 'Pre-fix evaluated-rejected N (corrected to 344)', correction: '344' },
            ];

            const crossResult = auditCrossRepo(crossDir, staleValues);
            if (crossResult.issues.length > 0) {
                for (const issue of crossResult.issues) {
                    console.log(`  ⚠ ${issue.file}:${issue.line} — ${issue.message}`);
                    if (issue.correction) console.log(`    → should be: ${issue.correction}`);
                }
            } else {
                console.log(`  ✓ No stale values detected.\n`);
            }
        }

        const errors = result.issues.filter(i => i.severity === 'error').length;
        if (errors > 0) process.exit(1);

    } else if (command === 'figure-audit') {
        const target = positional[0];
        if (!target) {
            console.error('usage: science-agent figure-audit <INDEX.md> [--json]');
            process.exit(2);
        }
        const targetPath = path.resolve(target);
        if (!fs.existsSync(targetPath)) {
            console.error(`figure-audit: not found: ${targetPath}`);
            process.exit(2);
        }
        const { auditIndex, formatReport } = require('./src/figure-audit');
        const audit = auditIndex(targetPath);

        if (flags.json) {
            console.log(JSON.stringify(audit, null, 2));
        } else {
            console.log(`\n═══ Science Agent: Figure Caption Audit ═══\n`);
            console.log(formatReport(audit));
            console.log('');
        }

        const totMis = audit.figures.reduce((n, f) => n + (f.mismatched ? f.mismatched.length : 0), 0);
        const totErr = audit.figures.reduce((n, f) => n + (f.error ? 1 : 0), 0);
        if (totMis > 0 || totErr > 0) process.exit(1);

    } else if (command === 'prose-audit') {
        const target = positional[0];
        if (!target) {
            console.error('usage: science-agent prose-audit <file-or-dir> [--severity=warn] [--respect-pencil] [--summary] [--json]');
            process.exit(2);
        }
        const { auditProse, auditDirectory, formatReport, formatSummary } = require('./src/prose-audit');
        const targetPath = path.resolve(target);
        if (!fs.existsSync(targetPath)) {
            console.error(`prose-audit: not found: ${targetPath}`);
            process.exit(2);
        }

        const respectPencil = flags['respect-pencil'] !== 'false' && flags['no-pencil'] !== true;
        const severity = flags.severity || 'warn';
        const summary = flags.summary === true;
        const native = flags['no-native'] !== true;
        const muriel = flags['no-muriel'] !== true;
        const stat = fs.statSync(targetPath);

        let progressShown = 0;
        const onProgress = !flags.json && stat.isDirectory()
            ? (i, total, file) => {
                if (i === 1 || i === total || i - progressShown >= 25) {
                    process.stderr.write(`\r  scanning ${i}/${total}…  `);
                    progressShown = i;
                }
                if (i === total) process.stderr.write('\n');
            }
            : null;

        const results = stat.isDirectory()
            ? auditDirectory(targetPath, { respectPencil, native, muriel, onProgress })
            : [auditProse(targetPath, { respectPencil, native, muriel })];

        const sourcesNote = `  Sources: native JS (rules from src/aiism-rules.json) + muriel.aiism (when available)\n`;

        if (flags.json) {
            console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
        } else if (summary) {
            console.log(`\n═══ Science Agent: Prose Audit (summary) ═══\n`);
            console.log(sourcesNote);
            console.log(formatSummary(results));
        } else {
            console.log(`\n═══ Science Agent: Prose Audit ═══\n`);
            console.log(sourcesNote);
            for (const r of results) {
                console.log(formatReport(r));
            }
        }

        if (!flags.json) {
            const totals = results.reduce((acc, r) => {
                acc.error += r.summary.error || 0;
                acc.warn += r.summary.warn || 0;
                acc.info += r.summary.info || 0;
                acc.total += r.summary.total || 0;
                return acc;
            }, { error: 0, warn: 0, info: 0, total: 0 });
            console.log(`── Totals across ${results.length} file(s) ──`);
            console.log(`  ${totals.error} error · ${totals.warn} warn · ${totals.info} info  (${totals.total} total)\n`);
        }

        const order = { info: 0, warn: 1, error: 2 };
        const threshold = order[severity] ?? 1;
        const worst = results.reduce((m, r) => {
            for (const f of r.findings) m = Math.max(m, order[f.severity] ?? 0);
            return m;
        }, -1);
        if (worst >= threshold) process.exit(1);

    } else {
        console.error(`Unknown command: ${command}`);
        usage();
    }
}

main().catch(err => { console.error(err); process.exit(1); });
