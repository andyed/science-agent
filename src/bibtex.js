'use strict';

const fs = require('fs');
const bibtexParse = require('bibtex-parse-js');

/**
 * Parse a BibTeX file into a normalized citation index.
 * Returns Map<string, {id, authors, title, year, journal, doi, arxiv, volume, pages}>
 */
function parseBibTeX(filepath) {
    const raw = fs.readFileSync(filepath, 'utf-8');
    const entries = bibtexParse.toJSON(raw);
    const index = new Map();

    for (const entry of entries) {
        const tags = entry.entryTags || {};
        const id = (entry.citationKey || '').toLowerCase();

        // Parse author string: "Last, First and Last, First" → ["Last, First", ...]
        const authorStr = (tags.author || tags.Author || '').replace(/[{}]/g, '');
        const authors = authorStr.split(/\s+and\s+/i).map(a => a.trim()).filter(Boolean);

        // Extract DOI
        const doi = (tags.doi || tags.DOI || '').replace(/[{}]/g, '').trim() || null;

        // Extract arxiv from URL
        let arxiv = null;
        const url = (tags.url || tags.URL || '').replace(/[{}]/g, '');
        const arxivMatch = url.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/);
        if (arxivMatch) arxiv = arxivMatch[1];

        const title = (tags.title || tags.Title || '').replace(/[{}]/g, '').trim();
        const year = parseInt(tags.year || tags.Year || '0');
        const journal = (tags.journal || tags.Journal || tags.booktitle || '').replace(/[{}]/g, '').trim();
        const volume = (tags.volume || tags.Volume || '').replace(/[{}]/g, '').trim() || null;
        const pages = (tags.pages || tags.Pages || '').replace(/[{}]/g, '').trim() || null;

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

module.exports = { parseBibTeX, buildLookup };
