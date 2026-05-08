'use strict';

/**
 * Prose audit — anti-AI-tell linting for paper drafts.
 *
 * Wraps muriel.aiism (Python; canonical rule table) via subprocess. Surfaces
 * the same findings shape as the rest of science-agent's audits so they can
 * be rolled into a unified report.
 *
 * The rule table itself lives in muriel/muriel/aiism.py — adding or tuning
 * a rule belongs there, not here. This module is the bridge.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_PYTHON = process.env.PYTHON || 'python3';
const DEFAULT_MURIEL = process.env.MURIEL_DIR ||
    path.join(process.env.HOME || '', 'Documents/dev/muriel');

/**
 * Run muriel.aiism --json against a single file.
 *
 * @param {string} filePath — markdown file to audit
 * @param {object} options
 * @param {boolean} [options.respectPencil=true] — skip pencil-locked sentences
 * @param {string[]} [options.rules] — filter to specific rule ids
 * @param {string} [options.python] — python interpreter to use
 * @param {string} [options.murielDir] — muriel package dir (PYTHONPATH)
 * @returns {{findings: object[], summary: object, file: string}}
 */
function auditProse(filePath, options = {}) {
    const {
        respectPencil = true,
        rules = null,
        python = DEFAULT_PYTHON,
        murielDir = DEFAULT_MURIEL,
    } = options;

    if (!fs.existsSync(filePath)) {
        throw new Error(`prose-audit: file not found: ${filePath}`);
    }

    const args = ['-m', 'muriel.aiism', filePath, '--json', '--no-color'];
    if (respectPencil) args.push('--respect-pencil');
    if (rules) {
        for (const r of rules) {
            args.push('--rule', r);
        }
    }

    const env = { ...process.env };
    if (murielDir) env.PYTHONPATH = murielDir + (env.PYTHONPATH ? `:${env.PYTHONPATH}` : '');

    const result = spawnSync(python, args, { env, encoding: 'utf-8' });
    if (result.error) {
        throw new Error(`prose-audit: failed to spawn ${python}: ${result.error.message}`);
    }
    // Exit code 1 means findings present (still success for our purposes); 2 = usage error.
    if (result.status === 2) {
        throw new Error(`prose-audit: muriel.aiism usage error: ${result.stderr}`);
    }

    try {
        return JSON.parse(result.stdout);
    } catch (err) {
        throw new Error(
            `prose-audit: could not parse JSON from muriel.aiism — ` +
            `is muriel installed at ${murielDir}?\n` +
            `stderr: ${result.stderr}\nstdout (first 200): ${result.stdout.slice(0, 200)}`
        );
    }
}

/**
 * Audit a directory of paper drafts. Walks .md files, skips node_modules etc.
 *
 * @param {string} dir
 * @param {object} options
 * @returns {{file: string, findings: object[], summary: object}[]}
 */
function auditDirectory(dir, options = {}) {
    const {
        extensions = ['.md', '.ipynb'],
        exclude = ['node_modules', '.git', 'dist', 'build', '__pycache__',
                   '.ipynb_checkpoints', '.claude', '.venv', 'venv',
                   '.next', '.cache'],
        excludePatterns = [
            // Build artifacts emitted by render pipelines (duplicate of source)
            /-rendersafe\.md$/,
            /-annotated\.md$/,
        ],
        onProgress = null,
    } = options;
    const files = [];

    function walk(d) {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            if (exclude.includes(entry.name)) continue;
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                if (excludePatterns.some(p => p.test(entry.name))) continue;
                files.push(full);
            }
        }
    }
    walk(dir);

    const results = [];
    for (let i = 0; i < files.length; i++) {
        const full = files[i];
        if (onProgress) onProgress(i + 1, files.length, full);
        try {
            results.push(auditProse(full, options));
        } catch (err) {
            results.push({
                file: full,
                findings: [],
                summary: { error: 1, warn: 0, info: 0, total: 0 },
                _error: err.message,
            });
        }
    }
    return results;
}

/** Format an array of results as a one-line-per-file summary table. */
function formatSummary(results) {
    const rows = results
        .filter(r => r.summary && r.summary.total > 0)
        .sort((a, b) => (b.summary.error - a.summary.error) ||
                        (b.summary.warn - a.summary.warn) ||
                        (b.summary.total - a.summary.total));
    if (!rows.length) {
        return `clean — no findings across ${results.length} file(s).\n`;
    }
    const lines = [
        '| err | warn | info | tot | file |',
        '|---:|---:|---:|---:|:---|',
    ];
    for (const r of rows) {
        const file = r.file.replace(process.env.HOME || '~', '~');
        lines.push(`| ${r.summary.error} | ${r.summary.warn} | ${r.summary.info} | ${r.summary.total} | ${file} |`);
    }
    return lines.join('\n') + '\n';
}

/** Format a single audit result as a Markdown report fragment. */
function formatReport(result) {
    const { file, findings, summary } = result;
    if (result._error) {
        return `### ${file}\n\n_audit failed: ${result._error}_\n`;
    }
    if (!findings.length) {
        return `### ${file}\n\n_clean — no AI-tell patterns detected._\n`;
    }
    const lines = [
        `### ${file}`,
        '',
        `**${summary.error} error · ${summary.warn} warn · ${summary.info} info** (${summary.total} total)`,
        '',
        '| line | sev | rule | message |',
        '|---:|:---|:---|:---|',
    ];
    for (const f of findings) {
        const msg = f.message.replace(/\|/g, '\\|');
        lines.push(`| ${f.line} | ${f.severity} | \`${f.rule}\` | ${msg} |`);
    }
    return lines.join('\n') + '\n';
}

module.exports = {
    auditProse,
    auditDirectory,
    formatReport,
    formatSummary,
};
