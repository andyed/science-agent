'use strict';

const path = require('path');
const { parseBibTeX } = require('./bibtex');
const { verifyDOI } = require('./crossref');

function decodeEntities(value) {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)));
}

function stripLatex(value) {
    return decodeEntities(value)
        .replace(/\\(?:ae|AE)\b/g, match => match.slice(1).toLowerCase())
        .replace(/\\(?:oe|OE)\b/g, match => match.slice(1).toLowerCase())
        .replace(/\\(?:aa|AA)\b/g, match => match.slice(1).toLowerCase())
        .replace(/\\["'`^~=.uvHckbdtr]\s*\{?([A-Za-z])\}?/g, '$1')
        .replace(/\\&/g, ' and ')
        .replace(/\\[A-Za-z]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, '$1')
        .replace(/\\[A-Za-z]+/g, ' ')
        .replace(/[{}]/g, ' ');
}

function normalizeText(value) {
    return stripLatex(value)
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/æ/gi, 'ae')
        .replace(/œ/gi, 'oe')
        .replace(/ø/gi, 'o')
        .replace(/ð/gi, 'd')
        .replace(/ł/gi, 'l')
        .replace(/ß/g, 'ss')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&/g, ' and ')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeDOI(value) {
    return String(value || '')
        .trim()
        .replace(/^[{\s]+/g, '')
        .replace(/[}\s]+$/g, '')
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
        .replace(/^doi:\s*/i, '')
        // A DOI suffix may legitimately end in punctuation. BibTeX braces and
        // surrounding whitespace are wrappers; punctuation is DOI data.
        .toLowerCase();
}

function normalizePages(value) {
    const normalized = String(value || '')
        .trim()
        .replace(/[–—]/g, '-')
        .replace(/--+/g, '-')
        .replace(/\s+/g, '')
        .toLowerCase();
    const articleRange = normalized.match(/^\d+:([^:-]+)-\d+:([^:-]+)$/);
    return articleRange ? `${articleRange[1]}-${articleRange[2]}` : normalized;
}

function authorFamily(author) {
    const raw = stripLatex(author).trim();
    if (!raw) return '';
    if (/^(others|et\s+al\.?)$/i.test(raw)) return 'others';
    const family = raw.includes(',')
        ? raw.split(',')[0]
        : raw.split(/\s+/).slice(-1)[0];
    return normalizeText(family);
}

function authorFamilies(authors) {
    return (authors || []).map(authorFamily).filter(Boolean);
}

function familyNamesCompatible(claimed, actual) {
    if (!claimed || !actual) return false;
    if (claimed === actual) return true;
    const claimedParts = claimed.split(' ');
    const actualParts = actual.split(' ');
    if (claimedParts.length === 1) return actualParts.includes(claimed);
    if (actualParts.length === 1) return claimedParts.includes(actual);
    return false;
}

function compareAuthors(claimedAuthors, actualAuthors) {
    const claimed = authorFamilies(claimedAuthors);
    const actual = authorFamilies(actualAuthors);
    const wildcard = claimed[claimed.length - 1] === 'others';
    const comparable = wildcard ? claimed.slice(0, -1) : claimed;
    const prefixMatches = comparable.every((family, index) => familyNamesCompatible(family, actual[index]));
    return {
        match: prefixMatches && (wildcard || comparable.length === actual.length),
        claimed,
        actual,
        partial: wildcard,
        // No author field at all is a different condition from author drift:
        // the entry cannot disagree with Crossref about a list it never made.
        claimedEmpty: claimed.length === 0,
    };
}

function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;

    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    const current = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
        current[0] = i;
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
        for (let j = 0; j <= b.length; j++) previous[j] = current[j];
    }
    return previous[b.length];
}

function titleSimilarity(a, b) {
    const left = normalizeText(a);
    const right = normalizeText(b);
    if (!left || !right) return 0;
    return 1 - (levenshteinDistance(left, right) / Math.max(left.length, right.length));
}

function compareTitles(claimedTitle, actualTitle) {
    const claimed = normalizeText(claimedTitle);
    const actual = normalizeText(actualTitle);
    const exact = claimed === actual;
    // Crossref commonly stores only the main title before a subtitle. A local
    // title that extends that canonical prefix is compatible; the reverse is
    // still reported because it means the BibTeX entry omitted title text.
    const crossrefPrefix = Boolean(actual && claimed.startsWith(`${actual} `));
    return {
        match: exact || crossrefPrefix,
        exact,
        crossrefPrefix,
        similarity: Number(titleSimilarity(claimedTitle, actualTitle).toFixed(3)),
    };
}

function comparePages(claimedPages, actualPages) {
    if (!claimedPages || !actualPages) return true;
    const claimed = normalizePages(claimedPages);
    const actual = normalizePages(actualPages);
    if (claimed === actual) return true;
    // Some Crossref deposits provide only the first page of a known range.
    return !actual.includes('-') && claimed.startsWith(`${actual}-`);
}

async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const index = next++;
            if (index >= items.length) return;
            results[index] = await worker(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

function issue(entry, type, severity, message, actual = null) {
    return {
        severity,
        type,
        citation: entry.id,
        file: entry.file,
        doi: entry.doi,
        message,
        claimed: {
            title: entry.title,
            authors: entry.authors,
            year: entry.year || null,
            volume: entry.volume,
            pages: entry.pages,
        },
        actual,
    };
}

/**
 * One issue per citation key that the bibliography defines more than once.
 * Only the first entry is in the index (BibTeX and biber keep the first too),
 * so every other check in the audit ran on that entry alone. When the dropped
 * entries differ from it, the audit did not read something the author wrote:
 * an error. Exact copies lose nothing: a warning.
 *
 * Needs no network, so `audit --offline` reports it as well.
 */
function duplicateKeyIssues(index, bibtexPath) {
    const file = path.resolve(bibtexPath);
    return (index.duplicateKeys || []).map(({ id, lines, identical }) => {
        const entry = { ...index.get(id), file };
        const later = lines.slice(1).join(', ');
        const many = lines.length > 2;
        let rest;
        if (identical) {
            rest = many
                ? `the entries on lines ${later} are exact copies`
                : `the entry on line ${later} is an exact copy`;
        } else {
            rest = many
                ? `the entries on lines ${later} were not checked and at least one differs from it`
                : `the entry on line ${later} differs from it and was not checked`;
        }
        const message = `Citation key "${id}" is defined ${lines.length} times (lines ${lines.join(', ')}). `
            + `Only the entry on line ${lines[0]} was audited, as BibTeX uses only the first; ${rest}`;
        return { ...issue(entry, 'duplicate_key', identical ? 'warn' : 'error', message), lines, identical };
    });
}

/**
 * Dereference every DOI in a BibTeX file and compare the returned identity
 * metadata with the entry. This is deliberately separate from the local prose
 * scan: references.bib is evidence to verify, never a trusted ground truth.
 */
async function auditBibTeX(bibtexPath, options = {}) {
    const verifier = options.verifyDOI || verifyDOI;
    const concurrency = Math.max(1, parseInt(options.concurrency, 10) || 2);
    const onProgress = options.onProgress || null;
    const index = parseBibTeX(bibtexPath);
    const entries = [...index.values()].map(entry => ({
        ...entry,
        file: path.resolve(bibtexPath),
        doi: normalizeDOI(entry.doi),
    }));
    const issues = duplicateKeyIssues(index, bibtexPath);
    const duplicateKey = issues.length;

    const doiOwners = new Map();
    for (const entry of entries) {
        if (!entry.doi) continue;
        if (!doiOwners.has(entry.doi)) doiOwners.set(entry.doi, []);
        doiOwners.get(entry.doi).push(entry.id);
    }
    for (const [doi, owners] of doiOwners) {
        if (owners.length < 2) continue;
        const entry = entries.find(candidate => candidate.id === owners[0]);
        issues.push(issue(
            entry,
            'duplicate_doi',
            'error',
            `DOI ${doi} is assigned to multiple BibTeX entries: ${owners.join(', ')}`,
        ));
    }

    const withoutDOI = entries.filter(entry => !entry.doi);
    for (const entry of withoutDOI) {
        issues.push(issue(entry, 'missing_doi', 'info', 'BibTeX entry has no DOI and was not Crossref-verified'));
    }

    const invalidDOIs = entries.filter(entry => entry.doi && !/^10\.\d{4,9}\/\S+$/i.test(entry.doi));
    for (const entry of invalidDOIs) {
        issues.push(issue(entry, 'invalid_doi', 'error', `DOI has an invalid shape: ${entry.doi}`));
    }

    const verifiable = entries.filter(entry => entry.doi && /^10\.\d{4,9}\/\S+$/i.test(entry.doi));
    let completed = 0;
    const verificationCache = new Map();
    const results = await mapLimit(verifiable, concurrency, async entry => {
        if (!verificationCache.has(entry.doi)) {
            verificationCache.set(entry.doi, Promise.resolve().then(() => verifier(entry.doi)));
        }
        const actual = await verificationCache.get(entry.doi);
        completed++;
        if (onProgress) onProgress(completed, verifiable.length, entry);
        return { entry, actual };
    });

    let verified = 0;
    let matched = 0;
    let mismatched = 0;
    let unverified = 0;
    const entryResults = [];

    for (const { entry, actual } of results) {
        if (!actual || !actual.verified) {
            unverified++;
            issues.push(issue(
                entry,
                'doi_unverified',
                'error',
                `Crossref could not verify DOI ${entry.doi}: ${actual?.error || 'unknown error'}`,
            ));
            entryResults.push({ id: entry.id, doi: entry.doi, status: 'unverified', actual: actual || null });
            continue;
        }

        verified++;
        const title = compareTitles(entry.title, actual.title);
        const authors = compareAuthors(entry.authors, actual.authors);
        const actualYears = [...new Set([...(actual.years || []), actual.year].filter(Boolean).map(Number))];
        const yearMatch = !entry.year || actualYears.length === 0 || actualYears.includes(Number(entry.year));
        const volumeMatch = !entry.volume || !actual.volume || normalizeText(entry.volume) === normalizeText(actual.volume);
        const pagesMatch = comparePages(entry.pages, actual.pages);
        const authorsUnknown = authors.claimedEmpty && authors.actual.length > 0;
        const comparison = {
            titleMatch: title.match,
            titleExact: title.exact,
            titleCrossrefPrefix: title.crossrefPrefix,
            titleSimilarity: title.similarity,
            authorsMatch: authors.match,
            authorsUnknown,
            yearMatch,
            volumeMatch,
            pagesMatch,
        };

        const sameFirstAuthor = authors.claimed[0]
            && familyNamesCompatible(authors.claimed[0], authors.actual[0]);
        const clearlyDifferentPaper = !title.match && !authors.match && !sameFirstAuthor && title.similarity < 0.35;
        if (clearlyDifferentPaper) {
            issues.push(issue(
                entry,
                'wrong_doi',
                'error',
                `DOI resolves to a different paper: “${actual.title}” by ${(actual.authors || []).join('; ') || 'unknown authors'}`,
                actual,
            ));
        } else {
            if (!title.match) {
                issues.push(issue(
                    entry,
                    'title_mismatch',
                    'error',
                    `Title differs from Crossref: “${entry.title}” → “${actual.title}” (similarity ${comparison.titleSimilarity})`,
                    actual,
                ));
            }
            if (authorsUnknown) {
                // Standards, datasets, org-authored reports and many @misc
                // entries carry no author field. That is a completeness gap to
                // fill from Crossref, not evidence that the DOI is wrong, so it
                // must not fail a CI audit the way author drift does.
                issues.push(issue(
                    entry,
                    'missing_authors',
                    'warn',
                    `BibTeX entry has no author field; Crossref lists ${(actual.authors || []).join('; ')}`,
                    actual,
                ));
            } else if (!authors.match) {
                issues.push(issue(
                    entry,
                    'author_mismatch',
                    'error',
                    `Author list differs from Crossref: ${entry.authors.join('; ')} → ${(actual.authors || []).join('; ')}`,
                    actual,
                ));
            }
        }
        if (!yearMatch) {
            issues.push(issue(
                entry,
                'year_mismatch',
                'error',
                `Year ${entry.year} is not among Crossref publication years: ${actualYears.join(', ') || 'unknown'}`,
                actual,
            ));
        }
        if (!volumeMatch) {
            issues.push(issue(
                entry,
                'volume_mismatch',
                'warn',
                `Volume differs from Crossref: ${entry.volume} → ${actual.volume}`,
                actual,
            ));
        }
        if (!pagesMatch) {
            issues.push(issue(
                entry,
                'pages_mismatch',
                'warn',
                `Pages differ from Crossref: ${entry.pages} → ${actual.pages}`,
                actual,
            ));
        }

        const identityMatch = title.match && (authors.match || authorsUnknown) && yearMatch;
        if (identityMatch) matched++;
        else mismatched++;
        entryResults.push({
            id: entry.id,
            doi: entry.doi,
            status: identityMatch ? 'verified' : 'mismatch',
            comparison,
            actual,
        });
    }

    for (const entry of withoutDOI) entryResults.push({ id: entry.id, doi: null, status: 'missing_doi' });
    for (const entry of invalidDOIs) entryResults.push({ id: entry.id, doi: entry.doi, status: 'invalid_doi' });

    return {
        skipped: false,
        entries: entryResults,
        issues,
        stats: {
            total: entries.length,
            withDOI: entries.length - withoutDOI.length,
            withoutDOI: withoutDOI.length,
            verified,
            matched,
            mismatched,
            unverified,
            invalidDOI: invalidDOIs.length,
            duplicateDOI: [...doiOwners.values()].filter(owners => owners.length > 1).length,
            duplicateKey,
            issueCount: issues.length,
        },
    };
}

module.exports = {
    auditBibTeX,
    authorFamilies,
    compareAuthors,
    compareTitles,
    duplicateKeyIssues,
    normalizeDOI,
    normalizeText,
    titleSimilarity,
};


// Running a src/ module directly exits 0 and prints nothing, which for an
// audit tool is indistinguishable from a clean result. Fail loudly instead.
if (require.main === module) {
    console.error(
        `science-agent: src/bib-audit.js is a library, not a command.\n` +
        'Invoking it directly produces no output and no findings, whatever the input.\n' +
        'Use:\n' +
        '  node cli.js audit <dir> --bibtex=<path>\n'
    );
    process.exit(2);
}
