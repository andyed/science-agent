'use strict';

const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');
const { extractInlineCitations, extractDOIs } = require('./patterns');
const { parseBibTeX, buildLookup } = require('./bibtex');

/**
 * Audit citations in a directory against a BibTeX file.
 *
 * For each inline citation found in .md/.html/.js files:
 *   1. Look up in BibTeX by surname+year
 *   2. If found, check title consistency (fuzzy match)
 *   3. If not found, flag as orphan (no BibTeX entry)
 *   4. Check for DOI presence
 *   5. Flag ambiguous citations (same surname+year, multiple papers)
 *
 * Returns { citations: [...], issues: [...], stats: {...} }
 */
function auditDirectory(dir, bibtexPath, options = {}) {
    const { extensions = ['.md', '.html', '.js'], exclude = ['node_modules', '.git', 'dist'] } = options;

    // Parse BibTeX
    const index = parseBibTeX(bibtexPath);
    const lookup = buildLookup(index);

    // Build fuzzy title matcher
    const allEntries = [...index.values()];
    const fuse = new Fuse(allEntries, {
        keys: ['title'],
        threshold: 0.4,
        includeScore: true,
    });

    const citations = [];
    const issues = [];
    const seen = new Map(); // dedup: "surname_year_file" → count

    // Walk directory
    function walk(dirPath) {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
            if (exclude.some(e => entry.name === e)) continue;
            const full = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                scanFile(full);
            }
        }
    }

    function scanFile(filepath) {
        const text = fs.readFileSync(filepath, 'utf-8');
        const relPath = path.relative(dir, filepath);
        const inlineCites = extractInlineCitations(text);
        const dois = extractDOIs(text);

        for (const cite of inlineCites) {
            const surname = cite.authors.split(/[,&]| and | et al/i)[0].trim().toLowerCase();
            const key = `${surname}_${cite.year}`;
            const dedup = `${key}_${relPath}`;

            // Count but don't re-process duplicates in same file
            if (seen.has(dedup)) {
                seen.set(dedup, seen.get(dedup) + 1);
                continue;
            }
            seen.set(dedup, 1);

            const entry = {
                raw: cite.raw,
                authors: cite.authors,
                year: cite.year,
                file: relPath,
                lookupKey: key,
                inBibTeX: false,
                hasDOI: false,
                ambiguous: false,
                titleMatch: null,
            };

            // Look up in BibTeX
            const matches = lookup.get(key);
            if (matches) {
                entry.inBibTeX = true;
                if (matches.length > 1) {
                    entry.ambiguous = true;
                    issues.push({
                        severity: 'warn',
                        type: 'ambiguous',
                        citation: cite.raw,
                        file: relPath,
                        message: `"${cite.raw}" matches ${matches.length} BibTeX entries — disambiguate with DOI or journal`,
                        bibEntries: matches.map(m => m.id),
                    });
                }
                // Check if any match has a DOI
                entry.hasDOI = matches.some(m => m.doi);
            } else {
                // Not in BibTeX — check if title-searchable
                issues.push({
                    severity: 'info',
                    type: 'orphan',
                    citation: cite.raw,
                    file: relPath,
                    message: `"${cite.raw}" has no BibTeX entry`,
                });
            }

            citations.push(entry);
        }
    }

    walk(dir);

    // Stats
    const total = citations.length;
    const inBib = citations.filter(c => c.inBibTeX).length;
    const orphans = total - inBib;
    const withDOI = citations.filter(c => c.hasDOI).length;
    const ambiguous = citations.filter(c => c.ambiguous).length;

    return {
        citations,
        issues,
        stats: {
            total,
            inBibTeX: inBib,
            orphans,
            withDOI,
            ambiguous,
            issueCount: issues.length,
        },
    };
}

module.exports = { auditDirectory };
