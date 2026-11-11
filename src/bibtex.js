'use strict';

const fs = require('fs');
const { parseBibTeXText, BibTeXParseError } = require('./bibtex-parser');

const stripBraces = value => (value || '').replace(/[{}]/g, '');

/**
 * Parse a BibTeX file into a normalized citation index.
 * Returns Map<string, {id, authors, title, year, journal, doi, arxiv, volume, pages, raw}>
 *
 * Throws BibTeXParseError when the file cannot be read as BibTeX or holds no
 * entries. Both callers audit against this index, and an empty index makes
 * every check pass on nothing.
 *
 * A citation key defined more than once keeps its first entry, as BibTeX and
 * biber do; keys compare case-insensitively. The later entries are not in the
 * index, so they are listed on the returned Map as
 *   index.duplicateKeys = [{ id, lines: [first, ...later], identical }]
 * for the audit to report. `identical` is false when a dropped entry differs
 * from the kept one in type or in any field.
 */
function parseBibTeX(filepath) {
    const text = fs.readFileSync(filepath, 'utf-8');
    const { entries } = parseBibTeXText(text, { file: filepath });
    if (entries.length === 0) {
        throw new BibTeXParseError(
            'no BibTeX entries found; an audit against an empty bibliography checks nothing',
            { file: filepath },
        );
    }
    const index = new Map();
    const repeats = new Map(); // id -> { id, lines, identical }
    const signature = entry => JSON.stringify([entry.entryType, entry.entryTags]);

    for (const entry of entries) {
        // Field names arrive lowercased from the parser.
        const tags = entry.entryTags;
        const id = entry.citationKey.toLowerCase();

        if (index.has(id)) {
            const kept = index.get(id).raw;
            if (!repeats.has(id)) repeats.set(id, { id, lines: [kept.line], identical: true });
            const repeat = repeats.get(id);
            repeat.lines.push(entry.line);
            if (signature(entry) !== signature(kept)) repeat.identical = false;
            continue;
        }

        // Parse author string: "Last, First and Last, First" → ["Last, First", ...]
        const authors = stripBraces(tags.author).split(/\s+and\s+/i).map(a => a.trim()).filter(Boolean);

        // Extract DOI
        const doi = stripBraces(tags.doi).trim() || null;

        // Extract arxiv from URL
        let arxiv = null;
        const arxivMatch = stripBraces(tags.url).match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/);
        if (arxivMatch) arxiv = arxivMatch[1];

        const title = stripBraces(tags.title).trim();
        const year = parseInt(tags.year || '0');
        const journal = stripBraces(tags.journal || tags.booktitle).trim();
        const volume = stripBraces(tags.volume).trim() || null;
        const pages = stripBraces(tags.pages).trim() || null;

        index.set(id, {
            id,
            authors,
            title,
            year,
            journal,
            doi,
            arxiv,
            volume,
            pages,
            raw: entry,
        });
    }

    index.duplicateKeys = [...repeats.values()];
    return index;
}

/**
 * Build a surname+year lookup from a BibTeX index.
 * Returns Map<"surname_year", [{id, ...entry}]> — array because same author+year may have multiple papers.
 */
function buildLookup(index) {
    const lookup = new Map();

    for (const [id, entry] of index) {
        // Extract primary author surname
        if (entry.authors.length > 0) {
            const surname = entry.authors[0].split(',')[0].trim().toLowerCase();
            const key = `${surname}_${entry.year}`;
            if (!lookup.has(key)) lookup.set(key, []);
            lookup.get(key).push(entry);
        }
    }

    return lookup;
}

module.exports = { parseBibTeX, buildLookup, BibTeXParseError };


// Running a src/ module directly exits 0 and prints nothing, which for an
// audit tool is indistinguishable from a clean result. Fail loudly instead.
if (require.main === module) {
    console.error(
        `science-agent: src/bibtex.js is a library, not a command.\n` +
        'Invoking it directly produces no output and no findings, whatever the input.\n' +
        'Use:\n' +
        '  node cli.js --help\n'
    );
    process.exit(2);
}
