'use strict';

// Citation pattern detection — finds inline references in prose and code comments.
// Returns { raw, authors, year, context } for each match.

// "Author (Year)" or "Author et al. (Year)" or "Author & Author (Year)"
const INLINE_PATTERN = /(?:([A-Z][a-z]+(?:\s*(?:,|&|and)\s*[A-Z][a-z]+)*(?:\s+et\s+al\.)?)\s*\((\d{4})\))/g;

// "Author, I., Author, I. (Year). Title." — full reference line
const FULL_REF_PATTERN = /^[-*]\s*(.+?)\s*\((\d{4})\)\.\s*(.+?)(?:\.\s*\*?([^.]+?)\*?(?:,\s*(\d+))?)?\.?\s*$/gm;

// DOI patterns
const DOI_PATTERN = /(?:doi\.org\/|doi:\s*)(10\.\d{4,}\/[^\s,)]+)/gi;

// arXiv patterns
const ARXIV_PATTERN = /arxiv[:\s]*(\d{4}\.\d{4,5})/gi;

function extractInlineCitations(text) {
    const matches = [];
    let m;
    INLINE_PATTERN.lastIndex = 0;
    while ((m = INLINE_PATTERN.exec(text)) !== null) {
        matches.push({
            raw: m[0],
            authors: m[1].trim(),
            year: parseInt(m[2]),
            index: m.index,
        });
    }
    return matches;
}

function extractDOIs(text) {
    const dois = [];
    let m;
    DOI_PATTERN.lastIndex = 0;
    while ((m = DOI_PATTERN.exec(text)) !== null) {
        dois.push(m[1]);
    }
    return dois;
}

function extractArxivIds(text) {
    const ids = [];
    let m;
    ARXIV_PATTERN.lastIndex = 0;
    while ((m = ARXIV_PATTERN.exec(text)) !== null) {
        ids.push(m[1]);
    }
    return ids;
}

module.exports = { extractInlineCitations, extractDOIs, extractArxivIds, INLINE_PATTERN, FULL_REF_PATTERN };
